import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { Spinner } from './ui.jsx';

export function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  return children;
}

// level: 'teacher' (teacher+), 'staff' (editor+), 'admin' (admin+), 'super'
export function RequireRole({ level = 'staff', children }) {
  const { user, loading, profile, isStaff, isTeacher, isAdmin, isSuper } = useAuth();
  const loc = useLocation();
  if (loading || (user && !profile)) return <Spinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  const ok = level === 'super' ? isSuper : level === 'admin' ? isAdmin : level === 'teacher' ? isTeacher : isStaff;
  if (!ok) {
    return (
      <div className="page narrow">
        <div className="errorbox" role="alert">
          <h2>You do not have access to this area</h2>
          <p>This section is for content administrators. If you think you should have access, ask a super admin to change your role.</p>
        </div>
      </div>
    );
  }
  return children;
}
