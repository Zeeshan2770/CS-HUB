import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast, useConfirm } from '../lib/toast.jsx';
import { Crumbs, PageHead } from '../components/ui.jsx';
import CodeEditor from '../components/CodeEditor.jsx';
import TkView from '../components/TkView.jsx';

const SAMPLES = {
  'Hello and variables': 'name = "Ayesha"\nmarks = 87\nprint("Student:", name)\nprint("Marks:", marks)\nprint("Passed" if marks >= 40 else "Failed")',
  'Class and object': 'class Student:\n    def __init__(self, name):\n        self.name = name\n\n    def greet(self):\n        return "Hello, " + self.name\n\ns = Student("Bilal")\nprint(s.greet())',
  'Loop and function': 'def is_even(n):\n    return n % 2 == 0\n\nfor i in range(1, 8):\n    print(i, "even" if is_even(i) else "odd")',
  'Handling an error': 'try:\n    x = int("abc")\nexcept ValueError as e:\n    print("Bad number:", e)',
};
const LIMIT_MS = 10000;

export default function PythonLab() {
  const loc = useLocation();
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [code, setCode] = useState(loc.state?.code || SAMPLES['Hello and variables']);
  const [title, setTitle] = useState(loc.state?.title || 'My program');
  const [out, setOut] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | running
  const [saved, setSaved] = useState([]);
  const [figs, setFigs] = useState([]);
  const [tk, setTk] = useState(null);
  const worker = useRef(null);
  const timer = useRef(null);

  const kill = useCallback(() => { worker.current?.terminate(); worker.current = null; clearTimeout(timer.current); }, []);
  useEffect(() => kill, [kill]);

  const loadSaved = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('saved_code').select('id,title,code,updated_at').order('updated_at', { ascending: false }).limit(30);
    setSaved(data || []);
  }, [user]);
  useEffect(() => { loadSaved(); }, [loadSaved]);

  const run = () => {
    kill();
    setOut(''); setFigs([]); setTk(null);
    setStatus('loading');
    const w = new Worker(new URL('../workers/py.worker.js', import.meta.url));
    worker.current = w;
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'status') {
        const running = m.text.startsWith('Running');
        setStatus(running ? 'running' : 'loading');
        // The time limit starts when Python starts running, not while the engine downloads.
        if (running) {
          clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            kill(); setStatus('idle');
            setOut((o) => o + `\nStopped: the program ran for more than ${LIMIT_MS / 1000} seconds. Check for an endless loop.\n`);
          }, LIMIT_MS);
        }
      }
      if (m.type === 'out') setOut((o) => o + m.text);
      if (m.type === 'figures') setFigs(m.images);
      if (m.type === 'tk') clearTimeout(tkTimer.current);
      if (m.type === 'tk') setTk({ tree: m.tree, closed: m.closed, alerts: m.alerts, mainloop: m.mainloop });
      if (m.type === 'error') { setOut((o) => o + m.text + '\n'); setStatus('idle'); kill(); }
      if (m.type === 'done') { setStatus('idle'); clearTimeout(timer.current); }
    };
    w.onerror = () => { setOut((o) => o + 'The Python engine could not start. Check your internet connection and try again.\n'); setStatus('idle'); kill(); };
    w.postMessage({ type: 'run', code });
  };
  const tkTimer = useRef(null);
  const tkSend = (event) => {
    if (!worker.current) return;
    clearTimeout(tkTimer.current);
    // If a handler never returns (an endless loop in a callback), stop the program instead of freezing the page.
    tkTimer.current = setTimeout(() => { kill(); setOut((o) => o + `\nStopped: a window handler ran for more than ${LIMIT_MS / 1000} seconds.\n`); }, LIMIT_MS);
    worker.current.postMessage({ type: 'tk-event', event });
  };
  const stop = () => { kill(); setStatus('idle'); setOut((o) => o + '\nStopped.\n'); };

  const save = async () => {
    if (!user) { toast('Sign in to save programs to your account.', 'info'); return; }
    const { error } = await supabase.from('saved_code').insert({ user_id: user.id, title: title.trim() || 'My program', code });
    if (error) toast('Could not save. Try again.', 'error'); else { toast('Program saved', 'success'); loadSaved(); }
  };
  const remove = async (id) => {
    if (!(await confirm('Delete this saved program?', { confirmLabel: 'Delete', danger: true }))) return;
    const { error } = await supabase.from('saved_code').delete().eq('id', id);
    if (error) toast('Could not delete.', 'error'); else loadSaved();
  };

  const busy = status !== 'idle';
  return (
    <div className="page wide">
      <Crumbs items={[{ label: 'Labs', to: '/labs' }, { label: 'Python lab' }]} />
      <PageHead title="Python lab" sub="Runs in your browser. Limits: 10 seconds per run, no input(), no Tkinter. The sqlite3 module works. numpy and pandas load on demand (slow the first time). Charts are not displayed." />
      <div className="lab-grid">
        <section aria-label="Editor">
          <div className="row filters">
            <label className="field inline"><span>Sample program</span>
              <select value="" onChange={(e) => { if (e.target.value) { setCode(SAMPLES[e.target.value]); setTitle(e.target.value); } }}>
                <option value="">Choose…</option>{Object.keys(SAMPLES).map((k) => <option key={k}>{k}</option>)}
              </select></label>
            <label className="field inline"><span>Name</span><input value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} /></label>
          </div>
          <CodeEditor value={code} onChange={setCode} label="Python code" />
          <div className="row">
            {!busy ? <button className="btn btn-primary" onClick={run}>Run</button> : <button className="btn btn-danger" onClick={stop}>Stop</button>}
            <button className="btn" onClick={() => setCode('')} disabled={busy}>Clear</button>
            <button className="btn" onClick={() => { setCode(SAMPLES['Hello and variables']); setOut(''); }} disabled={busy}>Reset</button>
            <button className="btn" onClick={save}>Save</button>
            <span className="hint">Press Esc, then Tab, to leave the editor with the keyboard.</span>
          </div>
        </section>
        <section aria-label="Output">
          <h2 className="h3">Output {busy && <span className="chip">{status === 'loading' ? 'Loading Python…' : 'Running…'}</span>}</h2>
          <pre className="console" aria-live="polite">{out || <span className="muted">Output appears here after you press Run.</span>}</pre>
          {figs.map((src, i) => <img key={i} className="plotimg" src={src} alt={`Chart ${i + 1} drawn by your program`} />)}
          {tk && <><h2 className="h3">Window</h2><p className="hint">This is a browser stand-in for Tkinter, not the real thing: layout is approximate and some options are ignored.</p><TkView state={tk} send={tkSend} /></>}
          {user && (<><h2 className="h3">Saved programs</h2>
            {saved.length === 0 ? <p className="muted">Nothing saved yet.</p> : (
              <ul className="saved">{saved.map((s) => (
                <li key={s.id}><button className="linkbtn" onClick={() => { setCode(s.code); setTitle(s.title); }}>{s.title}</button>
                  <button className="linkbtn danger" onClick={() => remove(s.id)} aria-label={`Delete ${s.title}`}>Delete</button></li>))}</ul>)}</>)}
          {!user && <p className="hint"><Link to="/login">Sign in</Link> to save programs to your account.</p>}
        </section>
      </div>
    </div>
  );
}
