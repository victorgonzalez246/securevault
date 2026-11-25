import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { api, resetCsrf } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  // Devuelve { mfaRequired: true } si la cuenta tiene verificacion en dos pasos
  const login = useCallback(async (email, password) => {
    const d = await api('/auth/login', { method: 'POST', body: { email, password } });
    if (d.mfaRequired) return { mfaRequired: true };
    setUser(d.user);
    return { user: d.user };
  }, []);

  const verifyMfa = useCallback(async (code) => {
    const d = await api('/auth/mfa', { method: 'POST', body: { code } });
    setUser(d.user);
    return d;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      resetCsrf();
      setUser(null);
    }
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, verifyMfa, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

// Protege rutas en la interfaz. OJO: es solo comodidad visual;
// la autorizacion real se verifica SIEMPRE en el servidor.
export function Protected({ role, children }) {
  const { user, loading } = useAuth();
  if (loading) return <p aria-busy="true">Cargando...</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/notes" replace />;
  return children;
}
