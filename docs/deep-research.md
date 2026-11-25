# Deep Research: despliegue de aplicaciones Node.js en producción

**Proyecto:** SecureVault · **Modalidad:** trabajo individual (victorgonzalez246) · **Fecha:** 25 de noviembre de 2026

## Resumen ejecutivo

Comparamos tres modelos de despliegue (PaaS, contenedores y VPS/IaaS) y tres plataformas concretas (Render, Railway y Fly.io) para publicar SecureVault, una app Node.js/Express + React con base de datos MySQL. Con los planes vigentes en noviembre de 2026, **Render** es la única de las tres con un servicio web gratuito permanente sin tarjeta: 750 horas/mes, HTTPS automático, secretos en el panel y reinicio automático. Su desventaja es que suspende el servicio tras 15 minutos sin tráfico [1][2]. Railway solo ofrece una prueba de 30 días con USD 5 de crédito y luego USD 1/mes [3]. Fly.io ya no da una asignación gratuita a organizaciones nuevas, más allá de un crédito de prueba [4].

Para la base de datos descubrimos que **el plan gratuito de MySQL de Aiven quedó retirado**: desde el 6 de noviembre de 2026 no se pueden crear servicios nuevos [5]. Por eso elegimos **TiDB Cloud Starter**, compatible con el protocolo MySQL, gratuito (5 GiB por instancia) y con TLS obligatorio en el endpoint público. Tiene guía oficial de conexión con Sequelize [6][7].

**Decisión:** Render (Web Service, plan free) + TiDB Cloud Starter + GitHub Actions como CI, con despliegue automático solo cuando CI pasa.

## Respuestas a las preguntas

**1. PaaS vs. contenedores vs. VPS/IaaS.**
- **PaaS** (Render, Railway, Fly.io, Heroku): subes el código y la plataforma compila, ejecuta, emite certificados TLS, reinicia el proceso y guarda secretos. *Ventajas:* rapidez y poca operación. *Desventajas:* menos control (sistema operativo, red), límites del plan y dependencia del proveedor. *Costo:* gratis o bajo al inicio; sube por instancia.
- **Contenedores** (Docker): empaquetan la app y sus dependencias en una imagen reproducible que corre igual en cualquier lugar (un PaaS, Kubernetes o un VPS). *Ventajas:* portabilidad, aislamiento y la opción de correr como usuario no root. *Desventajas:* hay que mantener la imagen y orquestarla.
- **VPS/IaaS** (AWS EC2, DigitalOcean, Azure VM): una máquina virtual completa. *Ventajas:* control total. *Desventajas:* el equipo es responsable de parches del SO, firewall, proxy inverso, certificados, gestor de procesos y respaldos. *Costo:* desde unos USD 4–6/mes, más tiempo de operación.

Para un equipo pequeño con poco tiempo, un PaaS reduce la superficie de errores de configuración (A02).

**2. Comparación de plataformas** (ver la tabla más abajo).

**3. Variables de entorno y secretos.** La configuración que cambia por entorno (URL de la BD, llaves) se inyecta como variables de entorno y no se escribe en el código [8][12]. Un **gestor de secretos** guarda esos valores cifrados, con control de acceso, auditoría y rotación; en Render son las *Environment Variables / Secret Files* del panel [9]. Un archivo `.env` no basta en producción: vive en texto plano en el disco, se copia por error a repositorios o imágenes, no tiene control de acceso ni historial, y no se puede rotar de forma centralizada [8]. Lo usamos solo en desarrollo, excluido por `.gitignore`.

**4. TLS, Let's Encrypt y HSTS.** Un certificado TLS vincula un dominio con una llave pública y está firmado por una autoridad de certificación (CA). Permite cifrar el tráfico y comprobar que el servidor es quien dice ser. **Let's Encrypt** es una CA gratuita y automatizada que usa el protocolo **ACME**: el servidor demuestra que controla el dominio (desafío HTTP-01 o DNS-01) y recibe un certificado de 90 días que se renueva solo [10]. **HSTS** (`Strict-Transport-Security`) ordena al navegador usar únicamente HTTPS con ese dominio durante `max-age`, lo que evita ataques de *downgrade* y *SSL stripping* [11]. SecureVault envía `max-age=31536000; includeSubDomains`.

