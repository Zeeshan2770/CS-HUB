import { useEffect, useMemo, useRef, useState } from 'react';
import { Crumbs, PageHead } from '../components/ui.jsx';
import CodeEditor from '../components/CodeEditor.jsx';
import { createWorkerClient } from '../lib/workerRpc.js';
import { EXERCISES, SCHEMA_TEXT, SETUP_SQL, judge } from '../lib/sqlLab.js';

const KEY = 'cs12.sql.solved';
const loadSolved = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };

function Results({ out }) {
  if (!out) return <p className="muted">Results appear here after you press Run.</p>;
  if (out.error) return <p className="fielderr" role="alert">{out.error}</p>;
  if (!out.results.length) return <p className="muted">{out.changes ? `Done. ${out.changes} row(s) changed.` : 'Done. The statement ran and returned no rows.'}</p>;
  return out.results.map((r, i) => (
    <div key={i} className="tablewrap"><table className="lt"><thead><tr>{r.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
      <tbody>{r.values.map((row, k) => <tr key={k}>{row.map((v, j) => <td key={j} className="mono">{v === null ? <span className="muted">NULL</span> : String(v)}</td>)}</tr>)}</tbody></table>
      {r.total > r.values.length && <p className="hint">Showing the first {r.values.length} of {r.total} rows.</p>}</div>));
}

export default function SqlLab() {
  const [exId, setExId] = useState(EXERCISES[0].id);
  const ex = EXERCISES.find((e) => e.id === exId);
  const [sql, setSql] = useState('SELECT * FROM students;');
  const [out, setOut] = useState(null);
  const [verdict, setVerdict] = useState(null);
  const [busy, setBusy] = useState(false);
  const [solved, setSolved] = useState(loadSolved);
  const client = useRef(null);
  if (!client.current) client.current = createWorkerClient(() => new Worker(new URL('../workers/sql.worker.js', import.meta.url)));
  useEffect(() => () => client.current?.close(), []);
  useEffect(() => { setVerdict(null); }, [exId]);

  const wrap = (r) => (r.ok ? { results: r.results, changes: r.changes } : { error: r.error });
  const run = async () => {
    setBusy(true); setVerdict(null);
    try { setOut(wrap(await client.current.call({ type: 'run', setup: SETUP_SQL, sql }))); }
    catch (e) { setOut({ error: e.message }); }
    setBusy(false);
  };
  const reset = async () => {
    setBusy(true);
    try { await client.current.call({ type: 'reset', setup: SETUP_SQL }); setOut({ results: [], changes: 0, note: true }); setOut({ results: [], changes: 0 }); }
    catch (e) { setOut({ error: e.message }); }
    setBusy(false);
  };
  const check = async () => {
    setBusy(true); setVerdict(null);
    try {
      const tail = `\n;\n${ex.verify || ''}`;
      const student = wrap(await client.current.call({ type: 'fresh', setup: SETUP_SQL, sql: sql + tail }));
      const expected = ex.expectError ? null : wrap(await client.current.call({ type: 'fresh', setup: SETUP_SQL, sql: ex.solution + tail }));
      const v = judge(ex, student, expected);
      setVerdict(v);
      if (v.ok) { const n = [...new Set([...solved, ex.id])]; setSolved(n); try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* ignore */ } }
    } catch (e) { setVerdict({ ok: false, message: e.message }); }
    setBusy(false);
  };

  const pick = (id) => { const e = EXERCISES.find((x) => x.id === id); setExId(id); setSql(e.starter || ''); };
  const done = useMemo(() => EXERCISES.filter((e) => solved.includes(e.id)).length, [solved]);

  return (
    <div className="page wide">
      <Crumbs items={[{ label: 'Labs', to: '/labs' }, { label: 'SQL lab' }]} />
      <PageHead title="SQL lab" sub="Practise the SQL from Chapter 4 on a real SQLite database in your browser. The sample table matches the textbook's students example." />
      <div className="lab-grid">
        <section aria-label="Exercise and editor">
          <div className="card">
            <label className="field"><span>Exercise ({done} of {EXERCISES.length} solved on this device)</span>
              <select value={exId} onChange={(e) => pick(e.target.value)}>{EXERCISES.map((e, i) => <option key={e.id} value={e.id}>{solved.includes(e.id) ? '✓ ' : ''}{i + 1}. {e.title}</option>)}</select></label>
            <p><b>Task:</b> {ex.prompt}</p>
            {ex.note && <p className="hint">{ex.note}</p>}
            <p className="hint">Table: <code>{SCHEMA_TEXT}</code></p>
          </div>
          <CodeEditor value={sql} onChange={setSql} label="SQL" height={220} />
          <div className="row">
            <button className="btn btn-primary" disabled={busy || !sql.trim()} onClick={run}>Run</button>
            <button className="btn btn-primary" disabled={busy || !sql.trim()} onClick={check}>Check my answer</button>
            <button className="btn" disabled={busy} onClick={reset}>Reset database</button>
            <button className="btn" disabled={busy} onClick={() => setSql('SELECT * FROM students;')}>Show students</button>
          </div>
          {busy && <p className="hint">Working… the first run downloads the SQL engine (about 1 MB).</p>}
          {verdict && <p className={`feedback ${verdict.ok ? 'ok' : 'no'}`} role="status">{verdict.message}</p>}
          <p className="muted small">Run changes a practice database that stays until you press Reset. Check my answer always uses a fresh copy of the sample data, so earlier experiments cannot affect it.</p>
        </section>
        <section aria-label="Results"><h2 className="h3">Result</h2><Results out={out} /></section>
      </div>
    </div>
  );
}
