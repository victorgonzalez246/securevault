import { Link, NavLink, Route, Routes, useNavigate } from 'react-router';
import { Protected, useAuth } from './auth.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Forgot from './pages/Forgot.jsx';
import Reset from './pages/Reset.jsx';
import Notes from './pages/Notes.jsx';
import NoteDetail from './pages/NoteDetail.jsx';
import Profile from './pages/Profile.jsx';
import Admin from './pages/Admin.jsx';

function Nav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const onLogout = async () => {
    await logout();
    navigate('/login');
  };
  return (
    <nav className="container">
      <ul>
        <li>
          <Link to="/" className="brand">
            <span aria-hidden="true">&#128274;</span> SecureVault
          </Link>
        </li>
      </ul>
      <ul>
        {user ? (
          <>
            <li><NavLink to="/notes">Mis notas</NavLink></li>
            <li><NavLink to="/profile">Perfil</NavLink></li>
            {user.role === 'admin' && <li><NavLink to="/admin">Administracion</NavLink></li>}
            <li><button className="outline secondary small" onClick={onLogout}>Salir</button></li>
          </>
        ) : (
          <>
            <li><NavLink to="/login">Entrar</NavLink></li>
            <li><Link to="/register" role="button" className="small">Crear cuenta</Link></li>
          </>
        )}
      </ul>
    </nav>
  );
}

export default function App() {
  return (
    <>
      <header className="topbar"><Nav /></header>
      <main className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot" element={<Forgot />} />
          <Route path="/reset" element={<Reset />} />
          <Route path="/notes" element={<Protected><Notes /></Protected>} />
          <Route path="/notes/:id" element={<Protected><NoteDetail /></Protected>} />
          <Route path="/profile" element={<Protected><Profile /></Protected>} />
          <Route path="/admin" element={<Protected role="admin"><Admin /></Protected>} />
          <Route path="*" element={<p>Pagina no encontrada. <Link to="/">Volver al inicio</Link></p>} />
        </Routes>
      </main>
      <footer className="container footer">
        <small>SecureVault &middot; Laboratorio OWASP Top 10:2025 &middot; AES-256-GCM + Argon2id</small>
      </footer>
    </>
  );
}
