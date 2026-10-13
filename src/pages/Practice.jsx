import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useCatalog } from '../lib/catalog.jsx';
import { useToast } from '../lib/toast.jsx';
import { useLoad, unwrap } from '../lib/useLoad.js';
import { Empty, PageHead, Spinner } from '../components/ui.jsx';

export default function Practice() {
  const { chapters } = useCatalog();
  const nav = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const [mode, setMode] = useState('practice');
  const [count, setCount] = useState(10);
  const [minutes, setMinutes] = useState(10);
  const [sel, setSel] = useState(() => new Set(params.get('chapter') ? [params.get('chapter')] : []));
  const [busy, setBusy] = useState(false);
  const [mockCount, setMockCount] = useState(40);
  const [mockMinutes, setMockMinutes] = useState(60);
  const [mockBusy, setMockBusy] = useState(false);

  const { data, loading, reload } = useLoad(async () => {
    const [open, done] = await Promise.all([
      supabase.from('quiz_sessions').select('id,mode,total,started_at,expires_at').eq('status', 'in_progress').order('started_at', { ascending: false }).limit(5).then(unwrap),
      supabase.from('quiz_sessions').select('id,mode,score,total,submitted_at,chapter_ids').eq('status', 'submitted').order('submitted_at', { ascending: false }).limit(20).then(unwrap),
    ]);
    return { open, done };
  }, []);
  useEffect(() => { if (mode === 'timed') setMinutes(Math.max(1, Math.round(count))); }, [count, mode]);

  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const start = async () => {
    setBusy(true);
    const { data: d, error } = await supabase.rpc('start_quiz', { p_mode: mode, p_chapter_ids: [...sel], p_count: count, p_minutes: mode === 'timed' ? minutes : null });
    setBusy(false);
    if (error) { toast(error.message.includes('no questions') ? 'There are no questions for that selection yet.' : 'Could not start the test. Try again.', 'error'); return; }
    try { localStorage.setItem(`cs12.quiz.${d.session_id}`, JSON.stringify(d)); } catch { /* resume will refetch */ }
    nav(`/practice/session/${d.session_id}`);
  };

  const startMock = async () => {
    setMockBusy(true);
    const { data: d, error } = await supabase.rpc('start_quiz', { p_mode: 'timed', p_chapter_ids: [], p_count: mockCount, p_minutes: mockMinutes });
    setMockBusy(false);
    if (error) { toast(error.message.includes('no questions') ? 'There are no published questions yet.' : 'Could not start the mock exam. Try again.', 'error'); return; }
    try { localStorage.setItem(`cs12.quiz.${d.session_id}`, JSON.stringify(d)); } catch { /* resume will refetch */ }
    nav(`/practice/session/${d.session_id}`);
  };

  return (
    <div className="page">
      <PageHead title="Practice and exams" sub="Questions are marked on the server. Correct answers and explanations appear after you submit." />

      <section className="card mock-exam-card">
        <h2>Full syllabus mock exam</h2>
        <p className="muted small">Questions drawn at random from every published chapter, timed like a real paper. Multiple-choice only — same honest scope as the custom test below. Adjust the defaults if you want a shorter drill.</p>
        <div className="row">
          <label className="field inline"><span>Questions</span><select value={mockCount} onChange={(e) => setMockCount(Number(e.target.value))}>{[20, 30, 40, 50].map((n) => <option key={n}>{n}</option>)}</select></label>
          <label className="field inline"><span>Minutes</span><input type="number" min="10" max="180" value={mockMinutes} onChange={(e) => setMockMinutes(Number(e.target.value))} /></label>
        </div>
        <button className="btn btn-primary btn-lg" disabled={mockBusy} onClick={startMock}>{mockBusy ? 'Starting…' : 'Start full mock exam'}</button>
      </section>

      <section className="card">
        <h2>Start a test</h2>
        <fieldset className="field"><legend>Mode</legend>
          <label className="opt inline"><input type="radio" name="mode" checked={mode === 'practice'} onChange={() => setMode('practice')} /><span>Practice (no time limit)</span></label>
          <label className="opt inline"><input type="radio" name="mode" checked={mode === 'timed'} onChange={() => setMode('timed')} /><span>Timed test</span></label>
        </fieldset>
        <fieldset className="field"><legend>Chapters (leave empty for all)</legend>
          <div className="checks">{chapters.map((c) => (
            <label key={c.id} className="opt inline"><input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} /><span>{c.number}. {c.title}</span></label>))}</div>
        </fieldset>
        <div className="row">
          <label className="field inline"><span>Number of questions</span><select value={count} onChange={(e) => setCount(Number(e.target.value))}>{[5, 10, 20, 30, 50].map((n) => <option key={n}>{n}</option>)}</select></label>
          {mode === 'timed' && <label className="field inline"><span>Minutes</span><input type="number" min="1" max="180" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} /></label>}
        </div>
        <p className="muted small">Multiple-choice only. Short and long answers appear inside lessons and are for self-checking, not automatic marking.</p>
        <button className="btn btn-primary" disabled={busy} onClick={start}>{busy ? 'Starting…' : 'Start test'}</button>
      </section>

      <section className="card"><h2>Written questions</h2><p className="muted">Short and long answers marked by your teacher. You get an automatic key-point check straight away, but only the teacher's mark counts.</p><Link className="btn" to="/practice/written">Open written questions</Link></section>

      {loading ? <Spinner /> : (<>
        {data.open.length > 0 && (<section className="card"><h2>Unfinished tests</h2><ul className="plain">{data.open.map((s) => (
          <li key={s.id}><Link to={`/practice/session/${s.id}`}>Resume {s.mode === 'timed' ? 'timed test' : 'practice'} ({s.total} questions)</Link> <small className="muted">started {new Date(s.started_at).toLocaleString()}</small></li>))}</ul></section>)}
        <section className="card"><h2>Your results</h2>
          {data.done.length === 0 ? <Empty title="No completed tests yet">Your scores will be listed here.</Empty> : (
            <div className="tablewrap"><table className="lt"><thead><tr><th>Date</th><th>Type</th><th>Score</th><th /></tr></thead>
              <tbody>{data.done.map((s) => (<tr key={s.id}><td>{new Date(s.submitted_at).toLocaleString()}</td><td>{s.mode === 'timed' ? 'Timed' : 'Practice'}</td>
                <td>{s.score}/{s.total} ({Math.round((s.score / s.total) * 100)}%)</td><td><Link to={`/practice/results/${s.id}`}>Review</Link></td></tr>))}</tbody></table></div>)}
          <button className="linkbtn" onClick={reload}>Refresh</button>
        </section></>)}
    </div>
  );
}
