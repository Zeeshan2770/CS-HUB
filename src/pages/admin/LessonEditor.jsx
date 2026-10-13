import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase.js';
import { useCatalog } from '../../lib/catalog.jsx';
import { useToast, useConfirm } from '../../lib/toast.jsx';
import { BLOCK_TYPES, sectionReadiness, validateBlock } from '../../lib/blocks.js';
import { reorder } from '../../lib/reorder.js';
import { Icon } from '../../components/ui.jsx';
import BlockRenderer from '../../components/BlockRenderer.jsx';
import { Crumbs, ErrorBox, Spinner } from '../../components/ui.jsx';

const FIELDS = {
  definition: [['label', 'Term or label'], ['text', 'Definition', 'area']],
  tidbit: [['label', 'Label'], ['text', 'Text', 'area']],
  paragraph: [['text', 'Text', 'area']],
  subheading: [['text', 'Heading']],
  code_single: [['label', 'Caption'], ['code', 'Code', 'code'], ['runnable', 'Can run in the Python lab', 'check'], ['note', 'Note (optional)']],
  code_pair: [['label_original', 'Caption for the original'], ['code_original', 'Original code', 'code'], ['label_fixed', 'Caption for the corrected version'], ['code_fixed', 'Corrected code', 'code'], ['ocr_note', 'Note (optional)']],
  short_question: [['question', 'Question', 'area'], ['answer', 'Answer', 'area']],
  long_question: [['question', 'Question', 'area'], ['answer', 'Model answer (optional)', 'area']],
};
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`.replace('.', ''));

function TableEditor({ c, set }) {
  const [text, setText] = useState(() => [c.headers.join(' | '), ...c.rows.map((r) => r.join(' | '))].join('\n'));
  const change = (v) => {
    setText(v);
    const lines = v.split('\n').filter((l) => l.trim() !== '');
    const cells = (l) => l.split('|').map((x) => x.trim());
    set({ headers: lines[0] ? cells(lines[0]) : [], rows: lines.slice(1).map(cells) });
  };
  return (<label className="field"><span>Table: one row per line, cells separated by |. First line is the header.</span><textarea rows={6} value={text} onChange={(e) => change(e.target.value)} spellCheck={false} /></label>);
}

function ImageEditor({ c, set, sectionId }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const upload = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(f.type)) { toast('Use a PNG, JPEG, WebP or GIF image.', 'error'); return; }
    if (f.size > 5 * 1024 * 1024) { toast('The image is larger than 5 MB.', 'error'); return; }
    setBusy(true);
    const ext = f.type.split('/')[1].replace('jpeg', 'jpg');
    const path = `${sectionId}/${uid()}.${ext}`;
    const { error } = await supabase.storage.from('lesson-assets').upload(path, f, { contentType: f.type, upsert: false });
    setBusy(false);
    if (error) { toast('Upload failed. Check that you have editor access.', 'error'); return; }
    set({ ...c, url: supabase.storage.from('lesson-assets').getPublicUrl(path).data.publicUrl });
  };
  return (<>
    <label className="field"><span>Upload an image (PNG, JPEG, WebP or GIF, up to 5 MB)</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={upload} disabled={busy} /></label>
    <label className="field"><span>Image address (https)</span><input value={c.url || ''} onChange={(e) => set({ ...c, url: e.target.value })} /></label>
    <label className="field"><span>Alt text (describe the image)</span><input value={c.alt || ''} onChange={(e) => set({ ...c, alt: e.target.value })} /></label>
    <label className="field"><span>Caption (optional)</span><input value={c.caption || ''} onChange={(e) => set({ ...c, caption: e.target.value })} /></label>
  </>);
}

function BlockForm({ b, onChange, sectionId }) {
  const c = b.content || {};
  const set = (next) => onChange({ ...b, content: next });
  const t = b.block_type;
  if (t === 'objectives') return (<label className="field"><span>Objectives, one per line</span><textarea rows={4} value={(c.items || []).join('\n')} onChange={(e) => set({ items: e.target.value.split('\n') })} /></label>);
  if (t === 'table') return <TableEditor c={c} set={set} />;
  if (t === 'image') return <ImageEditor c={c} set={set} sectionId={sectionId} />;
  return (<>{(FIELDS[t] || []).map(([k, label, kind]) => (
    <label key={k} className={`field ${kind === 'check' ? 'check' : ''}`}><span>{label}</span>
      {kind === 'area' ? <textarea rows={3} value={c[k] || ''} onChange={(e) => set({ ...c, [k]: e.target.value })} />
        : kind === 'code' ? <textarea className="mono" rows={7} spellCheck={false} value={c[k] || ''} onChange={(e) => set({ ...c, [k]: e.target.value })} />
        : kind === 'check' ? <input type="checkbox" checked={c[k] !== false} onChange={(e) => set({ ...c, [k]: e.target.checked })} />
        : <input value={c[k] || ''} onChange={(e) => set({ ...c, [k]: e.target.value })} />}
    </label>))}
    <label className="field inline"><span>Source PDF page (optional)</span><input type="number" min="1" value={b.source_page || ''} onChange={(e) => onChange({ ...b, source_page: e.target.value ? Number(e.target.value) : null })} /></label></>);
}

export default function LessonEditor() {
  const { sectionId } = useParams();
  const toast = useToast();
  const confirm = useConfirm();
  const { reload: reloadCatalog } = useCatalog();
  const [st, setSt] = useState({ loading: true });
  const [section, setSection] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [orig, setOrig] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState(false);
  const [revs, setRevs] = useState([]);
  const [add, setAdd] = useState('paragraph');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);

  const load = useCallback(async () => {
    setSt({ loading: true });
    const [s, b, r] = await Promise.all([
      supabase.from('sections').select('*').eq('id', sectionId).maybeSingle(),
      supabase.from('lesson_blocks').select('*').eq('section_id', sectionId).order('order_index'),
      supabase.from('section_revisions').select('id,note,created_at').eq('section_id', sectionId).order('created_at', { ascending: false }).limit(10),
    ]);
    if (s.error || b.error || !s.data) { setSt({ loading: false, error: s.error?.message || 'Lesson not found' }); return; }
    setSection(s.data); setBlocks(b.data.map((x) => ({ ...x }))); setOrig(b.data.map((x) => x.id)); setRevs(r.data || []); setDirty(false);
    setSt({ loading: false });
  }, [sectionId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const h = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const ready = useMemo(() => (section ? sectionReadiness(section, blocks) : { errors: [], warnings: [] }), [section, blocks]);
  const edit = (fn) => { setBlocks(fn); setDirty(true); };
  const move = (i, d) => edit((bs) => { const n = [...bs]; const j = i + d; if (j < 0 || j >= n.length) return bs; [n[i], n[j]] = [n[j], n[i]]; return n; });

  const saveBlocks = async () => {
    setBusy(true);
    const rows = blocks.map((b, i) => ({ id: b.id || uid(), section_id: sectionId, order_index: i + 1, block_type: b.block_type, content: b.content, source_page: b.source_page || null }));
    const up = await supabase.from('lesson_blocks').upsert(rows);
    if (up.error) { setBusy(false); toast(`Could not save: ${up.error.message}`, 'error'); return false; }
    const removed = orig.filter((id) => !rows.some((r) => r.id === id));
    if (removed.length) { const del = await supabase.from('lesson_blocks').delete().in('id', removed); if (del.error) { setBusy(false); toast('Saved, but some removed blocks could not be deleted.', 'error'); return false; } }
    setBusy(false); toast('Lesson saved', 'success'); await load(); return true;
  };
  const saveDetails = async () => {
    const { error } = await supabase.from('sections').update({ title: section.title.trim(), review_status: section.review_status, estimated_minutes: section.estimated_minutes || null }).eq('id', sectionId);
    if (error) toast('Could not save details.', 'error'); else { toast('Details saved', 'success'); reloadCatalog(); }
  };
  const snapshot = async (note) => { const { error } = await supabase.rpc('save_section_revision', { p_section: sectionId, p_note: note }); if (error) toast('Could not save a version.', 'error'); else { toast('Version saved', 'success'); load(); } };
  const restore = async (r) => { if (await confirm('Restore this version? Your current content is saved as a version first.', { confirmLabel: 'Restore' })) { const { error } = await supabase.rpc('restore_section_revision', { p_revision: r.id }); if (error) toast('Could not restore.', 'error'); else { toast('Version restored', 'success'); load(); } } };
  const publish = async (yes) => {
    if (yes) {
      if (dirty) { toast('Save your changes before publishing.', 'error'); return; }
      if (ready.errors.length) { toast('Fix the problems listed under Validate first.', 'error'); return; }
      if (ready.warnings.length && !(await confirm(`Publish with ${ready.warnings.length} warning(s)? ${ready.warnings.join(' ')}`, { confirmLabel: 'Publish anyway' }))) return;
      await supabase.rpc('save_section_revision', { p_section: sectionId, p_note: 'auto: published' });
    }
    const { error } = await supabase.from('sections').update({ published: yes }).eq('id', sectionId);
    if (error) toast('Could not change publication.', 'error'); else { toast(yes ? 'Published' : 'Unpublished', 'success'); reloadCatalog(); load(); }
  };

  if (st.loading) return <Spinner />;
  if (st.error) return <ErrorBox message={st.error} />;
  return (
    <div>
      <Crumbs items={[{ label: 'Lessons and chapters', to: '/admin/content' }, { label: section.title }]} />
      <section className="card">
        <h2>Lesson details</h2>
        <div className="row">
          <label className="field inline grow"><span>Title</span><input value={section.title} onChange={(e) => setSection({ ...section, title: e.target.value })} /></label>
          <label className="field inline"><span>Review status</span><select value={section.review_status} onChange={(e) => setSection({ ...section, review_status: e.target.value })}><option value="unreviewed">Not reviewed</option><option value="in_review">In review</option><option value="verified">Verified against PDF</option></select></label>
          <label className="field inline"><span>Estimated minutes</span><input type="number" min="1" value={section.estimated_minutes || ''} onChange={(e) => setSection({ ...section, estimated_minutes: e.target.value ? Number(e.target.value) : null })} /></label>
          <button className="btn" onClick={saveDetails}>Save details</button>
        </div>
      </section>

      <div className="row between"><h2>Content blocks {dirty && <span className="chip warn">Unsaved changes</span>}</h2>
        <div className="row"><button className={`btn ${preview ? 'btn-on' : ''}`} aria-pressed={preview} onClick={() => setPreview((p) => !p)}>{preview ? 'Back to editing' : 'Preview'}</button>
          <button className="btn btn-primary" disabled={!dirty || busy} onClick={saveBlocks}>{busy ? 'Saving…' : 'Save content'}</button></div></div>

      {preview ? <section className="card"><h1>{section.title}</h1><BlockRenderer blocks={blocks} showErrors /></section> : (
        <>
          {blocks.map((b, i) => {
            const errs = validateBlock(b.block_type, b.content);
            return (
              <section key={b.id || `n${i}`} data-testid={`block-${i}`}
                className={`card blockedit ${errs.length ? 'bad' : ''} ${drag === i ? 'dragging' : ''} ${drag !== null && over === i && drag !== i ? 'dropt' : ''}`}
                onDragOver={(e) => { if (drag !== null) { e.preventDefault(); if (over !== i) setOver(i); } }}
                onDrop={(e) => { e.preventDefault(); if (drag !== null) edit((bs) => reorder(bs, drag, i)); setDrag(null); setOver(null); }}>
                <div className="row between"><h3><button type="button" className="grip" draggable aria-label="Drag to reorder this block (or use the Up and Down buttons)" title="Drag to reorder"
                    onDragStart={(e) => { setDrag(i); if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); } }}
                    onDragEnd={() => { setDrag(null); setOver(null); }}><Icon name="grip" /></button>{i + 1}. {BLOCK_TYPES[b.block_type]?.label || b.block_type}</h3>
                  <div className="row"><button className="btn btn-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move block up">Up</button><button className="btn btn-sm" disabled={i === blocks.length - 1} onClick={() => move(i, 1)} aria-label="Move block down">Down</button>
                    <button className="btn btn-sm btn-danger" onClick={() => edit((bs) => bs.filter((_, k) => k !== i))}>Remove</button></div></div>
                <BlockForm b={b} sectionId={sectionId} onChange={(nb) => edit((bs) => bs.map((x, k) => (k === i ? nb : x)))} />
                {errs.length > 0 && <p className="fielderr">{errs.join('. ')}</p>}
              </section>);
          })}
          <div className="card row">
            <label className="field inline"><span>Add a block</span><select value={add} onChange={(e) => setAdd(e.target.value)}>{Object.entries(BLOCK_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
            <button className="btn" onClick={() => edit((bs) => [...bs, { block_type: add, content: BLOCK_TYPES[add].blank(), source_page: null }])}>Add block</button>
          </div>
        </>)}

      <section className="card">
        <h2>Validate and publish</h2>
        <p>Status: <span className={`chip ${section.published ? 'ok' : ''}`}>{section.published ? 'Published' : 'Draft'}</span></p>
        {ready.errors.length === 0 ? <p className="feedback ok">No blocking problems.</p> : <ul className="fielderr">{ready.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
        {ready.warnings.length > 0 && <ul className="warnlist">{ready.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
        <div className="row">
          {!section.published ? <button className="btn btn-primary" disabled={dirty || ready.errors.length > 0} onClick={() => publish(true)}>Publish lesson</button> : <button className="btn" onClick={() => publish(false)}>Unpublish</button>}
          <Link className="btn" to={`/lesson/${sectionId}`}>Open student view</Link>
        </div>
        <p className="muted small">Workflow: edit, save, check the list above, preview, then publish. Publishing saves a version automatically.</p>
      </section>

      <section className="card">
        <h2>Versions</h2>
        <button className="btn btn-sm" disabled={dirty} onClick={() => snapshot('manual')}>Save current version</button>
        {revs.length === 0 ? <p className="muted">No saved versions yet.</p> : <ul className="plain">{revs.map((r) => <li key={r.id}>{new Date(r.created_at).toLocaleString()} {r.note && <small className="muted">({r.note})</small>} <button className="linkbtn" onClick={() => restore(r)}>Restore</button></li>)}</ul>}
      </section>
    </div>
  );
}
