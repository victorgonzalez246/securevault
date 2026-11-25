// Crea (o actualiza) un usuario con rol admin o user. Las credenciales se leen de
// variables de entorno de la terminal, nunca de archivos del repositorio.
// Uso (PowerShell):
//   $env:ADMIN_EMAIL="admin@ejemplo.com"; $env:ADMIN_NAME="Admin"; $env:ADMIN_PASSWORD="..."; npm run create-admin
//   Para un usuario normal agregar: $env:ADMIN_ROLE="user"
import { User } from '../src/db/models.js';
import { closeDb } from '../src/db/sequelize.js';
import { hashPassword } from '../src/crypto/password.js';
import { passwordPolicy } from '../src/schemas.js';

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const name = process.env.ADMIN_NAME?.trim() || 'Administrador';
const password = process.env.ADMIN_PASSWORD;
const role = process.env.ADMIN_ROLE === 'user' ? 'user' : 'admin';

try {
  if (!email) throw new Error('Define ADMIN_EMAIL');
  const check = passwordPolicy.safeParse(password ?? '');
  if (!check.success) throw new Error(`ADMIN_PASSWORD no cumple la politica: ${check.error.issues[0].message}`);
  const passwordHash = await hashPassword(password);
  const existing = await User.findOne({ where: { email } });
  if (existing) {
    await existing.update({ role, name, passwordHash, failedAttempts: 0, lockedUntil: null });
    console.log(`Usuario ${email} actualizado (rol: ${role})`);
  } else {
    await User.create({ email, name, role, passwordHash });
    console.log(`Usuario ${email} creado (rol: ${role})`);
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await closeDb();
}
