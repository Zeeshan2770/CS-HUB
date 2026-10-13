import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from './ui.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useCatalog } from '../lib/catalog.jsx';
import { BRAND } from '../lib/config.js';

function useTheme() {
  const [theme, setTheme] = useState(() => {
    try { const t = localStorage.getItem('cs12.theme'); if (t) return t; } catch { /* ignore */ }
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('cs12.theme', theme); } catch { /* ignore */ }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))];
}

function SearchBox({ className = '' }) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  return (
    <form className={`searchbox ${className}`} role="search" onSubmit={(e) => { e.preventDefault(); if (q.trim()) { nav(`/search?q=${encodeURIComponent(q.trim())}`); } }}>
      <Icon name="search" />
      <label className="sr" htmlFor="gsearch">Search lessons</label>
      <input id="gsearch" type="search" placeholder="Search chapters and topics" value={q} onChange={(e) => setQ(e.target.value)} />
    </form>
  );
}
export { SearchBox };

export default function Layout() {
  const { user, profile, isTeacher, signOut } = useAuth();
  const { chapters } = useCatalog();
  const [theme, toggleTheme] = useTheme();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('cs12.collapsed') === '1'; } catch { return false; } });
  const [chOpen, setChOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => { try { localStorage.setItem('cs12.collapsed', collapsed ? '1' : '0'); } catch { /* ignore */ } }, [collapsed]);

  const item = (to, icon, label, end) => (
    <NavLink to={to} end={end} className={({ isActive }) => `nav ${isActive ? 'active' : ''}`} title={label}>
      <Icon name={icon} /><span className="lbl">{label}</span>
    </NavLink>
  );

  const initial = (profile?.full_name || user?.email || '?').trim()[0]?.toUpperCase();

  return (
    <div className={`shell ${collapsed ? 'collapsed' : ''} ${open ? 'menu-open' : ''}`}>
      <a className="skip" href="#main">Skip to content</a>
      <aside className="sidebar" aria-label="Main navigation">
        <Link to="/" className="brand"><span className="logo" aria-hidden="true">&lt;/&gt;</span><span className="lbl"><b>{BRAND.name}</b><small>{BRAND.tagline}</small></span></Link>
        <nav>
          {item('/', 'home', 'Home', true)}
          {item('/dashboard', 'dash', 'Student Dashboard')}
          {item('/syllabus', 'list', 'Complete Syllabus')}
          <button className={`nav navbtn ${chOpen ? 'open' : ''}`} aria-expanded={chOpen} onClick={() => setChOpen((v) => !v)} title="Chapters">
            <Icon name="book" /><span className="lbl">Chapters</span><span className="lbl chev"><Icon name="chevron" size={14} /></span>
          </button>
          {chOpen && !collapsed && (
            <div className="subnav">
              {chapters.map((c) => (
                <NavLink key={c.id} to={`/chapter/${c.id}`} className={({ isActive }) => `subitem ${isActive ? 'active' : ''}`}>
                  <b>{c.number}</b><span>{c.title}</span>
                </NavLink>
              ))}
            </div>
          )}
          {item('/labs', 'flask', 'Interactive Labs')}
          {item('/practice', 'target', 'Practice & Exams')}
          {item('/assignments', 'list', 'Assignments')}
          {item('/revision', 'refresh', 'Revision Center')}
          {item('/focus', 'timer', 'Focus Timer')}
          {item('/bookmarks', 'bookmark', 'Bookmarks')}
          {item('/planner', 'calendar', 'Study Planner')}
          {item('/profile', 'user', 'Profile')}
          {isTeacher && item('/teach', 'users', 'Teaching')}
          {isTeacher && item('/admin', 'shield', 'Admin Panel')}
        </nav>
        <div className="side-foot">
          <button className="nav navbtn" onClick={toggleTheme} title="Switch theme"><Icon name={theme === 'dark' ? 'sun' : 'moon'} /><span className="lbl">{theme === 'dark' ? 'Light theme' : 'Dark theme'}</span></button>
          <button className="nav navbtn hide-sm" onClick={() => setCollapsed((v) => !v)} aria-pressed={collapsed} title="Collapse sidebar"><Icon name="panel" /><span className="lbl">Collapse sidebar</span></button>
        </div>
      </aside>
      {open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />}

      <div className="main-col">
        <header className="topbar">
          <button className="iconbtn show-sm" onClick={() => setOpen((v) => !v)} aria-label="Open menu" aria-expanded={open}><Icon name="menu" size={22} /></button>
          <SearchBox />
          <div className="grow" />
          {user ? (
            <Link to="/profile" className="avatar" title={user.email} aria-label="Your profile">{initial}</Link>
          ) : (
            <div className="row"><Link className="btn btn-sm" to="/login">Sign in</Link><Link className="btn btn-primary btn-sm" to="/signup">Create account</Link></div>
          )}
          {user && <button className="btn btn-sm hide-sm" onClick={signOut}>Sign out</button>}
        </header>
        <main id="main" tabIndex={-1}><Outlet /></main>
        <footer className="footer">
          <div><b>{BRAND.name}</b> is an independent study portal for Class 12 Computer Science. Practice scores are for study only and do not predict board results.</div>
          <div className="row"><Link to="/syllabus">Syllabus</Link><Link to="/labs">Labs</Link><Link to="/practice">Practice</Link></div>
          <div className="credit-line">Designed &amp; presented by <b>Muhammad Zeeshan Haider</b></div>
        </footer>
      </div>
    </div>
  );
}
