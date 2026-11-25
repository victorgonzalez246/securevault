// Configuracion validada al arrancar (A02/A10: fail closed).
// Si falta un secreto o una llave es invalida, el proceso NO arranca.
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
  DB_SSL: z.enum(['true', 'false']).default('false'),
  DB_CA_CERT: z.string().optional(), // PEM de la CA del proveedor (p. ej. Aiven)
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET debe tener al menos 32 caracteres'),
  APP_ORIGIN: z.url(),
  // Formato: "1:<base64 32 bytes>,2:<base64 32 bytes>" (permite rotacion de llaves)
  ENCRYPTION_KEYS: z.string().min(1),
  ENCRYPTION_KEY_CURRENT: z.coerce.number().int().positive(),
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  ALERT_WEBHOOK_URL: z.url().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'silent']).optional(),
});

function load() {
  // Variables vacias en .env se tratan como no definidas
  const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ''));
  // En Render, si no se define APP_ORIGIN se usa la URL publica que la plataforma asigna
  raw.APP_ORIGIN ??= raw.RENDER_EXTERNAL_URL;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    // Solo se informan los NOMBRES de las variables, nunca sus valores
    const fields = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Configuracion invalida -> ${fields.join('; ')}`);
  }
  const env = parsed.data;

  const keys = new Map();
  for (const pair of env.ENCRYPTION_KEYS.split(',')) {
    const [version, b64] = pair.trim().split(':');
    const key = Buffer.from(b64 ?? '', 'base64');
    if (!/^\d+$/.test(version ?? '') || key.length !== 32) {
      throw new Error('ENCRYPTION_KEYS invalida: cada llave debe ser "version:base64" de 32 bytes');
    }
    keys.set(Number(version), key);
  }
  if (!keys.has(env.ENCRYPTION_KEY_CURRENT)) {
    throw new Error('ENCRYPTION_KEY_CURRENT no existe en ENCRYPTION_KEYS');
  }

  return Object.freeze({
    ...env,
    isProd: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',
    dbSsl: env.DB_SSL === 'true',
    dbCaCert: env.DB_CA_CERT?.replace(/\\n/g, '\n'),
    keys,
    logLevel: env.LOG_LEVEL ?? (env.NODE_ENV === 'test' ? 'silent' : 'info'),
  });
}

export const config = load();
