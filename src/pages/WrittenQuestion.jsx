import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useToast } from '../lib/toast.jsx';
import { useLoad, unwrap } from '../lib/useLoad.js';
import { AUTO_NOTE } from '../lib/written.js';
import { Crumbs, Empty, ErrorBox, Spinner } from '../components/ui.jsx';

function Feedback({ r }) {
  return (
    <section className="card" aria-label="Feedback">
      <h2>Automatic key-point check</h2>
      <p className="hint">{AUTO_NOTE}</p>
      <ul className="plain">{r.points.map((p) => { const hit = r.matched.includes(p); return <li key={p}><span className={`chip ${hit ? 'ok' : ''}`}>{hit ? 'Found' : 'Not found'}</span> {p}</li>; })}</ul>
      <p>Found {r.matched.length} of {r.total} key points.</p>
      <h3>Model answer</h3>
      <p className="ans">{r.model_answer}</p>
    </section>
  );
}

export default function WrittenQuestion() {
  const { id } = useParams();
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const { data, error, loading, reload } = useLoad(async () => {
    const q = await supabase.from('written_questions_public').select('*').eq('id', id).maybeSingle().then(unwrap);
    if (!q) return { q: null };
    const mine = await supabase.rpc('my_written', { p_question: id }).then(unwrap);
    return { q, mine };
  }, [id]);

  const submit = async () => {
    setBusy(true);
    const { data: r, error: e } = await supabase.rpc('submit_written', { p_question: id, p_answer: text });
    setBusy(false);
    if (e) { toast(e.message.includes('too many') ? 'Slow down: wait a minute before submitting again.' : e.message.includes('too short') ? 'Write a little more before submitting.' : 'Could not submit. Try again.', 'error'); return; }
    setResult(r); setText(''); toast('Answer submitted. Your teacher will mark it.', 'success'); reload();
  };

  if (loading && !data) return <div className="page"><Spinner /></div>;
  if (error) return <div className="page narrow"><ErrorBox message={error} onRetry={reload} /></div>;
  if (!data.q) return <div className="page narrow"><Empty title="Question not found" action={<Link className="btn" to="/practice/written">Back to written questions</Link>}>It may have been unpublished.</Empty></div>;
  const { q, mine } = data;
  const subs = mine?.submissions || [];

  return (
    <div className="page narrow">
      <Crumbs items={[{ label: 'Practice and exams', to: '/practice' }, { label: 'Written questions', to: '/practice/written' }, { label: 'Answer' }]} />
      <h1>{q.prompt}</h1>
      <p className="muted">{q.kind === 'long' ? 'Long answer' : 'Short answer'}, {q.max_marks} marks. Marked by your teacher.</p>
      <label className="field"><span>Your answer</span><textarea rows={q.kind === 'long' ? 10 : 5} maxLength={5000} value={text} onChange={(e) => setText(e.target.value)} /></label>
      <div className="row"><button className="btn btn-primary" disabled={busy || text.trim().length < 5} onClick={submit}>{busy ? 'Submitting…' : 'Submit answer'}</button><span className="muted small">{text.length} / 5000</span></div>
      {result && <Feedback r={result} />}
      {subs.length > 0 && (
        <section className="card"><h2>Your submissions</h2>
          {!result && mine.model_answer && <Feedback r={{ points: mine.points || [], matched: subs[0].auto_matched || [], total: subs[0].auto_total, model_answer: mine.model_answer }} />}
          <ul className="plain">{subs.map((a) => (
            <li key={a.id} className="card">
              <small className="muted">{new Date(a.submitted_at).toLocaleString()}</small>
              <p className="ans">{a.answer}</p>
              {a.status === 'graded' ? (
                <div className="feedback ok"><b>Teacher's mark: {a.teacher_marks} out of {q.max_marks}</b>{a.teacher_feedback && <p>{a.teacher_feedback}</p>}</div>
              ) : <p className="hint">Waiting for your teacher to mark this.</p>}
            </li>))}</ul></section>)}
    </div>
  );
}
