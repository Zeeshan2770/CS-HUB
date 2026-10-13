import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useToast, useConfirm } from '../lib/toast.jsx';
import { ErrorBox, Spinner } from '../components/ui.jsx';

const K = (id) => `cs12.quiz.${id}`;
const KA = (id) => `cs12.quiz.answers.${id}`;
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function QuizSession() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [quiz, setQuiz] = useState(null);
  const [err, setErr] = useState('');
  const [answers, setAnswers] = useState(() => read(KA(id), {}));
  const [flags, setFlags] = useState(new Set());
  const [i, setI] = useState(0);
  const [left, setLeft] = useState(null);
  const [busy, setBusy] = useState(false);
  const submitted = useRef(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc('resume_quiz', { p_session: id });
      if (error) { setErr('This test could not be found.'); return; }
      if (data.status === 'submitted') { nav(`/practice/results/${id}`, { replace: true }); return; }
      if (data.status === 'expired') { setErr('Time ran out before this test was submitted, so it was not scored.'); return; }
      setQuiz(data);
      try { localStorage.setItem(K(id), JSON.stringify(data)); } catch { /* ignore */ }
    })();
  }, [id, nav]);

  const pick = (qid, idx) => setAnswers((a) => { const n = { ...a, [qid]: idx }; try { localStorage.setItem(KA(id), JSON.stringify(n)); } catch { /* ignore */ } return n; });

  const submit = useCallback(async (auto = false) => {
    if (submitted.current) return;
    submitted.current = true; setBusy(true);
    const { data, error } = await supabase.rpc('submit_quiz', { p_session: id, p_answers: answers });
    setBusy(false);
    if (error) { submitted.current = false; toast('Could not submit. Your answers are saved on this device. Try again.', 'error'); return; }
    if (data.expired) { setErr('Time ran out before this test was submitted, so it was not scored.'); return; }
    try { localStorage.removeItem(K(id)); localStorage.removeItem(KA(id)); } catch { /* ignore */ }
    if (auto) toast('Time is up. Your answers were submitted.', 'info');
    nav(`/practice/results/${id}`, { replace: true });
  }, [id, answers, nav, toast]);

  useEffect(() => {
    if (!quiz?.expires_at) return undefined;
    const tick = () => {
      const s = Math.max(0, Math.round((new Date(quiz.expires_at) - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) submit(true);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [quiz, submit]);

  if (err) return <div className="page narrow"><ErrorBox message={err} /><Link className="btn" to="/practice">Back to practice</Link></div>;
  if (!quiz) return <div className="page"><Spinner /></div>;

  const qs = quiz.questions || [];
  const q = qs[i];
  const answered = qs.filter((x) => answers[x.id] !== undefined).length;

  const finish = async () => {
    const un = qs.length - answered;
    const msg = un ? `You have ${un} unanswered ${un === 1 ? 'question' : 'questions'}. Submit anyway? You cannot change answers afterwards.` : 'Submit your answers? You cannot change them afterwards.';
    if (await confirm(msg, { confirmLabel: 'Submit test' })) submit(false);
  };

  return (
    <div className="page quiz">
      <div className="quizbar">
        <span><b>Question {i + 1}</b> of {qs.length}</span>
        <span>{answered} answered, {qs.length - answered} left</span>
        {left !== null && <span className={`timer ${left < 60 ? 'low' : ''}`} role="timer" aria-label="Time remaining">{fmt(left)}</span>}
      </div>
      <nav className="qnav" aria-label="Questions">
        {qs.map((x, n) => (
          <button key={x.id} className={`qn-btn ${n === i ? 'cur' : ''} ${answers[x.id] !== undefined ? 'ans' : ''} ${flags.has(x.id) ? 'flag' : ''}`} onClick={() => setI(n)} aria-label={`Question ${n + 1}${answers[x.id] !== undefined ? ', answered' : ''}${flags.has(x.id) ? ', flagged' : ''}`} aria-current={n === i}>{n + 1}</button>))}
      </nav>
      <fieldset className="mcq">
        <legend>{q.question}</legend>
        <div className="opts">{(q.options || []).map((o, n) => (
          <label key={n} className={`opt ${answers[q.id] === n ? 'on' : ''}`}><input type="radio" name={`q-${q.id}`} checked={answers[q.id] === n} onChange={() => pick(q.id, n)} /><span>{o}</span></label>))}</div>
        <div className="row">
          <button className={`btn btn-sm ${flags.has(q.id) ? 'btn-on' : ''}`} aria-pressed={flags.has(q.id)} onClick={() => setFlags((f) => { const s = new Set(f); s.has(q.id) ? s.delete(q.id) : s.add(q.id); return s; })}>{flags.has(q.id) ? 'Flagged for review' : 'Flag for review'}</button>
          {answers[q.id] !== undefined && <button className="btn btn-sm" onClick={() => setAnswers((a) => { const n = { ...a }; delete n[q.id]; try { localStorage.setItem(KA(id), JSON.stringify(n)); } catch { /* ignore */ } return n; })}>Clear answer</button>}
        </div>
      </fieldset>
      <div className="row between">
        <button className="btn" disabled={i === 0} onClick={() => setI(i - 1)}>Previous</button>
        {i < qs.length - 1 ? <button className="btn btn-primary" onClick={() => setI(i + 1)}>Next</button> : <button className="btn btn-primary" disabled={busy} onClick={finish}>{busy ? 'Submitting…' : 'Submit test'}</button>}
      </div>
      {i < qs.length - 1 && <div className="row end"><button className="btn" disabled={busy} onClick={finish}>Submit test now</button></div>}
    </div>
  );
}
