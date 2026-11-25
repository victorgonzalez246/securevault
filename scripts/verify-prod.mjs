// Verificacion de seguridad sobre la URL de PRODUCCION propia (Fase 4 del laboratorio).
// Ejecuta ataques controlados SOLO contra tu propia app y genera evidencias en Markdown.
// Uso: node scripts/verify-prod.mjs https://tu-app.onrender.com
// Nota: al final prueba fuerza bruta; tu IP quedara limitada en /login unos 15 minutos.
import { randomBytes } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import * as OTPAuth from 'otpauth';

const BASE = (process.argv[2] ?? '').replace(/\/+$/, '');
if (!/^https:\/\/[^/]+$/.test(BASE) && !/^http:\/\/localhost:\d+$/.test(BASE)) {
  console.error('Uso: node scripts/verify-prod.mjs https://tu-app.onrender.com');
  process.exit(1);
}
const ORIGIN = BASE;
const results = [];
const log = [];

function check(category, test, pass, evidence) {
  results.push({ category, test, pass, evidence });
  console.log(`${pass ? 'OK  ' : 'FAIL'} [${category}] ${test} -> ${evidence}`);
}

class Client {
  cookies = new Map();
  csrf = null;
  async req(method, path, body, { csrf = true, raw, spoofIp } = {}) {
    const headers = { Origin: ORIGIN };
    if (spoofIp) { headers['X-Forwarded-For'] = spoofIp; headers['True-Client-IP'] = spoofIp; }
    if (this.cookies.size) headers.Cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    if (method !== 'GET') {
      headers['Content-Type'] = 'application/json';
      if (csrf && this.csrf) headers['X-CSRF-Token'] = this.csrf;
    }
    const res = await fetch(BASE + path, {
      method,
      headers,
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
      redirect: 'manual',
      signal: AbortSignal.timeout(90_000),
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      this.cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* no JSON */ }
    if (json?.csrfToken) this.csrf = json.csrfToken;
    log.push(`${method} ${path} -> ${res.status} ${text.slice(0, 160).replace(/\s+/g, ' ')}`);
    return { status: res.status, headers: res.headers, json, text, setCookie: res.headers.getSetCookie() };
  }
  async init() { await this.req('GET', '/api/csrf'); return this; }
}

const rnd = () => randomBytes(4).toString('hex');
const password = () => `Vf#${randomBytes(9).toString('base64url')}9a`;
const register = async (c, email, pw) => c.req('POST', '/api/auth/register', { email, name: 'Verificacion', password: pw });

console.log(`\nVerificando ${BASE} (si el servicio estaba dormido, el primer acceso tarda ~1 min)...\n`);

// --- RF-08 / A02 ---
const health = await new Client().req('GET', '/health');
check('RF-08', '/health sin versiones ni datos internos', health.status === 200 && health.text === '{"status":"ok"}', `${health.status} ${health.text}`);

const home = await new Client().req('GET', '/');
const h = (n) => home.headers.get(n);
const scriptSrc = (h('content-security-policy') ?? '').split(';').find((d) => d.trim().startsWith('script-src ')) ?? '';
check('A02', 'Content-Security-Policy estricta (sin scripts inline)', scriptSrc.trim() === "script-src 'self'", h('content-security-policy'));
check('A02', 'X-Powered-By oculto', !h('x-powered-by'), `x-powered-by: ${h('x-powered-by') ?? '(ausente)'}`);
check('A02', 'X-Content-Type-Options', h('x-content-type-options') === 'nosniff', h('x-content-type-options'));
check('A02', 'Clickjacking bloqueado', /frame-ancestors 'none'/.test(h('content-security-policy') ?? ''), `x-frame-options: ${h('x-frame-options')}`);
check('A02', 'Referrer-Policy / Permissions-Policy', !!h('referrer-policy') && !!h('permissions-policy'), `${h('referrer-policy')} | ${h('permissions-policy')}`);
check('A04', 'HSTS', /max-age=\d{7,}/.test(h('strict-transport-security') ?? ''), h('strict-transport-security'));

try {
  const http = await fetch(BASE.replace('https://', 'http://') + '/notes', { redirect: 'manual', signal: AbortSignal.timeout(30_000) });
  check('A04', 'HTTP redirige a HTTPS', [301, 302, 307, 308].includes(http.status) && /^https:/.test(http.headers.get('location') ?? ''), `${http.status} -> ${http.headers.get('location')}`);
} catch (err) {
  check('A04', 'HTTP redirige a HTTPS', false, err.message);
}

// --- Usuarios de prueba (el registro inicia sesion; la MFA es obligatoria) ---
const A = await new Client().init();
const B = await new Client().init();
const emailA = `verify-a-${rnd()}@example.com`;
const emailB = `verify-b-${rnd()}@example.com`;
const regA = await register(A, emailA, password());
const cookie = regA.setCookie.join(' ');
check('A07/A04', 'Cookie de sesion HttpOnly + Secure + SameSite=Strict + __Host-', /HttpOnly/i.test(cookie) && /Secure/i.test(cookie) && /SameSite=Strict/i.test(cookie) && /__Host-/.test(cookie), cookie.replace(/=s%3A[^;]+/, '=<redactado>'));

const blocked = await A.req('GET', '/api/notes');
check('A07', 'MFA obligatoria: cuenta nueva sin Google Authenticator no accede a nada', blocked.status === 403 && blocked.json?.code === 'MFA_ENROLLMENT_REQUIRED', `${blocked.status} ${blocked.text}`);

// Activa Google Authenticator calculando el codigo TOTP con la clave (como hace la app del telefono)
async function enrollMfa(c) {
  const setup = await c.req('POST', '/api/mfa/setup');
  const code = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(setup.json.secret), digits: 6, period: 30, algorithm: 'SHA1' }).generate();
  return (await c.req('POST', '/api/mfa/enable', { code })).status;
}
const enrolledA = await enrollMfa(A);
await register(B, emailB, password());
const enrolledB = await enrollMfa(B);
const unlocked = await A.req('GET', '/api/notes');
check('A07', 'Tras activar Google Authenticator la cuenta queda desbloqueada', enrolledA === 200 && enrolledB === 200 && unlocked.status === 200, `enable A ${enrolledA}, enable B ${enrolledB}, GET /api/notes ${unlocked.status}`);

