// Configuracion de pruebas: usa .env.test (local) o variables del CI.
// Las llaves de prueba se generan al vuelo: nunca se reutilizan las de produccion.
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

if (existsSync('.env.test')) process.loadEnvFile('.env.test');
process.env.NODE_ENV = 'test';
process.env.APP_ORIGIN ??= 'http://localhost:5173';
process.env.SESSION_SECRET ??= randomBytes(32).toString('hex');
process.env.ENCRYPTION_KEYS ??= `1:${randomBytes(32).toString('base64')},2:${randomBytes(32).toString('base64')}`;
process.env.ENCRYPTION_KEY_CURRENT ??= '1';
process.env.MFA_REQUIRED ??= 'false'; // test/mfa.test.js la activa
process.env.RESEND_API_KEY = '';
process.env.ALERT_WEBHOOK_URL = '';

if (!/test/i.test(process.env.DATABASE_URL ?? '')) {
  throw new Error('Las pruebas requieren DATABASE_URL apuntando a una BD cuyo nombre contenga "test"');
}