**5. Proxy inverso y `trust proxy`.** Un proxy inverso (Nginx, Caddy o el balanceador del PaaS) recibe las conexiones públicas, termina TLS, comprime, limita y reenvía a Node.js por la red interna. Así Node no maneja certificados ni se expone directamente. Como la conexión que ve Express viene del proxy, la IP real del cliente y el protocolo llegan en `X-Forwarded-For` y `X-Forwarded-Proto`. `app.set('trust proxy', 1)` le dice a Express que confíe en **un** salto: con eso `req.ip` y `req.secure` son correctos, el rate limit funciona por cliente y las cookies `Secure` se envían [12]. Si se configura `true` sin pensar, un atacante puede falsificar su IP con esa cabecera.

**6. Gestor de procesos.** PM2 o systemd mantienen vivo el proceso Node: lo reinician si cae, lo arrancan con el sistema y gestionan logs y clúster [13]. Hacen falta en un VPS. En **contenedores y PaaS** dejan de ser necesarios, porque la plataforma o el orquestador ya reinician el contenedor y revisan el *health check* (`/health` en nuestro caso).

**7. CI/CD.** La integración continua compila y prueba cada cambio de forma automática; el despliegue continuo publica la versión solo si todo pasó. Pipeline mínimo con GitHub Actions [14]: `actions/checkout` → `actions/setup-node` → `npm ci` (instala exactamente el `package-lock.json`) → `npm audit --audit-level=high` → `npm test` → escaneo de secretos (gitleaks) → despliegue. Nuestro `ci.yml` levanta un MySQL 8 de servicio para las pruebas, y Render despliega solo cuando los checks pasan (`autoDeployTrigger: checksPass`).

**8. Bases de datos gestionadas y conexión segura.** Opciones: Neon y Supabase (PostgreSQL), MongoDB Atlas, TiDB Cloud (compatible con MySQL), y PlanetScale y Aiven (MySQL de pago desde la retirada del plan gratuito de Aiven [5]). Para asegurar la conexión: **TLS obligatorio con verificación del certificado** (en TiDB, Node usa las CA de Mozilla incluidas [7]), **listas de IP autorizadas** o endpoints privados cuando el plan lo permite [6], y un **usuario de mínimo privilegio** con permisos solo sobre la base de la app, nunca el usuario raíz.

**9. Desarrollo vs. producción.** `NODE_ENV=production` activa optimizaciones y desactiva mensajes de depuración [15]. Logs: en producción, JSON estructurado y sin datos sensibles. Errores: mensaje genérico al cliente y detalle solo en el log. CORS: solo el dominio propio. Cookies: `Secure` (solo HTTPS), `HttpOnly`, `SameSite` y prefijo `__Host-`. Además: HTTPS obligatorio con HSTS, secretos desde el panel y no desde `.env`, y `trust proxy` configurado.

**10. Verificaciones después del despliegue.** Cabeceras con **securityheaders.com** o Mozilla Observatory; TLS con **Qualys SSL Labs** [16]; escaneo dinámico con **OWASP ZAP baseline** [17]; `npm audit`; pruebas manuales de IDOR, inyección, XSS y fuerza bruta sobre la URL real; comprobar que HTTP redirige a HTTPS, los atributos de las cookies, que `/health` no revela versiones y que los logs no contienen secretos.

## Tabla comparativa de plataformas (noviembre de 2026)

