import { Link, useParams } from 'react-router-dom';
import { useCatalog } from '../lib/catalog.jsx';
import { useProgress } from '../lib/progress.jsx';
import { Crumbs, Empty, ProgressBar, Spinner } from '../components/ui.jsx';
import { SOURCE_NOTE } from '../lib/config.js';

export default function Chapter() {
  const { chapterId } = useParams();
  const { chapterMap, byChapter, chapters, loading } = useCatalog();
  const progress = useProgress();
  if (loading) return <div className="page"><Spinner /></div>;
  const c = chapterMap[chapterId];
  if (!c) return <div className="page narrow"><Empty title="Chapter not found" action={<Link className="btn" to="/syllabus">Browse the syllabus</Link>}>It may be unpublished or the address is wrong.</Empty></div>;
  const secs = byChapter[c.id] || [];
  const done = progress.doneCount(secs.map((s) => s.id));
  const next = secs.find((s) => !progress.isDone(s.id)) || secs[0];
  const i = chapters.findIndex((x) => x.id === c.id);
  const prevC = chapters[i - 1], nextC = chapters[i + 1];
  const minutes = secs.reduce((a, s) => a + (s.estimated_minutes || 0), 0) || c.estimated_minutes;

  return (
    <div className="page">
      <Crumbs items={[{ label: 'Syllabus', to: '/syllabus' }, { label: `Chapter ${c.number}` }]} />
      <h1>Chapter {c.number}: {c.title}</h1>
      {c.summary && <p className="lead">{c.summary}</p>}
      <div className="row meta">
        <span className="chip">{secs.length} topics</span>
        {minutes ? <span className="chip" title="An estimate, not a measured time">About {minutes} min (estimate)</span> : null}
        <span className="chip">{done} of {secs.length} completed</span>
      </div>
      <ProgressBar value={done} max={secs.length} label="Chapter progress" />
      <div className="row">
        {next && <Link className="btn btn-primary" to={`/lesson/${next.id}`}>{done ? 'Continue this chapter' : 'Start this chapter'}</Link>}
        <Link className="btn" to={`/practice?chapter=${c.id}`}>Practice this chapter</Link>
        <Link className="btn" to={`/chapter/${c.id}/cheatsheet`}>Printable cheat sheet</Link>
      </div>
      {secs.length === 0 ? <Empty title="No topics yet">This chapter has no published lessons.</Empty> : (
        <ol className="topiclist">
          {secs.map((s) => (
            <li key={s.id}><Link to={`/lesson/${s.id}`} className="card row between"><span>{s.title}</span>
              <span>{progress.isDone(s.id) ? <span className="chip ok">Completed</span> : <span className="chip">Not started</span>}</span></Link></li>
          ))}
        </ol>
      )}
      <p className="muted small">{SOURCE_NOTE}</p>
      <div className="row between">
        {prevC ? <Link to={`/chapter/${prevC.id}`}>Previous: Chapter {prevC.number}</Link> : <span />}
        {nextC ? <Link to={`/chapter/${nextC.id}`}>Next: Chapter {nextC.number}</Link> : <span />}
      </div>
    </div>
  );
}
