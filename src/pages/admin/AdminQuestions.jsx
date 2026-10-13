import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useCatalog } from '../../lib/catalog.jsx';
import { useToast, useConfirm } from '../../lib/toast.jsx';
import { useLoad, unwrap } from '../../lib/useLoad.js';
import { Empty, ErrorBox, Spinner } from '../../components/ui.jsx';

const PAGE = 25;
const blank = (chapter_id) => ({ chapter_id, section_id: '', question: '', options: ['', '', '', ''], correct_answer: 0, explanation: '', difficulty: 'medium', source_type: 'supplementary' });

export function validateQuestion(q) {
  const errs = [];
  const opts = q.options.map((o) => o.trim());
  if (q.question.trim().length < 3) errs.push('Write the question.');
  if (opts.filter(Boolean).length < 2) errs.push('Give at least two options.');
  if (opts.some((o, i) => !o && i < opts.length - 0 && opts.slice(i + 1).some(Boolean))) errs.push('Options cannot have gaps. Fill or remove empty ones.');
  const filled = opts.filter(Boolean);
  if (new Set(filled.map((o) => o.toLowerCase())).size !== filled.length) errs.push('Two options are identical.');
  if (!opts[q.correct_answer]) errs.push('Choose which option is correct.');
  return errs;
}

