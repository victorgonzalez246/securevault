// Rotacion de llaves (bonificacion). Procedimiento:
//  1. Generar llave nueva: npm run gen-key
//  2. Agregarla a ENCRYPTION_KEYS ("1:viejaB64,2:nuevaB64") y poner ENCRYPTION_KEY_CURRENT=2
//  3. Desplegar (los datos nuevos ya se cifran con v2; los viejos se siguen leyendo con v1)
//  4. Ejecutar: npm run rotate-keys  -> re-cifra todo lo que no este en la version actual
//  5. Cuando reporte 0 pendientes, retirar la llave 1 de ENCRYPTION_KEYS
import { Op } from 'sequelize';
import { sequelize, closeDb } from '../src/db/sequelize.js';
import { User, Note, noteAad, phoneAad } from '../src/db/models.js';
import { encrypt, decrypt, keyVersionOf } from '../src/crypto/aes.js';
import { config } from '../src/config/env.js';

const current = config.ENCRYPTION_KEY_CURRENT;
const stale = (v) => v && keyVersionOf(v) !== current;
let notes = 0;
let phones = 0;

try {
  await sequelize.transaction(async (transaction) => {
    for (const note of await Note.findAll({ transaction, lock: transaction.LOCK.UPDATE })) {
      if (!stale(note.titleEnc) && !stale(note.contentEnc)) continue;
      note.titleEnc = encrypt(decrypt(note.titleEnc, noteAad(note, 'title')), noteAad(note, 'title'));
      note.contentEnc = encrypt(decrypt(note.contentEnc, noteAad(note, 'content')), noteAad(note, 'content'));
      await note.save({ transaction, silent: true });
      notes++;
    }
    const users = await User.findAll({ where: { phoneEnc: { [Op.ne]: null } }, transaction, lock: transaction.LOCK.UPDATE });
    for (const user of users) {
      if (!stale(user.phoneEnc)) continue;
      user.phoneEnc = encrypt(decrypt(user.phoneEnc, phoneAad(user.id)), phoneAad(user.id));
      await user.save({ transaction, silent: true });
      phones++;
    }
  });
  console.log(`Rotacion a v${current} completa: ${notes} notas y ${phones} telefonos re-cifrados.`);
} catch (err) {
  console.error('Rotacion fallida (transaccion revertida, no se perdio nada):', err.message);
  process.exitCode = 1;
} finally {
  await closeDb();
}
