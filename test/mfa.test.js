// A07: autenticacion multifactor con TOTP (Google Authenticator).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import * as OTPAuth from 'otpauth';

const { createApp } = await import('../src/app.js');
const { sequelize, closeDb } = await import('../src/db/sequelize.js');

const PASSWORD = 'Clave#Segura2026';
const EMAIL = 'mfa@test.com';
let app;
let secret;
let recoveryCodes;

const totpFor = (offsetSteps = 0) =>
  new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30, algorithm: 'SHA1' })
    .generate({ timestamp: Date.now() + offsetSteps * 30_000 });

let ip = 1;
async function client() {
  const agent = request.agent(app);
  const addr = `10.9.0.${ip++}`;
  let csrf = (await agent.get('/api/csrf').set('X-Forwarded-For', addr)).body.csrfToken;
  const post = async (url, body) => {
    const res = await agent.post(url).set('X-Forwarded-For', addr).set('X-CSRF-Token', csrf).send(body);
    if (res.body?.csrfToken) csrf = res.body.csrfToken;
    return res;
  };
  return { post, get: (url) => agent.get(url).set('X-Forwarded-For', addr) };
}

beforeAll(async () => {
  await sequelize.sync({ force: true });
  app = createApp();
  const c = await client();
  await c.post('/api/auth/register', { email: EMAIL, name: 'MFA', password: PASSWORD });
});

afterAll(async () => {
  app.locals.sessionStore.stopExpiringSessions();
  await closeDb();
});

describe('MFA con Google Authenticator (TOTP)', () => {
  it('activa MFA: QR + confirmacion con codigo + codigos de respaldo', async () => {
    const c = await client();
    await c.post('/api/auth/login', { email: EMAIL, password: PASSWORD });
    const setup = await c.post('/api/mfa/setup');
    expect(setup.status).toBe(200);
    expect(setup.body.qr).toMatch(/^data:image\/png;base64,/);
    expect(setup.body.uri).toMatch(/^otpauth:\/\/totp\/SecureVault:/);
    secret = setup.body.secret;

    expect((await c.post('/api/mfa/enable', { code: '000000' })).status).toBe(400);
    const enable = await c.post('/api/mfa/enable', { code: totpFor() });
    expect(enable.status).toBe(200);
    recoveryCodes = enable.body.recoveryCodes;
    expect(recoveryCodes).toHaveLength(8);

    const [[row]] = await sequelize.query(`SELECT totp_secret_enc, recovery_codes FROM users WHERE email='${EMAIL}'`);
    expect(row.totp_secret_enc).toMatch(/^v1\./); // secreto cifrado con AES-256-GCM
    expect(row.totp_secret_enc).not.toContain(secret);
    expect(JSON.stringify(row.recovery_codes)).not.toContain(recoveryCodes[0]); // solo hashes
  });

  it('con MFA activo, la contrasena sola NO da acceso', async () => {
    const c = await client();
    const login = await c.post('/api/auth/login', { email: EMAIL, password: PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body).toMatchObject({ mfaRequired: true });
    expect(login.body.user).toBeUndefined();
    expect((await c.get('/api/notes')).status).toBe(401);
    expect((await c.get('/api/auth/me')).status).toBe(401);
  });

  it('codigo incorrecto => 401; codigo correcto => sesion completa; el mismo codigo no se puede reutilizar', async () => {
    const c = await client();
    await c.post('/api/auth/login', { email: EMAIL, password: PASSWORD });
    expect((await c.post('/api/auth/mfa', { code: '123456' })).status).toBe(401);
    const code = totpFor(1); // siguiente periodo (el actual ya se uso al activar)
    const ok = await c.post('/api/auth/mfa', { code });
    expect(ok.status).toBe(200);
    expect(ok.body.user.email).toBe(EMAIL);
    expect((await c.get('/api/notes')).status).toBe(200);

    // Replay: un atacante que vio el codigo intenta usarlo en otra sesion
    const attacker = await client();
    await attacker.post('/api/auth/login', { email: EMAIL, password: PASSWORD });
    expect((await attacker.post('/api/auth/mfa', { code })).status).toBe(401);
  });

  it('tras 5 codigos incorrectos se cancela el login y hay que repetir la contrasena', async () => {
    const c = await client();
    await c.post('/api/auth/login', { email: EMAIL, password: PASSWORD });
    for (let i = 0; i < 5; i++) await c.post('/api/auth/mfa', { code: '99999' + i });
    const res = await c.post('/api/auth/mfa', { code: totpFor(1) });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Inicia sesion de nuevo/);
  });

  it('el codigo de respaldo funciona una sola vez', async () => {
    const c = await client();
    await c.post('/api/auth/login', { email: EMAIL, password: PASSWORD });
    expect((await c.post('/api/auth/mfa', { code: recoveryCodes[0] })).status).toBe(200);

    const again = await client();
    await again.post('/api/auth/login', { email: EMAIL, password: PASSWORD });
    expect((await again.post('/api/auth/mfa', { code: recoveryCodes[0] })).status).toBe(401);
  });

  it('desactivar MFA exige contrasena y codigo', async () => {
    const c = await client();
    await c.post('/api/auth/login', { email: EMAIL, password: PASSWORD });
    await c.post('/api/auth/mfa', { code: recoveryCodes[1] });
    expect((await c.post('/api/mfa/disable', { password: 'mala', code: recoveryCodes[2] })).status).toBe(400);
    expect((await c.post('/api/mfa/disable', { password: PASSWORD, code: recoveryCodes[3] })).status).toBe(200);
    expect((await c.get('/api/mfa/status')).body.enabled).toBe(false);
  });
});
