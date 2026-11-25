# Despliegue paso a paso (copiar y pegar)

Tiempo estimado: 20–30 minutos. Los valores secretos están en `privado/SECRETOS-PRODUCCION.md` (solo en tu PC; no está en GitHub).

---

## Paso 1 — Base de datos en TiDB Cloud (MySQL gratis, 5 min)

1. Entra a **https://tidbcloud.com** y regístrate con tu cuenta de GitHub o Google.
2. **Create Cluster** → plan **Starter** (gratis) → proveedor **AWS**, región **Oregon (us-west-2)**, la misma que Render → **Create**.
3. En el clúster pulsa **Connect**:
   - *Connection Type*: **Public**
   - Pulsa **Generate Password** y copia la contraseña (se muestra una sola vez).
   - Anota **HOST**, **PORT** (4000) y **USER** (algo como `4Xyz123abc.root`).
4. Arma tu `DATABASE_URL` con este formato (la base `securevault` se crea sola al primer arranque):

```
mysql://USER:PASSWORD@HOST:4000/securevault
```

Ejemplo: `mysql://4Xyz123abc.root:AbCd1234EfGh@gateway01.us-west-2.prod.aws.tidbcloud.com:4000/securevault`

> Si la contraseña tiene símbolos (`@ : / ? # %`), genera otra hasta que salga solo con letras y números, o codifícala con `encodeURIComponent`.

---

## Paso 2 — App en Render (5–10 min)

1. Entra a **https://render.com** → **Get Started** → **GitHub**, y autoriza el acceso al repositorio **securevault**.
2. **New +** → **Blueprint** → elige `victorgonzalez246/securevault` → **Connect**.
3. Render lee `render.yaml` y pide 2 valores. Pega:
   - `DATABASE_URL` → la del paso 1
   - `ENCRYPTION_KEYS` → el valor de `privado/SECRETOS-PRODUCCION.md` (sección 1)
4. **Apply** / **Deploy Blueprint**. Espera a que el log diga `SecureVault listening` (3–5 min).
5. Copia la URL que aparece arriba en el servicio, por ejemplo `https://securevault-abcd.onrender.com`.

Render configura solo: HTTPS (Let's Encrypt), redirección de HTTP a HTTPS, `SESSION_SECRET` aleatorio, `APP_ORIGIN` (desde `RENDER_EXTERNAL_URL`), health check en `/health`, reinicio automático, y deploy solo cuando el CI de GitHub pasa.

---

## Paso 3 — Crear el administrador y el usuario de prueba (1 min)

En PowerShell, desde la carpeta del proyecto (pega tu `DATABASE_URL` entre comillas simples):

```powershell
cd "C:\Users\HP78D\Downloads\lab owasp"
powershell -ExecutionPolicy Bypass -File privado\crear-usuarios.ps1 'PEGA_AQUI_TU_DATABASE_URL'
```

Las credenciales que crea están en `privado/SECRETOS-PRODUCCION.md` (sección 3).

---

## Paso 4 — Verificación de seguridad en producción (2 min)

```powershell
npm run verify:prod -- https://TU-URL.onrender.com
```

Ejecuta 20 pruebas contra tu URL (IDOR, CSRF, SQLi, XSS, cabeceras, HTTPS, cookies, errores y fuerza bruta → 429) y guarda la evidencia en `entregables/evidencia-produccion.md`.

> La última prueba (fuerza bruta) deja tu IP limitada en `/login` por 15 minutos. Hazla **después** de grabar la demo, o espera 15 min antes de iniciar sesión.

**Escaneo OWASP ZAP** (corre en GitHub, no hay que instalar nada):

```powershell
gh workflow run zap.yml -f url=https://TU-URL.onrender.com
gh run watch $(gh run list --workflow=zap.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run download $(gh run list --workflow=zap.yml --limit 1 --json databaseId --jq '.[0].databaseId') -n zap-report -D entregables/zap
```

Abre `entregables/zap/report_html.html` y toma una captura.

**Escáneres web** (abre cada enlace, espera el resultado y toma una captura):
- Cabeceras: `https://securityheaders.com/?q=https://TU-URL.onrender.com&followRedirects=on`
- TLS: `https://www.ssllabs.com/ssltest/analyze.html?d=TU-URL.onrender.com&hideResults=on`

---

## Paso 5 — Generar los PDF finales (1 min)

```powershell
npm run docs:pdf -- https://TU-URL.onrender.com
```

Quedan en `entregables/`: `deep-research.pdf`, `security-report.pdf`, `threat-model.pdf` y `evidencia-produccion.pdf`.

---

## Paso 6 — Entregar

- Enviar al docente, por canal privado, el mensaje de `privado/SECRETOS-PRODUCCION.md` (sección 3) con la URL y las credenciales.
- Dar acceso al repositorio privado (comando en la misma sección).
- Grabar la demo siguiendo `docs/DEMO-GUION.md`.

## Si algo falla

| Síntoma | Solución |
|---|---|
| El deploy falla con `Configuracion invalida -> ENCRYPTION_KEYS` | Revisa que pegaste `1:` + la llave completa, sin espacios |
| `migration failed` con `ER_ACCESS_DENIED` | USER o PASSWORD de TiDB mal copiados; genera otra contraseña |
| `migration failed` con `ETIMEDOUT` | HOST o PUERTO incorrectos (debe ser 4000) |
| La página tarda ~1 min | Normal en el plan gratuito: el servicio estaba dormido |
| El deploy no arranca tras un push | Render espera a que el CI de GitHub pase (`checksPass`) |
