# Guion de la demostración (10 minutos)

**Preparación (antes de grabar):**
- Abre la URL una vez para "despertar" el servicio (plan gratuito de Render).
- Ten dos navegadores: uno normal (**usuario**) y otro en incógnito (**admin**).
- Ten PowerShell abierto con la variable de la URL:

```powershell
$u = 'https://TU-URL.onrender.com'
```

- En el navegador normal, inicia sesión como **usuario**, crea una nota "Mi nota privada" y **copia su URL** (`/notes/<uuid>`).

---

## 1. Introducción (1 min)
"SecureVault guarda notas privadas cifradas con AES-256-GCM. Stack: React, Express 5, Sequelize y MySQL (TiDB Cloud), desplegado en Render con HTTPS y un pipeline de CI que ejecuta 34 pruebas de seguridad, npm audit y gitleaks antes de cada deploy."

Muestra: la URL con el candado HTTPS, y en GitHub → **Actions** el CI en verde.

## 2. Funcionalidad + MFA con Google Authenticator (2 min)
1. **Perfil** → teléfono enmascarado `***-***-1234` → **Mostrar completo**.
2. **Activar con Google Authenticator** → escanear el QR con el teléfono → escribir el código → se muestran los 8 códigos de respaldo.
3. **Salir** → iniciar sesión → la contraseña sola **no basta**: pide el código de 6 dígitos → ingresarlo.
4. Explicar: el secreto TOTP se guarda cifrado, cada código sirve una sola vez (anti-replay) y hay 5 intentos máximo.

## 3. Ataque 1 — IDOR / Broken Access Control (A01) (1 min)
En el navegador **admin** (incógnito), pega la URL de la nota del usuario:
→ **"Nota no encontrada"** (404).

Luego, como admin: **Administración → Bitácora** → aparece el evento `access_denied`.

## 4. Ataque 2 — Fuerza bruta (A07) (1.5 min)
```powershell
$r = Invoke-RestMethod "$u/api/csrf" -SessionVariable s
foreach ($i in 1..6) {
  try {
    Invoke-RestMethod "$u/api/auth/login" -Method Post -WebSession $s -ContentType 'application/json' `
      -Headers @{ 'X-CSRF-Token' = $r.csrfToken; Origin = $u } `
      -Body '{"email":"usuario@securevault.dev","password":"Incorrecta#123"}' | Out-Null
  } catch { "Intento $i -> HTTP $($_.Exception.Response.StatusCode.value__)" }
}
```
Resultado esperado: `401, 401, 401, 401, 401, 429`. Luego, en **Bitácora**: `login_fail` ×5, `security_alert` y `login_rate_limited`.

> Tu IP queda limitada en el login unos 15 minutos y la cuenta de usuario se bloquea 1 minuto: haz este ataque al final o usa la sesión que ya tienes abierta.

## 5. Ataque 3 — Inyección SQL y XSS (A05) (1.5 min)
- **SQL injection:** en el login escribe correo `' OR 1=1 --` y contraseña `' OR 1=1 --` → "Correo o contraseña incorrectos".
- **XSS:** crea una nota con título `<script>alert(1)</script>` y contenido `<img src=x onerror=alert(1)>` → se muestra como **texto**; no sale ninguna alerta. React escapa la salida y la CSP `script-src 'self'` bloquea scripts inline.

## 6. Datos cifrados en la base (A04) (1 min)
En **TiDB Cloud → SQL Editor**:
```sql
USE securevault;
SELECT email, password_hash, phone_enc, totp_secret_enc FROM users;
SELECT title_enc, content_enc FROM notes;
```
Señala: `$argon2id$...` y `v1.<iv>.<tag>.<datos>`, ilegibles sin la llave, que vive en los secretos de Render y no en la BD ni en GitHub.

## 7. Configuración y verificación (1.5 min)
- **securityheaders.com** → calificación A/A+.
- **SSL Labs** → calificación A.
- `npm run verify:prod -- $u` → 20/20 OK (si no hiciste el ataque 2 hace menos de 15 min).
- Reporte de **OWASP ZAP** (de GitHub Actions).

## 8. Cierre (30 s)
"Cubrimos las 10 categorías del OWASP Top 10:2025 con evidencia, más las bonificaciones: MFA con TOTP, rotación de llaves, Dockerfile no root, gitleaks en CI y alertas. Los riesgos residuales están en el informe."
