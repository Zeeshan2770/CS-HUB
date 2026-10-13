import TRACER from './tracerSource.js';
import TK_SOURCE from './shims/tkSource.js';
import TK_INSTALL from './shims/installTk.js';
import MYSQL_SOURCE from './shims/mysqlSource.js';
import FIG_SOURCE from './shims/figuresSource.js';
// Runs student Python code inside a Web Worker (isolated from the page). Pyodide is loaded from jsDelivr.
let pyodide = null;
let tracerReady = false;
let tkActive = false;
let figsActive = false;
const MAX_OUT = 20000;
let outLen = 0;

const post = (m) => self.postMessage(m);
const emit = (text) => {
  if (outLen > MAX_OUT) return;
  outLen += text.length;
  post({ type: 'out', text: outLen > MAX_OUT ? text.slice(0, Math.max(0, text.length - (outLen - MAX_OUT))) + '\n[output truncated]\n' : text });
};

async function init() {
  if (pyodide) return;
  post({ type: 'status', text: 'Loading Python (first run downloads about 10 MB)…' });
  self.importScripts('https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js');
  pyodide = await self.loadPyodide();
  pyodide.runPython(`
import builtins
def _no_input(prompt=''):
    raise RuntimeError("input() is not available in the browser lab. Store test values in variables instead.")
builtins.input = _no_input
`);
}

async function loadNeeded(code) {
  // Standard-library extras and common packages (numpy, pandas, sqlite3...) are fetched only if the code imports them.
  if (/\b(import|from)\s+(numpy|pandas|sqlite3|scipy|matplotlib|statistics|sklearn)\b/.test(code)) {
    post({ type: 'status', text: 'Loading packages…' });
    await pyodide.loadPackagesFromImports(code);
  }
  if (/\bmysql\b/.test(code)) await pyodide.loadPackage('sqlite3'); // the mysql.connector stand-in runs on SQLite
}

async function tkFlush() {
  const t = pyodide.pyimport('tkinter');
  let out;
  try { out = JSON.parse(t._flush()); } finally { t.destroy(); }
  (out.timers || []).forEach(({ token, ms }) => setTimeout(() => tkEvent({ type: 'after', token }), ms));
  post({ type: 'tk', ...out, timers: undefined });
}

function tkEvent(ev) {
  if (!tkActive || !pyodide) return;
  const t = pyodide.pyimport('tkinter');
  try { t._dispatch(JSON.stringify(ev)); } catch (err) { emit(String(err?.message || err) + '\n'); } finally { t.destroy(); }
  tkFlush();
}

function installShims(code) {
  tkActive = false;
  if (/\btkinter\b|\bTkinter\b/.test(code)) {
    pyodide.runPython(TK_INSTALL);
    pyodide.globals.get('_install_tkinter')(TK_SOURCE);
    tkActive = true;
  }
  if (/\bmysql\b/.test(code)) pyodide.runPython(MYSQL_SOURCE);
  figsActive = /\bmatplotlib\b/.test(code);
}

async function runTrace(code, watches) {
  await init();
  await loadNeeded(code);
  if (!tracerReady) { pyodide.runPython(TRACER); tracerReady = true; }
  post({ type: 'status', text: 'Running…' });
  const fn = pyodide.globals.get('run_trace');
  try {
    post({ type: 'trace', result: JSON.parse(fn(code, JSON.stringify(watches || []), 400)) });
  } finally { fn.destroy(); }
}

self.onmessage = async (e) => {
  const { type, code, watches } = e.data;
  if (type === 'tk-event') { tkEvent(e.data.event); return; }
  if (type === 'trace') {
    try { await runTrace(code, watches); } catch (err) { post({ type: 'error', text: String(err?.message || err) }); }
    return;
  }
  if (type !== 'run') return;
  outLen = 0;
  try {
    await init();
    await loadNeeded(code);
    installShims(code);
    if (figsActive) pyodide.runPython(FIG_SOURCE);
    pyodide.setStdout({ batched: (s) => emit(s + '\n') });
    pyodide.setStderr({ batched: (s) => emit(s + '\n') });
    const globals = pyodide.globals.get('dict')();
    try {
      post({ type: 'status', text: 'Running…' });
      await pyodide.runPythonAsync(code, { globals });
      if (figsActive) {
        const imgs = JSON.parse(pyodide.runPython('_cs_take()'));
        if (imgs.length) post({ type: 'figures', images: imgs });
      }
      if (tkActive) await tkFlush();
      post({ type: 'done' });
    } finally {
      globals.destroy();
    }
  } catch (err) {
    let msg = String(err?.message || err);
    const at = msg.indexOf('File "<exec>"');
    if (at > -1) msg = 'Traceback (most recent call last):\n  ' + msg.slice(at);
    post({ type: 'error', text: msg });
  }
};
