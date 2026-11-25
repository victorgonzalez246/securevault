import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../api.js';
import { ErrorBox } from '../components.jsx';

export default function NoteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [note, setNote] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ title: '', content: '' });
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    api(`/notes/${encodeURIComponent(id)}`)
      .then((d) => {
        setNote(d.note);
        setForm({ title: d.note.title, content: d.note.content });
      })
      .catch(setError);
  }, [id]);

  const onSave = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const d = await api(`/notes/${encodeURIComponent(id)}`, { method: 'PUT', body: form });
      setNote(d.note);
      setEditing(false);
    } catch (err) {
      setError(err);
    }
  };

  const onDelete = async () => {
    try {
      await api(`/notes/${encodeURIComponent(id)}`, { method: 'DELETE' });
      navigate('/notes');
    } catch (err) {
      setError(err);
    }
  };

  if (error && !note) return <><ErrorBox error={error} /><Link to="/notes">Volver a mis notas</Link></>;
  if (!note) return <p aria-busy="true">Cargando...</p>;

  return (
    <article>
      <ErrorBox error={error} />
      {editing ? (
        <form onSubmit={onSave}>
          <label>Titulo<input required maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <label>Contenido<textarea required rows={10} maxLength={10000} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></label>
          <div className="row">
            <button type="submit">Guardar</button>
            <button type="button" className="secondary outline" onClick={() => setEditing(false)}>Cancelar</button>
          </div>
        </form>
      ) : (
        <>
          <header>
            <h2>{note.title}</h2>
            <small className="muted">Actualizada {new Date(note.updatedAt).toLocaleString()}</small>
          </header>
          <p className="note-content">{note.content}</p>
          <footer className="row">
            <button onClick={() => setEditing(true)}>Editar</button>
            {confirmDelete ? (
              <>
                <span>Eliminar definitivamente?</span>
                <button className="secondary" onClick={onDelete}>Si, eliminar</button>
                <button className="outline" onClick={() => setConfirmDelete(false)}>No</button>
              </>
            ) : (
              <button className="secondary outline" onClick={() => setConfirmDelete(true)}>Eliminar</button>
            )}
            <Link to="/notes">Volver</Link>
          </footer>
        </>
      )}
    </article>
  );
}
