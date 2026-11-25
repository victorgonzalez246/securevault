// Conexion MySQL via Sequelize. Sequelize usa consultas parametrizadas (A05).
// En produccion la conexion va cifrada con TLS verificando el certificado (A04).
import { Sequelize } from 'sequelize';
import { config } from '../config/env.js';
import { logger } from '../logger.js';

const dialectOptions = { connectTimeout: 10_000, enableKeepAlive: true };
if (config.dbSsl) {
  dialectOptions.ssl = { rejectUnauthorized: true, minVersion: 'TLSv1.2' };
  if (config.dbCaCert) dialectOptions.ssl.ca = config.dbCaCert;
}

export const sequelize = new Sequelize(config.DATABASE_URL, {
  dialect: 'mysql',
  logging: false, // nunca se registran consultas con datos
  dialectOptions,
  pool: { max: 10, min: 0, acquire: 10_000, idle: 10_000 },
  define: { underscored: true },
  hooks: {
    // A10: timeout de consultas en el servidor MySQL (10 s)
    afterConnect: async (connection) => {
      await connection.promise().query('SET SESSION max_execution_time = 10000');
    },
  },
});

export async function closeDb() {
  try {
    await sequelize.close();
  } catch (err) {
    logger.error({ err }, 'error closing database');
  }
}
