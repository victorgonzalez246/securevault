// Verificacion del segundo factor: codigo TOTP de 6 digitos o codigo de respaldo de un solo uso.
import { Op } from 'sequelize';
import { User, totpAad } from '../db/models.js';
import { decrypt } from '../crypto/aes.js';
import { verifyTotp, hashRecoveryCode } from '../crypto/totp.js';

/** Devuelve 'totp' | 'recovery' si el codigo es valido (y lo consume), o null. */
export async function verifySecondFactor(user, rawCode) {
  const code = String(rawCode ?? '').replace(/\s/g, '');
  if (!user?.totpEnabled || !user.totpSecretEnc) return null;

  if (/^\d{6}$/.test(code)) {
    const secret = decrypt(user.totpSecretEnc, totpAad(user.id));
    const step = verifyTotp(secret, code, user.totpLastStep);
    if (step === null) return null;
    // Actualizacion atomica: si dos peticiones usan el mismo codigo, solo una gana (anti-replay)
    const [updated] = await User.update(
      { totpLastStep: step },
      { where: { id: user.id, [Op.or]: [{ totpLastStep: null }, { totpLastStep: { [Op.lt]: step } }] } },
    );
    return updated === 1 ? 'totp' : null;
  }

  const hash = hashRecoveryCode(code);
  const codes = Array.isArray(user.recoveryCodes) ? user.recoveryCodes : [];
  if (!codes.includes(hash)) return null;
  await User.update({ recoveryCodes: codes.filter((c) => c !== hash) }, { where: { id: user.id } });
  return 'recovery';
}
