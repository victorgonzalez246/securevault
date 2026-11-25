// Configuracion de MFA (Google Authenticator) para el usuario autenticado.
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { User, totpAad } from '../db/models.js';
import { encrypt, decrypt } from '../crypto/aes.js';
import { verifyPassword } from '../crypto/password.js';
import { newTotpSecret, verifyTotp, totpEnrollment, generateRecoveryCodes, hashRecoveryCode } from '../crypto/totp.js';
import { requireAuth, validate } from '../middleware/security.js';
import { mfaCodeSchema, mfaDisableSchema } from '../schemas.js';
import { verifySecondFactor } from '../services/mfa.js';
import { audit } from '../services/audit.js';

export function mfaRouter() {
  const router = Router();
  router.use(requireAuth);
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Demasiados intentos. Intenta mas tarde.' },
  });

  const loadFull = (req) => User.findByPk(req.user.id);

  router.get('/status', async (req, res) => {
    const user = await loadFull(req);
    res.json({ enabled: user.totpEnabled, recoveryCodesLeft: user.recoveryCodes?.length ?? 0 });
  });

  // Paso 1: generar secreto y QR. Se guarda cifrado como "pendiente" hasta confirmarlo.
  router.post('/setup', limiter, async (req, res) => {
    const user = await loadFull(req);
    if (user.totpEnabled) return res.status(409).json({ error: 'La verificacion en dos pasos ya esta activa' });
    const secret = newTotpSecret();
    await user.update({ totpPendingEnc: encrypt(secret, totpAad(user.id)) });
    const { qr, uri } = await totpEnrollment(secret, user.email);
    await audit(req, 'mfa_setup_started');
    res.set('Cache-Control', 'no-store').json({ qr, uri, secret });
  });

  // Paso 2: confirmar con un codigo de la app. Se activa y se entregan los codigos de respaldo (una sola vez).
  router.post('/enable', limiter, validate(mfaCodeSchema), async (req, res) => {
    const user = await loadFull(req);
    if (user.totpEnabled) return res.status(409).json({ error: 'La verificacion en dos pasos ya esta activa' });
    if (!user.totpPendingEnc) return res.status(400).json({ error: 'Primero genera el codigo QR' });
    const secret = decrypt(user.totpPendingEnc, totpAad(user.id));
    const step = verifyTotp(secret, req.valid.body.code);
    if (step === null) {
      await audit(req, 'mfa_enable_failed');
      return res.status(400).json({ error: 'Codigo incorrecto. Revisa la hora de tu telefono e intenta de nuevo.' });
    }
    const recoveryCodes = generateRecoveryCodes();
    await user.update({
      totpEnabled: true,
      totpSecretEnc: encrypt(secret, totpAad(user.id)),
      totpPendingEnc: null,
      totpLastStep: step,
      recoveryCodes: recoveryCodes.map(hashRecoveryCode),
    });
    await audit(req, 'mfa_enabled');
    res.set('Cache-Control', 'no-store').json({ recoveryCodes });
  });

  // Desactivar exige contrasena + codigo vigente (o de respaldo)
  router.post('/disable', limiter, validate(mfaDisableSchema), async (req, res) => {
    const user = await loadFull(req);
    if (!user.totpEnabled) return res.status(400).json({ error: 'La verificacion en dos pasos no esta activa' });
    const passwordOk = await verifyPassword(user.passwordHash, req.valid.body.password);
    const factor = passwordOk ? await verifySecondFactor(user, req.valid.body.code) : null;
    if (!factor) {
      await audit(req, 'mfa_disable_failed');
      return res.status(400).json({ error: 'Contrasena o codigo incorrectos' });
    }
    await user.update({ totpEnabled: false, totpSecretEnc: null, totpPendingEnc: null, totpLastStep: null, recoveryCodes: null });
    await audit(req, 'mfa_disabled');
    res.json({ message: 'Verificacion en dos pasos desactivada' });
  });

  return router;
}