| Criterio | **Render** | **Railway** | **Fly.io** |
|---|---|---|---|
| Plan gratuito | Sí, permanente: 750 h/mes por workspace [1][2] | Prueba de 30 días con USD 5; luego plan Free de USD 1/mes [3] | Sin asignación gratuita para organizaciones nuevas; crédito de prueba [4] (fuentes contradictorias: verificar en fly.io/docs/about/pricing) |
| ¿Duerme por inactividad? | Sí, tras 15 min; despierta en unos 30–60 s [1][2] | No, mientras haya crédito | Configurable (auto-stop de máquinas) |
| Base de datos | PostgreSQL gratis 30 días; **sin MySQL gestionado** | PostgreSQL, MySQL, Redis (consumen crédito) | Postgres gestionado (de pago) |
| HTTPS automático | Sí (Let's Encrypt), redirección HTTP→HTTPS | Sí | Sí |
| Regiones | Oregón, Ohio, Virginia, Frankfurt, Singapur | Varias (EE. UU., UE, Asia) | Más de 30 regiones |
| Secretos | Panel de variables y Secret Files [9] | Panel de variables | `fly secrets set` |
| Despliegue | Git push / Blueprint `render.yaml` / Docker | Git push / Docker | `flyctl` + Docker |

**Base de datos MySQL gratuita (n/a = no aplica):**

| | TiDB Cloud Starter | Aiven for MySQL |
|---|---|---|
| Plan gratis | Sí: hasta 5 instancias, 5 GiB + 50 M Request Units/mes cada una [6] | **Retirado**: sin servicios nuevos desde el 6/11/2026; los existentes se apagan el 21/12/2026 [5] |
| TLS | Obligatorio en endpoint público [7] | n/a |

## Plan de despliegue para SecureVault

```
Navegador ──HTTPS──▶ Render (proxy TLS, Let's Encrypt)
                       └─▶ Node 24 + Express 5 (sirve React + /api)
                              └─TLS 1.2+ verificado─▶ TiDB Cloud Starter (MySQL)
GitHub ──push──▶ GitHub Actions (npm ci · audit · 28 pruebas · gitleaks) ──checks OK──▶ Render deploy
```

- **Plataforma:** Render Web Service (free), definido en `render.yaml` para que el despliegue sea reproducible. *Justificación:* el único plan gratuito permanente de las tres, con HTTPS, secretos y reinicio automático incluidos. Aceptamos el arranque en frío como riesgo de disponibilidad.
- **Secretos:** `DATABASE_URL`, `SESSION_SECRET` y `ENCRYPTION_KEYS` (llaves AES versionadas) en el panel de Render. En el repositorio solo está `.env.example` con nombres.
- **Base de datos:** TiDB Cloud Starter con un usuario propio con permisos solo sobre la base `securevault`, TLS verificado y lista de IP si el plan lo permite.
- **Pipeline:** `.github/workflows/ci.yml` + Dependabot. Render con `autoDeployTrigger: checksPass`.
- **Arranque:** `npm run db:migrate && npm start`; health check en `/health`; `trust proxy 1`; `NODE_ENV=production`.

## Referencias

1. Render. *Your First Render Deploy* / *Deploy for Free*. https://render.com/docs/your-first-deploy · https://render.com/docs/free
2. Render. *Platforms with a real free tier for developers in 2026*. https://render.com/articles/platforms-with-a-real-free-tier-for-developers-in-2026
3. Railway. *Pricing*. https://railway.com/pricing
4. Fly.io. *Fly.io Resource Pricing*. https://fly.io/docs/about/pricing/
5. Aiven. *Free MySQL database: the MySQL free tier is retired*. https://aiven.io/free-mysql-database
6. PingCAP. *Limitations and Quotas of TiDB Cloud Starter and Essential*. https://docs.pingcap.com/tidbcloud/serverless-limitations/
7. PingCAP. *Connect to TiDB with Sequelize*. https://docs.pingcap.com/tidb/dev/dev-guide-sample-application-nodejs-sequelize
8. OWASP. *Secrets Management Cheat Sheet*. https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
9. Render. *Environment Variables and Secrets*. https://render.com/docs/configure-environment-variables
10. Let's Encrypt. *How It Works*. https://letsencrypt.org/how-it-works/
11. MDN. *Strict-Transport-Security*. https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security
12. Express. *Express behind proxies* y *Security best practices*. https://expressjs.com/en/guide/behind-proxies.html · https://expressjs.com/en/advanced/best-practice-security.html
13. PM2. *Quick Start*. https://pm2.keymetrics.io/docs/usage/quick-start/
14. GitHub Docs. *Building and testing Node.js*. https://docs.github.com/en/actions/use-cases-and-examples/building-and-testing/building-and-testing-nodejs
15. Node.js. *Security Best Practices*. https://nodejs.org/en/learn/getting-started/security-best-practices
16. Qualys. *SSL Server Test*. https://www.ssllabs.com/ssltest/
17. OWASP ZAP. *Baseline Scan*. https://www.zaproxy.org/docs/docker/baseline-scan/
18. OWASP. *OWASP Top 10:2025*. https://owasp.org/Top10/2025/
