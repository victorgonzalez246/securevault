# Informe de seguridad — SecureVault

**URL de producción:** `https://<completar>.onrender.com`
**Repositorio:** https://github.com/victorgonzalez246/securevault (privado)
**Modalidad:** trabajo individual (victorgonzalez246)

> Las secciones marcadas con ⏳ se completan con capturas **después del despliegue**. Todo lo demás ya está verificado con las pruebas automáticas (`npm test`: 34/34) y con pruebas manuales en local.

## 1. Mapa OWASP Top 10:2025 → mitigación → evidencia

| Categoría | Mitigación en SecureVault | Evidencia |
|---|---|---|
| **A01 Broken Access Control** (incl. SSRF) | `requireAuth` / `requireRole('admin')` en el servidor; denegación por defecto; `WHERE id=? AND owner_id=?` en todas las consultas de notas; UUID no adivinables; CSRF (token + `Origin`); lista blanca de destinos salientes (`safeFetch`) | Prueba *"el usuario B NO puede leer, editar ni borrar la nota del usuario A"* → **404** en GET/PUT/DELETE + eventos `access_denied`; usuario normal en `/api/admin/users` → **403**; sin token CSRF → **403**. Código: `src/routes/notes.js`, `src/middleware/security.js`, `src/services/http.js` |
| **A02 Security Misconfiguration** | helmet con CSP estricta, HSTS, `nosniff`, `frame-ancestors 'none'`, `Referrer-Policy: no-referrer`, `Permissions-Policy`; `X-Powered-By` desactivado; CORS solo a `APP_ORIGIN`; `NODE_ENV=production`; sin stack traces; sin rutas de depuración; `trust proxy 1` | Prueba *"envía cabeceras de seguridad y oculta X-Powered-By"*. ⏳ Captura de **securityheaders.com** (objetivo: A o A+) |
| **A03 Software Supply Chain Failures** | `package-lock.json` versionado; `npm ci` en CI y Render; `npm audit --audit-level=high` bloquea el pipeline; Dependabot (npm ×2 + Actions); `overrides` para corregir `uuid` transitivo; dependencias mínimas | `npm audit` → **found 0 vulnerabilities** (backend y frontend). Archivos `.github/dependabot.yml` y `.github/workflows/ci.yml` |
| **A04 Cryptographic Failures** | Argon2id (19 MiB, t=2, p=1); AES-256-GCM con IV aleatorio de 12 B y tag de 16 B + AAD; llaves versionadas en el gestor de secretos de Render; tokens con `randomBytes(32)` + SHA-256; TLS obligatorio (301 a HTTPS + HSTS); cookie `__Host-` Secure; TLS verificado hacia la BD | Prueba *"contraseñas como $argon2id$ y notas/teléfono cifrados"* y `test/crypto.test.js` (IV único en 200 cifrados, detección de manipulación, AAD). ⏳ Captura de la BD en Workbench/TiDB y reporte de **SSL Labs** |
| **A05 Injection** (incl. XSS) | Sequelize (consultas parametrizadas); validación zod `.strict()` en toda entrada; React escapa la salida (sin `dangerouslySetInnerHTML`); CSP `script-src 'self'`, `script-src-attr 'none'` | Pruebas: `' OR 1=1 --` en login → **401**; inyección en el id → **400**; `<script>` se guarda y devuelve como texto JSON. ⏳ Captura de la nota `<script>alert(1)</script>` mostrada como texto |
| **A06 Insecure Design** | Modelo de amenazas STRIDE; límites de negocio (100 notas, 10 000 caracteres, 20 KB por petición); casos de abuso documentados | `docs/threat-model.md` (diagrama + 17 amenazas + 6 casos de abuso); prueba *"rechaza notas mayores a 10 000 caracteres"* |
| **A07 Authentication Failures** | Rate limit 5/15 min por IP en login; bloqueo progresivo por cuenta; mensajes genéricos; igualación de tiempos; `session.regenerate()`; expiración 30 min / 8 h; logout que destruye la sesión; política de contraseña; recuperación de un solo uso; **MFA con TOTP (Google Authenticator)**: secreto cifrado AES-256-GCM, anti-replay, 5 intentos por login, 8 códigos de respaldo guardados como SHA-256 | Pruebas: 5 fallos → **429** en el 6.º; cuenta bloqueada aunque cambie de IP; mismo mensaje para correo inexistente o contraseña incorrecta; logout invalida la sesión; token de recuperación no reutilizable; `test/mfa.test.js` (6 pruebas): con MFA activo la contraseña sola **no** da acceso (401 en /api/notes), código incorrecto → 401, el mismo código no se reutiliza (replay), 5 fallos cancelan el login, código de respaldo de un solo uso, desactivar exige contraseña + código |
| **A08 Software or Data Integrity Failures** | Sin deserialización de datos no confiables (solo `express.json`, 20 KB); sesiones de servidor en vez de JWT (no hay algoritmos que confundir); GCM verifica la integridad de los datos cifrados; **SRI (sha384)** en todos los JS/CSS que sirve la app (`client/scripts/add-sri.mjs` tras el build); sin recursos de terceros; CI ejecuta pruebas antes del deploy (`autoDeployTrigger: checksPass`); gitleaks | `dist/index.html` generado (atributos `integrity="sha384-..."` en `<script>` y `<link>`); `.github/workflows/ci.yml`; `render.yaml` |
| **A09 Security Logging and Alerting Failures** | pino en JSON; eventos `login_ok`, `login_fail`, `login_blocked`, `login_rate_limited`, `access_denied`, `role_change`, `password_reset_*`, `sensitive_data_revealed`; redacción de cookie/password/token/phone/content; alerta al 5.º fallo consecutivo (log `warn` + bitácora + webhook opcional) | Muestra de log JSON (abajo); panel **Administración → Bitácora**. ⏳ Captura del panel |
| **A10 Mishandling of Exceptional Conditions** | Manejador global con respuesta genérica + `requestId`; detalle solo en el log; *fail closed* (sin llaves válidas o sin BD el servidor no arranca; si falla el descifrado se responde 500); `unhandledRejection` y `uncaughtException` → log fatal y reinicio limpio; timeouts (servidor 30 s, conexión a BD 10 s, `max_execution_time` 10 s, salientes 5 s) | Prueba *"un dato manipulado en la BD produce error genérico (sin stack)"* → **500** `{"error":"Ocurrio un error interno...","requestId":"..."}`; JSON malformado → **400** genérico |

