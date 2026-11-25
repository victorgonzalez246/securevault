import { createApp } from './app.js';
import { config } from './config/env.js';
import { logger } from './logger.js';
import { sequelize, closeDb } from './db/sequelize.js';

await sequelize.authenticate(); // fail closed: sin BD no se arranca

const app = createApp();
const server = app.listen(config.PORT, () => logger.info({ port: config.PORT }, 'SecureVault listening'));

// A10: timeouts para conexiones lentas
server.requestTimeout = 30_000;
server.headersTimeout = 20_000;
server.keepAliveTimeout = 65_000;

let shuttingDown = false;
function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.locals.sessionStore?.stopExpiringSessions();
  server.close(async () => {
    await closeDb();
    process.exit(code);
  });
  setTimeout(() => process.exit(code), 10_000).unref();
}

// A10: errores no controlados => se registran y el proceso se reinicia limpio
// (la plataforma/contenedor lo vuelve a levantar). Fallar de forma segura.
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'unhandledRejection');
  shutdown(1);
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaughtException');
  shutdown(1);
});
process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));
