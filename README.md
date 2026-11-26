# SecureVault

**Aplicación desplegada:** https://securevault-w3bn.onrender.com

**Repositorio:** https://github.com/victorgonzalez246/securevault


Aplicación web para guardar **notas privadas** y **datos personales sensibles** con cifrado autenticado, construida para el laboratorio *Sistema seguro en Node.js: OWASP Top 10:2025, cifrado, hash y despliegue a producción*.

| Capa | Tecnología |
|---|---|
| Frontend | React 19 + Vite + React Router, estilos propios y SRI en recursos compilados |
| Backend | Node.js 24 LTS + Express 5 |
| Base de datos | MySQL 8 (local) / TiDB Cloud Starter, compatible con MySQL (producción) mediante **Sequelize** |
| Seguridad | helmet (CSP), express-rate-limit, zod, argon2 (Argon2id), `node:crypto` (AES-256-GCM), express-session |
| Logs | pino (JSON estructurado) |
| CI/CD | GitHub Actions (npm ci, npm audit, pruebas, gitleaks) + Render (`autoDeployTrigger: checksPass`) |

## Funcionalidades (RF-01 a RF-08)

- **RF-01** Registro con política de contraseña (12+ caracteres, mayúscula, minúscula, número y símbolo). Hash Argon2id.
- **RF-02** Login/logout con sesión en cookie `HttpOnly; Secure; SameSite=Strict` (`__Host-` en producción), 30 min de inactividad y 8 h de duración máxima. El logout destruye la sesión en el servidor.
- **MFA obligatoria (bonificación)** Verificación en dos pasos con **Google Authenticator**, exigida desde la creación de la cuenta (el servidor bloquea todo hasta configurarla; `MFA_REQUIRED=true` por defecto) (TOTP RFC 6238): QR, secreto cifrado, anti-replay y 8 códigos de respaldo de un solo uso.
- **RF-03** Roles `user` y `admin`, verificados en el servidor en cada petición (el rol se lee de la BD).
- **RF-04** CRUD de notas. Cada consulta filtra por `owner_id`. Título y contenido cifrados con AES-256-GCM.
- **RF-05** Teléfono cifrado y mostrado como `***-***-1234`. Mostrarlo completo queda en la bitácora.
- **RF-06** Recuperación con token de 256 bits, un solo uso y 15 min de validez. En la BD solo se guarda el SHA-256 del token.
- **RF-07** Panel de administración: usuarios, cambio de rol y bitácora de seguridad.
- **RF-08** `GET /health` → `{"status":"ok"}` (sin versiones ni datos internos).

## Instalación local

Requisitos: Node.js 22+ y MySQL 8.

```bash
# 1. Crear las BD y un usuario de minimo privilegio (en MySQL Workbench, como root):
#    CREATE DATABASE securevault; CREATE DATABASE securevault_test;
#    CREATE USER 'securevault'@'localhost' IDENTIFIED BY '<contrasena>';
#    GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES ON securevault.* TO 'securevault'@'localhost';
#    (lo mismo para securevault_test)

# 2. Configurar variables
cp .env.example .env              # completar valores
npm run gen-key                   # genera una llave AES de 32 bytes -> ENCRYPTION_KEYS=1:<llave>
echo "DATABASE_URL=mysql://securevault:<contrasena>@127.0.0.1:3306/securevault_test" > .env.test

# 3. Instalar, crear tablas y ejecutar
npm ci
npm run build                     # compila el frontend React
npm run db:migrate
npm run dev                       # API en :3000
npm run dev --prefix client       # React en :5173 (proxy a la API)
```

Crear un administrador (las credenciales se pasan por la terminal y no se guardan en archivos):

```powershell
$env:ADMIN_EMAIL="admin@dominio.com"; $env:ADMIN_PASSWORD="<contrasena fuerte>"; npm run create-admin
```

## Pruebas

```bash
npm test             # 36 pruebas: MFA, IDOR, CSRF, inyección, fuerza bruta (429), cripto, errores genéricos...
npm run test:audit   # npm audit (backend + frontend), falla con altas/críticas
```

## Variables de entorno (solo nombres)

| Variable | Descripción |
|---|---|
| `NODE_ENV` | `production` en el servidor |
| `PORT` | Puerto HTTP (lo asigna la plataforma) |
| `APP_ORIGIN` | URL pública exacta, p. ej. `https://securevault.onrender.com` (CORS, CSRF y redirección a HTTPS) |
| `DATABASE_URL` | `mysql://usuario:contraseña@host:puerto/base` |
| `DB_SSL` | `true` en producción (TLS 1.2+ con verificación del certificado) |
| `DB_CA_CERT` | (Opcional) PEM de la CA del proveedor |
| `SESSION_SECRET` | 32+ caracteres aleatorios |
| `ENCRYPTION_KEYS` | Llaves AES-256 versionadas: `1:<base64>,2:<base64>` |
| `ENCRYPTION_KEY_CURRENT` | Versión de llave con la que se cifra lo nuevo |
| `RESEND_API_KEY`, `MAIL_FROM` | (Opcional) envío del correo de recuperación |
| `ALERT_WEBHOOK_URL` | (Opcional) webhook de Discord/Slack para alertas de seguridad |

## Despliegue a producción (Render + TiDB Cloud)

Guía completa para copiar y pegar: **[docs/DEPLOY.md](docs/DEPLOY.md)**. En resumen:

1. TiDB Cloud Starter (MySQL gratis, TLS obligatorio) → `DATABASE_URL`. La base se crea sola al arrancar.
2. Render → *New → Blueprint* con este repo (`render.yaml`) → pegar `DATABASE_URL` y `ENCRYPTION_KEYS`. `SESSION_SECRET` lo genera Render y `APP_ORIGIN` sale de `RENDER_EXTERNAL_URL`.
3. Cada push a `main` se despliega **solo si el CI pasa** (`autoDeployTrigger: checksPass`). HTTPS, redirección a HTTPS y reinicio automático los da la plataforma.
4. Verificación: `npm run verify:prod -- https://<url>` (20 pruebas de ataque), ZAP baseline (`gh workflow run zap.yml -f url=https://<url>`), securityheaders.com y SSL Labs.
5. PDFs de entrega: `npm run docs:pdf -- https://<url>`.

> Las credenciales de prueba (usuario y admin) se entregan al docente por canal privado, no en este README.

## Rotación de llaves

1. `npm run gen-key` → agregar como versión nueva: `ENCRYPTION_KEYS=1:<vieja>,2:<nueva>` y `ENCRYPTION_KEY_CURRENT=2`.
2. Desplegar: lo nuevo se cifra con v2 y lo viejo se sigue leyendo con v1.
3. `npm run rotate-keys`: re-cifra todo en una transacción. Si algo falla, no se pierde nada.
4. Retirar la llave 1.

## Documentación

- [`docs/deep-research.md`](docs/deep-research.md): investigación de despliegue (Fase 0)
- [`docs/threat-model.md`](docs/threat-model.md): modelo de amenazas STRIDE (A06)
- [`docs/security-report.md`](docs/security-report.md): informe OWASP Top 10:2025 con evidencias
- [`docs/DEPLOY.md`](docs/DEPLOY.md): despliegue paso a paso
- [`docs/DEMO-GUION.md`](docs/DEMO-GUION.md): guion de la demostración de 10 minutos
