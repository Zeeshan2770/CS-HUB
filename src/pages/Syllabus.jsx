import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCatalog } from '../lib/catalog.jsx';
import { useProgress } from '../lib/progress.jsx';
import { Empty, ErrorBox, PageHead, Spinner } from '../components/ui.jsx';

export default function Syllabus() {
  const { chapters, byChapter, loading, error, reload } = useCatalog();
  const progress = useProgress();
  const [q, setQ] = useState('');
  const [ch, setCh] = useState('all');
  const needle = q.trim().toLowerCase();

  const view = useMemo(() => chapters
    .filter((c) => ch === 'all' || c.id === ch)
    .map((c) => ({ c, secs: (byChapter[c.id] || []).filter((s) => !needle || s.title.toLowerCase().includes(needle) || c.title.toLowerCase().includes(needle)) }))
    .filter((x) => !needle || x.secs.length > 0), [chapters, byChapter, needle, ch]);

  if (loading) return <div className="page"><Spinner /></div>;
  if (error) return <div className="page"><ErrorBox message={error} onRetry={reload} /></div>;
  return (
    <div className="page">
      <PageHead title="Complete syllabus" sub="Every published chapter and topic. Filter by chapter or search by topic name." />
      <div className="row filters">
        <label className="field inline"><span>Search topics</span><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="For example: encapsulation" /></label>
        <label className="field inline"><span>Chapter</span>
          <select value={ch} onChange={(e) => setCh(e.target.value)}>
            <option value="all">All chapters</option>
            {chapters.map((c) => <option key={c.id} value={c.id}>{c.number}. {c.title}</option>)}
          </select>
        </label>
      </div>
      {view.length === 0 ? <Empty title="No topics match">Try a different word or clear the filters.</Empty> : view.map(({ c, secs }) => (
        <section key={c.id} className="card syl">
          <h2><Link to={`/chapter/${c.id}`}>Chapter {c.number}: {c.title}</Link></h2>
          {secs.length === 0 ? <p className="muted">No topics published in this chapter yet.</p> : (
            <ol className="toc">
              {secs.map((s) => (
                <li key={s.id}>
                  <Link to={`/lesson/${s.id}`}>{s.title}</Link>
                  {progress.isDone(s.id) && <span className="chip ok">Completed</span>}
                  {s.review_status !== 'verified' && <span className="chip" title="Not yet checked against the PDF by a teacher">Unverified</span>}
                </li>
              ))}
            </ol>
          )}
        </section>
      ))}
    </div>
  );
}
