import { useState } from 'react';
import { useToast, useConfirm } from '../lib/toast.jsx';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.jsx';
import { useCatalog } from '../lib/catalog.jsx';
import { useLoad, unwrap } from '../lib/useLoad.js';
import Question from '../components/Question.jsx';
import { Empty, ErrorBox, PageHead, Spinner } from '../components/ui.jsx';

// The queue rule (shown to the student): a question is "to revise" when your MOST RECENT attempt at it was wrong.
export function latestWrong(attempts) {
  const seen = new Set();
  const out = [];
  for (const a of attempts) { // attempts are newest first
    if (seen.has(a.question_id)) continue;
    seen.add(a.question_id);
    if (!a.is_correct) out.push(a.question_id);
  }
  return out;
}

function Flashcards() {
  const { chapters } = useCatalog();
  const [ch, setCh] = useState('all');
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);
  const { data, error, loading, reload } = useLoad(async () => {
    const rows = await supabase.from('lesson_blocks').select('id,content,sections!inner(id,title,chapter_id)').eq('block_type', 'definition').limit(400).then(unwrap);
    return rows.filter((r) => r.content?.label && r.content?.text);
  }, []);
  if (loading) return <Spinner />;
  if (error) return <ErrorBox message="Could not load definitions." onRetry={reload} />;
  const cards = data.filter((r) => ch === 'all' || r.sections.chapter_id === ch);
  const c = cards[Math.min(i, cards.length - 1)];
  return (
    <div>
      <label className="field inline"><span>Chapter</span><select value={ch} onChange={(e) => { setCh(e.target.value); setI(0); setFlip(false); }}><option value="all">All chapters</option>{chapters.map((x) => <option key={x.id} value={x.id}>{x.number}. {x.title}</option>)}</select></label>
      {!c ? <Empty title="No definitions found">Definitions from published lessons appear here as flashcards.</Empty> : (<>
        <button className={`flashcard ${flip ? 'flip' : ''}`} onClick={() => setFlip((f) => !f)} aria-label={flip ? 'Show the term' : 'Show the definition'}>
          <small>{flip ? 'Definition' : 'Term'}</small>
          <span>{flip ? c.content.text : c.content.label}</span>
        </button>
        <div className="row between">
          <button className="btn" onClick={() => { setI((i - 1 + cards.length) % cards.length); setFlip(false); }}>Previous</button>
          <span className="muted">{Math.min(i, cards.length - 1) + 1} of {cards.length}. <Link to={`/lesson/${c.sections.id}`}>Open lesson</Link></span>
          <button className="btn" onClick={() => { setI((i + 1) % cards.length); setFlip(false); }}>Next</button>
        </div>
        <button className="linkbtn" onClick={() => { setI(Math.floor(Math.random() * cards.length)); setFlip(false); }}>Pick a random card</button>
      </>)}
    </div>
  );
}

function QuestionList({ ids, emptyTitle, emptyText, flagged }) {
  const { data, error, loading, reload } = useLoad(async () => {
    if (!ids.length) return [];
    return supabase.from('questions_public').select('*').in('id', ids.slice(0, 50)).then(unwrap);
  }, [ids.join(',')]);
  if (loading) return <Spinner />;
  if (error) return <ErrorBox message="Could not load questions." onRetry={reload} />;
  if (!data.length) return <Empty title={emptyTitle}>{emptyText}</Empty>;
  return <div>{data.map((q, n) => <Question key={q.id} q={q} index={n} flagged={flagged.has(q.id)} />)}</div>;
}

export const localDate = (d = new Date()) => d.toLocaleDateString('en-CA'); // YYYY-MM-DD in the student's own timezone

// Cards due today or earlier, soonest first; the rest grouped by due date.
export function splitCards(cards, today = localDate()) {
  const due = cards.filter((c) => c.due_date <= today).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const later = {};
  cards.filter((c) => c.due_date > today).forEach((c) => { later[c.due_date] = (later[c.due_date] || 0) + 1; });
  return { due, later: Object.entries(later).sort(([a], [b]) => a.localeCompare(b)) };
}

