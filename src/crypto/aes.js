// A04: cifrado autenticado AES-256-GCM con IV aleatorio de 12 bytes por registro
// y tag de 16 bytes. Formato guardado en BD: v<version>.<iv>.<tag>.<datos> (base64).
// El prefijo de version permite rotar llaves sin perder informacion.
// El AAD (datos asociados) liga el cifrado a su registro: si alguien copia el
// texto cifrado de un usuario a otro registro, el descifrado falla.
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { config } from '../config/env.js';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function encrypt(plaintext, aad, version = config.ENCRYPTION_KEY_CURRENT) {
  const key = config.keys.get(version);
  if (!key) throw new Error('Unknown encryption key version');
  const iv = randomBytes(IV_BYTES); // IV unico por cada cifrado, nunca se reutiliza
  const cipher = createCipheriv(ALGO, key, iv, { authTagLength: TAG_BYTES });
  if (aad) cipher.setAAD(Buffer.from(aad, 'utf8'));
  const data = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v${version}.` + [iv, tag, data].map((b) => b.toString('base64')).join('.');
}

export function decrypt(payload, aad) {
  const parts = String(payload).split('.');
  if (parts.length !== 4 || !/^v\d+$/.test(parts[0])) throw new Error('Invalid ciphertext format');
  const key = config.keys.get(Number(parts[0].slice(1)));
  if (!key) throw new Error('Unknown encryption key version');
  const [iv, tag, data] = parts.slice(1).map((s) => Buffer.from(s, 'base64'));
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new Error('Invalid ciphertext format');
  const decipher = createDecipheriv(ALGO, key, iv, { authTagLength: TAG_BYTES });
  if (aad) decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(tag); // falla si el dato fue alterado
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export const keyVersionOf = (payload) => Number(String(payload).split('.')[0].slice(1));
