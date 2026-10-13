import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.jsx';
import { useCatalog } from '../lib/catalog.jsx';
import { useProgress } from '../lib/progress.jsx';
import { useLoad, unwrap } from '../lib/useLoad.js';
import { Empty, ErrorBox, PageHead, ProgressBar, Spinner } from '../components/ui.jsx';

const weekStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };
const fmt = (d) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export default function Dashboard() {
  const { user, profile } = useAuth();
  const { chapters, byChapter, sectionMap, flat } = useCatalog();
  const progress = useProgress();

  const { data, error, loading, reload } = useLoad(async () => {
    const [quiz, bm, tasks, goal, recent, streak, weak, assignments] = await Promise.all([
      supabase.from('quiz_sessions').select('id,mode,score,total,submitted_at').eq('status', 'submitted').order('submitted_at', { ascending: false }).limit(5).then(unwrap),
      supabase.from('bookmarks').select('id', { count: 'exact', head: true }).then(({ count, error: e }) => { if (e) throw e; return count || 0; }),
      supabase.from('study_tasks').select('id,title,due_date').eq('completed', false).order('due_date', { ascending: true, nullsFirst: false }).limit(5).then(unwrap),
      supabase.from('study_goals').select('weekly_lessons_target').maybeSingle().then(unwrap),
      supabase.from('lesson_progress').select('section_id,last_opened_at').order('last_opened_at', { ascending: false }).limit(5).then(unwrap),
      supabase.rpc('my_streak').then(unwrap),
      supabase.rpc('my_weak_topics').then(unwrap),
      supabase.rpc('my_assignments').then(unwrap).catch(() => []),
    ]);
    return { quiz, bm, tasks, target: goal?.weekly_lessons_target ?? 5, recent, streak, weak, assignments };
  }, [user?.id]);

  const total = flat.length;
  const done = flat.filter((s) => progress.isDone(s.id)).length;
  const ws = weekStart();
  const thisWeek = Object.values(progress.map).filter((v) => v.completed && v.completed_at && new Date(v.completed_at) >= ws).length;
  const resume = profile?.last_section_id && sectionMap[profile.last_section_id];
  const name = profile?.full_name || user?.email?.split('@')[0];

  if (loading || !progress.ready) return <div className="page"><Spinner /></div>;
  if (error) return <div className="page"><ErrorBox message={error} onRetry={reload} /></div>;

  return (
    <div className="page">
      <PageHead title={`Welcome${name ? `, ${name}` : ''}`} sub="Your progress, results and plans in one place.">
        {resume ? <Link className="btn btn-primary" to={`/lesson/${resume.id}`}>Continue: {resume.title}</Link> : <Link className="btn btn-primary" to="/syllabus">Start your first lesson</Link>}
      </PageHead>

      <div className="grid stats">
        <div className="card stat"><b>{total ? Math.round((done / total) * 100) : 0}%</b><span>of the syllabus completed</span><ProgressBar value={done} max={total} label="Overall progress" /><small className="muted">{done} of {total} topics</small></div>
        <div className="card stat"><b>{thisWeek}<small>/{data.target}</small></b><span>topics completed this week</span><ProgressBar value={Math.min(thisWeek, data.target)} max={data.target} label="Weekly goal" /><Link to="/planner">Change goal</Link></div>
        <div className="card stat"><b>{data.quiz.length ? `${Math.round((data.quiz.reduce((a, q) => a + q.score, 0) / data.quiz.reduce((a, q) => a + q.total, 0)) * 100)}%` : 'None yet'}</b><span>average of your last {data.quiz.length || 'few'} tests</span><Link to="/practice">Take a practice test</Link></div>
        <div className="card stat"><b>{data.streak?.current ?? 0}<small> {(data.streak?.current ?? 0) === 1 ? 'day' : 'days'}</small></b><span>current study streak</span>
          <div className="dots" role="img" aria-label={`Studied on ${(data.streak?.recent_days || []).length} of the last 14 days`}>{Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (13 - i)); const key = d.toLocaleDateString('en-CA'); return <i key={key} className={(data.streak?.recent_days || []).includes(key) ? 'on' : ''} title={key} />; })}</div>
          <small className="muted">Longest: {data.streak?.longest ?? 0}. {data.streak?.active_today ? 'You studied today.' : (data.streak?.current ? 'Study today to keep it going.' : 'Open a lesson or answer a question to start.')}</small></div>
        <div className="card stat"><b>{data.bm}</b><span>bookmarked topics</span><Link to="/bookmarks">Open bookmarks</Link></div>
      </div>

      {data.assignments.some((a) => a.status === 'not_started' || a.status === 'in_progress') && (
        <section className="card">
          <h2>Assignments from your teacher</h2>
          <ul className="plain">
            {data.assignments.filter((a) => a.status === 'not_started' || a.status === 'in_progress').slice(0, 4).map((a) => (
              <li key={a.id} className="row between">
                <span><Link to="/assignments">{a.title}</Link> <small className="muted">· {a.class_name}{a.due_at ? ` · due ${new Date(a.due_at).toLocaleDateString()}` : ''}</small></span>
                {a.overdue ? <span className="chip warn">Closed</span> : a.status === 'in_progress' ? <span className="chip">In progress</span> : <span className="chip">To do</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.weak.length > 0 && (
        <section className="card">
          <h2>Where to focus next</h2>
          <p className="muted small">Based on your own quiz answers — topics with the lowest accuracy, from at least 3 attempts.</p>
          <ul className="plain weaktopics">
            {data.weak.map((t) => (
              <li key={t.section_id || t.chapter_id}>
                <div>
                  <Link to={`/chapter/${t.chapter_id}`}>{t.section_title || `Ch.${t.chapter_number} — ${t.chapter_title}`}</Link>
                  <small className="muted"> · Ch.{t.chapter_number} {t.section_title ? `— ${t.chapter_title}` : ''}</small>
                </div>
                <div className="row">
                  <small className="muted">{t.correct}/{t.attempts} correct</small>
                  <b className={t.accuracy < 50 ? 'weak-bad' : 'weak-mid'}>{t.accuracy}%</b>
                  <Link className="btn btn-sm" to={`/practice?chapter=${t.chapter_id}`}>Practice this</Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid two">
        <section className="card"><h2>Chapter progress</h2>
          {chapters.length === 0 ? <p className="muted">No chapters published yet.</p> : chapters.map((c) => {
            const ids = (byChapter[c.id] || []).map((s) => s.id); const d = progress.doneCount(ids);
            return (<div key={c.id} className="chrow"><Link to={`/chapter/${c.id}`}>{c.number}. {c.title}</Link><ProgressBar value={d} max={ids.length} label={`${c.title} progress`} /><small className="muted">{d}/{ids.length}</small></div>);
          })}
        </section>
        <div>
          <section className="card"><h2>Recently studied</h2>
            {data.recent.length === 0 ? <p className="muted">Open a lesson and it will appear here.</p> : <ul className="plain">{data.recent.filter((r) => sectionMap[r.section_id]).map((r) => (
              <li key={r.section_id}><Link to={`/lesson/${r.section_id}`}>{sectionMap[r.section_id].title}</Link> <small className="muted">{fmt(r.last_opened_at)}</small></li>))}</ul>}
          </section>
          <section className="card"><h2>Upcoming study tasks</h2>
            {data.tasks.length === 0 ? <Empty title="No tasks planned"><Link to="/planner">Plan your week</Link></Empty> : <ul className="plain">{data.tasks.map((t) => (
              <li key={t.id}>{t.title} {t.due_date && <small className="muted">due {fmt(t.due_date)}</small>}</li>))}</ul>}
          </section>
          <section className="card"><h2>Recent test results</h2>
            {data.quiz.length === 0 ? <p className="muted">No completed tests yet.</p> : <ul className="plain">{data.quiz.map((q) => (
              <li key={q.id}><Link to={`/practice/results/${q.id}`}>{q.score}/{q.total}</Link> <small className="muted">{q.mode === 'timed' ? 'Timed' : 'Practice'}, {fmt(q.submitted_at)}</small></li>))}</ul>}
          </section>
        </div>
      </div>
      <p className="muted small">Study suggestions on the Revision page come from your own answers and bookmarks. They are not predictions of exam results.</p>
    </div>
  );
}
