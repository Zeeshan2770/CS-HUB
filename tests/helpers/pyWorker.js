// Loads the REAL src/workers/py.worker.js into Node with a REAL Pyodide, so tests drive it with the same messages the page sends.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

export const DIR = process.env.PYODIDE_DIR || '/tmp/pyfull/pyodide';
export const haveEngine = fs.existsSync(path.join(DIR, 'pyodide.asm.wasm'));
const req = createRequire(import.meta.url);

export async function startPyWorker() {
  const real = req(path.join(DIR, 'pyodide.js'));
  const posted = [];
  const waiters = [];
  const g = globalThis;
  g.self = g;
  g.postMessage = (m) => { posted.push(m); [...waiters].forEach((w) => w(m)); };
  g.importScripts = (url) => { if (/pyodide\.js$/.test(url)) g.loadPyodide = (o = {}) => real.loadPyodide({ indexURL: DIR + '/', ...o }); };
  await import('../../src/workers/py.worker.js?t=' + Date.now());
  const send = (msg, until, ms = 150000) => new Promise((resolve, reject) => {
    const start = posted.length;
    const t = setTimeout(() => reject(new Error('worker timeout; got ' + JSON.stringify(posted.slice(start)).slice(0, 600))), ms);
    const check = (m) => { if (until(m)) { clearTimeout(t); waiters.splice(waiters.indexOf(check), 1); resolve(posted.slice(start)); } };
    waiters.push(check);
    g.onmessage({ data: msg });
  });
  return {
    posted,
    send,
    run: (code) => send({ type: 'run', code }, (m) => m.type === 'done' || m.type === 'error'),
    // send a UI event and wait for the next 'tk' state message
    event: (event) => send({ type: 'tk-event', event }, (m) => m.type === 'tk'),
    text: (msgs) => msgs.filter((m) => m.type === 'out').map((m) => m.text).join(''),
    lastTk: (msgs) => [...msgs].reverse().find((m) => m.type === 'tk'),
  };
}
