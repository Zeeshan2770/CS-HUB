import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useToast, useConfirm } from '../lib/toast.jsx';
import { useLoad, unwrap } from '../lib/useLoad.js';
import { Empty, ErrorBox, PageHead, Spinner } from '../components/ui.jsx';

const fmtDate = (iso) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

function StatusChip({ a }) {
  if (a.status === 'submitted') return <span className="chip ok">Submitted</span>;
  if (a.status === 'expired') return <span className="chip warn">Time ran out</span>;
  if (a.status === 'in_progress') return <span className="chip">In progress</span>;
  if (a.overdue) return <span className="chip warn">Closed</span>;
  return <span className="chip">Not started</span>;
}

export default function Assignments() {
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState('');

  const { data, error, loading, reload } = useLoad(async () => {
    const [assignments, classes] = await Promise.all([
      supabase.rpc('my_assignments').then(unwrap),
      supabase.rpc('my_classes').then(unwrap),
    ]);
    return { assignments, classes };
  });

  async function join(e) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    const { data: d, error: er } = await supabase.rpc('join_class', { p_code: code });
    setBusy(false);
    if (er) { toast(er.message || 'Could not join that class.', 'error'); return; }
    toast(`Joined ${d.name}.`, 'success');
    setCode('');
    reload();
  }

  async function leave(c) {
    if (!(await confirm(`Leave “${c.name}”? You will stop seeing its assignments. Anything you already submitted stays in your results.`, { confirmLabel: 'Leave class', danger: true }))) return;
    const { error: er } = await supabase.rpc('leave_class', { p_class: c.id });
    if (er) toast('Could not leave the class.', 'error'); else { toast('You left the class.', 'success'); reload(); }
  }

  async function start(a) {
    setStarting(a.id);
    const { data: d, error: er } = await supabase.rpc('start_assignment', { p_assignment: a.id });
    setStarting('');
    if (er) { toast(er.message || 'Could not start the assignment.', 'error'); reload(); return; }
    nav(`/practice/session/${d.session_id}`);
  }

  if (loading) return <div className="page"><Spinner /></div>;
  if (error) return <div className="page"><ErrorBox message={error} onRetry={reload} /></div>;

  const todo = data.assignments.filter((a) => a.status === 'not_started' || a.status === 'in_progress');
  const done = data.assignments.filter((a) => a.status === 'submitted' || a.status === 'expired');

  const card = (a) => (
    <li key={a.id} className="card assign-card">
      <div className="row between">
        <div>
          <h3>{a.title}</h3>
          <p className="muted small">{a.class_name} · {a.total} questions · {a.time_limit_minutes} min{a.due_at ? ` · due ${fmtDate(a.due_at)}` : ''}</p>
        </div>
        <StatusChip a={a} />
      </div>
      {a.instructions && <p className="assign-instructions">{a.instructions}</p>}
      <div className="row">
        {a.status === 'not_started' && !a.overdue && (
          <button className="btn btn-primary" disabled={starting === a.id} onClick={() => start(a)}>
            {starting === a.id ? 'Starting…' : `Start (${a.time_limit_minutes} min timer)`}
          </button>
        )}
        {a.status === 'not_started' && a.overdue && <span className="muted small">The due date has passed. Ask your teacher if you still need to do this.</span>}
        {a.status === 'in_progress' && <button className="btn btn-primary" onClick={() => start(a)}>Continue</button>}
        {a.status === 'submitted' && (
          <>
            <b>{a.score}/{a.total}</b>
            <Link className="btn btn-sm" to={`/practice/results/${a.session_id}`}>Review answers</Link>
          </>
        )}
        {a.status === 'expired' && <span className="muted small">Your time ran out before you submitted. Ask your teacher if you can try again.</span>}
      </div>
      {a.status === 'not_started' && !a.overdue && <p className="muted small">You get one attempt. The timer starts when you press Start and keeps running if you close the page.</p>}
    </li>
  );

  return (
    <div className="page">
      <PageHead title="Assignments" sub="Practice tests set by your teacher. Marked on the server, one attempt each." />

      <div className="grid two">
        <section className="card">
          <h2>Join a class</h2>
          <p className="muted small">Your teacher gives you a 6-character code.</p>
          <form className="row" onSubmit={join}>
            <label className="sr" htmlFor="class-code">Class code</label>
            <input id="class-code" className="code-input" value={code} maxLength={6} autoComplete="off" placeholder="ABC123"
              onChange={(e) => setCode(e.target.value.toUpperCase())} />
            <button className="btn btn-primary" disabled={busy || code.trim().length < 6}>{busy ? 'Joining…' : 'Join'}</button>
          </form>
        </section>

        <section className="card">
          <h2>My classes</h2>
          {data.classes.length === 0 ? <p className="muted small">You have not joined a class yet.</p> : (
            <ul className="plain">
              {data.classes.map((c) => (
                <li key={c.id} className="row between">
                  <span><b>{c.name}</b> <small className="muted">· {c.teacher}</small></span>
                  <button className="btn btn-sm" onClick={() => leave(c)}>Leave</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <h2>To do</h2>
      {todo.length === 0 ? (
        <Empty title={data.classes.length === 0 ? 'Nothing here yet' : 'You are all caught up'}>
          {data.classes.length === 0 ? 'Join a class with your teacher’s code and their assignments will appear here.' : 'New assignments from your teacher will show up here.'}
        </Empty>
      ) : <ul className="plain cards">{todo.map(card)}</ul>}

      {done.length > 0 && (<><h2>Finished</h2><ul className="plain cards">{done.map(card)}</ul></>)}
    </div>
  );
}
