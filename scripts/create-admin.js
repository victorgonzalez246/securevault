// Crea (o promueve) un administrador. Las credenciales se leen de variables de
// entorno de la terminal, nunca de archivos del repositorio.
// Uso (PowerShell):
//   $env:ADMIN_EMAIL="admin@ejemplo.com"; $env:ADMIN_NAME="Admin"; $env:ADMIN_PASSWORD="..."; npm run create-admin
import { User } from '../src/db/models.js';
import { closeDb } from '../src/db/sequelize.js';
import { hashPassword } from '../src/crypto/password.js';
import { passwordPolicy } from '../src/schemas.js';

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const name = process.env.ADMIN_NAME?.trim() || 'Administrador';
const password = process.env.ADMIN_PASSWORD;

try {
  if (!email) throw new Error('Define ADMIN_EMAIL');
  const existing = await User.findOne({ where: { email } });
  if (existing) {
    await existing.update({ role: 'admin' });
    console.log(`Usuario ${email} promovido a admin`);
  } else {
    const check = passwordPolicy.safeParse(password ?? '');
    if (!check.success) throw new Error(`ADMIN_PASSWORD no cumple la politica: ${check.error.issues[0].message}`);
    await User.create({ email, name, role: 'admin', passwordHash: await hashPassword(password) });
    console.log(`Administrador ${email} creado`);
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await closeDb();
}
