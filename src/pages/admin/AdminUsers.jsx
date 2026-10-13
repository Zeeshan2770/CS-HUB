import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useAuth } from '../../lib/auth.jsx';
import { useToast, useConfirm } from '../../lib/toast.jsx';
import { useLoad, unwrap } from '../../lib/useLoad.js';
import { Empty, ErrorBox, Spinner } from '../../components/ui.jsx';

const ROLES = [['student', 'Student'], ['teacher', 'Teacher'], ['content_editor', 'Content editor'], ['admin', 'Administrator'], ['super_admin', 'Super administrator']];
const PAGE = 25;

export default function AdminUsers() {
  const { user, isSuper } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [q]);
  const { data, error, loading, reload } = useLoad(() => supabase.rpc('admin_list_students', { p_search: q.trim() || null, p_limit: PAGE, p_offset: page * PAGE }).then(unwrap), [q, page]);

  const change = async (u, role) => {
    if (!(await confirm(`Change ${u.email || 'this user'} to ${ROLES.find((r) => r[0] === role)[1]}?`, { confirmLabel: 'Change role', danger: role !== 'student' }))) { reload(); return; }
    const { error: e } = await supabase.rpc('admin_set_user_role', { p_user: u.id, p_role: role });
    if (e) toast(e.message.includes('forbidden') ? 'Only a super administrator can change roles.' : e.message.includes('own role') ? 'You cannot change your own role.' : 'Could not change the role.', 'error'); else toast('Role changed', 'success');
    reload();
  };
  const total = data?.[0]?.total_count ?? 0;
  return (
    <>
      <label className="field inline"><span>Search by name or email</span><input type="search" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      {loading ? <Spinner /> : error ? <ErrorBox message="Could not load users." onRetry={reload} /> : data.length === 0 ? <Empty title="No users found" /> : (
        <div className="tablewrap"><table className="lt"><thead><tr><th>Name</th><th>Email</th><th>Joined</th><th>Lessons done</th><th>Last active</th><th>Role</th></tr></thead>
          <tbody>{data.map((u) => (
            <tr key={u.id}><td>{u.full_name || <span className="muted">not set</span>}</td><td>{u.email}</td><td>{new Date(u.created_at).toLocaleDateString()}</td><td>{u.completed_sections}</td><td>{u.last_active ? new Date(u.last_active).toLocaleDateString() : <span className="muted">never</span>}</td>
              <td>{isSuper && u.id !== user.id ? (
                <select value={u.role} aria-label={`Role for ${u.email}`} onChange={(e) => change(u, e.target.value)}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              ) : ROLES.find((r) => r[0] === u.role)?.[1]}</td></tr>))}</tbody></table></div>)}
      <div className="row between"><span className="muted">{total} accounts</span>
        <div className="row"><button className="btn btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><button className="btn btn-sm" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)}>Next</button></div></div>
      {!isSuper && <p className="muted small">Only a super administrator can change roles.</p>}
    </>
  );
}
