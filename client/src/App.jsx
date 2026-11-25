import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router';
import { EnrollmentRoute, Protected, useAuth } from './auth.jsx';
import MfaSetup from './pages/MfaSetup.jsx';
import Icon from './Icon.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Forgot from './pages/Forgot.jsx';
import Reset from './pages/Reset.jsx';
import Notes from './pages/Notes.jsx';
import NoteDetail from './pages/NoteDetail.jsx';
import Profile from './pages/Profile.jsx';
import Admin from './pages/Admin.jsx';
function Brand() {return <Link to="/" className="brand"><span className="brand-icon"><Icon/></span>SecureVault</Link>;}
export default function App() {
 const {user,logout}=useAuth(); const {pathname}=useLocation(); const navigate=useNavigate();
 const dashboard=Boolean(user) && /^\/(notes|profile|admin)/.test(pathname);
 const exit=async()=>{await logout();navigate('/login');};
 return <div className={dashboard?'app-shell':'public-shell'}>
 <a className="skip-link" href="#contenido">Saltar al contenido</a>
 {dashboard?<aside className="sidebar"><Brand/><div className="workspace"><span className="workspace-avatar">{user.name?.slice(0,1).toUpperCase() || 'S'}</span><div><strong>Mi espacio privado</strong><small>Bóveda personal</small></div><Icon name="lock"/></div><p className="nav-label">ESPACIO DE TRABAJO</p><nav className="side-nav" aria-label="Navegación de la bóveda"><NavLink to="/notes"><Icon name="grid"/>Notas cifradas</NavLink><NavLink to="/profile"><Icon name="user"/>Perfil y seguridad</NavLink>{user.role==='admin' && <NavLink to="/admin"><Icon/>Auditoría y usuarios</NavLink>}</nav><div className="sidebar-bottom"><div className="security-tip"><Icon name="lock"/><strong>Privacidad por diseño</strong><p>Tus notas se almacenan cifradas con AES-256-GCM.</p></div><div className="account"><span className="workspace-avatar">{user.name?.slice(0,1).toUpperCase() || 'S'}</span><div><strong>{user.name}</strong><small>{user.role==='admin'?'Administrador':'Cuenta personal'}</small></div><button className="icon-button" onClick={exit} aria-label="Cerrar sesión"><Icon name="logout"/></button></div></div></aside>:<header className="topbar"><nav className="container"><Brand/><div className="row"><a className="marketing-link" href="/#pilares">Bóveda</a><a className="marketing-link" href="/#arquitectura">Seguridad</a>{user?<><Link to="/notes" role="button">Abrir mi bóveda</Link><button className="outline" onClick={exit}>Salir</button></>:<><NavLink to="/login">Entrar</NavLink><Link to="/register" role="button">Crear bóveda<Icon name="arrow"/></Link></>}</div></nav></header>}
 <div className="app-body">{dashboard && <header className="dashboard-bar"><span>Espacio de trabajo <span className="muted">/ {pathname.startsWith('/admin')?'Administración':pathname.startsWith('/profile')?'Perfil y seguridad':'Mi bóveda'}</span></span><span className="badge badge-ok"><Icon name="lock"/>Sesión iniciada</span></header>}
 <main id="contenido" className="container"><Routes><Route path="/" element={<Home/>}/><Route path="/login" element={<Login/>}/><Route path="/register" element={<Register/>}/><Route path="/forgot" element={<Forgot/>}/><Route path="/reset" element={<Reset/>}/><Route path="/setup-mfa" element={<EnrollmentRoute><MfaSetup/></EnrollmentRoute>}/><Route path="/notes" element={<Protected><Notes/></Protected>}/><Route path="/notes/:id" element={<Protected><NoteDetail/></Protected>}/><Route path="/profile" element={<Protected><Profile/></Protected>}/><Route path="/admin" element={<Protected role="admin"><Admin/></Protected>}/><Route path="*" element={<p>Página no encontrada. <Link to="/">Volver al inicio</Link></p>}/></Routes></main>
 <footer className="container footer"><Brand/><small>Tu información, bajo tu control.</small><small>AES-256-GCM · Argon2id</small></footer></div></div>;
}
