import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import session from 'express-session';
import connectSessionSequelize from 'connect-session-sequelize';
import { rateLimit } from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config/env.js';
import { logger } from './logger.js';
import { sequelize } from './db/sequelize.js';
import './db/models.js';
import { csrfProtection, issueCsrfToken, loadUser, HttpError } from './middleware/security.js';
import { authRouter } from './routes/auth.js';
import { notesRouter } from './routes/notes.js';
import { profileRouter } from './routes/profile.js';
import { adminRouter } from './routes/admin.js';

const CLIENT_DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'client', 'dist');
const SESSION_TTL_MS = 30 * 60 * 1000;

export function createApp() {
  const app = express();
  const SequelizeStore = connectSessionSequelize(session.Store);
  const sessionStore = new SequelizeStore({
    db: sequelize,
    table: 'Session',
    expiration: SESSION_TTL_MS,
    checkExpirationInterval: config.isTest ? 0 : 15 * 60 * 1000,
    extendDefaultFields: (defaults, sess) => ({ data: defaults.data, expires: defaults.expires, userId: sess.userId ?? null }),
  });
  // __Host- obliga a Secure, Path=/ y sin Domain (solo en HTTPS)
  const cookieName = config.isProd ? '__Host-sv.sid' : 'sv.sid';
  app.set('sessionCookieName', cookieName);

  // A02: sin X-Powered-By; detras del proxy de la plataforma confiamos en 1 salto
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(pinoHttp({
    logger,
    genReqId: (req, res) => {
      const id = randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
    autoLogging: { ignore: (req) => req.url === '/health' },
    serializers: {
      req: (req) => ({ id: req.id, method: req.method, url: req.url, ip: req.remoteAddress }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  }));

  // A04: HTTPS obligatorio en produccion (se usa APP_ORIGIN, nunca el Host del cliente)
  if (config.isProd) {
    app.use((req, res, next) => {
      if (req.secure || req.path === '/health') return next();
      res.redirect(301, config.APP_ORIGIN + req.originalUrl);
    });
  }

  // A02/A05: cabeceras de seguridad + CSP estricta sin scripts inline
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", 'https://cdn.jsdelivr.net'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        baseUri: ["'self'"],
        upgradeInsecureRequests: config.isProd ? [] : null,
      },
    },
    strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true },
    referrerPolicy: { policy: 'no-referrer' },
  }));
  app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    next();
  });

  // RF-08: health sin versiones ni datos internos (antes de la sesion: no crea cookies)
  app.get('/health', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      await sequelize.query('SELECT 1');
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });

  // Frontend React compilado (mismo origen que la API)
  const hasClient = existsSync(CLIENT_DIST);
  if (hasClient) app.use(express.static(CLIENT_DIST, { index: false, maxAge: '1h' }));

  // A02: CORS restringido al dominio propio
  app.use('/api', cors({ origin: config.APP_ORIGIN, credentials: true }));
  app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }));
  app.use('/api', express.json({ limit: '20kb' }));

  app.use('/api', session({
    store: sessionStore,
    name: cookieName,
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    proxy: true,
    cookie: { httpOnly: true, secure: config.isProd, sameSite: 'strict', maxAge: SESSION_TTL_MS, path: '/' },
  }));
  app.use('/api', loadUser);

  app.get('/api/csrf', (req, res) => res.set('Cache-Control', 'no-store').json({ csrfToken: issueCsrfToken(req) }));
  app.use('/api', csrfProtection);
  app.use('/api/auth', authRouter());
  app.use('/api/notes', notesRouter());
  app.use('/api/profile', profileRouter());
  app.use('/api/admin', adminRouter());
  app.use('/api', (req, res, next) => next(new HttpError(404, 'Recurso no encontrado')));

  // SPA: cualquier otra ruta GET devuelve index.html
  if (hasClient) {
    app.get('/{*splat}', (req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
  }
  app.use((req, res, next) => next(new HttpError(404, 'Recurso no encontrado')));

  // A10: manejador global. Al cliente solo un mensaje generico + id de peticion;
  // el detalle (stack) queda unicamente en el log interno.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    let status = 500;
    if (err instanceof HttpError) status = err.status;
    else if (Number.isInteger(err.status) && err.status >= 400 && err.status < 500) status = err.status;

    const log = req.log ?? logger;
    if (status >= 500) log.error({ err, reqId: req.id }, 'unhandled error');
    else log.warn({ status, reason: err.message, reqId: req.id }, 'request rejected');

    if (res.headersSent) return;
    const message = err instanceof HttpError
      ? err.publicMessage
      : status >= 500 ? 'Ocurrio un error interno. Intenta de nuevo.' : 'Solicitud invalida';
    res.status(status).json({ error: message, requestId: req.id });
  });

  app.locals.sessionStore = sessionStore;
  return app;
}
