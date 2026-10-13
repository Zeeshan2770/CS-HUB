import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useCatalog } from '../lib/catalog.jsx';
import { useLoad, unwrap } from '../lib/useLoad.js';
import { ErrorBox, PageHead, ProgressBar, Spinner } from '../components/ui.jsx';

export default function QuizResults() {
  const { id } = useParams();
  const { chapterMap } = useCatalog();
  const [wrongOnly, setWrongOnly] = useState(false);
  const { data, error, loading, reload } = useLoad(() => supabase.rpc('quiz_review', { p_session: id }).then(unwrap), [id]);

  const byChapter = useMemo(() => {
    const m = {};
    (data?.items || []).forEach((it) => { const c = (m[it.chapter_id] ||= { right: 0, total: 0 }); c.total++; if (it.correct) c.right++; });
    return Object.entries(m).sort();
  }, [data]);

  if (loading) return <div className="page"><Spinner /></div>;
  if (error) return <div className="page narrow"><ErrorBox message="This result could not be loaded." onRetry={reload} /><Link to="/practice">Back to practice</Link></div>;

  const { session, items } = data;
  const pct = Math.round((session.score / session.total) * 100);
  const shown = wrongOnly ? items.filter((x) => !x.correct) : items;
  return (
    <div className="page">
      <PageHead title={`Score: ${session.score} of ${session.total} (${pct}%)`} sub={`${session.mode === 'timed' ? 'Timed test' : 'Practice'} on ${new Date(session.submitted_at).toLocaleString()}. A practice score shows how you did on these questions only. It does not predict exam results.`}>
        <Link className="btn btn-primary" to="/practice">Take another test</Link>
      </PageHead>
      {byChapter.length > 0 && (
        <section className="card"><h2>By chapter</h2>
          {byChapter.map(([cid, v]) => (
            <div key={cid} className="chrow"><span>{chapterMap[cid] ? `${chapterMap[cid].number}. ${chapterMap[cid].title}` : cid}</span><ProgressBar value={v.right} max={v.total} label={`${cid} score`} /><small>{v.right}/{v.total}</small></div>))}
          {items.length < 10 && <p className="muted small">Too few questions for a reliable breakdown. Treat this as a rough guide.</p>}
        </section>)}
      <div className="row"><label className="opt inline"><input type="checkbox" checked={wrongOnly} onChange={(e) => setWrongOnly(e.target.checked)} /><span>Show only questions I got wrong or skipped</span></label></div>
      {shown.map((it, n) => (
        <article key={it.question_id} className={`card review ${it.correct ? 'ok' : 'no'}`}>
          <h3>{n + 1}. {it.question}</h3>
          <ul className="opts static">{it.options.map((o, k) => (
            <li key={k} className={`${k === it.correct_answer ? 'right' : ''} ${k === it.selected && !it.correct ? 'wrong' : ''}`}>
              {o}{k === it.correct_answer && <b> (correct answer)</b>}{k === it.selected && k !== it.correct_answer && <b> (your answer)</b>}</li>))}</ul>
          {it.selected === null && <p className="muted">You did not answer this question.</p>}
          {it.explanation && <p className="expl"><b>Why:</b> {it.explanation}</p>}
        </article>))}
      {shown.length === 0 && <p className="feedback ok">Nothing to show here. Every question was answered correctly.</p>}
    </div>
  );
}
