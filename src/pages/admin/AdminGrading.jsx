import { useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useToast } from '../../lib/toast.jsx';
import { useLoad, unwrap } from '../../lib/useLoad.js';
import { AUTO_NOTE } from '../../lib/written.js';
import { Empty, ErrorBox, Spinner } from '../../components/ui.jsx';

const SELECT = 'id,answer,auto_matched,auto_total,submitted_at,status,teacher_marks,teacher_feedback,written_questions(prompt,model_answer,key_points,max_marks,kind)';

function Card({ a, onSaved }) {
  const toast = useToast();
  const q = a.written_questions;
  const [marks, setMarks] = useState(a.teacher_marks ?? '');
  const [fb, setFb] = useState(a.teacher_feedback || '');
  const [busy, setBusy] = useState(false);
  const bad = marks === '' || !Number.isInteger(Number(marks)) || Number(marks) < 0 || Number(marks) > q.max_marks;
  const save = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('grade_written', { p_answer: a.id, p_marks: Number(marks), p_feedback: fb });
    setBusy(false);
    if (error) toast(error.message.includes('between') ? `Marks must be from 0 to ${q.max_marks}.` : error.message.includes('own answer') ? 'You cannot mark your own answer.' : 'Could not save the mark.', 'error');
    else { toast('Mark saved', 'success'); onSaved(); }
  };
  return (
    <article className="card">
      <div className="row between"><b>{q.prompt}</b><span className="chip">{q.kind === 'long' ? 'Long' : 'Short'}, {q.max_marks} marks</span></div>
      <h3>Student's answer</h3>
      <p className="ans">{a.answer}</p>
      <details><summary>Model answer and automatic check</summary>
        <p className="ans">{q.model_answer}</p>
        <p className="hint">{AUTO_NOTE} It found {(a.auto_matched || []).length} of {a.auto_total} key points: {(a.auto_matched || []).join(', ') || 'none'}.</p></details>
      <div className="row">
        <label className="field inline"><span>Marks (0 to {q.max_marks})</span><input type="number" min={0} max={q.max_marks} value={marks} onChange={(e) => setMarks(e.target.value)} /></label>
        <label className="field inline grow"><span>Feedback for the student</span><input value={fb} maxLength={2000} onChange={(e) => setFb(e.target.value)} /></label>
        <button className="btn btn-primary" disabled={busy || bad} onClick={save}>{a.status === 'graded' ? 'Update mark' : 'Save mark'}</button>
      </div>
    </article>
  );
}

export default function AdminGrading() {
  const [tab, setTab] = useState('submitted');
  const { data, error, loading, reload } = useLoad(() =>
    supabase.from('written_answers').select(SELECT).eq('status', tab).order('submitted_at', { ascending: tab === 'submitted' }).limit(30).then(unwrap), [tab]);
  return (
    <>
      <div className="tabs" role="tablist">{[['submitted', 'Waiting for marking'], ['graded', 'Recently marked']].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      <p className="muted small">Student names are hidden while marking. The automatic check is only a guide; the mark you give is the only one students see as their result.</p>
      {loading ? <Spinner /> : error ? <ErrorBox message={error} onRetry={reload} /> : data.length === 0 ? <Empty title={tab === 'submitted' ? 'Nothing to mark' : 'Nothing marked yet'}>{tab === 'submitted' ? 'New written answers will appear here.' : ''}</Empty> : data.map((a) => <Card key={a.id} a={a} onSaved={reload} />)}
    </>
  );
}
