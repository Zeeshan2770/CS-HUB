import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.jsx';
import { useCatalog } from '../lib/catalog.jsx';
import { useProgress } from '../lib/progress.jsx';
import { useToast } from '../lib/toast.jsx';
import BlockRenderer from '../components/BlockRenderer.jsx';
import Question from '../components/Question.jsx';
import { Crumbs, Empty, ErrorBox, SaveBadge, Spinner } from '../components/ui.jsx';

export default function Lesson() {
  const { sectionId } = useParams();
  const { user, isStaff } = useAuth();
  const { chapterMap, flat } = useCatalog();
  const progress = useProgress();
  const toast = useToast();
  const [st, setSt] = useState({ loading: true });
  const [bookmark, setBookmark] = useState(false);
  const [flagged, setFlagged] = useState(new Set());

  const load = useCallback(async () => {
    setSt({ loading: true });
    try {
      const [s, b, q] = await Promise.all([
        supabase.from('sections').select('*').eq('id', sectionId).maybeSingle(),
        supabase.from('lesson_blocks').select('*').eq('section_id', sectionId).order('order_index'),
        supabase.from('questions_public').select('*').eq('section_id', sectionId),
      ]);
      if (s.error || b.error) throw s.error || b.error;
      setSt({ loading: false, section: s.data, blocks: b.data || [], questions: q.data || [] });
    } catch (e) {
      setSt({ loading: false, error: e.message || 'Could not load this lesson' });
    }
  }, [sectionId]);

  useEffect(() => { load(); window.scrollTo(0, 0); }, [load]);

  useEffect(() => {
    if (!user || !st.section) return;
    progress.touch(sectionId);
    supabase.from('bookmarks').select('id').eq('user_id', user.id).eq('section_id', sectionId).maybeSingle().then(({ data }) => setBookmark(Boolean(data)));
    supabase.from('flagged_questions').select('question_id').eq('user_id', user.id).then(({ data }) => setFlagged(new Set((data || []).map((r) => r.question_id))));
  }, [user, st.section, sectionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleBookmark = async () => {
    if (!user) { toast('Sign in to bookmark lessons.', 'info'); return; }
    const next = !bookmark;
    setBookmark(next);
    const { error } = next
      ? await supabase.from('bookmarks').upsert({ user_id: user.id, section_id: sectionId }, { onConflict: 'user_id,section_id' })
      : await supabase.from('bookmarks').delete().eq('user_id', user.id).eq('section_id', sectionId);
    if (error) { setBookmark(!next); toast('Could not update the bookmark.', 'error'); } else toast(next ? 'Bookmarked' : 'Bookmark removed', 'success');
  };

  if (st.loading) return <div className="page"><Spinner /></div>;
  if (st.error) return <div className="page narrow"><ErrorBox message={st.error} onRetry={load} /></div>;
  if (!st.section) return <div className="page narrow"><Empty title="Lesson not found" action={<Link className="btn" to="/syllabus">Browse the syllabus</Link>}>It may have been unpublished, or the address is wrong.</Empty></div>;

  const { section, blocks, questions } = st;
  const chapter = chapterMap[section.chapter_id];
  const i = flat.findIndex((x) => x.id === sectionId);
  const prev = i > 0 ? flat[i - 1] : null;
  const next = i >= 0 && i < flat.length - 1 ? flat[i + 1] : null;
  const done = progress.isDone(sectionId);
  const siblings = flat.filter((x) => x.chapter_id === section.chapter_id);

  return (
    <div className="page lesson">
      <Crumbs items={[{ label: 'Syllabus', to: '/syllabus' }, { label: `Chapter ${chapter?.number ?? ''}`, to: `/chapter/${section.chapter_id}` }, { label: section.title }]} />
      {!section.published && <div className="banner warn" role="status">Draft preview: students cannot see this lesson. {isStaff && <Link to={`/admin/lesson/${section.id}`}>Edit lesson</Link>}</div>}
      <h1>{section.title}</h1>
      <div className="row meta">
        {section.estimated_minutes ? <span className="chip" title="An estimate">About {section.estimated_minutes} min (estimate)</span> : null}
        <span className={`chip ${section.review_status === 'verified' ? 'ok' : ''}`}>{section.review_status === 'verified' ? 'Verified against the PDF' : 'Not yet verified against the PDF'}</span>
      </div>

      {blocks.length === 0 ? <Empty title="This lesson has no content yet">Check back soon.</Empty> : <BlockRenderer blocks={blocks} showErrors={isStaff} />}

      {questions.length > 0 && (
        <section aria-labelledby="kc" className="knowcheck">
          <h2 id="kc">Check your understanding</h2>
          {questions.map((q, n) => <Question key={q.id} q={q} index={n} flagged={flagged.has(q.id)} />)}
        </section>
      )}

      <div className="lesson-actions">
        <button className={`btn ${done ? 'btn-on' : 'btn-primary'}`} aria-pressed={done} onClick={() => progress.setCompleted(sectionId, !done)}>{done ? 'Completed. Undo' : 'Mark as completed'}</button>
        <button className={`btn ${bookmark ? 'btn-on' : ''}`} aria-pressed={bookmark} onClick={toggleBookmark}>{bookmark ? 'Bookmarked' : 'Bookmark'}</button>
        <SaveBadge state={progress.save} onRetry={progress.retry} />
        {!user && <span className="hint">Progress on this device only. <Link to="/signup">Create an account</Link> to keep it everywhere.</span>}
      </div>

      <nav className="prevnext" aria-label="Lesson navigation">
        {prev ? <Link className="card" to={`/lesson/${prev.id}`}><small>Previous</small><span>{prev.title}</span></Link> : <span />}
        {next ? <Link className="card right" to={`/lesson/${next.id}`}><small>Next</small><span>{next.title}</span></Link> : <span />}
      </nav>

      {siblings.length > 1 && (
        <aside className="related"><h2>More in this chapter</h2>
          <ul>{siblings.filter((x) => x.id !== sectionId).slice(0, 8).map((x) => <li key={x.id}><Link to={`/lesson/${x.id}`}>{x.title}</Link></li>)}</ul>
        </aside>
      )}
    </div>
  );
}
