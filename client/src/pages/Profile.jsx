import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { ErrorBox, Notice } from '../components.jsx';

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [fullPhone, setFullPhone] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '' });
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api('/profile').then((p) => {
      setProfile(p);
      setForm({ name: p.name, phone: '' });
    }).catch(setError);
  }, []);

  const reveal = async () => {
    try {
      setFullPhone((await api('/profile/phone')).phone);
    } catch (err) {
      setError(err);
    }
  };

  const onSave = async (e) => {
    e.preventDefault();
    setError(null);
    setMsg(null);
    try {
      const body = { name: form.name, ...(form.phone && { phone: form.phone }) };
      const d = await api('/profile', { method: 'PUT', body });
      setProfile((p) => ({ ...p, ...d }));
      setForm({ name: d.name, phone: '' });
      setFullPhone(null);
      setMsg('Perfil actualizado');
    } catch (err) {
      setError(err);
    }
  };

  if (!profile) return error ? <ErrorBox error={error} /> : <p aria-busy="true">Cargando...</p>;

  return (
    <article className="narrow">
      <h2>Mi perfil</h2>
      <Notice>{msg}</Notice>
      <ErrorBox error={error} />
      <p><strong>Correo:</strong> {profile.email}<br />
        <strong>Rol:</strong> <span className={`badge ${profile.role === 'admin' ? 'badge-admin' : ''}`}>{profile.role}</span></p>
      <p>
        <strong>Telefono:</strong> {fullPhone ?? profile.phoneMasked ?? <span className="muted">sin registrar</span>}{' '}
        {profile.phoneMasked && !fullPhone && <button className="outline small" onClick={reveal}>Mostrar completo</button>}
        {fullPhone && <button className="outline small" onClick={() => setFullPhone(null)}>Ocultar</button>}
      </p>
      <form onSubmit={onSave}>
        <label>Nombre<input required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label>Nuevo telefono (opcional)
          <input type="tel" maxLength={20} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Dejar vacio para no cambiarlo" />
        </label>
        <button type="submit">Guardar</button>
      </form>
    </article>
  );
}
