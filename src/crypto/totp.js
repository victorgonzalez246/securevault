// MFA con TOTP (RFC 6238), compatible con Google Authenticator, Microsoft Authenticator, Authy...
// Parametros estandar que esas apps soportan: SHA-1, 6 digitos, periodo de 30 s.
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { randomBytes, createHash } from 'node:crypto';

const ISSUER = 'SecureVault';
const PERIOD = 30;

const build = (secretBase32, label = 'usuario') =>
  new OTPAuth.TOTP({
    issuer: ISSUER,
    label,
    algorithm: 'SHA1',
    digits: 6,
    period: PERIOD,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });

// 160 bits aleatorios (CSPRNG), recomendado por RFC 4226
export const newTotpSecret = () => new OTPAuth.Secret({ size: 20 }).base32;

/**
 * Verifica un codigo TOTP aceptando +-1 periodo de desfase de reloj.
 * Devuelve el numero de paso usado, o null si es invalido o ya se uso (anti-replay).
 */
export function verifyTotp(secretBase32, token, lastStep = null) {
  if (!/^\d{6}$/.test(token)) return null;
  const delta = build(secretBase32).validate({ token, window: 1 });
  if (delta === null) return null;
  const step = Math.floor(Date.now() / 1000 / PERIOD) + delta;
  if (lastStep !== null && lastStep !== undefined && step <= lastStep) return null;
  return step;
}

export async function totpEnrollment(secretBase32, accountLabel) {
  const uri = build(secretBase32, accountLabel).toString();
  const qr = await QRCode.toDataURL(uri, { margin: 1, width: 220, errorCorrectionLevel: 'M' });
  return { uri, qr };
}

// Codigos de respaldo: 8 codigos de 40 bits, se muestran UNA vez y se guarda solo su SHA-256
const normalizeRecovery = (code) => String(code).toLowerCase().replace(/[^0-9a-f]/g, '');
export const hashRecoveryCode = (code) => createHash('sha256').update(normalizeRecovery(code)).digest('hex');
export function generateRecoveryCodes(count = 8) {
  return Array.from({ length: count }, () => {
    const hex = randomBytes(5).toString('hex');
    return `${hex.slice(0, 5)}-${hex.slice(5)}`;
  });
}
