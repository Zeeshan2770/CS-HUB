import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';

// One multiple-choice question with instant, server-side checking (grade_answer RPC).
export default function Question({ q, index, flagged = false, onFlagChange }) {
  const { user } = useAuth();
  const toast = useToast();
  const [sel, setSel] = useState(null);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [flag, setFlag] = useState(flagged);
  useEffect(() => setFlag(flagged), [flagged]);

  const check = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('grade_answer', { p_question_id: q.id, p_selected: sel });
    setBusy(false);
    if (error) { toast('Could not check this answer. Try again.', 'error'); return; }
    setRes(data);
  };

  const toggleFlag = async () => {
    if (!user) return;
    const next = !flag;
    setFlag(next);
    const { error } = next
      ? await supabase.from('flagged_questions').upsert({ user_id: user.id, question_id: q.id })
      : await supabase.from('flagged_questions').delete().eq('user_id', user.id).eq('question_id', q.id);
    if (error) { setFlag(!next); toast('Could not update the flag.', 'error'); } else onFlagChange?.(q.id, next);
  };

  const opts = Array.isArray(q.options) ? q.options : [];
  return (
    <fieldset className="mcq">
      <legend>{index != null && <span className="qn">Q{index + 1}.</span>} {q.question}</legend>
      <div className="opts">
        {opts.map((o, i) => {
          const state = res ? (i === res.correct_answer ? 'right' : i === sel ? 'wrong' : '') : '';
          return (
            <label key={i} className={`opt ${sel === i ? 'on' : ''} ${state}`}>
              <input type="radio" name={`q-${q.id}`} checked={sel === i} disabled={Boolean(res)} onChange={() => setSel(i)} />
              <span>{o}</span>
            </label>
          );
        })}
      </div>
      {!user ? (
        <p className="hint"><Link to="/login">Sign in</Link> to check your answer and keep your results.</p>
      ) : (
        <div className="row">
          {!res ? <button className="btn btn-primary btn-sm" disabled={sel === null || busy} onClick={check}>Check answer</button>
            : <button className="btn btn-sm" onClick={() => { setRes(null); setSel(null); }}>Try again</button>}
          <button className={`btn btn-sm ${flag ? 'btn-on' : ''}`} aria-pressed={flag} onClick={toggleFlag}>{flag ? 'Marked as difficult' : 'Mark as difficult'}</button>
        </div>
      )}
      {res && (
        <div className={`feedback ${res.correct ? 'ok' : 'no'}`} role="status">
          <strong>{res.correct ? 'Correct.' : 'Not quite.'}</strong>
          {!res.correct && <span> The right answer is {opts[res.correct_answer]}.</span>}
          {res.explanation && <p>{res.explanation}</p>}
        </div>
      )}
    </fieldset>
  );
}
