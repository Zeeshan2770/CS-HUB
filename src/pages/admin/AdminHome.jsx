import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase.js';
import { useLoad, unwrap } from '../../lib/useLoad.js';
import { ErrorBox, Spinner } from '../../components/ui.jsx';

export default function AdminHome() {
  const { data, error, loading, reload } = useLoad(() => supabase.rpc('admin_dashboard_stats').then(unwrap), []);
  if (loading) return <Spinner />;
  if (error) return <ErrorBox message="Could not load statistics." onRetry={reload} />;
  const s = data;
  const cards = [
    ['Registered students', s.students], ['Active in the last 7 days', s.active_students_7d], ['Published chapters', s.published_chapters],
    ['Published lessons', s.published_sections], ['Draft lessons', s.draft_sections], ['Lessons not yet verified', s.unverified_sections],
    ['Questions in the bank', s.questions], ['Written answers waiting for marking', s.written_waiting], ['Tests submitted', s.quizzes_submitted], ['Questions answered', s.question_attempts],
  ];
  return (
    <>
      <div className="grid stats">{cards.map(([l, v]) => <div key={l} className="card stat"><b>{v}</b><span>{l}</span></div>)}</div>
      {s.unverified_sections > 0 && <div className="banner warn">{s.unverified_sections} lessons are not marked as verified against the PDFs. Review each one and set its status in the lesson editor. <Link to="/admin/content">Open lessons</Link></div>}
      {s.published_sections === 0 && <div className="banner">No lessons yet. Use <Link to="/admin/import">Import</Link> to bring lessons across from your old project, or create them under <Link to="/admin/content">Lessons and chapters</Link>.</div>}
      <p className="muted small">All numbers are live counts from the database. Active students are those who opened a lesson or answered a question in the last 7 days.</p>
    </>
  );
}
