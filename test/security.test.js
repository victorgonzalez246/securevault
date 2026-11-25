// Pruebas de seguridad de extremo a extremo (evidencias para el informe OWASP).
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';

// Captura el token de recuperacion en lugar de enviar un correo
const sentResets = [];
vi.mock('../src/services/mailer.js', () => ({
  sendPasswordResetEmail: async (email, token) => sentResets.push({ email, token }),
}));

const { createApp } = await import('../src/app.js');
const { sequelize, closeDb } = await import('../src/db/sequelize.js');
const { User, Note, AuditLog } = await import('../src/db/models.js');

const PASSWORD = 'Clave#Segura2026';
let app;

// Cliente con sesion (cookies) y token CSRF
async function client(ip = `10.2.0.${ipCounter++}`) {
  const agent = request.agent(app);
  let csrf = (await agent.get('/api/csrf').set('X-Forwarded-For', ip)).body.csrfToken;
  const send = (method, url, body) => {
    const r = agent[method](url).set('X-Forwarded-For', ip).set('X-CSRF-Token', csrf);
    // registro y login regeneran la sesion y devuelven un token CSRF nuevo
    r.on('response', (res) => {
      if (res.body?.csrfToken) csrf = res.body.csrfToken;
    });
    return body === undefined ? r : r.send(body);
  };
  return {
    agent,
    get: (url) => agent.get(url).set('X-Forwarded-For', ip),
    post: (url, body) => send('post', url, body),
    put: (url, body) => send('put', url, body),
    patch: (url, body) => send('patch', url, body),
    del: (url) => send('delete', url),
    async login(email, password = PASSWORD) {
      const res = await send('post', '/api/auth/login', { email, password });
      if (res.body.csrfToken) csrf = res.body.csrfToken;
      return res;
    },
  };
}

let ipCounter = 1;
async function registerAndLogin(email, extra = {}, ip = `10.1.0.${ipCounter++}`) {
  const c = await client(ip);
  const reg = await c.post('/api/auth/register', { email, name: email.split('@')[0], password: PASSWORD, ...extra });
  expect(reg.status).toBe(201);
  expect((await c.login(email)).status).toBe(200);
  return c;
}

beforeAll(async () => {
  await sequelize.sync({ force: true });
  app = createApp();
});

afterAll(async () => {
  app.locals.sessionStore.stopExpiringSessions();
  await closeDb();
});

describe('A01 Broken Access Control', () => {
  it('el usuario B NO puede leer, editar ni borrar la nota del usuario A (IDOR)', async () => {
    const a = await registerAndLogin('alice@test.com');
    const b = await registerAndLogin('bob@test.com');
    const created = await a.post('/api/notes', { title: 'Privada', content: 'secreto de Alice' });
    expect(created.status).toBe(201);
    const id = created.body.note.id;

    expect((await b.get(`/api/notes/${id}`)).status).toBe(404);
    expect((await b.put(`/api/notes/${id}`, { title: 'hack', content: 'hack' })).status).toBe(404);
    expect((await b.del(`/api/notes/${id}`)).status).toBe(404);
    expect((await a.get(`/api/notes/${id}`)).body.note.content).toBe('secreto de Alice');
    expect(await AuditLog.count({ where: { event: 'access_denied' } })).toBeGreaterThanOrEqual(3);
  });

  it('un usuario normal recibe 404 en el panel de administracion (oculto); el admin si entra', async () => {
    const user = await registerAndLogin('normal@test.com');
    // 404 en vez de 403: no se revela que el panel admin existe
    expect((await user.get('/api/admin/users')).status).toBe(404);

    const admin = await registerAndLogin('admin@test.com');
    await User.update({ role: 'admin' }, { where: { email: 'admin@test.com' } });
    const res = await admin.get('/api/admin/users');
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/argon2|passwordHash|phoneEnc/);
  });

  it('el rol no se puede asignar desde el registro (asignacion masiva)', async () => {
    const c = await client();
    const res = await c.post('/api/auth/register', { email: 'evil@test.com', name: 'x', password: PASSWORD, role: 'admin' });
    expect(res.status).toBe(400);
  });

  it('peticiones sin token CSRF son rechazadas', async () => {
    const res = await request(app).post('/api/notes').send({ title: 't', content: 'c' });
    expect(res.status).toBe(403);
  });

  it('peticiones desde otro origen son rechazadas', async () => {
    const c = await registerAndLogin('origin@test.com');
    const res = await c.post('/api/notes', { title: 't', content: 'c' }).set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
  });
});

describe('A02 Security Misconfiguration', () => {
  it('envia cabeceras de seguridad y oculta X-Powered-By', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['content-security-policy']).toContain("script-src 'self'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toContain('max-age=31536000');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['permissions-policy']).toBeDefined();
  });

  it('la cookie de sesion es HttpOnly y SameSite=Strict', async () => {
    const c = await client();
    await c.post('/api/auth/register', { email: 'cookie@test.com', name: 'c', password: PASSWORD });
    const res = await c.login('cookie@test.com');
    const cookie = res.headers['set-cookie'].join(';');
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
  });
});

describe('A04 Cryptographic Failures (datos en la BD)', () => {
  it('contrasenas como $argon2id$ y notas/telefono cifrados', async () => {
    const c = await registerAndLogin('crypto@test.com', { phone: '+506 8888-1234' });
    await c.post('/api/notes', { title: 'Banco', content: 'PIN 4321' });
    const [[row]] = await sequelize.query("SELECT password_hash, phone_enc FROM users WHERE email='crypto@test.com'");
    expect(row.password_hash).toMatch(/^\$argon2id\$/);
    expect(row.phone_enc).toMatch(/^v1\./);
    expect(row.phone_enc).not.toContain('8888');
    const [[note]] = await sequelize.query('SELECT title_enc, content_enc FROM notes ORDER BY created_at DESC LIMIT 1');
    expect(note.content_enc).toMatch(/^v1\./);
    expect(note.content_enc).not.toContain('4321');

    const profile = await c.get('/api/profile');
    expect(profile.body.phoneMasked).toBe('***-***-1234');
  });
});

