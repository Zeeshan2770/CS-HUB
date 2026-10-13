import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.jsx';
import { useCatalog } from '../lib/catalog.jsx';
import { useProgress } from '../lib/progress.jsx';
import { useToast, useConfirm } from '../lib/toast.jsx';
import { useLoad, unwrap } from '../lib/useLoad.js';
import { Empty, ErrorBox, PageHead, ProgressBar, Spinner } from '../components/ui.jsx';

export default function Planner() {
  const { user } = useAuth();
  const { chapters } = useCatalog();
  const progress = useProgress();
  const toast = useToast();
  const confirm = useConfirm();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [chap, setChap] = useState('');
  const { data, error, loading, reload } = useLoad(async () => {
    const [tasks, goal] = await Promise.all([
      supabase.from('study_tasks').select('*').order('completed').order('due_date', { nullsFirst: false }).then(unwrap),
      supabase.from('study_goals').select('weekly_lessons_target').maybeSingle().then(unwrap),
    ]);
    return { tasks, target: goal?.weekly_lessons_target ?? 5 };
  }, [user?.id]);

  const ws = new Date(); ws.setHours(0, 0, 0, 0); ws.setDate(ws.getDate() - ((ws.getDay() + 6) % 7));
  const thisWeek = Object.values(progress.map).filter((v) => v.completed && v.completed_at && new Date(v.completed_at) >= ws).length;

  const add = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    const { error: er } = await supabase.from('study_tasks').insert({ user_id: user.id, title: title.trim(), due_date: due || null, chapter_id: chap || null });
    if (er) { toast('Could not add the task.', 'error'); return; }
    setTitle(''); setDue(''); setChap(''); reload();
  };
  const toggle = async (t) => {
    const { error: er } = await supabase.from('study_tasks').update({ completed: !t.completed, completed_at: t.completed ? null : new Date().toISOString() }).eq('id', t.id);
    if (er) toast('Could not update the task.', 'error'); else reload();
  };
  const remove = async (t) => {
    if (!(await confirm(`Delete the task “${t.title}”?`, { confirmLabel: 'Delete', danger: true }))) return;
    const { error: er } = await supabase.from('study_tasks').delete().eq('id', t.id);
    if (er) toast('Could not delete the task.', 'error'); else reload();
  };
  const setTarget = async (n) => {
    if (!(n >= 1 && n <= 100)) return;
    const { error: er } = await supabase.from('study_goals').upsert({ user_id: user.id, weekly_lessons_target: n, updated_at: new Date().toISOString() });
    if (er) toast('Could not save the goal.', 'error'); else { toast('Goal saved', 'success'); reload(); }
  };

  if (loading) return <div className="page"><Spinner /></div>;
  if (error) return <div className="page"><ErrorBox message={error} onRetry={reload} /></div>;
  const done = data.tasks.filter((t) => t.completed).length;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="page narrow">
      <PageHead title="Study planner" sub="Set a weekly goal and plan what you will study." />
      <section className="card">
        <h2>Weekly goal</h2>
        <div className="row">
          <label className="field inline"><span>Topics to complete each week</span><input type="number" min="1" max="100" defaultValue={data.target} key={data.target} onBlur={(e) => Number(e.target.value) !== data.target && setTarget(Number(e.target.value))} /></label>
        </div>
        <ProgressBar value={Math.min(thisWeek, data.target)} max={data.target} label="Weekly goal progress" />
        <p className="muted">{thisWeek} of {data.target} topics completed this week (week starts Monday).</p>
      </section>
      <section className="card">
        <h2>Add a task</h2>
        <form onSubmit={add}>
          <label className="field"><span>What will you do?</span><input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="Revise Chapter 3 definitions" /></label>
          <div className="row">
            <label className="field inline"><span>Due date (optional)</span><input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>
            <label className="field inline"><span>Chapter (optional)</span><select value={chap} onChange={(e) => setChap(e.target.value)}><option value="">None</option>{chapters.map((c) => <option key={c.id} value={c.id}>{c.number}. {c.title}</option>)}</select></label>
          </div>
          <button className="btn btn-primary" disabled={!title.trim()}>Add task</button>
        </form>
      </section>
      <section className="card">
        <h2>Your tasks</h2>
        {data.tasks.length === 0 ? <Empty title="No tasks yet">Add one above. Tasks with a due date also appear on your dashboard.</Empty> : (<>
          <p className="muted">{done} of {data.tasks.length} planned tasks completed.</p>
          <ul className="plain tasks">{data.tasks.map((t) => (
            <li key={t.id} className={t.completed ? 'done' : ''}>
              <label className="opt inline"><input type="checkbox" checked={t.completed} onChange={() => toggle(t)} /><span>{t.title}</span></label>
              {t.due_date && <small className={!t.completed && t.due_date < today ? 'overdue' : 'muted'}>{!t.completed && t.due_date < today ? 'Overdue: ' : 'Due '}{new Date(t.due_date + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</small>}
              <button className="linkbtn danger" onClick={() => remove(t)} aria-label={`Delete ${t.title}`}>Delete</button>
            </li>))}</ul></>)}
      </section>
    </div>
  );
}
