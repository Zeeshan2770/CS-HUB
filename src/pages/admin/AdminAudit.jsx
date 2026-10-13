import { useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useLoad, unwrap } from '../../lib/useLoad.js';
import { Empty, ErrorBox, Spinner } from '../../components/ui.jsx';

export default function AdminAudit() {
  const [n, setN] = useState(50);
  const { data, error, loading, reload } = useLoad(() =>
    supabase.from('audit_logs').select('id,action,target,details,created_at,actor:profiles!audit_logs_actor_id_fkey(email)').order('created_at', { ascending: false }).limit(n).then(unwrap), [n]);
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox message="Could not load the audit log." onRetry={reload} />;
  if (!data.length) return <Empty title="Nothing recorded yet">Changes to chapters, lessons, questions and roles are logged here.</Empty>;
  return (
    <>
      <div className="tablewrap"><table className="lt"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th><th>Details</th></tr></thead>
        <tbody>{data.map((r) => (<tr key={r.id}><td>{new Date(r.created_at).toLocaleString()}</td><td>{r.actor?.email || <span className="muted">system</span>}</td><td>{r.action}</td><td className="mono">{r.target}</td><td className="mono small">{r.details ? JSON.stringify(r.details) : ''}</td></tr>))}</tbody></table></div>
      {data.length >= n && <button className="btn" onClick={() => setN(n + 50)}>Load more</button>}
    </>
  );
}