function Form({ q, setQ, sections, chapters, onSave, onCancel }) {
  const errs = validateQuestion(q);
  const secs = sections.filter((s) => s.chapter_id === q.chapter_id);
  return (
    <section className="card">
      <h3>{q.id ? 'Edit question' : 'New question'}</h3>
      <div className="row">
        <label className="field inline"><span>Chapter</span><select value={q.chapter_id} onChange={(e) => setQ({ ...q, chapter_id: e.target.value, section_id: '' })}>{chapters.map((c) => <option key={c.id} value={c.id}>{c.number}. {c.title}</option>)}</select></label>
        <label className="field inline"><span>Lesson (optional)</span><select value={q.section_id || ''} onChange={(e) => setQ({ ...q, section_id: e.target.value })}><option value="">Whole chapter</option>{secs.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
        <label className="field inline"><span>Difficulty</span><select value={q.difficulty} onChange={(e) => setQ({ ...q, difficulty: e.target.value })}><option>easy</option><option>medium</option><option>hard</option></select></label>
        <label className="field inline"><span>Source</span><select value={q.source_type} onChange={(e) => setQ({ ...q, source_type: e.target.value })}><option value="original">From the textbook</option><option value="supplementary">Written for this portal</option></select></label>
      </div>
      <label className="field"><span>Question</span><textarea rows={2} value={q.question} onChange={(e) => setQ({ ...q, question: e.target.value })} /></label>
      <fieldset className="field"><legend>Options (select the correct one)</legend>
        {q.options.map((o, i) => (
          <div key={i} className="row"><input type="radio" name="correct" checked={q.correct_answer === i} onChange={() => setQ({ ...q, correct_answer: i })} aria-label={`Option ${i + 1} is correct`} />
            <input className="grow" value={o} aria-label={`Option ${i + 1}`} onChange={(e) => setQ({ ...q, options: q.options.map((x, k) => (k === i ? e.target.value : x)) })} /></div>))}
        <div className="row">{q.options.length < 6 && <button type="button" className="btn btn-sm" onClick={() => setQ({ ...q, options: [...q.options, ''] })}>Add option</button>}
          {q.options.length > 2 && <button type="button" className="btn btn-sm" onClick={() => setQ({ ...q, options: q.options.slice(0, -1), correct_answer: Math.min(q.correct_answer, q.options.length - 2) })}>Remove last option</button>}</div>
      </fieldset>
      <label className="field"><span>Explanation (shown after answering)</span><textarea rows={2} value={q.explanation || ''} onChange={(e) => setQ({ ...q, explanation: e.target.value })} /></label>
      {errs.length > 0 && <ul className="fielderr">{errs.map((e) => <li key={e}>{e}</li>)}</ul>}
      <div className="row"><button className="btn btn-primary" disabled={errs.length > 0} onClick={onSave}>Save question</button><button className="btn" onClick={onCancel}>Cancel</button></div>
    </section>
  );
}

export default function AdminQuestions() {
  const { chapters, sections } = useCatalog();
  const toast = useToast();
  const confirm = useConfirm();
  const [ch, setCh] = useState('all');
  const [text, setText] = useState('');
  const [page, setPage] = useState(0);
  const [edit, setEdit] = useState(null);
  const [allSections, setAllSections] = useState(sections);
  useEffect(() => { supabase.from('sections').select('id,chapter_id,title').order('order_index').then(({ data }) => data && setAllSections(data)); }, []);
  useEffect(() => setPage(0), [ch, text]);

  const { data, error, loading, reload } = useLoad(async () => {
    let q = supabase.from('questions').select('*', { count: 'exact' }).order('chapter_id').order('created_at').range(page * PAGE, page * PAGE + PAGE - 1);
    if (ch !== 'all') q = q.eq('chapter_id', ch);
    if (text.trim().length > 1) q = q.ilike('question', `%${text.trim().replace(/[%_]/g, '')}%`);
    const { data: rows, error: e, count } = await q;
    if (e) throw e;
    return { rows, count };
  }, [ch, text, page]);

  const save = async () => {
    const q = { ...edit, options: edit.options.map((o) => o.trim()).filter(Boolean), question: edit.question.trim(), section_id: edit.section_id || null, explanation: edit.explanation?.trim() || null };
    const res = q.id ? await supabase.from('questions').update(q).eq('id', q.id) : await supabase.from('questions').insert(q);
    if (res.error) toast(`Could not save: ${res.error.message}`, 'error'); else { toast('Question saved', 'success'); setEdit(null); reload(); }
  };
  const del = async (q) => { if (await confirm('Delete this question? Student attempts on it are deleted too.', { confirmLabel: 'Delete', danger: true })) { const { error: e } = await supabase.from('questions').delete().eq('id', q.id); if (e) toast('Could not delete.', 'error'); else reload(); } };
  const pages = useMemo(() => Math.max(1, Math.ceil((data?.count || 0) / PAGE)), [data]);

  if (edit) return <Form q={edit} setQ={setEdit} sections={allSections} chapters={chapters} onSave={save} onCancel={() => setEdit(null)} />;
  return (
    <>
      <div className="row filters">
        <label className="field inline"><span>Chapter</span><select value={ch} onChange={(e) => setCh(e.target.value)}><option value="all">All</option>{chapters.map((c) => <option key={c.id} value={c.id}>{c.number}. {c.title}</option>)}</select></label>
        <label className="field inline"><span>Search text</span><input type="search" value={text} onChange={(e) => setText(e.target.value)} /></label>
        <button className="btn btn-primary" onClick={() => setEdit(blank(ch !== 'all' ? ch : chapters[0]?.id))} disabled={!chapters.length}>New question</button>
      </div>
      {loading ? <Spinner /> : error ? <ErrorBox message={error} onRetry={reload} /> : data.rows.length === 0 ? <Empty title="No questions found">Add one, or use Import to load many at once.</Empty> : (
        <div className="tablewrap"><table className="lt"><thead><tr><th>Question</th><th>Chapter</th><th>Difficulty</th><th>Correct answer</th><th /></tr></thead>
          <tbody>{data.rows.map((q) => (
            <tr key={q.id}><td>{q.question}</td><td>{q.chapter_id.replace('chapter-', '')}</td><td>{q.difficulty}</td><td>{q.options[q.correct_answer]}</td>
              <td><button className="btn btn-sm" onClick={() => setEdit({ ...q, options: [...q.options], section_id: q.section_id || '' })}>Edit</button> <button className="linkbtn danger" onClick={() => del(q)}>Delete</button></td></tr>))}</tbody></table></div>)}
      <div className="row between"><span className="muted">{data?.count ?? 0} questions</span>
        <div className="row"><button className="btn btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page + 1} of {pages}</span><button className="btn btn-sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</button></div></div>
    </>
  );
}