// --- A01 ---
const note = await A.req('POST', '/api/notes', { title: 'Nota privada de A', content: 'secreto de A' });
const id = note.json?.note?.id;
const bGet = await B.req('GET', `/api/notes/${id}`);
const bPut = await B.req('PUT', `/api/notes/${id}`, { title: 'hack', content: 'hack' });
const bDel = await B.req('DELETE', `/api/notes/${id}`);
check('A01', 'IDOR: B no puede leer/editar/borrar la nota de A', [bGet, bPut, bDel].every((r) => r.status === 404), `GET ${bGet.status}, PUT ${bPut.status}, DELETE ${bDel.status}`);
const aGet = await A.req('GET', `/api/notes/${id}`);
check('A01', 'La duena si accede a su nota', aGet.status === 200, `${aGet.status}`);
const bAdmin = await B.req('GET', '/api/admin/users');
check('A01', 'Usuario normal en panel admin', bAdmin.status === 403, `${bAdmin.status} ${bAdmin.text}`);
const noCsrf = await A.req('POST', '/api/notes', { title: 't', content: 'c' }, { csrf: false });
check('A01', 'Peticion sin token CSRF', noCsrf.status === 403, `${noCsrf.status} ${noCsrf.text}`);

// --- A05 ---
const xss = await A.req('POST', '/api/notes', { title: '<script>alert(1)</script>', content: '<img src=x onerror=alert(1)>' });
check('A05', 'XSS: <script> se guarda como texto (React escapa; CSP bloquea inline)', xss.status === 201 && /application\/json/.test(xss.headers.get('content-type') ?? ''), `${xss.status} title=${xss.json?.note?.title}`);
const sqliId = await A.req('GET', `/api/notes/${encodeURIComponent("1' OR '1'='1")}`);
// 400 = la app lo rechaza por validacion; 403 HTML = lo bloquea antes el WAF del proveedor (Cloudflare)
check('A05', 'Inyeccion SQL en id de nota', sqliId.status === 400 || (sqliId.status === 403 && /<html/i.test(sqliId.text)), sqliId.status === 403 ? '403: bloqueado por el WAF de la plataforma antes de llegar a la app' : `${sqliId.status} ${sqliId.text}`);
const mass = await new Client().init();
const massReq = await mass.req('POST', '/api/auth/register', { email: `verify-x-${rnd()}@example.com`, name: 'x', password: password(), role: 'admin' });
check('A01', 'Asignacion masiva ("role":"admin" al registrarse)', massReq.status === 400 || massReq.status === 429, `${massReq.status} ${massReq.text}`);

// --- A10 ---
const bad = await A.req('POST', '/api/notes', undefined, { raw: '{"title":' });
check('A10', 'JSON malformado -> error generico sin stack', bad.status === 400 && !/at |stack|Error:/i.test(bad.text), `${bad.status} ${bad.text}`);
const unknown = await A.req('GET', '/api/debug');
check('A10', 'Ruta inexistente -> 404 generico', unknown.status === 404, `${unknown.status} ${unknown.text}`);

// --- A07 (al final: deja tu IP limitada en /login ~15 min) ---
const attacker = await new Client().init();
const sqliLogin = await attacker.req('POST', '/api/auth/login', { email: "' OR 1=1 --", password: "' OR 1=1 --" });
check('A05', "' OR 1=1 -- en el login no autentica", sqliLogin.status === 401, `${sqliLogin.status} ${sqliLogin.text}`);
const statuses = [];
// El atacante ademas falsifica X-Forwarded-For con una IP distinta en cada intento para evadir el limite
for (let i = 0; i < 6; i++) statuses.push((await attacker.req('POST', '/api/auth/login', { email: emailB, password: `Wrong#Pass${i}xx` }, { spoofIp: `203.0.113.${i + 1}` })).status);
check('A07', 'Fuerza bruta bloqueada con HTTP 429 (aunque falsifique X-Forwarded-For y True-Client-IP)', statuses.includes(429) && statuses[0] === 401, statuses.join(', '));

// --- Reporte ---
const passed = results.filter((r) => r.pass).length;
const md = `# Evidencia de verificacion en produccion

- **URL:** ${BASE}
- **Fecha:** ${new Date().toISOString()}
- **Resultado:** ${passed}/${results.length} verificaciones superadas

| Categoria | Prueba | Resultado | Evidencia |
|---|---|---|---|
${results.map((r) => `| ${r.category} | ${r.test} | ${r.pass ? 'OK' : 'FALLA'} | \`${String(r.evidence ?? '').replace(/\|/g, '\\|').slice(0, 220)}\` |`).join('\n')}

## Registro de peticiones

\`\`\`
${log.join('\n').replace(/"csrfToken":"[^"]+"/g, '"csrfToken":"<redactado>"')}
\`\`\`
`;
mkdirSync('entregables', { recursive: true });
writeFileSync('entregables/evidencia-produccion.md', md);
console.log(`\n${passed}/${results.length} verificaciones OK. Evidencia guardada en entregables/evidencia-produccion.md`);
process.exitCode = passed === results.length ? 0 : 1;
