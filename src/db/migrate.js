// Crea las tablas si no existen. Uso: npm run db:migrate
import { sequelize, closeDb } from './sequelize.js';
import './models.js';
import { logger } from '../logger.js';

try {
  await sequelize.authenticate();
  await sequelize.sync();
  logger.info('database schema ready');
} catch (err) {
  logger.fatal({ err: { message: err.message, code: err.original?.code } }, 'migration failed');
  process.exitCode = 1;
} finally {
  await closeDb();
}
