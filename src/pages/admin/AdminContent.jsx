import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase.js';
import { useAuth } from '../../lib/auth.jsx';
import { useCatalog } from '../../lib/catalog.jsx';
import { useToast, useConfirm } from '../../lib/toast.jsx';
import { useLoad, unwrap } from '../../lib/useLoad.js';
import { ErrorBox, Icon, Spinner } from '../../components/ui.jsx';
import { reorder } from '../../lib/reorder.js';

export default function AdminContent() {
  const { isAdmin } = useAuth();
  const catalog = useCatalog();
  const toast = useToast();
  const confirm = useConfirm();
  const [newCh, setNewCh] = useState({ number: '', title: '' });
  const [newSec, setNewSec] = useState({});
  const [drag, setDrag] = useState(null); // { chapter, index }
  const [over, setOver] = useState(null);

  const { data, error, loading, reload } = useLoad(async () => {
    const [c, s] = await Promise.all([
      supabase.from('chapters').select('*').order('number').then(unwrap),
      supabase.from('sections').select('id,chapter_id,title,order_index,published,review_status').order('order_index').then(unwrap),
    ]);
    return { chapters: c, sections: s };
  }, []);
  const refresh = () => { reload(); catalog.reload(); };
  const run = async (p, ok) => { const { error: e } = await p; if (e) toast(e.message.includes('row-level') ? 'You do not have permission for that.' : `Could not save: ${e.message}`, 'error'); else { if (ok) toast(ok, 'success'); refresh(); } };

  const addChapter = (e) => {
    e.preventDefault();
    const n = Number(newCh.number);
    if (!n || !newCh.title.trim()) return;
    run(supabase.from('chapters').insert({ id: `chapter-${n}`, number: n, title: newCh.title.trim(), published: false }), 'Chapter created as a draft').then(() => setNewCh({ number: '', title: '' }));
  };
  const addSection = (ch) => {
    const t = (newSec[ch.id] || '').trim();
    if (!t) return;
    const order = Math.max(0, ...data.sections.filter((s) => s.chapter_id === ch.id).map((s) => s.order_index)) + 1;
    run(supabase.from('sections').insert({ id: `${ch.id}-${Date.now().toString(36)}`, chapter_id: ch.id, title: t, order_index: order, published: false }), 'Lesson created as a draft').then(() => setNewSec({ ...newSec, [ch.id]: '' }));
  };
  const swap = async (a, b) => {
    const r1 = await supabase.from('sections').update({ order_index: b.order_index }).eq('id', a.id);
    const r2 = await supabase.from('sections').update({ order_index: a.order_index }).eq('id', b.id);
    if (r1.error || r2.error) toast('Could not reorder.', 'error'); refresh();
  };
  // Drag a lesson to a new position inside its chapter; every lesson in the chapter is renumbered 1..n.
  const dropSection = async (ch, secs, from, to) => {
    setDrag(null); setOver(null);
    if (from === to) return;
    const next = reorder(secs, from, to);
    const rows = next.map((s, i) => ({ id: s.id, chapter_id: s.chapter_id, title: s.title, order_index: i + 1 }));
    const { error: e } = await supabase.from('sections').upsert(rows, { onConflict: 'id' });
    if (e) toast('Could not reorder.', 'error'); else { toast('Order saved', 'success'); refresh(); }
  };
  const delSection = async (s) => { if (await confirm(`Delete the lesson “${s.title}” and all its content? This cannot be undone.`, { confirmLabel: 'Delete lesson', danger: true })) run(supabase.from('sections').delete().eq('id', s.id), 'Lesson deleted'); };
  const delChapter = async (c) => { if (await confirm(`Delete “${c.title}” with ALL its lessons and questions? This cannot be undone.`, { confirmLabel: 'Delete chapter', danger: true })) run(supabase.from('chapters').delete().eq('id', c.id), 'Chapter deleted'); };

  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  return (
    <>
      <form className="card row" onSubmit={addChapter}>
        <label className="field inline"><span>Chapter number</span><input type="number" min="1" value={newCh.number} onChange={(e) => setNewCh({ ...newCh, number: e.target.value })} /></label>
        <label className="field inline grow"><span>New chapter title</span><input value={newCh.title} onChange={(e) => setNewCh({ ...newCh, title: e.target.value })} /></label>
        <button className="btn btn-primary">Add chapter</button>
      </form>
      {data.chapters.map((c) => {
        const secs = data.sections.filter((s) => s.chapter_id === c.id).sort((a, b) => a.order_index - b.order_index);
        return (
          <section key={c.id} className="card">
            <div className="row between">
              <h2>Chapter {c.number}: {c.title}</h2>
              <div className="row">
                <span className={`chip ${c.published ? 'ok' : ''}`}>{c.published ? 'Published' : 'Draft'}</span>
                <button className="btn btn-sm" onClick={() => run(supabase.from('chapters').update({ published: !c.published }).eq('id', c.id), c.published ? 'Chapter unpublished' : 'Chapter published')}>{c.published ? 'Unpublish' : 'Publish'}</button>
                {isAdmin && <button className="btn btn-sm btn-danger" onClick={() => delChapter(c)}>Delete</button>}
              </div>
            </div>
            <div className="tablewrap"><table className="lt"><thead><tr><th>Lesson</th><th>Status</th><th>Review</th><th>Order</th><th /></tr></thead>
              <tbody>{secs.map((s, i) => (
                <tr key={s.id} data-testid={`sec-${s.id}`} className={`${drag?.chapter === c.id && drag.index === i ? 'dragging' : ''} ${drag?.chapter === c.id && over === i && drag.index !== i ? 'dropt-row' : ''}`}
                  onDragOver={(e) => { if (drag?.chapter === c.id) { e.preventDefault(); if (over !== i) setOver(i); } }}
                  onDrop={(e) => { e.preventDefault(); if (drag?.chapter === c.id) dropSection(c, secs, drag.index, i); }}>
                  <td><button type="button" className="grip" draggable aria-label={`Drag ${s.title} to a new position (or use Up and Down)`} title="Drag to reorder"
                      onDragStart={(e) => { setDrag({ chapter: c.id, index: i }); if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', s.id); } }}
                      onDragEnd={() => { setDrag(null); setOver(null); }}><Icon name="grip" /></button><Link to={`/admin/lesson/${s.id}`}>{s.title}</Link></td>
                  <td><span className={`chip ${s.published ? 'ok' : ''}`}>{s.published ? 'Published' : 'Draft'}</span></td>
                  <td><span className={`chip ${s.review_status === 'verified' ? 'ok' : ''}`}>{s.review_status.replace('_', ' ')}</span></td>
                  <td><button className="linkbtn" disabled={i === 0} onClick={() => swap(s, secs[i - 1])} aria-label={`Move ${s.title} up`}>Up</button> <button className="linkbtn" disabled={i === secs.length - 1} onClick={() => swap(s, secs[i + 1])} aria-label={`Move ${s.title} down`}>Down</button></td>
                  <td><Link className="btn btn-sm" to={`/admin/lesson/${s.id}`}>Edit</Link> <button className="linkbtn danger" onClick={() => delSection(s)}>Delete</button></td></tr>))}
                {secs.length === 0 && <tr><td colSpan={5} className="muted">No lessons in this chapter yet.</td></tr>}</tbody></table></div>
            <div className="row"><label className="field inline grow"><span>New lesson in this chapter</span><input value={newSec[c.id] || ''} onChange={(e) => setNewSec({ ...newSec, [c.id]: e.target.value })} /></label><button className="btn" onClick={() => addSection(c)}>Add lesson</button></div>
          </section>);
      })}
    </>
  );
}
