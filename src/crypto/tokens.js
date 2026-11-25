// RF-06: tokens de recuperacion. Se generan con un CSPRNG (nunca Math.random)
// y en la BD solo se guarda su SHA-256. Un token de 256 bits de entropia no necesita hash lento.
import { randomBytes, createHash } from 'node:crypto';

export const generateToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token) => createHash('sha256').update(String(token)).digest('hex');
