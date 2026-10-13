import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../lib/auth.jsx';

export default function AdminLayout() {
  const { isAdmin, isStaff, profile } = useAuth();
  const l = (to, label, end) => <NavLink to={to} end={end} className={({ isActive }) => `tab ${isActive ? 'on' : ''}`}>{label}</NavLink>;
  return (
    <div className="page wide">
      <div className="pagehead"><div><h1>{isStaff ? 'Admin panel' : 'Teacher area'}</h1><p className="muted">Signed in as {profile?.role?.replace('_', ' ')}.</p></div></div>
      <nav className="tabs" aria-label="Admin sections">
        {isStaff && l('/admin', 'Overview', true)}{isStaff && l('/admin/content', 'Lessons and chapters')}{isStaff && l('/admin/questions', 'Question bank')}
        {isStaff && l('/admin/written', 'Written questions')}{l('/admin/grading', 'Marking')}{isStaff && l('/admin/import', 'Import')}
        {isAdmin && l('/admin/users', 'Students and roles')}{isAdmin && l('/admin/audit', 'Audit log')}
      </nav>
      <Outlet />
    </div>
  );
}
