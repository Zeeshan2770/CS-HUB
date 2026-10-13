import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useCatalog } from '../lib/catalog.jsx';
import { useToast, useConfirm } from '../lib/toast.jsx';
import { useLoad, unwrap } from '../lib/useLoad.js';
import { Crumbs, Empty, PageHead, Spinner } from '../components/ui.jsx';
import { CopyCode } from './Teach.jsx';

const fmtDate = (iso) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
const COUNTS = [5, 10, 15, 20, 30, 50];

// <input type="datetime-local"> wants local "YYYY-MM-DDTHH:mm"
const localNowForInput = () => { const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };

export default function TeachClass() {
  const { classId } = useParams();
  const { chapters } = useCatalog();
  const toast = useToast();
  const confirm = useConfirm();

  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [chapterIds, setChapterIds] = useState(new Set());
  const [count, setCount] = useState(10);
  const [minutes, setMinutes] = useState(10);
  const [minutesTouched, setMinutesTouched] = useState(false);
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);

  const { data, error, loading, reload } = useLoad(() => supabase.rpc('class_detail', { p_class: classId }).then(unwrap), [classId]);

  function toggleChapter(id) {
    setChapterIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function changeCount(n) {
    setCount(n);
    if (!minutesTouched) setMinutes(Math.min(180, n)); // sensible default: one minute per question
  }

  async function createAssignment(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    const { error: er } = await supabase.rpc('create_assignment', {
      p_class: classId, p_title: title, p_instructions: instructions, p_chapter_ids: [...chapterIds],
      p_count: count, p_minutes: minutes, p_due: due ? new Date(due).toISOString() : null,
    });
    setBusy(false);
    if (er) { toast(er.message || 'Could not create the assignment.', 'error'); return; }
    toast(`Assignment set for ${data.members.length} ${data.members.length === 1 ? 'student' : 'students'}.`, 'success');
    setTitle(''); setInstructions(''); setDue(''); setChapterIds(new Set());
    reload();
  }

  async function removeMember(m) {
    if (!(await confirm(`Remove ${m.name} from this class? They will lose access to its assignments.`, { confirmLabel: 'Remove', danger: true }))) return;
    const { error: er } = await supabase.rpc('remove_class_member', { p_class: classId, p_user: m.user_id });
    if (er) toast('Could not remove that student.', 'error'); else { toast('Student removed.', 'success'); reload(); }
  }

  async function deleteAssignment(a) {
    if (!(await confirm(`Delete “${a.title}”? Students lose it and your results for it are removed. Their own test history is not affected.`, { confirmLabel: 'Delete', danger: true }))) return;
    const { error: er } = await supabase.rpc('delete_assignment', { p_assignment: a.id });
    if (er) toast('Could not delete the assignment.', 'error'); else { toast('Assignment deleted.', 'success'); reload(); }
  }

  async function toggleArchive() {
    const archiving = !data.class.archived;
    if (archiving && !(await confirm('Archive this class? Students will no longer see its assignments and nobody can join with the code. You can restore it later.', { confirmLabel: 'Archive' }))) return;
    const { error: er } = await supabase.rpc('set_class_archived', { p_class: classId, p_archived: archiving });
    if (er) toast('Could not update the class.', 'error'); else reload();
  }

  if (loading) return <div className="page"><Spinner /></div>;
  if (error) {
    return <div className="page narrow"><Empty title="Class not found" action={<Link className="btn" to="/teach">Back to your classes</Link>}>It may not be yours, or it no longer exists.</Empty></div>;
  }

  const { class: cls, members, assignments } = data;

  return (
    <div className="page">
      <Crumbs items={[{ label: 'Teaching', to: '/teach' }, { label: cls.name }]} />
      <PageHead title={cls.name} sub={`${members.length} ${members.length === 1 ? 'student' : 'students'}`}>
        <button className="btn" onClick={toggleArchive}>{cls.archived ? 'Restore class' : 'Archive class'}</button>
      </PageHead>

      {cls.archived ? <p className="notice">This class is archived. Students cannot see it or join it.</p> : (
        <section className="card">
          <h2>Class code</h2>
          <p className="muted small">Students enter this on their Assignments page.</p>
          <CopyCode code={cls.join_code} />
        </section>
      )}

      <section className="card">
        <h2>Set a practice test</h2>
        <form className="stack" onSubmit={createAssignment}>
          <label className="field"><span>Title</span><input value={title} maxLength={120} placeholder="e.g. Networks — week 3 check" onChange={(e) => setTitle(e.target.value)} /></label>
          <label className="field"><span>Instructions for students (optional)</span><textarea rows={2} maxLength={2000} value={instructions} onChange={(e) => setInstructions(e.target.value)} /></label>
          <fieldset className="field">
            <legend>Chapters to draw questions from</legend>
            <p className="muted small">Leave all unticked to draw from every chapter. Every student gets the same questions.</p>
            <div className="checks">
              {chapters.map((c) => (
                <label key={c.id} className="check"><input type="checkbox" checked={chapterIds.has(c.id)} onChange={() => toggleChapter(c.id)} /> Ch.{c.number} — {c.title}</label>
              ))}
            </div>
          </fieldset>
          <div className="row">
            <label className="field inline"><span>Questions</span>
              <select value={count} onChange={(e) => changeCount(Number(e.target.value))}>{COUNTS.map((n) => <option key={n}>{n}</option>)}</select></label>
            <label className="field inline"><span>Time limit (minutes)</span>
              <input type="number" min="1" max="180" value={minutes} onChange={(e) => { setMinutesTouched(true); setMinutes(Math.min(180, Math.max(1, Number(e.target.value) || 1))); }} /></label>
            <label className="field inline"><span>Due (optional)</span>
              <input type="datetime-local" min={localNowForInput()} value={due} onChange={(e) => setDue(e.target.value)} /></label>
          </div>
          <p className="muted small">Multiple-choice only, marked automatically. Students get one attempt, and can’t start after the due date. You can allow a retry for an individual student from the results page.</p>
          <div><button className="btn btn-primary" disabled={busy || !title.trim() || cls.archived}>{busy ? 'Setting…' : 'Set assignment'}</button></div>
        </form>
      </section>

      <h2>Assignments</h2>
      {assignments.length === 0 ? <Empty title="Nothing set yet">Set your first practice test above.</Empty> : (
        <div className="tablewrap">
          <table className="lt">
            <thead><tr><th>Title</th><th>Questions</th><th>Due</th><th>Submitted</th><th>Average</th><th /></tr></thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id}>
                  <td><Link to={`/teach/assignment/${a.id}`}>{a.title}</Link></td>
                  <td>{a.total} · {a.time_limit_minutes} min</td>
                  <td>{a.due_at ? fmtDate(a.due_at) : '—'}</td>
                  <td>{a.submitted} / {a.members}</td>
                  <td>{a.avg_pct == null ? '—' : `${a.avg_pct}%`}</td>
                  <td><button className="btn btn-sm" onClick={() => deleteAssignment(a)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Students</h2>
      {members.length === 0 ? <Empty title="No students yet">Share the class code and students will appear here when they join.</Empty> : (
        <ul className="plain">
          {members.map((m) => (
            <li key={m.user_id} className="row between">
              <span>{m.name} <small className="muted">· joined {new Date(m.joined_at).toLocaleDateString()}</small></span>
              <button className="btn btn-sm" onClick={() => removeMember(m)}>Remove</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