function Schedule({ cards, flagged, onReset }) {
  const { due, later } = splitCards(cards);
  return (
    <div>
      <p><b>{due.length}</b> {due.length === 1 ? 'question is' : 'questions are'} due for review today. You have <b>{cards.length}</b> in your schedule.</p>
      <details className="card"><summary>How the schedule works</summary>
        <p>Every time you answer a question (in a lesson, in a practice test, or here), the server updates a review date for it. This is a simplified version of the SM-2 method:</p>
        <ul>
          <li><b>Wrong answer:</b> it comes back tomorrow, and the next correct streak starts again from the beginning.</li>
          <li><b>Correct answer:</b> it comes back after 1 day, then 3 days, then each gap is multiplied by an ease number (about 2.5, going up a little for each correct answer and down for each mistake). The longest gap is 180 days.</li>
          <li>Answering the same question correctly several times on one day counts once, so repeating it cannot push it months away.</li>
        </ul>
        <p className="muted small">This is a study aid. It does not predict exam results.</p></details>
      {later.length > 0 && <p className="muted">Coming up: {later.slice(0, 5).map(([d, n]) => `${n} on ${new Date(d + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`).join(', ')}{later.length > 5 ? ', and more later' : ''}.</p>}
      {due.length === 0 ? <Empty title={cards.length ? 'Nothing is due today' : 'Your schedule is empty'}>{cards.length ? 'Come back tomorrow, or practise something new.' : 'Answer questions in lessons or practice tests and they will be scheduled automatically.'}</Empty>
        : <QuestionList ids={due.map((c) => c.question_id)} flagged={flagged} emptyTitle="Nothing due" emptyText="" />}
      {cards.length > 0 && <div className="row"><button className="btn btn-sm btn-danger" onClick={onReset}>Reset my review schedule</button></div>}
    </div>
  );
}

export default function Revision() {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState('due');
  const { data, error, loading, reload } = useLoad(async () => {
    const [att, fl, cards] = await Promise.all([
      supabase.from('question_attempts').select('question_id,is_correct,attempted_at').order('attempted_at', { ascending: false }).limit(500).then(unwrap),
      supabase.from('flagged_questions').select('question_id').then(unwrap),
      supabase.from('review_cards').select('question_id,due_date,interval_days,reps,lapses').order('due_date').then(unwrap),
    ]);
    return { wrong: latestWrong(att), flagged: fl.map((f) => f.question_id), cards };
  }, [user?.id, tab]);

  const reset = async () => {
    if (!(await confirm('Reset your review schedule? Your answers and scores are kept; only the review dates are cleared.', { confirmLabel: 'Reset schedule', danger: true }))) return;
    const { error: e } = await supabase.from('review_cards').delete().eq('user_id', user.id);
    if (e) toast('Could not reset the schedule.', 'error'); else { toast('Schedule reset', 'success'); reload(); }
  };
  const tabs = [['due', 'Due today'], ['wrong', 'Answered wrong'], ['flagged', 'Marked difficult'], ['cards', 'Definition flashcards']];
  return (
    <div className="page">
      <PageHead title="Revision center" sub="Practise the questions you found hardest, and review key definitions." />
      <div className="tabs" role="tablist">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      <p className="muted small">Bookmarked lessons are on the <Link to="/bookmarks">Bookmarks</Link> page. These lists are study suggestions based on your own answers, not exam predictions.</p>
      {tab === 'cards' ? <Flashcards /> : loading ? <Spinner /> : error ? <ErrorBox message={error} onRetry={reload} /> : tab === 'due' ? (
        <Schedule cards={data.cards} flagged={new Set(data.flagged)} onReset={reset} />
      ) : tab === 'wrong' ? (
        <>
          <p className="muted">A question appears here when your most recent attempt at it was wrong. Answer it correctly and it leaves the list.</p>
          <QuestionList ids={data.wrong} flagged={new Set(data.flagged)} emptyTitle="Nothing to revise" emptyText="Answer some questions in lessons or practice tests. Ones you miss will show up here." />
        </>
      ) : (
        <QuestionList ids={data.flagged} flagged={new Set(data.flagged)} emptyTitle="No difficult questions marked" emptyText="Use Mark as difficult under any question to collect it here." />
      )}
    </div>
  );
}
