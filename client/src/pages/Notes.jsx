import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { api } from '../api.js';
import { ErrorBox, Notice } from '../components.jsx';

export default function Notes() {
  const [notes, setNotes] = useState(null);
  const [limit, setLimit] = useState(100);
  const [form, setForm] = useState({ title: '', content: '' });
  const [error, setError] = useState(null);
  const [mfaOn, setMfaOn] = useState(true);
  const location = useLocation();

  const load = () =>
    api('/notes').then((d) => {
      setNotes(d.notes);
      setLimit(d.limit);
    }).catch(setError);

  useEffect(() => {
    load();
    api('/mfa/status').then((s) => setMfaOn(s.enabled)).catch(() => {});
  }, []);

  const onCreate = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await api('/notes', { method: 'POST', body: form });
      setForm({ title: '', content: '' });
      load();
    } catch (err) {
      setError(err);
    }
  };

  return (
    <>
      <h2>Mis notas</h2>
      <Notice>{location.state?.notice}</Notice>
      {!mfaOn && (
        <article className="msg msg-warn">
          <strong>Protege tu cuenta:</strong> activa la verificacion en dos pasos con Google Authenticator.{' '}
          <Link to="/profile">Activar ahora</Link>
        </article>
      )}
      <ErrorBox error={error} />
      <details open={notes?.length === 0}>
        <summary role="button" className="outline">+ Nueva nota</summary>
        <form onSubmit={onCreate}>
          <label>Titulo<input required maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <label>Contenido
            <textarea required rows={6} maxLength={10000} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
            <small>{form.content.length}/10000 &middot; Se guarda cifrado con AES-256-GCM</small>
          </label>
          <button type="submit">Guardar nota</button>
        </form>
      </details>
      {notes === null ? (
        <p aria-busy="true">Cargando...</p>
      ) : notes.length === 0 ? (
        <p className="muted">Aun no tienes notas.</p>
      ) : (
        <>
          <ul className="note-list">
            {notes.map((n) => (
              <li key={n.id}>
                <Link to={`/notes/${n.id}`}>{n.title}</Link>
                <small className="muted">{new Date(n.updatedAt).toLocaleString()}</small>
              </li>
            ))}
          </ul>
          <small className="muted">{notes.length} de {limit} notas</small>
        </>
      )}
    </>
  );
}
