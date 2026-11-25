import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../auth.jsx';
import { ErrorBox, PASSWORD_HINT } from '../components.jsx';

export default function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [form, setForm] = useState({ email: '', name: '', password: '', phone: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const d = await register(form);
      // Paso obligatorio: configurar Google Authenticator antes de usar la boveda
      navigate(d.mfaRequired ? '/setup-mfa' : '/notes', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="narrow">
      <h2>Crear cuenta</h2>
      <ErrorBox error={error} />
      <form onSubmit={onSubmit}>
        <label>Nombre<input required maxLength={80} value={form.name} onChange={set('name')} autoComplete="name" /></label>
        <label>Correo<input type="email" required value={form.email} onChange={set('email')} autoComplete="email" /></label>
        <label>Contrasena
          <input type="password" required minLength={12} maxLength={128} value={form.password} onChange={set('password')}
            autoComplete="new-password" aria-describedby="pw-hint" />
          <small id="pw-hint">{PASSWORD_HINT}</small>
        </label>
        <label>Telefono (opcional, se guarda cifrado)
          <input type="tel" maxLength={20} value={form.phone} onChange={set('phone')} placeholder="+506 8888-1234" />
        </label>
        <button type="submit" aria-busy={busy} disabled={busy}>Registrarme</button>
      </form>
      <p><Link to="/login">Ya tengo cuenta</Link></p>
    </article>
  );
}
