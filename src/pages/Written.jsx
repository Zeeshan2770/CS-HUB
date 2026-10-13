import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.jsx';
import { useCatalog } from '../lib/catalog.jsx';
import { useLoad, unwrap } from '../lib/useLoad.js';
import { Crumbs, Empty, ErrorBox, PageHead, Spinner } from '../components/ui.jsx';

export default function Written() {
  const { user } = useAuth();
  const { chapterMap } = useCatalog();
  const { data, error, loading, reload } = useLoad(async () => {
    const [qs, mine] = await Promise.all([
      supabase.from('written_questions_public').select('id,chapter_id,kind,prompt,max_marks').order('chapter_id').then(unwrap),
      supabase.from('written_answers').select('question_id,status,teacher_marks,submitted_at').eq('user_id', user.id).order('submitted_at', { ascending: false }).then(unwrap),
    ]);
    const latest = {};
    mine.forEach((a) => { if (!latest[a.question_id]) latest[a.question_id] = a; });
    return { qs, latest };
  }, [user?.id]);

  const badge = (q) => {
    const a = data.latest[q.id];
    if (!a) return <span className="chip">Not answered</span>;
    return a.status === 'graded' ? <span className="chip ok">Marked: {a.teacher_marks}/{q.max_marks}</span> : <span className="chip warn">Waiting for your teacher</span>;
  };
  return (
    <div className="page narrow">
      <Crumbs items={[{ label: 'Practice and exams', to: '/practice' }, { label: 'Written questions' }]} />
      <PageHead title="Written questions" sub="Write your answer in your own words. You will see an automatic key-point check and a model answer straight away. Your teacher gives the mark." />
      {loading ? <Spinner /> : error ? <ErrorBox message={error} onRetry={reload} /> : data.qs.length === 0 ? <Empty title="No written questions yet">Your teacher has not published any.</Empty> : (
        <ul className="plain cards">{data.qs.map((q) => (
          <li key={q.id}><Link className="card" to={`/practice/written/${q.id}`}>
            <div className="row between"><small className="muted">Chapter {chapterMap[q.chapter_id]?.number ?? ''}, {q.kind === 'long' ? 'long answer' : 'short answer'}, {q.max_marks} marks</small>{badge(q)}</div>
            <b>{q.prompt}</b></Link></li>))}</ul>)}
    </div>
  );
}
