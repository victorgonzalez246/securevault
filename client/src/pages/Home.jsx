import { Link } from 'react-router';
import { useAuth } from '../auth.jsx';

export default function Home() {
  const { user } = useAuth();
  return (
    <>
      <section className="hero">
        <h1>Tus notas privadas, cifradas de verdad.</h1>
        <p className="muted">
          SecureVault guarda tus notas y datos personales con cifrado autenticado AES-256-GCM.
          Ni siquiera quien tenga acceso a la base de datos puede leerlas.
        </p>
        {user ? (
          <Link to="/notes" role="button">Ir a mis notas</Link>
        ) : (
          <div className="row">
            <Link to="/register" role="button">Crear cuenta</Link>
            <Link to="/login" role="button" className="secondary outline">Ya tengo cuenta</Link>
          </div>
        )}
      </section>
      <section className="features">
        <article><h4>Cifrado AES-256-GCM</h4><p className="muted">IV unico por registro y deteccion de manipulacion.</p></article>
        <article><h4>Argon2id</h4><p className="muted">Contrasenas con hash lento y sal; nunca se guardan en claro.</p></article>
        <article><h4>Sesiones seguras</h4><p className="muted">Cookie HttpOnly, Secure y SameSite con expiracion.</p></article>
        <article><h4>Bitacora</h4><p className="muted">Registro de accesos fallidos, denegados y cambios de rol.</p></article>
      </section>
    </>
  );
}