describe('A05 Injection', () => {
  it("' OR 1=1 -- en el login no autentica", async () => {
    const c = await client('10.0.0.50');
    const res = await c.post('/api/auth/login', { email: "' OR 1=1 --", password: "' OR 1=1 --" });
    expect(res.status).toBe(401);
  });

  it('inyeccion en el id de la nota es rechazada por validacion', async () => {
    const c = await registerAndLogin('sqli@test.com');
    const res = await c.get(`/api/notes/${encodeURIComponent("1' OR '1'='1")}`);
    expect(res.status).toBe(400);
  });

  it('<script> se guarda como texto y se devuelve como JSON (React lo escapa al renderizar)', async () => {
    const c = await registerAndLogin('xss@test.com');
    const res = await c.post('/api/notes', { title: '<script>alert(1)</script>', content: '<img src=x onerror=alert(1)>' });
    expect(res.status).toBe(201);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.note.title).toBe('<script>alert(1)</script>');
  });
});

describe('A06 Insecure Design (limites de negocio)', () => {
  it('rechaza notas mayores a 10 000 caracteres', async () => {
    const c = await registerAndLogin('limits@test.com');
    const res = await c.post('/api/notes', { title: 't', content: 'a'.repeat(10_001) });
    expect(res.status).toBe(400);
  });
});

describe('A07 Authentication Failures', () => {
  it('fuerza bruta: tras 5 intentos fallidos el login responde 429', async () => {
    const victim = await client('10.0.0.99');
    await victim.post('/api/auth/register', { email: 'victim@test.com', name: 'v', password: PASSWORD });
    const attacker = await client('10.0.0.66');
    const statuses = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await attacker.login('victim@test.com', `Wrong#Pass${i}aa`)).status);
    }
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
  });

  it('bloqueo progresivo de la cuenta aunque el atacante cambie de IP', async () => {
    // tras 5 fallos la cuenta quedo bloqueada: incluso la contrasena correcta falla
    const other = await client('10.0.0.77');
    const res = await other.login('victim@test.com', PASSWORD);
    expect(res.status).toBe(401);
    const victim = await User.findOne({ where: { email: 'victim@test.com' } });
    expect(victim.lockedUntil.getTime()).toBeGreaterThan(Date.now());
  });

  it('mensaje de error generico (no revela si el correo existe)', async () => {
    const c = await client('10.0.0.88');
    const unknown = await c.login('noexiste@test.com', 'Algo#123456789');
    const wrong = await c.login('alice@test.com', 'Algo#123456789');
    expect(unknown.body.error).toBe(wrong.body.error);
  });

  it('el logout invalida la sesion en el servidor', async () => {
    const c = await registerAndLogin('logout@test.com');
    expect((await c.get('/api/auth/me')).status).toBe(200);
    expect((await c.post('/api/auth/logout')).status).toBe(200);
    expect((await c.get('/api/auth/me')).status).toBe(401);
  });

  it('recuperacion: token de un solo uso, guardado como hash', async () => {
    const c = await client('10.0.0.120');
    await c.post('/api/auth/register', { email: 'reset@test.com', name: 'r', password: PASSWORD });
    expect((await c.post('/api/auth/forgot', { email: 'reset@test.com' })).status).toBe(200);
    const { token } = sentResets.at(-1);
    const [[row]] = await sequelize.query('SELECT token_hash FROM password_resets ORDER BY id DESC LIMIT 1');
    expect(row.token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(row.token_hash).not.toBe(token);

    expect((await c.post('/api/auth/reset', { token, password: 'Nueva#Clave2026' })).status).toBe(200);
    // el reset cierra todas las sesiones del usuario (tambien esta): se reintenta desde otro cliente
    const other = await client('10.0.0.121');
    expect((await other.post('/api/auth/reset', { token, password: 'Otra#Clave20266' })).status).toBe(400);
    expect((await other.login('reset@test.com', 'Nueva#Clave2026')).status).toBe(200);
  });
});

describe('A10 Mishandling of Exceptional Conditions', () => {
  it('un dato manipulado en la BD produce error generico (sin stack) y no filtra datos', async () => {
    const c = await registerAndLogin('tamper@test.com');
    const { body } = await c.post('/api/notes', { title: 'Original', content: 'contenido' });
    const note = await Note.findByPk(body.note.id);
    const parts = note.contentEnc.split('.');
    parts[3] = Buffer.from('dato alterado').toString('base64');
    await note.update({ contentEnc: parts.join('.') });

    const res = await c.get(`/api/notes/${body.note.id}`);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Ocurrio un error interno. Intenta de nuevo.');
    expect(res.body.requestId).toBeDefined();
    expect(JSON.stringify(res.body)).not.toMatch(/at |Error:|stack|decipher/i);
  });

  it('JSON malformado devuelve 400 generico', async () => {
    const c = await client();
    const res = await c.post('/api/auth/login').set('Content-Type', 'application/json').send('{"email":');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Solicitud invalida');
  });

  it('rutas inexistentes devuelven 404 sin detalles', async () => {
    const res = await request(app).get('/api/debug');
    expect(res.status).toBe(404);
  });
});
