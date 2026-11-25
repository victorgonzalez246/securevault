// Crea las tablas que no existen y agrega columnas nuevas a las existentes
// (nunca borra ni modifica columnas: migracion aditiva y segura). Uso: npm run db:migrate
import { sequelize, closeDb } from './sequelize.js';
import './models.js';
import { logger } from '../logger.js';

async function addMissingColumns() {
  const qi = sequelize.getQueryInterface();
  const tables = new Set((await qi.showAllTables()).map((t) => (typeof t === 'string' ? t : t.tableName)));
  for (const model of Object.values(sequelize.models)) {
    const table = model.getTableName();
    if (!tables.has(table)) continue;
    const existing = await qi.describeTable(table);
    for (const attr of Object.values(model.getAttributes())) {
      if (!existing[attr.field]) {
        await qi.addColumn(table, attr.field, attr);
        logger.info({ table, column: attr.field }, 'column added');
      }
    }
  }
}

try {
  await sequelize.authenticate();
  await addMissingColumns();
  await sequelize.sync();
  logger.info('database schema ready');
} catch (err) {
  logger.fatal({ err: { message: err.message, code: err.original?.code } }, 'migration failed');
  process.exitCode = 1;
} finally {
  await closeDb();
}
