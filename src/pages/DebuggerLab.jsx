import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Crumbs, PageHead } from '../components/ui.jsx';
import CodeEditor from '../components/CodeEditor.jsx';

const SAMPLES = {
  'Area of a circle (Chapter 5)': 'def calculate_area(radius):\n    return 3.14 * radius * radius\n\nradius = 5\nprint("Area of circle:", calculate_area(radius))',
  'Largest number in a list': 'numbers = [4, 9, 2, 7]\nlargest = numbers[0]\nfor n in numbers:\n    if n > largest:\n        largest = n\nprint("Largest:", largest)',
  'Factorial with a loop': 'n = 5\nresult = 1\nwhile n > 1:\n    result = result * n\n    n = n - 1\nprint("Factorial:", result)',
  'Bug hunt: the total is wrong': 'marks = [70, 80, 90]\ntotal = 0\nfor i in range(1, len(marks)):\n    total = total + marks[i]\nprint("Average:", total / len(marks))',
};
const LIMIT_MS = 15000;

function describe(step) {
  if (!step) return '';
  const where = step.fn === '<module>' ? 'the main program' : `${step.fn}()`;
  return step.event === 'return' ? `Returning ${step.ret} from ${where}.` : `About to run line ${step.line} in ${where}.`;
}

export default function DebuggerLab() {
  const [code, setCode] = useState(SAMPLES['Area of a circle (Chapter 5)']);
  const [watchText, setWatchText] = useState('');
  const [mode, setMode] = useState('edit'); // edit | debug
  const [status, setStatus] = useState('idle'); // idle | loading | running
  const [res, setRes] = useState(null);
  const [idx, setIdx] = useState(0);
  const [bps, setBps] = useState(() => new Set());
  const [msg, setMsg] = useState('');
  const worker = useRef(null);
  const timer = useRef(null);

  const kill = useCallback(() => { worker.current?.terminate(); worker.current = null; clearTimeout(timer.current); }, []);
  useEffect(() => kill, [kill]);

  const trace = () => {
    kill(); setMsg(''); setStatus('loading');
    const watches = watchText.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 6);
    const w = new Worker(new URL('../workers/py.worker.js', import.meta.url));
    worker.current = w;
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'status') {
        const running = m.text.startsWith('Running');
        setStatus(running ? 'running' : 'loading');
        if (running) { clearTimeout(timer.current); timer.current = setTimeout(() => { kill(); setStatus('idle'); setMsg(`Stopped: tracing took more than ${LIMIT_MS / 1000} seconds.`); }, LIMIT_MS); }
      }
      if (m.type === 'trace') {
        kill(); setStatus('idle'); setRes(m.result); setIdx(0); setMode('debug');
        if (!m.result.steps.length && !m.result.error) setMsg('The program ran but has no lines to step through.');
      }
      if (m.type === 'error') { kill(); setStatus('idle'); setMsg(m.text); }
    };
    w.onerror = () => { kill(); setStatus('idle'); setMsg('The Python engine could not start. Check your internet connection and try again.'); };
    w.postMessage({ type: 'trace', code, watches });
  };

  const steps = res?.steps || [];
  const step = steps[idx];
  const prev = idx > 0 ? steps[idx - 1] : null;
  const lines = useMemo(() => code.split('\n'), [code]);
  const watchKeys = step ? Object.keys(step.watch) : [];
  const atEnd = steps.length > 0 && idx === steps.length - 1;

  const toggleBp = (n) => setBps((s) => { const x = new Set(s); x.has(n) ? x.delete(n) : x.add(n); return x; });
  const cont = () => {
    const next = steps.findIndex((s, i) => i > idx && bps.has(s.line));
    setIdx(next === -1 ? steps.length - 1 : next);
  };
  const changed = (name, val, source) => !prev || (source === 'globals' ? prev.globals[name] !== val : prev.fn !== step.fn || prev.vars[name] !== val);

  if (mode === 'edit') {
    return (
      <div className="page wide">
        <Crumbs items={[{ label: 'Labs', to: '/labs' }, { label: 'Step-through debugger' }]} />
        <PageHead title="Step-through debugger" sub="Run any program one line at a time, watch the variables change, and set breakpoints (Chapter 5: Code Testing and Debugging). Works for any algorithm you write." />
        <div className="row filters">
          <label className="field inline"><span>Sample program</span>
            <select value="" onChange={(e) => e.target.value && setCode(SAMPLES[e.target.value])}><option value="">Choose…</option>{Object.keys(SAMPLES).map((k) => <option key={k}>{k}</option>)}</select></label>
          <label className="field inline grow"><span>Watch expressions (comma separated, optional)</span><input value={watchText} onChange={(e) => setWatchText(e.target.value)} placeholder="total, len(marks), total / 3" /></label>
        </div>
        <CodeEditor value={code} onChange={setCode} label="Python code to debug" height={340} />
        <div className="row"><button className="btn btn-primary" disabled={status !== 'idle' || !code.trim()} onClick={trace}>{status === 'idle' ? 'Start debugging' : status === 'loading' ? 'Loading Python…' : 'Tracing…'}</button>
          <span className="hint">Records up to 400 steps. No input(), no Tkinter.</span></div>
        {msg && <p className="fielderr" role="alert">{msg}</p>}
      </div>
    );
  }

  return (
    <div className="page wide">
      <Crumbs items={[{ label: 'Labs', to: '/labs' }, { label: 'Step-through debugger' }]} />
      <PageHead title="Step-through debugger" sub={`Step ${steps.length ? idx + 1 : 0} of ${steps.length}`}>
        <button className="btn" onClick={() => setMode('edit')}>Edit code</button><button className="btn" onClick={trace}>Run again</button>
      </PageHead>
      <div className="row stepctl" role="group" aria-label="Debugger controls">
        <button className="btn btn-sm" disabled={idx === 0} onClick={() => setIdx(0)}>First</button>
        <button className="btn btn-sm" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>Back</button>
        <button className="btn btn-sm btn-primary" disabled={atEnd || !steps.length} onClick={() => setIdx(idx + 1)}>Next line</button>
        <button className="btn btn-sm" disabled={atEnd || !steps.length} onClick={cont} title="Run to the next breakpoint, or to the end">Continue</button>
        <button className="btn btn-sm" disabled={atEnd || !steps.length} onClick={() => setIdx(steps.length - 1)}>Last</button>
        <input type="range" min={0} max={Math.max(0, steps.length - 1)} value={idx} onChange={(e) => setIdx(Number(e.target.value))} aria-label="Step" disabled={!steps.length} />
      </div>
      <p className="stepnote" role="status" aria-live="polite">{describe(step)}</p>
      <div className="lab-grid">
        <section aria-label="Program">
          <div className="codeview">
            {lines.map((text, i) => {
              const n = i + 1;
              return (
                <div key={n} className={`cl ${step?.line === n ? 'curline' : ''}`}>
                  <button className={`bp ${bps.has(n) ? 'on' : ''}`} onClick={() => toggleBp(n)} aria-pressed={bps.has(n)} aria-label={`Breakpoint on line ${n}`}>{n}</button>
                  <code>{text || ' '}</code>
                </div>);
            })}
          </div>
          <p className="hint">Click a line number to set or clear a breakpoint, then press Continue.</p>
        </section>
        <section aria-label="State">
          <h2 className="h3">Variables {step && step.fn !== '<module>' && <span className="chip">in {step.fn}()</span>}</h2>
          {step && Object.keys(step.vars).length ? (
            <table className="lt vars"><thead><tr><th>Name</th><th>Value</th></tr></thead>
              <tbody>{Object.entries(step.vars).map(([k, v]) => <tr key={k} className={changed(k, v, 'vars') ? 'chg' : ''}><td className="mono">{k}</td><td className="mono">{v}</td></tr>)}</tbody></table>
          ) : <p className="muted">No variables yet.</p>}
          {step && Object.keys(step.globals).length > 0 && (<><h2 className="h3">Global variables</h2>
            <table className="lt vars"><tbody>{Object.entries(step.globals).map(([k, v]) => <tr key={k} className={changed(k, v, 'globals') ? 'chg' : ''}><td className="mono">{k}</td><td className="mono">{v}</td></tr>)}</tbody></table></>)}
          {watchKeys.length > 0 && (<><h2 className="h3">Watches</h2>
            <table className="lt vars"><tbody>{watchKeys.map((k) => <tr key={k}><td className="mono">{k}</td><td className="mono">{step.watch[k]}</td></tr>)}</tbody></table></>)}
          <h2 className="h3">Output so far</h2>
          <pre className="console" aria-live="polite">{step?.out || (atEnd ? res.output : '') || <span className="muted">Nothing printed yet.</span>}</pre>
          {atEnd && res.output && step?.out !== res.output && <pre className="console">{res.output}</pre>}
          {atEnd && res.error && <p className="fielderr" role="alert">The program stopped with an error{res.error.line ? ` on line ${res.error.line}` : ''}: {res.error.message}</p>}
          {atEnd && res.truncated && <p className="hint">Tracing stopped after {steps.length} steps (limit reached).</p>}
          {atEnd && !res.error && !res.truncated && <p className="hint">The program finished.</p>}
        </section>
      </div>
    </div>
  );
}
