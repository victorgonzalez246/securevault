// A09: bitacora de eventos de seguridad (BD + log JSON) y alertas.
// REGLA: "detail" nunca lleva contrasenas, tokens ni datos cifrados/sensibles.
import { AuditLog } from '../db/models.js';
import { logger } from '../logger.js';
import { config } from '../config/env.js';
import { safeFetch } from './http.js';

export async function audit(req, event, detail = {}, userId = req.user?.id ?? null) {
  logger.info({ securityEvent: event, userId, ip: req.ip, reqId: req.id, ...detail }, 'security_event');
  try {
    await AuditLog.create({ userId, event, detail, ip: req.ip });
  } catch (err) {
    logger.error({ err: { message: err.message } }, 'audit insert failed');
  }
}

export async function alert(req, message, detail = {}) {
  logger.warn({ alert: true, ip: req.ip, ...detail }, message);
  await audit(req, 'security_alert', { message, ...detail });
  if (!config.ALERT_WEBHOOK_URL) return;
  try {
    // Formato compatible con Discord (content) y Slack (text)
    const text = `[SecureVault] ${message} ${JSON.stringify(detail)}`;
    await safeFetch(config.ALERT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text, text }),
    });
  } catch (err) {
    logger.error({ err: { message: err.message } }, 'alert webhook failed');
  }
}
