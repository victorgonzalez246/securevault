import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth.jsx';
import { ErrorBox, Notice } from '../components.jsx';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/notes" replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(form.email, form.password);
      navigate('/notes');
    } catch (err) {
      setError(err);
      setForm((f) => ({ ...f, password: '' }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="narrow">
      <h2>Iniciar sesion</h2>
      <Notice>{location.state?.notice}</Notice>
      <ErrorBox error={error} />
      <form onSubmit={onSubmit}>
        <label>Correo
          <input type="email" autoComplete="username" required value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <label>Contrasena
          <input type="password" autoComplete="current-password" required maxLength={128} value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </label>
        <button type="submit" aria-busy={busy} disabled={busy}>Entrar</button>
      </form>
      <p><Link to="/forgot">Olvide mi contrasena</Link> &middot; <Link to="/register">Crear cuenta</Link></p>
    </article>
  );
}
