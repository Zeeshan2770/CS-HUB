import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useToast } from '../lib/toast.jsx';
import { useLoad, unwrap } from '../lib/useLoad.js';
import { Empty, ErrorBox, PageHead, Spinner } from '../components/ui.jsx';

export function CopyCode({ code }) {
  const toast = useToast();
  async function copy() {
    try { await navigator.clipboard.writeText(code); toast('Class code copied.', 'success'); }
    catch { toast('Could not copy. Select the code and copy it by hand.', 'error'); }
  }
  return (
    <span className="row">
      <code className="join-code" aria-label={`Class code ${code.split('').join(' ')}`}>{code}</code>
      <button type="button" className="btn btn-sm" onClick={copy}>Copy</button>
    </span>
  );
}

export default function Teach() {
  const toast = useToast();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const { data: classes, error, loading, reload } = useLoad(() => supabase.rpc('teacher_classes').then(unwrap));

  async function create(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const { data: c, error: er } = await supabase.rpc('create_class', { p_name: name });
    setBusy(false);
    if (er) { toast(er.message || 'Could not create the class.', 'error'); return; }
    toast(`Class created. Share the code ${c.join_code} with your students.`, 'success');
    setName('');
    reload();
  }

  if (loading) return <div className="page"><Spinner /></div>;
  if (error) return <div className="page"><ErrorBox message={error} onRetry={reload} /></div>;

  return (
    <div className="page">
      <PageHead title="Teaching" sub="Create a class, share its code, then set practice tests for your students." />

      <section className="card">
        <h2>New class</h2>
        <form className="row" onSubmit={create}>
          <label className="sr" htmlFor="class-name">Class name</label>
          <input id="class-name" className="grow" value={name} maxLength={80} placeholder="e.g. Class 12 — Section A" onChange={(e) => setName(e.target.value)} />
          <button className="btn btn-primary" disabled={busy || !name.trim()}>{busy ? 'Creating…' : 'Create class'}</button>
        </form>
      </section>

      <h2>Your classes</h2>
      {classes.length === 0 ? (
        <Empty title="No classes yet">Create your first class above. Students join with the code it gives you.</Empty>
      ) : (
        <ul className="plain cards">
          {classes.map((c) => (
            <li key={c.id} className="card">
              <div className="row between">
                <h3><Link to={`/teach/class/${c.id}`}>{c.name}</Link></h3>
                {c.archived && <span className="chip warn">Archived</span>}
              </div>
              <p className="muted small">{c.members} {c.members === 1 ? 'student' : 'students'} · {c.assignments} {c.assignments === 1 ? 'assignment' : 'assignments'}</p>
              <div className="row between">
                {c.archived ? <span className="muted small">Students can no longer join.</span> : <CopyCode code={c.join_code} />}
                <Link className="btn btn-sm" to={`/teach/class/${c.id}`}>Open</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
