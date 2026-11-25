// A04/A07: contrasenas con Argon2id (hash lento con sal). Nunca se cifran ni se descifran.
// Parametros minimos recomendados por OWASP: 19 MiB, 2 iteraciones, paralelismo 1.
import argon2 from 'argon2';

const OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const hashPassword = (plain) => argon2.hash(plain, OPTIONS);

export async function verifyPassword(hash, plain) {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false; // hash corrupto => fail closed
  }
}

// Hash ficticio para igualar tiempos cuando el correo no existe
// (evita enumeracion de usuarios por tiempo de respuesta).
let dummyHash;
export async function burnPasswordTime(plain) {
  dummyHash ??= await hashPassword('dummy-password-for-timing');
  await verifyPassword(dummyHash, plain);
  return false;
}
