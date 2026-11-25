// Modelo de datos. Los campos *_enc guardan texto cifrado con AES-256-GCM.
import { DataTypes } from 'sequelize';
import { sequelize } from './sequelize.js';

export const LIMITS = Object.freeze({
  MAX_NOTES_PER_USER: 100, // A06: limite de negocio
  MAX_NOTE_TITLE: 120,
  MAX_NOTE_CONTENT: 10_000,
});

export const User = sequelize.define('User', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  email: { type: DataTypes.STRING(254), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(80), allowNull: false },
  passwordHash: { type: DataTypes.STRING(255), allowNull: false },
  role: { type: DataTypes.ENUM('user', 'admin'), allowNull: false, defaultValue: 'user' },
  phoneEnc: { type: DataTypes.TEXT, allowNull: true },
  failedAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  lockedUntil: { type: DataTypes.DATE, allowNull: true },
}, { tableName: 'users' });

export const Note = sequelize.define('Note', {
  id: { type: DataTypes.UUID, primaryKey: true }, // UUID generado en la app (no adivinable)
  ownerId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  titleEnc: { type: DataTypes.TEXT, allowNull: false },
  contentEnc: { type: DataTypes.TEXT('medium'), allowNull: false },
}, { tableName: 'notes', indexes: [{ fields: ['owner_id'] }] });

export const PasswordReset = sequelize.define('PasswordReset', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  tokenHash: { type: DataTypes.CHAR(64), allowNull: false, unique: true }, // SHA-256, nunca el token
  expiresAt: { type: DataTypes.DATE, allowNull: false },
  usedAt: { type: DataTypes.DATE, allowNull: true },
}, { tableName: 'password_resets', updatedAt: false });

export const AuditLog = sequelize.define('AuditLog', {
  id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
  userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  event: { type: DataTypes.STRING(50), allowNull: false },
  detail: { type: DataTypes.JSON, allowNull: true },
  ip: { type: DataTypes.STRING(64), allowNull: true },
}, { tableName: 'audit_log', updatedAt: false, indexes: [{ fields: ['created_at'] }] });

// Tabla de sesiones (connect-session-sequelize) con user_id para poder
// invalidar todas las sesiones de un usuario (p. ej. tras cambiar la contrasena).
export const Session = sequelize.define('Session', {
  sid: { type: DataTypes.STRING(64), primaryKey: true },
  userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
  expires: { type: DataTypes.DATE },
  data: { type: DataTypes.TEXT },
}, { tableName: 'sessions', indexes: [{ fields: ['user_id'] }, { fields: ['expires'] }] });

User.hasMany(Note, { foreignKey: 'ownerId', onDelete: 'CASCADE' });
Note.belongsTo(User, { foreignKey: 'ownerId' });
User.hasMany(PasswordReset, { foreignKey: 'userId', onDelete: 'CASCADE' });
AuditLog.belongsTo(User, { foreignKey: 'userId', constraints: true, onDelete: 'SET NULL' });

export const noteAad = (note, field) => `note:${note.ownerId}:${note.id}:${field}`;
export const phoneAad = (userId) => `user:${userId}:phone`;
