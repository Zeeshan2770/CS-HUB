import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.jsx';
import { useCatalog } from '../lib/catalog.jsx';
import { useToast, useConfirm } from '../lib/toast.jsx';
import { useLoad, unwrap } from '../lib/useLoad.js';
import { Empty, ErrorBox, PageHead, Spinner } from '../components/ui.jsx';

export default function Bookmarks() {
  const { user } = useAuth();
  const { chapterMap } = useCatalog();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(null);
  const [note, setNote] = useState('');
  const { data, error, loading, reload } = useLoad(() =>
    supabase.from('bookmarks').select('id,note,created_at,section_id,sections(title,chapter_id)').order('created_at', { ascending: false }).then(unwrap), [user?.id]);

  const remove = async (b) => {
    if (!(await confirm(`Remove the bookmark for “${b.sections?.title}”?`, { confirmLabel: 'Remove', danger: true }))) return;
    const { error: e } = await supabase.from('bookmarks').delete().eq('id', b.id);
    if (e) toast('Could not remove the bookmark.', 'error'); else reload();
  };
  const saveNote = async (b) => {
    const { error: e } = await supabase.from('bookmarks').update({ note: note.trim() || null }).eq('id', b.id);
    if (e) toast('Could not save the note.', 'error'); else { setEditing(null); reload(); }
  };

  return (
    <div className="page narrow">
      <PageHead title="Bookmarks" sub="Lessons you saved to come back to." />
      {loading ? <Spinner /> : error ? <ErrorBox message={error} onRetry={reload} /> : data.length === 0 ? (
        <Empty title="No bookmarks yet" action={<Link className="btn" to="/syllabus">Browse the syllabus</Link>}>Open a lesson and choose Bookmark.</Empty>
      ) : (
        <ul className="plain cards">{data.map((b) => (
          <li key={b.id} className="card">
            <div className="row between"><Link to={`/lesson/${b.section_id}`}><b>{b.sections?.title || b.section_id}</b></Link><small className="muted">Chapter {chapterMap[b.sections?.chapter_id]?.number}</small></div>
            {editing === b.id ? (
              <div><label className="field"><span>Note</span><textarea rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} /></label>
                <div className="row"><button className="btn btn-primary btn-sm" onClick={() => saveNote(b)}>Save note</button><button className="btn btn-sm" onClick={() => setEditing(null)}>Cancel</button></div></div>
            ) : (<>
              {b.note && <p>{b.note}</p>}
              <div className="row"><button className="linkbtn" onClick={() => { setEditing(b.id); setNote(b.note || ''); }}>{b.note ? 'Edit note' : 'Add note'}</button><button className="linkbtn danger" onClick={() => remove(b)}>Remove</button></div></>)}
          </li>))}</ul>
      )}
    </div>
  );
}
