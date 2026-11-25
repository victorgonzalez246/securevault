import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { ErrorBox, Notice } from '../components.jsx';
import { useAuth } from '../auth.jsx';

// Configuracion de la verificacion en dos pasos con Google Authenticator
// onboarding: paso obligatorio tras crear la cuenta; onDone se llama cuando el usuario guardo sus codigos
export default function MfaSettings({ onboarding = false, onDone }) {
  const { refresh: refreshAuth } = useAuth();
  const [status, setStatus] = useState(null);
  const [setup, setSetup] = useState(null); // { qr, secret }
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState(null);
  const [disableForm, setDisableForm] = useState(null); // { password, code }
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  const refresh = () => api('/mfa/status').then(setStatus).catch(setError);
  useEffect(() => {
    refresh();
  }, []);

  const act = async (fn) => {
    setError(null);
    setMsg(null);
    try {
      await fn();
    } catch (err) {
      setError(err);
    }
  };

  const start = () => act(async () => setSetup(await api('/mfa/setup', { method: 'POST' })));

  const confirm = (e) => {
    e.preventDefault();
    act(async () => {
      const d = await api('/mfa/enable', { method: 'POST', body: { code } });
      setRecoveryCodes(d.recoveryCodes);
      setSetup(null);
      setCode('');
      refresh();
    });
  };

  const disable = (e) => {
    e.preventDefault();
    act(async () => {
      const d = await api('/mfa/disable', { method: 'POST', body: disableForm });
      setDisableForm(null);
      setMsg(d.message);
      await refreshAuth(); // la MFA es obligatoria: la app pedira configurarla de nuevo
      refresh();
    });
  };

  if (!status) return null;

  return (
    <article>
      <header className="row">
        <h3 className="no-margin">Verificacion en dos pasos</h3>
        <span className={`badge ${status.enabled ? 'badge-ok' : 'badge-alert'}`}>{status.enabled ? 'Activa' : 'Desactivada'}</span>
      </header>
      <Notice>{msg}</Notice>
      <ErrorBox error={error} />

      {recoveryCodes && (
        <div className="recovery">
          <p><strong>Guarda estos codigos de respaldo en un lugar seguro.</strong> Cada uno sirve una sola vez si pierdes tu telefono. No se volveran a mostrar.</p>
          <ul className="codes">{recoveryCodes.map((c) => <li key={c}><code>{c}</code></li>)}</ul>
          <button className="small" onClick={() => (onDone ? onDone() : setRecoveryCodes(null))}>{onboarding ? 'Ya los guarde, ir a mi boveda' : 'Ya los guarde'}</button>
        </div>
      )}

      {!status.enabled && !setup && (
        <>
          <p className="muted">
            Ademas de tu contrasena, se pedira un codigo de 6 digitos de <strong>Google Authenticator</strong> (o Microsoft Authenticator, Authy).
            Aunque alguien robe tu contrasena, no podra entrar sin tu telefono.
          </p>
          <button onClick={start}>Activar con Google Authenticator</button>
        </>
      )}

      {setup && (
        <div className="mfa-setup">
          <ol>
            <li>Instala <strong>Google Authenticator</strong> en tu telefono.</li>
            <li>Toca <strong>+</strong> &rarr; <strong>Escanear un codigo QR</strong> y escanea este codigo:</li>
          </ol>
          <img src={setup.qr} alt="Codigo QR para Google Authenticator" width={220} height={220} className="qr" />
          <details>
            <summary>No puedo escanear: ingresar la clave manualmente</summary>
            <code className="secret">{setup.secret.match(/.{1,4}/g).join(' ')}</code>
          </details>
          <form onSubmit={confirm}>
            <label>3. Escribe el codigo de 6 digitos que muestra la app
              <input required className="otp-input" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}"
                maxLength={6} placeholder="000000" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
            </label>
            <div className="row">
              <button type="submit">Confirmar y activar</button>
              <button type="button" className="secondary outline" onClick={() => setSetup(null)}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {status.enabled && !disableForm && !onboarding && (
        <>
          <p className="muted">Codigos de respaldo restantes: <strong>{status.recoveryCodesLeft}</strong></p>
          <button className="secondary outline" onClick={() => setDisableForm({ password: '', code: '' })}>Cambiar de telefono</button>
        </>
      )}

      {disableForm && (
        <form onSubmit={disable}>
          <label>Contrasena
            <input type="password" required autoComplete="current-password" value={disableForm.password}
              onChange={(e) => setDisableForm({ ...disableForm, password: e.target.value })} />
          </label>
          <label>Codigo de la app o de respaldo
            <input required autoComplete="one-time-code" value={disableForm.code}
              onChange={(e) => setDisableForm({ ...disableForm, code: e.target.value })} />
          </label>
          <div className="row">
            <button type="submit" className="secondary">Reconfigurar con otro telefono</button>
            <button type="button" className="outline" onClick={() => setDisableForm(null)}>Cancelar</button>
          </div>
        </form>
      )}
    </article>
  );
}
