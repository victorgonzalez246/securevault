import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ErrorBox } from '../components.jsx';
import Icon from '../Icon.jsx';

const ALERT_EVENTS = new Set(['mfa_fail', 'mfa_rate_limited', 'mfa_disabled', 'login_fail', 'login_blocked', 'login_rate_limited', 'access_denied', 'security_alert', 'role_change']);

export default function Admin() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [u, a] = await Promise.all([api('/admin/users'), api('/admin/audit')]);
      setUsers(u.users);
      setEvents(a.events);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const changeRole = async (id, role) => {
    setError(null);
    try {
      await api(`/admin/users/${id}/role`, { method: 'PATCH', body: { role } });
      load();
    } catch (err) {
      setError(err);
    }
  };

  return (
    <>
      <div className="page-heading"><div><span className="overline">CONTROL Y VISIBILIDAD</span><h1>Administración</h1><p>Gestiona los accesos y revisa la actividad de seguridad.</p></div><button className="outline" onClick={load} disabled={loading}>{loading ? 'Cargando…' : 'Actualizar'}</button></div>
      <ErrorBox error={error} />
      <div className="stats"><div className="stat"><span>Usuarios registrados</span><strong>{loading ? '—' : users.length}</strong><small>Acceso por roles</small></div><div className="stat"><span>Verificación en dos pasos</span><strong>{loading ? '—' : users.filter(u => u.totpEnabled).length}</strong><small>Cuentas con MFA activa</small></div><div className="stat"><span>Eventos de seguridad</span><strong>{loading ? '—' : events.length}</strong><small>En la bitácora consultada</small></div></div>
      <h3>Usuarios ({users.length})</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>Correo</th><th>Nombre</th><th>Rol</th><th>MFA</th><th>Fallos</th><th>Bloqueado hasta</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.id}</td><td>{u.email}</td><td>{u.name}</td>
                <td>
                  {u.id === user.id ? (
                    <span className="badge badge-admin">{u.role} (tu)</span>
                  ) : (
                    <select value={u.role} onChange={(e) => changeRole(u.id, e.target.value)} aria-label={`Rol de ${u.email}`}>
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                  )}
                </td>
                <td>{u.totpEnabled ? <span className="badge badge-ok">activa</span> : <span className="badge">no</span>}</td>
                <td>{u.failedAttempts}</td>
                <td>{u.lockedUntil && new Date(u.lockedUntil) > new Date() ? new Date(u.lockedUntil).toLocaleString() : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="row">Bitacora de seguridad <button className="outline small" onClick={load}>Actualizar</button></h3>
      <div className="search-field"><Icon name="search" /><input type="search" aria-label="Buscar eventos de seguridad" placeholder="Buscar evento, usuario o IP…" value={query} onChange={e => setQuery(e.target.value)} /></div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>Evento</th><th>Usuario</th><th>IP</th><th>Detalle</th></tr></thead>
          <tbody>
            {events.filter(e => [e.event, e.user, e.ip, JSON.stringify(e.detail)].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase())).map((e) => (
              <tr key={e.id}>
                <td><small>{new Date(e.createdAt).toLocaleString()}</small></td>
                <td><span className={`badge ${ALERT_EVENTS.has(e.event) ? 'badge-alert' : ''}`}>{e.event}</span></td>
                <td>{e.user ?? '-'}</td>
                <td><small>{e.ip}</small></td>
                <td><small><code>{e.detail ? JSON.stringify(e.detail) : ''}</code></small></td>
              </tr>
            ))}
            {!loading && !events.some(e => [e.event, e.user, e.ip, JSON.stringify(e.detail)].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase())) && <tr><td colSpan={5}>No hay eventos que mostrar.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
