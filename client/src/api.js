// Cliente de la API. La sesion viaja en una cookie HttpOnly (JavaScript no puede leerla);
// las peticiones que cambian estado llevan el token CSRF en la cabecera X-CSRF-Token.
let csrfToken = null;

export class ApiError extends Error {
  constructor(status, data) {
    super(data?.error || 'Error inesperado');
    this.status = status;
    this.fields = data?.fields ?? [];
  }
}

async function getCsrf() {
  if (!csrfToken) {
    const res = await fetch('/api/csrf', { credentials: 'same-origin' });
    csrfToken = (await res.json()).csrfToken;
  }
  return csrfToken;
}

export const resetCsrf = () => {
  csrfToken = null;
};

export async function api(path, { method = 'GET', body } = {}, retried = false) {
  const headers = {};
  if (method !== 'GET') {
    headers['X-CSRF-Token'] = await getCsrf();
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));

  // La sesion pudo expirar y con ella el token CSRF: se pide uno nuevo una sola vez
  if (res.status === 403 && data.error === 'Solicitud no permitida' && !retried) {
    resetCsrf();
    return api(path, { method, body }, true);
  }
  if (!res.ok) throw new ApiError(res.status, data);
  if (data.csrfToken) csrfToken = data.csrfToken;
  return data;
}
