import { randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from '../config/env.js';
import { User } from '../db/models.js';
import { audit } from '../services/audit.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const ABSOLUTE_SESSION_MS = 8 * 60 * 60 * 1000;

export class HttpError extends Error {
  constructor(status, publicMessage) {
    super(publicMessage);
    this.status = status;
    this.publicMessage = publicMessage;
  }
}

// A01/CSRF: en peticiones que cambian estado se exige (1) Origin igual al de la app
// y (2) cabecera X-CSRF-Token igual al token guardado en la sesion.
export function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.get('origin');
  if (origin && origin !== config.APP_ORIGIN) return next(new HttpError(403, 'Solicitud no permitida'));
  const expected = req.session?.csrfToken;
  const sent = req.get('x-csrf-token');
  if (!expected || !sent) return next(new HttpError(403, 'Solicitud no permitida'));
  const a = Buffer.from(sent);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return next(new HttpError(403, 'Solicitud no permitida'));
  next();
}

export function issueCsrfToken(req) {
  req.session.csrfToken ??= randomBytes(32).toString('base64url');
  return req.session.csrfToken;
}

// Carga el usuario en cada peticion desde la BD: el rol se verifica SIEMPRE en el
// servidor y un cambio de rol surte efecto de inmediato (RF-03).
export async function loadUser(req, res, next) {
  req.user = null;
  const { userId, authAt } = req.session ?? {};
  if (!userId) return next();
  if (!authAt || Date.now() - authAt > ABSOLUTE_SESSION_MS) {
    return req.session.regenerate(() => next()); // expiracion absoluta de la sesion
  }
  const user = await User.findByPk(userId, { attributes: ['id', 'email', 'name', 'role'] });
  if (!user) return req.session.regenerate(() => next());
  req.user = user;
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return next(new HttpError(401, 'Debes iniciar sesion'));
  next();
}

// Denegar por defecto: solo pasan los roles listados.
export const requireRole = (...roles) => async (req, res, next) => {
  if (!req.user) return next(new HttpError(401, 'Debes iniciar sesion'));
  if (!roles.includes(req.user.role)) {
    await audit(req, 'access_denied', { path: req.originalUrl, requiredRole: roles.join(',') });
    return next(new HttpError(403, 'Acceso denegado'));
  }
  next();
};

// Valida req.body / req.params con un esquema zod. Rechaza campos desconocidos.
export const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    return res.status(400).json({
      error: 'Datos invalidos',
      fields: result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }
  req.valid = { ...req.valid, [source]: result.data };
  next();
};
