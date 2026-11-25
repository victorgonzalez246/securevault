import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../api.js';
import { ErrorBox, PASSWORD_HINT } from '../components.jsx';

// El token llega en el fragmento (#token=...), que el navegador nunca envia al servidor.
// Se lee una vez y se borra de la barra de direcciones.
let capturedToken = null;
function takeTokenFromHash() {
  const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
  if (token) {
    capturedToken = token;
    window.history.replaceState(null, '', window.location.pathname);
  }
  return capturedToken;
}

export default function Reset() {
  const navigate = useNavigate();
  const [token] = useState(takeTokenFromHash);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const d = await api('/auth/reset', { method: 'POST', body: { token, password } });
      navigate('/login', { state: { notice: d.message } });
    } catch (err) {
      setError(err);
    }
  };

  if (!token) return <article className="narrow"><p>Enlace invalido. Solicita uno nuevo desde &laquo;Olvide mi contrasena&raquo;.</p></article>;

  return (
    <article className="narrow">
      <h2>Nueva contrasena</h2>
      <ErrorBox error={error} />
      <form onSubmit={onSubmit}>
        <label>Contrasena nueva
          <input type="password" required minLength={12} maxLength={128} autoComplete="new-password"
            value={password} onChange={(e) => setPassword(e.target.value)} />
          <small>{PASSWORD_HINT}</small>
        </label>
        <button type="submit">Guardar</button>
      </form>
    </article>
  );
}
