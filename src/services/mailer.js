// Envio del enlace de recuperacion. El token viaja en el fragmento (#) de la URL:
// el navegador nunca lo envia al servidor, asi no queda en logs ni en cabeceras Referer.
import { config } from '../config/env.js';
import { logger } from '../logger.js';
import { safeFetch } from './http.js';

export async function sendPasswordResetEmail(email, token) {
  const link = `${config.APP_ORIGIN}/reset#token=${token}`;

  if (!config.RESEND_API_KEY) {
    if (!config.isProd && !config.isTest) {
      // SOLO en desarrollo local: se imprime en consola (no en el log estructurado)
      console.info(`\n[DEV] Enlace de recuperacion para ${email}: ${link}\n`);
    } else if (config.isProd) {
      logger.warn('RESEND_API_KEY not configured: reset email not sent');
    }
    return;
  }

  const res = await safeFetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: config.MAIL_FROM ?? 'SecureVault <onboarding@resend.dev>',
      to: [email],
      subject: 'Recupera tu contrasena de SecureVault',
      text: `Usa este enlace en los proximos 15 minutos: ${link}\nSi no lo solicitaste, ignora este correo.`,
    }),
  });
  if (!res.ok) logger.error({ status: res.status }, 'reset email provider error');
}
