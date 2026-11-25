import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth.jsx';
import { ErrorBox, Notice } from '../components.jsx';

export default function Login() {
  const { user, login, verifyMfa } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [step, setStep] = useState('password'); // 'password' | 'mfa'
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/notes" replace />;

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err);
      // Si el servidor cancelo la verificacion, volver a pedir la contrasena
      if (step === 'mfa' && /Inicia sesion de nuevo/.test(err.message)) {
        setStep('password');
        setCode('');
      }
    } finally {
      setBusy(false);
    }
  };

  const onPassword = (e) => {
    e.preventDefault();
    run(async () => {
      const r = await login(form.email, form.password);
      setForm((f) => ({ ...f, password: '' }));
      if (r.mfaRequired) setStep('mfa');
      else navigate('/notes');
    }).finally(() => setForm((f) => ({ ...f, password: '' })));
  };

  const onMfa = (e) => {
    e.preventDefault();
    run(async () => {
      const r = await verifyMfa(code.trim());
      navigate('/notes', { state: { notice: r.notice } });
    });
  };

  if (step === 'mfa') {
    return (
      <article className="narrow">
        <h2><span aria-hidden="true">&#128241;</span> Verificacion en dos pasos</h2>
        <p className="muted">
          {useRecovery
            ? 'Ingresa uno de tus codigos de respaldo (cada uno sirve una sola vez).'
            : 'Abre Google Authenticator e ingresa el codigo de 6 digitos de SecureVault.'}
        </p>
        <ErrorBox error={error} />
        <form onSubmit={onMfa}>
          {useRecovery ? (
            <input key="rec" required autoFocus autoComplete="off" placeholder="xxxxx-xxxxx" maxLength={11}
              value={code} onChange={(e) => setCode(e.target.value)} aria-label="Codigo de respaldo" />
          ) : (
            <input key="totp" required autoFocus className="otp-input" inputMode="numeric" autoComplete="one-time-code"
              pattern="\d{6}" maxLength={6} placeholder="000000" value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} aria-label="Codigo de 6 digitos" />
          )}
          <button type="submit" aria-busy={busy} disabled={busy}>Verificar</button>
        </form>
        <p>
          <button type="button" className="link-button" onClick={() => { setUseRecovery(!useRecovery); setCode(''); setError(null); }}>
            {useRecovery ? 'Usar el codigo de la app' : 'No tengo mi telefono: usar un codigo de respaldo'}
          </button>
        </p>
      </article>
    );
  }

  return (
    <article className="narrow">
      <h2>Iniciar sesion</h2>
      <Notice>{location.state?.notice}</Notice>
      <ErrorBox error={error} />
      <form onSubmit={onPassword}>
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
