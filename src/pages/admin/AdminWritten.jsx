import { useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useCatalog } from '../../lib/catalog.jsx';
import { useToast, useConfirm } from '../../lib/toast.jsx';
import { useLoad, unwrap } from '../../lib/useLoad.js';
import { formatKeyPoints, parseKeyPoints } from '../../lib/written.js';
import { Empty, ErrorBox, Spinner } from '../../components/ui.jsx';

const blank = (chapter_id) => ({ chapter_id, section_id: '', kind: 'short', prompt: '', model_answer: '', max_marks: 5, published: false, kp: '' });

function Form({ q, setQ, chapters, onSave, onCancel }) {
  const { points, errors } = parseKeyPoints(q.kp);
  const probs = [...errors];
  if (q.prompt.trim().length < 3) probs.push('Write the question.');
  if (!q.model_answer.trim()) probs.push('Write the model answer.');
  if (!(Number(q.max_marks) >= 1 && Number(q.max_marks) <= 50)) probs.push('Marks must be 1 to 50.');
  return (
    <section className="card">
      <h3>{q.id ? 'Edit written question' : 'New written question'}</h3>
      <div className="row">
        <label className="field inline"><span>Chapter</span><select value={q.chapter_id} onChange={(e) => setQ({ ...q, chapter_id: e.target.value })}>{chapters.map((c) => <option key={c.id} value={c.id}>{c.number}. {c.title}</option>)}</select></label>
        <label className="field inline"><span>Type</span><select value={q.kind} onChange={(e) => setQ({ ...q, kind: e.target.value })}><option value="short">Short answer</option><option value="long">Long answer</option></select></label>
        <label className="field inline"><span>Marks</span><input type="number" min={1} max={50} value={q.max_marks} onChange={(e) => setQ({ ...q, max_marks: e.target.value })} /></label>
        <label className="opt inline"><input type="checkbox" checked={q.published} onChange={(e) => setQ({ ...q, published: e.target.checked })} /><span>Published (students can see it)</span></label>
      </div>
      <label className="field"><span>Question</span><textarea rows={2} value={q.prompt} onChange={(e) => setQ({ ...q, prompt: e.target.value })} /></label>
      <label className="field"><span>Model answer (shown to students after they submit)</span><textarea rows={4} value={q.model_answer} onChange={(e) => setQ({ ...q, model_answer: e.target.value })} /></label>
      <label className="field"><span>Key points for the automatic check: one per line, written as  label: keyword | another keyword</span>
        <textarea rows={5} className="mono" value={q.kp} onChange={(e) => setQ({ ...q, kp: e.target.value })} placeholder={'forwards packets: forwards packets | routes packets\nconnects networks: network | networks'} /></label>
      <p className="hint">A key point counts as found when the student's answer contains one of its keywords as a whole word or phrase (capital letters ignored). It is only a guide for the student and teacher. It never gives a mark.</p>
      {points.length > 0 && <p className="muted small">{points.length} key point(s) will be checked.</p>}
      {probs.length > 0 && <ul className="fielderr">{probs.map((e) => <li key={e}>{e}</li>)}</ul>}
      <div className="row"><button className="btn btn-primary" disabled={probs.length > 0} onClick={onSave}>Save question</button><button className="btn" onClick={onCancel}>Cancel</button></div>
    </section>
  );
}

export default function AdminWritten() {
  const { chapters } = useCatalog();
  const toast = useToast();
  const confirm = useConfirm();
  const [edit, setEdit] = useState(null);
  const { data, error, loading, reload } = useLoad(() => supabase.from('written_questions').select('*').order('chapter_id').order('created_at').then(unwrap), []);

  const save = async () => {
    const { points } = parseKeyPoints(edit.kp);
    const row = { chapter_id: edit.chapter_id, section_id: edit.section_id || null, kind: edit.kind, prompt: edit.prompt.trim(), model_answer: edit.model_answer.trim(), max_marks: Number(edit.max_marks), published: edit.published, key_points: points };
    const res = edit.id ? await supabase.from('written_questions').update(row).eq('id', edit.id) : await supabase.from('written_questions').insert(row);
    if (res.error) toast(`Could not save: ${res.error.message}`, 'error'); else { toast('Question saved', 'success'); setEdit(null); reload(); }
  };
  const del = async (q) => { if (await confirm('Delete this written question and every student answer to it?', { confirmLabel: 'Delete', danger: true })) { const { error: e } = await supabase.from('written_questions').delete().eq('id', q.id); if (e) toast('Could not delete.', 'error'); else reload(); } };

  if (edit) return <Form q={edit} setQ={setEdit} chapters={chapters} onSave={save} onCancel={() => setEdit(null)} />;
  if (loading) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  return (
    <>
      <div className="row"><button className="btn btn-primary" disabled={!chapters.length} onClick={() => setEdit(blank(chapters[0]?.id))}>New written question</button></div>
      {data.length === 0 ? <Empty title="No written questions yet">Add one. Students answer in their own words, a teacher gives the mark.</Empty> : (
        <div className="tablewrap"><table className="lt"><thead><tr><th>Question</th><th>Chapter</th><th>Type</th><th>Marks</th><th>Key points</th><th>Status</th><th /></tr></thead>
          <tbody>{data.map((q) => (<tr key={q.id}><td>{q.prompt}</td><td>{q.chapter_id.replace('chapter-', '')}</td><td>{q.kind}</td><td>{q.max_marks}</td><td>{(q.key_points || []).length}</td>
            <td><span className={`chip ${q.published ? 'ok' : ''}`}>{q.published ? 'Published' : 'Draft'}</span></td>
            <td><button className="btn btn-sm" onClick={() => setEdit({ ...q, section_id: q.section_id || '', kp: formatKeyPoints(q.key_points) })}>Edit</button> <button className="linkbtn danger" onClick={() => del(q)}>Delete</button></td></tr>))}</tbody></table></div>)}
    </>
  );
}
