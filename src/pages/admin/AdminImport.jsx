import { useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useCatalog } from '../../lib/catalog.jsx';
import { useToast } from '../../lib/toast.jsx';
import { extractExportJSON, parseQuestionCSV, QUESTION_TEMPLATE, validateExport } from '../../lib/importers.js';
import { ProgressBar } from '../../components/ui.jsx';

const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const readFile = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('Could not read the file')); r.readAsText(f); });

function LessonImport() {
  const toast = useToast();
  const { reload } = useCatalog();
  const [st, setSt] = useState(null); // { data, errors, warnings }
  const [prog, setProg] = useState(null);
  const [log, setLog] = useState([]);
  const [fileErr, setFileErr] = useState('');

  const onFile = async (e) => {
    const f = e.target.files?.[0]; setSt(null); setLog([]); setFileErr('');
    if (!f) return;
    try {
      const data = extractExportJSON(await readFile(f));
      setSt({ data, ...validateExport(data) });
    } catch (x) { setFileErr(`This file could not be read: ${x.message}`); }
  };

  const run = async () => {
    const d = st.data; const steps = [
      ['Chapters', 'chapters', d.chapters.map((c) => ({ id: c.id, number: c.number, title: c.title, source_pdf: c.source_pdf ?? null, source_pages: c.source_pages ?? null, published: Boolean(c.published) })), 50],
      ['Lessons', 'sections', d.sections.map((s) => ({ id: s.id, chapter_id: s.chapter_id, title: s.title, order_index: s.order_index, published: Boolean(s.published), review_status: 'unreviewed' })), 50],
      ['Lesson blocks', 'lesson_blocks', d.lesson_blocks.map((b) => ({ id: b.id, section_id: b.section_id, order_index: b.order_index, block_type: b.block_type, content: b.content, source_page: b.source_page ?? null })), 100],
      ['Questions', 'questions', d.questions.map((q) => ({ id: q.id, chapter_id: q.chapter_id, section_id: q.section_id ?? null, question: q.question, options: q.options, correct_answer: q.correct_answer, explanation: q.explanation ?? null, difficulty: ['easy', 'medium', 'hard'].includes(q.difficulty) ? q.difficulty : 'medium', source_type: q.source_type || 'original', source_page: q.source_page ?? null, tags: q.tags || [] })), 100],
    ];
    const total = steps.reduce((a, s) => a + s[2].length, 0);
    let done = 0; setLog([]); setProg({ done, total });
    for (const [label, table, rows, size] of steps) {
      for (const part of chunk(rows, size)) {
        const { error } = await supabase.from(table).upsert(part, { onConflict: 'id' });
        if (error) { setLog((l) => [...l, `Stopped while importing ${label}: ${error.message}. Nothing already imported was removed; you can run the import again.`]); toast('Import stopped. See the message below.', 'error'); return; }
        done += part.length; setProg({ done, total });
      }
      setLog((l) => [...l, `${label}: ${rows.length} imported`]);
    }
    toast('Import finished', 'success'); reload();
  };

  return (
    <section className="card">
      <h2>Import lessons from the old project</h2>
      <ol className="steps">
        <li>Open your OLD Supabase project, go to SQL Editor, and run the query in <code>supabase/export_old_content.sql</code>. It only reads data.</li>
        <li>Click Download CSV on the result (or copy the single cell into a <code>.json</code> file).</li>
        <li>Choose that file below. It is checked first, and nothing is written until you press Import.</li>
      </ol>
      <label className="field"><span>Export file (.csv or .json)</span><input type="file" accept=".csv,.json,text/csv,application/json" onChange={onFile} /></label>
      {fileErr && <p className="fielderr" role="alert">{fileErr}</p>}
      {st && (<>
        <p>Found <b>{st.data.chapters?.length ?? 0}</b> chapters, <b>{st.data.sections?.length ?? 0}</b> lessons, <b>{st.data.lesson_blocks?.length ?? 0}</b> content blocks and <b>{st.data.questions?.length ?? 0}</b> questions.</p>
        {st.errors.length > 0 && <div className="errorbox"><b>Fix these before importing:</b><ul>{st.errors.slice(0, 15).map((e, i) => <li key={i}>{e}</li>)}</ul>{st.errors.length > 15 && <p>and {st.errors.length - 15} more.</p>}</div>}
        {st.warnings.length > 0 && <details><summary>{st.warnings.length} block(s) look incomplete and will show as hidden to students until fixed</summary><ul>{st.warnings.slice(0, 30).map((w, i) => <li key={i}>{w}</li>)}</ul></details>}
        <p className="muted small">Imported lessons keep their published state but are marked “not reviewed” until a teacher verifies them. Importing again updates existing items and never deletes anything.</p>
        <button className="btn btn-primary" disabled={st.errors.length > 0 || Boolean(prog && prog.done < prog.total)} onClick={run}>Import</button>
      </>)}
      {prog && <ProgressBar value={prog.done} max={prog.total} label="Import progress" />}
      {log.map((l, i) => <p key={i} className={l.startsWith('Stopped') ? 'fielderr' : 'muted'}>{l}</p>)}
    </section>
  );
}

function QuestionImport() {
  const toast = useToast();
  const { chapters } = useCatalog();
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const onFile = async (e) => { const f = e.target.files?.[0]; setRes(null); if (f) setRes(parseQuestionCSV(await readFile(f), chapters.map((c) => c.id))); };
  const template = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([QUESTION_TEMPLATE], { type: 'text/csv' })); a.download = 'questions-template.csv'; a.click(); URL.revokeObjectURL(a.href); };
  const run = async () => {
    setBusy(true); let n = 0;
    for (const part of chunk(res.valid, 100)) {
      const { error } = await supabase.from('questions').insert(part);
      if (error) { toast(`Import stopped after ${n} questions: ${error.message}`, 'error'); setBusy(false); return; }
      n += part.length;
    }
    setBusy(false); toast(`${n} questions imported`, 'success'); setRes(null);
  };
  return (
    <section className="card">
      <h2>Import questions from a CSV file</h2>
      <p>Columns: <code>chapter_id, section_id, question, option_a … option_f, correct (A to F), explanation, difficulty</code>. Only <code>chapter_id, question, option_a, option_b, correct</code> are required. Rows with problems are listed and skipped; valid rows are imported.</p>
      <div className="row"><button className="btn" onClick={template}>Download template</button>
        <label className="field inline"><span>CSV file</span><input type="file" accept=".csv,text/csv" onChange={onFile} /></label></div>
      {res && (<>
        <p><b>{res.valid.length}</b> valid rows, <b>{res.errors.length}</b> with problems.</p>
        {res.errors.length > 0 && <div className="errorbox"><ul>{res.errors.slice(0, 40).map((e, i) => <li key={i}>Line {e.line}: {e.message}</li>)}</ul></div>}
        <button className="btn btn-primary" disabled={!res.valid.length || busy} onClick={run}>{busy ? 'Importing…' : `Import ${res.valid.length} questions`}</button></>)}
    </section>
  );
}

export default function AdminImport() { return (<><LessonImport /><QuestionImport /></>); }
