import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { api, resetCsrf } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [mfaRequired, setMfaRequired] = useState(true);
  const [loading, setLoading] = useState(true);

  const apply = useCallback((d) => {
    setUser(d?.user ?? null);
    if (typeof d?.mfaRequired === 'boolean') setMfaRequired(d.mfaRequired);
  }, []);

  const refresh = useCallback(
    () => api('/auth/me').then(apply).catch(() => setUser(null)),
    [apply],
  );

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  // Crea la cuenta y deja la sesion iniciada (luego se exige configurar Google Authenticator)
  const register = useCallback(async (form) => {
    const d = await api('/auth/register', { method: 'POST', body: form });
    apply(d);
    return d;
  }, [apply]);

  // Devuelve { mfaRequired: true } si la cuenta pide el codigo de Google Authenticator
  const login = useCallback(async (email, password) => {
    const d = await api('/auth/login', { method: 'POST', body: { email, password } });
    if (d.mfaRequired && !d.user) return { mfaRequired: true };
    apply(d);
    return { user: d.user };
  }, [apply]);

  const verifyMfa = useCallback(async (code) => {
    const d = await api('/auth/mfa', { method: 'POST', body: { code } });
    apply(d);
    return d;
  }, [apply]);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      resetCsrf();
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, mfaRequired, loading, register, login, verifyMfa, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

export const needsEnrollment = (user, mfaRequired) => Boolean(user && mfaRequired && !user.mfaEnabled);

// Protege rutas en la interfaz. OJO: es solo comodidad visual;
// la autorizacion real (incluida la MFA obligatoria) se verifica SIEMPRE en el servidor.
export function Protected({ role, children }) {
  const { user, mfaRequired, loading } = useAuth();
  if (loading) return <p aria-busy="true">Cargando...</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (needsEnrollment(user, mfaRequired)) return <Navigate to="/setup-mfa" replace />;
  if (role && user.role !== role) return <Navigate to="/notes" replace />;
  return children;
}

// Pantalla de configuracion obligatoria: solo para sesiones que aun no tienen MFA
export function EnrollmentRoute({ children }) {
  const { user, mfaRequired, loading } = useAuth();
  if (loading) return <p aria-busy="true">Cargando...</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (!needsEnrollment(user, mfaRequired)) return <Navigate to="/notes" replace />;
  return children;
}
