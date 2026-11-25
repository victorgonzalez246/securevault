import { useNavigate } from 'react-router';
import { useAuth } from '../auth.jsx';
import Icon from '../Icon.jsx';
import MfaSettings from './MfaSettings.jsx';

// Paso obligatorio despues de crear la cuenta (o al iniciar sesion sin MFA):
// sin Google Authenticator configurado, el servidor no permite usar la boveda.
export default function MfaSetup() {
  const { user, refresh, logout } = useAuth();
  const navigate = useNavigate();

  const done = async () => {
    await refresh();
    navigate('/notes', { replace: true, state: { notice: 'Verificacion en dos pasos activada. Tu boveda esta protegida.' } });
  };

  const exit = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="narrow mfa-onboarding">
      <div className="onboarding-steps" aria-label="Progreso">
        <span className="done"><Icon name="check" />Cuenta creada</span>
        <span className="current"><Icon name="lock" />Google Authenticator</span>
        <span><Icon name="note" />Tu boveda</span>
      </div>
      <h2>Protege tu cuenta, {user?.name}</h2>
      <p className="muted">
        SecureVault exige verificacion en dos pasos para todas las cuentas. Ademas de tu contrasena, cada inicio de sesion
        pedira un codigo de 6 digitos de tu telefono. Asi, aunque alguien robe tu contrasena, no podra entrar.
      </p>
      <MfaSettings onboarding onDone={done} />
      <p>
        <button type="button" className="link-button" onClick={exit}>Cerrar sesion y hacerlo despues</button>
      </p>
    </div>
  );
}
