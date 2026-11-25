// A01 (SSRF): toda peticion saliente pasa por aqui. Solo HTTPS, solo hosts de la
// lista blanca, sin seguir redirecciones y con timeout (A10).
const ALLOWED_HOSTS = new Set(['api.resend.com', 'hooks.slack.com', 'discord.com']);

export async function safeFetch(url, options = {}) {
  const target = new URL(url);
  if (target.protocol !== 'https:' || !ALLOWED_HOSTS.has(target.hostname)) {
    throw new Error(`Outbound destination not allowed: ${target.hostname}`);
  }
  return fetch(target, { ...options, redirect: 'error', signal: AbortSignal.timeout(5000) });
}
