import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { Op } from 'sequelize';
import { User, PasswordReset, Session, phoneAad } from '../db/models.js';
import { sequelize } from '../db/sequelize.js';
import { hashPassword, verifyPassword, burnPasswordTime } from '../crypto/password.js';
import { encrypt } from '../crypto/aes.js';
import { generateToken, hashToken } from '../crypto/tokens.js';
import { validate, issueCsrfToken, requireAuth } from '../middleware/security.js';
import { registerSchema, loginSchema, forgotSchema, resetSchema } from '../schemas.js';
import { audit, alert } from '../services/audit.js';
import { sendPasswordResetEmail } from '../services/mailer.js';

const LOCK_THRESHOLD = 5;
const RESET_TTL_MS = 15 * 60 * 1000;
const GENERIC_LOGIN_ERROR = 'Correo o contrasena incorrectos, o cuenta bloqueada temporalmente';

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role });

// Promesas para la API de callbacks de express-session
const regenerate = (req) => new Promise((ok, ko) => req.session.regenerate((e) => (e ? ko(e) : ok())));
const destroy = (req) => new Promise((ok, ko) => req.session.destroy((e) => (e ? ko(e) : ok())));

export function authRouter() {
  const router = Router();

  // A07: limite por IP en login (429). Los logins exitosos no cuentan.
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: async (req, res) => {
      await audit(req, 'login_rate_limited', {}, null);
      res.status(429).json({ error: 'Demasiados intentos. Intenta de nuevo en unos minutos.' });
    },
  });
  const sensitiveLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes. Intenta mas tarde.' },
  });

  router.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

  // RF-01: registro. La contrasena solo se guarda como hash Argon2id.
  router.post('/register', sensitiveLimiter, validate(registerSchema), async (req, res) => {
    const { email, name, password, phone } = req.valid.body;
    const exists = await User.findOne({ where: { email }, attributes: ['id'] });
    if (exists) {
      // Mensaje generico: no confirma si el correo ya esta registrado
      return res.status(400).json({ error: 'No se pudo completar el registro' });
    }
    const passwordHash = await hashPassword(password);
    const user = await sequelize.transaction(async (t) => {
      const u = await User.create({ email, name, passwordHash }, { transaction: t });
      if (phone) await u.update({ phoneEnc: encrypt(phone, phoneAad(u.id)) }, { transaction: t });
      return u;
    });
    await audit(req, 'register', {}, user.id);
    res.status(201).json({ message: 'Cuenta creada. Ya puedes iniciar sesion.' });
  });

  // RF-02: login con sesion en cookie HttpOnly/Secure/SameSite
  router.post('/login', loginLimiter, validate(loginSchema), async (req, res) => {
    const email = req.valid.body.email.trim().toLowerCase();
    const { password } = req.valid.body;
    const fail = () => res.status(401).json({ error: GENERIC_LOGIN_ERROR });

    const user = await User.findOne({ where: { email } });
    if (!user) {
      await burnPasswordTime(password);
      await audit(req, 'login_fail', { reason: 'unknown_user' }, null);
      return fail();
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await burnPasswordTime(password);
      await audit(req, 'login_blocked', { reason: 'account_locked' }, user.id);
      return fail();
    }
    if (!(await verifyPassword(user.passwordHash, password))) {
      await User.increment('failedAttempts', { where: { id: user.id } });
      await user.reload();
      const attempts = user.failedAttempts;
      if (attempts >= LOCK_THRESHOLD) {
        // A07: bloqueo progresivo 1, 2, 4, 8... minutos (maximo 60)
        const minutes = Math.min(60, 2 ** (attempts - LOCK_THRESHOLD));
        await user.update({ lockedUntil: new Date(Date.now() + minutes * 60_000) });
      }
      await audit(req, 'login_fail', { reason: 'bad_password', attempts }, user.id);
      if (attempts === LOCK_THRESHOLD || attempts % 10 === 0) {
        await alert(req, 'Multiples logins fallidos consecutivos', { userId: user.id, attempts });
      }
      return fail();
    }

    await user.update({ failedAttempts: 0, lockedUntil: null });
    await regenerate(req); // A07: nuevo ID de sesion al autenticar (evita fijacion de sesion)
    req.session.userId = user.id;
    req.session.authAt = Date.now();
    const csrfToken = issueCsrfToken(req);
    await audit(req, 'login_ok', {}, user.id);
    res.json({ user: publicUser(user), csrfToken });
  });

  // RF-02: cierre de sesion que invalida la sesion en el servidor
  router.post('/logout', async (req, res) => {
    if (req.user) await audit(req, 'logout');
    await destroy(req);
    res.clearCookie(req.app.get('sessionCookieName'), { path: '/' });
    res.json({ message: 'Sesion cerrada' });
  });

  // RF-06: solicitar recuperacion. Respuesta identica exista o no el correo.
  router.post('/forgot', sensitiveLimiter, validate(forgotSchema), async (req, res) => {
    const user = await User.findOne({ where: { email: req.valid.body.email }, attributes: ['id', 'email'] });
    if (user) {
      const token = generateToken();
      await PasswordReset.destroy({ where: { userId: user.id, usedAt: null } });
      await PasswordReset.create({
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      });
      await audit(req, 'password_reset_requested', {}, user.id);
      await sendPasswordResetEmail(user.email, token);
    }
    res.json({ message: 'Si el correo existe, enviamos un enlace de recuperacion valido por 15 minutos.' });
  });

  // RF-06: usar el token (un solo uso, con expiracion). Se busca por su hash.
  router.post('/reset', sensitiveLimiter, validate(resetSchema), async (req, res) => {
    const { token, password } = req.valid.body;
    const passwordHash = await hashPassword(password);
    const userId = await sequelize.transaction(async (t) => {
      const reset = await PasswordReset.findOne({
        where: { tokenHash: hashToken(token), usedAt: null, expiresAt: { [Op.gt]: new Date() } },
        lock: t.LOCK.UPDATE,
        transaction: t,
      });
      if (!reset) return null;
      await reset.update({ usedAt: new Date() }, { transaction: t });
      await User.update({ passwordHash, failedAttempts: 0, lockedUntil: null }, { where: { id: reset.userId }, transaction: t });
      await Session.destroy({ where: { userId: reset.userId }, transaction: t }); // cierra todas sus sesiones
      return reset.userId;
    });
    if (!userId) return res.status(400).json({ error: 'El enlace es invalido o ya expiro' });
    await audit(req, 'password_reset_completed', {}, userId);
    res.json({ message: 'Contrasena actualizada. Inicia sesion con tu nueva contrasena.' });
  });

  return router;
}
