import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api.js';
import { ErrorBox, Notice } from '../components.jsx';

export default function Forgot() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      setMsg((await api('/auth/forgot', { method: 'POST', body: { email } })).message);
    } catch (err) {
      setError(err);
    }
  };

  return (
    <article className="narrow">
      <h2>Recuperar contrasena</h2>
      <Notice>{msg}</Notice>
      <ErrorBox error={error} />
      {!msg && (
        <form onSubmit={onSubmit}>
          <label>Correo<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <button type="submit">Enviar enlace</button>
        </form>
      )}
      <p><Link to="/login">Volver</Link></p>
    </article>
  );
}
