import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useCatalog } from '../lib/catalog.jsx';
import { useToast, useConfirm } from '../lib/toast.jsx';
import { useLoad, unwrap } from '../lib/useLoad.js';
import { Crumbs, Empty, ErrorBox, PageHead, ProgressBar, Spinner } from '../components/ui.jsx';

const STATUS = { not_started: 'Not started', in_progress: 'In progress', submitted: 'Submitted', expired: 'Time ran out' };
const fmtDate = (iso) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
const localNowForInput = () => { const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };

// Student names are chosen by students, so a spreadsheet could treat one as a formula (=, +, -, @).
// Prefixing an apostrophe makes Excel/Sheets show it as plain text.
function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function TeachAssignment() {
  const { id } = useParams();
  const { chapterMap } = useCatalog();
  const toast = useToast();
  const confirm = useConfirm();
  const [newDue, setNewDue] = useState('');
  const [savingDue, setSavingDue] = useState(false);

  const { data, error, loading, reload } = useLoad(() => supabase.rpc('teacher_assignment_results', { p_assignment: id }).then(unwrap), [id]);

  const stats = useMemo(() => {
    if (!data) return null;
    const submitted = data.students.filter((s) => s.status === 'submitted');
    const avg = submitted.length ? Math.round(submitted.reduce((a, s) => a + (100 * s.score) / s.total, 0) / submitted.length) : null;
    return { submitted: submitted.length, members: data.students.length, avg };
  }, [data]);

  if (loading) return <div className="page"><Spinner /></div>;
  if (error) {
    return <div className="page narrow"><ErrorBox message="This assignment could not be loaded. It may not be yours, or it was deleted." onRetry={reload} /><Link className="btn" to="/teach">Back to your classes</Link></div>;
  }

  const { assignment: a, students, questions } = data;
  const closed = a.due_at && new Date(a.due_at) < new Date();

  async function allowRetry(s) {
    const msg = s.status === 'submitted'
      ? `Let ${s.name} try again? Their current score (${s.score}/${s.total}) is removed from these results and they get a fresh attempt with a new timer.${closed ? ' The due date has passed, so also set a new one below or they will still be locked out.' : ''}`
      : `Let ${s.name} start again? Their unfinished attempt is discarded and they get a fresh timer.${closed ? ' The due date has passed, so also set a new one below or they will still be locked out.' : ''}`;
    if (!(await confirm(msg, { confirmLabel: 'Allow another try' }))) return;
    const { error: er } = await supabase.rpc('reset_assignment_attempt', { p_assignment: id, p_user: s.user_id });
    if (er) toast('Could not reset that attempt.', 'error'); else { toast(`${s.name} can try again.`, 'success'); reload(); }
  }

  async function saveDue(value) {
    setSavingDue(true);
    const { error: er } = await supabase.rpc('set_assignment_due', { p_assignment: id, p_due: value });
    setSavingDue(false);
    if (er) { toast(er.message || 'Could not change the due date.', 'error'); return; }
    toast(value ? 'Due date updated.' : 'Deadline removed.', 'success');
    setNewDue(''); reload();
  }

  function exportCsv() {
    const rows = [['Student', 'Status', 'Score', 'Out of', 'Percent', 'Submitted at', 'Late']];
    students.forEach((s) => rows.push([
      s.name, STATUS[s.status], s.score ?? '', s.total,
      s.score != null ? Math.round((100 * s.score) / s.total) : '',
      s.submitted_at ? new Date(s.submitted_at).toISOString() : '', s.late ? 'yes' : '',
    ]));
    const blob = new Blob([`\ufeff${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${a.title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'results'}.csv`;
    document.body.appendChild(link); link.click(); link.remove();
    URL.revokeObjectURL(url);
  }

  const hardest = [...questions].sort((x, y) => (x.pct_correct ?? 101) - (y.pct_correct ?? 101));
  const anyAnswered = questions.some((q) => q.answered > 0);

  return (
    <div className="page">
      <Crumbs items={[{ label: 'Teaching', to: '/teach' }, { label: 'Class', to: `/teach/class/${a.class_id}` }, { label: a.title }]} />
      <PageHead title={a.title} sub={`${a.total} questions · ${a.time_limit_minutes} min${a.chapter_ids.length ? ` · ${a.chapter_ids.map((c) => `Ch.${chapterMap[c]?.number ?? '?'}`).join(', ')}` : ' · all chapters'}`}>
        <button className="btn" onClick={exportCsv} disabled={students.length === 0}>Download CSV</button>
      </PageHead>
      {a.instructions && <p className="assign-instructions">{a.instructions}</p>}

      <div className="stats">
        <div className="card stat"><b>{stats.submitted}/{stats.members}</b><span>submitted</span></div>
        <div className="card stat"><b>{stats.avg == null ? '—' : `${stats.avg}%`}</b><span>class average</span></div>
        <div className="card stat"><b>{a.due_at ? fmtDate(a.due_at) : 'No deadline'}</b><span>{closed ? 'closed' : 'due'}</span></div>
      </div>

      <section className="card">
        <h2>Deadline</h2>
        <p className="muted small">{closed ? 'This assignment is closed, so students cannot start it. Set a new date to reopen it.' : 'You can move the deadline or remove it.'}</p>
        <div className="row">
          <label className="sr" htmlFor="new-due">New due date</label>
          <input id="new-due" type="datetime-local" min={localNowForInput()} value={newDue} onChange={(e) => setNewDue(e.target.value)} />
          <button className="btn btn-primary" disabled={!newDue || savingDue} onClick={() => saveDue(new Date(newDue).toISOString())}>Set due date</button>
          {a.due_at && <button className="btn" disabled={savingDue} onClick={() => saveDue(null)}>Remove deadline</button>}
        </div>
      </section>

      <h2>Students</h2>
      {students.length === 0 ? <Empty title="No students in this class yet">Share the class code and they will appear here.</Empty> : (
        <div className="tablewrap">
          <table className="lt">
            <thead><tr><th>Student</th><th>Status</th><th>Score</th><th>Submitted</th><th /></tr></thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.user_id}>
                  <td>{s.name}</td>
                  <td><span className={`chip ${s.status === 'submitted' ? 'ok' : s.status === 'expired' ? 'warn' : ''}`}>{STATUS[s.status]}</span></td>
                  <td>{s.score != null ? <>{s.score}/{s.total} <small className="muted">({Math.round((100 * s.score) / s.total)}%)</small></> : '—'}</td>
                  <td>{s.submitted_at ? fmtDate(s.submitted_at) : '—'}{s.late && <> <span className="chip warn">Late</span></>}</td>
                  <td>{s.status !== 'not_started' && <button className="btn btn-sm" onClick={() => allowRetry(s)}>Allow another try</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Which questions were hardest</h2>
      {!anyAnswered ? <Empty title="No submissions yet">Once students submit, you will see which questions the class found hardest.</Empty> : (
        <>
          <p className="muted small">Based on the {stats.submitted} submitted {stats.submitted === 1 ? 'attempt' : 'attempts'}, lowest first. A question most of the class missed is worth re-teaching.</p>
          <div className="tablewrap">
            <table className="lt">
              <thead><tr><th>Question</th><th>Chapter</th><th>Class got it right</th></tr></thead>
              <tbody>
                {hardest.map((q) => (
                  <tr key={q.question_id}>
                    <td>{q.question}</td>
                    <td>{chapterMap[q.chapter_id] ? `Ch.${chapterMap[q.chapter_id].number}` : '—'}</td>
                    <td className="itemcell">
                      {q.pct_correct == null ? '—' : <><ProgressBar value={q.pct_correct} max={100} label={`${q.pct_correct}% correct`} /><small>{q.correct}/{q.answered} · {q.pct_correct}%</small></>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
