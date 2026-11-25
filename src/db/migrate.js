// Prepara la base de datos (se ejecuta en cada arranque en Render). Uso: npm run db:migrate
//  1. Si la base no existe, la crea (p. ej. la primera vez en TiDB Cloud).
//  2. Agrega columnas nuevas a tablas existentes (migracion aditiva: nunca borra datos).
//  3. Crea las tablas que falten.
import mysql from 'mysql2/promise';
import { sequelize, closeDb, parseDatabaseUrl } from './sequelize.js';
import './models.js';
import { config } from '../config/env.js';
import { logger } from '../logger.js';

async function ensureDatabase() {
  const url = parseDatabaseUrl();
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!/^[A-Za-z0-9_]+$/.test(database)) throw new Error('Nombre de base de datos invalido en DATABASE_URL');
  const conn = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    connectTimeout: 10_000,
    ...(config.dbSsl && {
      ssl: { rejectUnauthorized: true, minVersion: 'TLSv1.2', ...(config.dbCaCert && { ca: config.dbCaCert }) },
    }),
  });
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally {
    await conn.end();
  }
}

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
  try {
    await sequelize.authenticate();
  } catch (err) {
    if (err.original?.code !== 'ER_BAD_DB_ERROR') throw err;
    await ensureDatabase();
    logger.info('database created');
    await sequelize.authenticate();
  }
  await addMissingColumns();
  await sequelize.sync();
  logger.info('database schema ready');
} catch (err) {
  logger.fatal({ err: { message: err.message, code: err.original?.code } }, 'migration failed');
  process.exitCode = 1;
} finally {
  await closeDb();
}