### Muestra de log (A09)

```json
{"level":30,"time":"2026-11-25T14:40:49.838Z","service":"securevault","securityEvent":"register","userId":1,"ip":"::1","reqId":"155d04e1-...","msg":"security_event"}
{"level":30,"time":"2026-11-25T14:40:49.938Z","service":"securevault","securityEvent":"login_ok","userId":1,"ip":"::1","reqId":"6bc644e0-...","msg":"security_event"}
```

### Muestra de la base de datos (A04)

```
email           hash                              phone
demo@test.com   $argon2id$v=19$m=19456,t=2,p=1    v1.eXRQ5srrikLnrqVF.mAYScCbUnVT1DOoj5JB6...
content (notes)
v1./iwu7UahhC7UDqAu.+6fTpGRLKiZ1sDu8pMoHAw==.UJy7KfFDug==
```

## 2. Decisiones criptográficas

| Dato | Técnica | Parámetros | Justificación |
|---|---|---|---|
| Contraseña | Argon2id | m=19 456 KiB, t=2, p=1, sal aleatoria | Mínimo recomendado por OWASP Password Storage Cheat Sheet; resistente a GPU por uso de memoria. Nunca se descifra, solo se verifica |
| Notas (título y contenido) | AES-256-GCM | IV 12 B aleatorio por cifrado, tag 16 B, AAD `note:<owner>:<id>:<campo>` | Cifrado autenticado: confidencialidad + detección de manipulación; el AAD impide mover cifrados entre registros |
| Teléfono | AES-256-GCM | AAD `user:<id>:phone` | Debe mostrarse enmascarado o completo al dueño |
| Token de recuperación | SHA-256 | Token de `randomBytes(32)` (256 bits) | Alta entropía: un hash rápido basta; si roban la BD, los hashes no sirven |
| Secreto TOTP (MFA) | AES-256-GCM | AAD `user:<id>:totp`; 160 bits de CSPRNG | Se necesita leer para verificar códigos (por eso cifrado, no hash) |
| Códigos de respaldo MFA | SHA-256 | 8 códigos de 40 bits, un solo uso | Solo se comparan; si roban la BD no sirven |
| Sesión | HMAC-SHA256 (express-session firma el ID) | `SESSION_SECRET` ≥ 32 caracteres | Evita falsificar el ID de sesión en la cookie |
| Tránsito | TLS 1.2/1.3 | Certificado gestionado por Render (Let's Encrypt) + HSTS 1 año; TLS 1.2+ verificado hacia TiDB | Protege credenciales y cookies |

**No usado (prohibido):** MD5/SHA para contraseñas, ECB, `createCipher()`, IV fijo, llaves en el código, `Math.random()`.

### Pregunta de análisis: ¿qué pasa si se pierde la llave? ¿Cómo rotarla?

- **Si se pierde la llave, los datos cifrados con ella se pierden de forma irrecuperable.** Esa es justamente la garantía de AES-256-GCM: sin la llave no hay forma práctica de descifrar. Las contraseñas no se ven afectadas, porque son hashes y no dependen de la llave. Mitigación: guardar una copia de la llave en un gestor de secretos independiente (p. ej. un gestor de contraseñas del equipo con acceso restringido), separada de los respaldos de la BD.
- **Si la llave se filtra**, hay que rotarla de inmediato.
- **Rotación sin pérdida (implementada, bonificación):** cada cifrado lleva su versión (`v1.`, `v2.`…) y la app acepta varias llaves (`ENCRYPTION_KEYS=1:...,2:...`). Se agrega la llave nueva como actual; lo nuevo se cifra con ella y lo viejo se sigue leyendo. Luego `npm run rotate-keys` re-cifra todo dentro de **una transacción** (si falla, se revierte), y por último se retira la llave vieja. Probado en `test/crypto.test.js` (*"soporta rotación"*).

## 3. Resultados de las herramientas ⏳

| Herramienta | Resultado | Captura |
|---|---|---|
| `npm audit` (backend + frontend) | **0 vulnerabilidades** | `npm run test:audit` |
| securityheaders.com | ⏳ | |
| Qualys SSL Labs | ⏳ | |
| OWASP ZAP baseline | ⏳ `gh workflow run zap.yml -f url=https://<url>` (workflow `.github/workflows/zap.yml`) | |
| Pruebas de ataque en producción | ⏳ `npm run verify:prod -- https://<url>`: 20 pruebas (IDOR, CSRF, SQLi, XSS, cabeceras, HTTPS, cookies, errores, fuerza bruta → 429). Ver `evidencia-produccion.pdf` | |

## 4. Riesgos residuales

1. **Bloqueo de cuenta como DoS:** un atacante puede bloquear temporalmente la cuenta de otro usuario con intentos fallidos. Se acota con bloqueo progresivo (máx. 60 min) y alertas; una mejora sería CAPTCHA tras N fallos.
2. **El rate limit vive en memoria:** con varias instancias cada una cuenta por separado y se reinicia con el proceso. Mejora: un store compartido (Redis).
3. **El plan gratuito de Render duerme el servicio** tras 15 min sin tráfico: el primer acceso tarda alrededor de 1 min. No es un riesgo de seguridad, pero sí de disponibilidad.
4. **La llave de cifrado convive con la app:** si el servidor se compromete en ejecución, el atacante puede descifrar. Mejora: KMS/HSM con cifrado por sobre (*envelope encryption*).
5. **MFA opcional:** cada usuario decide si lo activa (se muestra un aviso para activarlo). Mejora: hacerlo obligatorio para administradores. TOTP es vulnerable a phishing en tiempo real; WebAuthn/passkeys sería el siguiente paso.
6. **Correo de recuperación:** sin `RESEND_API_KEY`, en producción no se envía el enlace (falla de forma segura, pero RF-06 queda sin canal de entrega). Configurar Resend o un SMTP para la demo.
7. **`sequelize.sync()` como migración:** sirve para el laboratorio; en un equipo real se usarían migraciones versionadas (`sequelize-cli`).
