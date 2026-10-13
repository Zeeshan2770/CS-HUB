// @vitest-environment node
// Runs the REAL worker files (src/workers/*.js) against REAL Pyodide and REAL SQLite (sql.js).
// Needs the Pyodide distribution on disk (about 300 MB):
//   curl -L -o p.tar.bz2 https://github.com/pyodide/pyodide/releases/download/0.26.4/pyodide-0.26.4.tar.bz2 && tar xjf p.tar.bz2
//   PYODIDE_DIR=/path/to/pyodide npm test
// Without PYODIDE_DIR (or /tmp/pyfull/pyodide) these tests are skipped, not faked.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const DIR = process.env.PYODIDE_DIR || '/tmp/pyfull/pyodide';
const have = fs.existsSync(path.join(DIR, 'pyodide.asm.wasm'));
const d = have ? describe : describe.skip;
const require_ = createRequire(import.meta.url);

function makeWorker(importer, setupGlobals) {
  const posted = [];
  const waiters = [];
  const g = globalThis;
  g.self = g;
  g.postMessage = (m) => { posted.push(m); waiters.forEach((w) => w(m)); };
  g.importScripts = (url) => setupGlobals(url);
  return {
    posted,
    async load() { await importer(); },
    send(msg, until) {
      return new Promise((resolve, reject) => {
        const start = posted.length;
        const t = setTimeout(() => reject(new Error('worker timeout; got ' + JSON.stringify(posted.slice(start)).slice(0, 400))), 110000);
        const check = (m) => { if (until(m)) { clearTimeout(t); waiters.splice(waiters.indexOf(check), 1); resolve(posted.slice(start)); } };
        waiters.push(check);
        g.onmessage({ data: msg });
      });
    },
  };
}

d('REAL Python worker (Pyodide 0.26.4)', () => {
  let w;
  const run = (code) => w.send({ type: 'run', code }, (m) => m.type === 'done' || m.type === 'error');
  const text = (msgs) => msgs.filter((m) => m.type === 'out').map((m) => m.text).join('');
  beforeAll(async () => {
    const real = require_(path.join(DIR, 'pyodide.js'));
    w = makeWorker(() => import('../src/workers/py.worker.js'), (url) => {
      if (/pyodide\.js$/.test(url)) globalThis.loadPyodide = (o = {}) => real.loadPyodide({ indexURL: DIR + '/', ...o });
    });
    await w.load();
  }, 60000);

  it('the engine URL the app uses points at the same file layout as this distribution', () => {
    expect(fs.readFileSync('src/workers/py.worker.js', 'utf8')).toMatch(/cdn\.jsdelivr\.net\/pyodide\/v0\.26\.4\/full\/pyodide\.js/);
    for (const f of ['pyodide.js', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json']) expect(fs.existsSync(path.join(DIR, f)), f).toBe(true);
  });
  it('runs a program and streams its output', async () => {
    const m = await run('for i in range(3):\n    print("line", i)\n');
    expect(m.at(-1).type).toBe('done');
    expect(text(m)).toBe('line 0\nline 1\nline 2\n');
  }, 120000);
  it('formats errors like Python, with the student line', async () => {
    const m = await run('x = 1\nprint(x / 0)\n');
    expect(m.at(-1)).toMatchObject({ type: 'error' });
    expect(m.at(-1).text).toMatch(/Traceback/);
    expect(m.at(-1).text).toMatch(/ZeroDivisionError: division by zero/);
  }, 120000);
  it('explains that input() is unavailable', async () => {
    const m = await run('name = input("Name? ")\n');
    expect(m.at(-1).text).toMatch(/input\(\) is not available/);
  }, 120000);
  it('keeps student runs isolated from each other (fresh globals each time)', async () => {
    await run('secret = 42\n');
    const m = await run('print("secret" in globals())\n');
    expect(text(m)).toBe('False\n');
  }, 120000);
  it('loads numpy on demand', async () => {
    const m = await run('import numpy as np\nprint(int(np.arange(5).sum()))\n');
    expect(text(m)).toBe('10\n');
    expect(m.some((x) => x.type === 'status' && /packages/i.test(x.text))).toBe(true);
  }, 120000);
  it('loads pandas on demand (Chapter 6)', async () => {
    const m = await run('import pandas as pd\ndf = pd.DataFrame({"marks": [60, 70, 80]})\nprint(df["marks"].mean())\n');
    expect(text(m)).toBe('70.0\n');
  }, 180000);
  it("runs the textbook's sqlite3 connection example (Chapter 4)", async () => {
    const code = [
      'import sqlite3',
      'connection = sqlite3.connect(":memory:")',
      'cursor = connection.cursor()',
      'cursor.execute("CREATE TABLE students (id INTEGER PRIMARY KEY, name TEXT, age INTEGER, grade TEXT)")',
      'cursor.execute("INSERT INTO students (name, age, grade) VALUES (?, ?, ?)", ("Ayesha", 17, "A"))',
      'connection.commit()',
      'cursor.execute("SELECT * FROM students")',
      'print(cursor.fetchall())',
      'connection.close()',
    ].join('\n');
    const m = await run(code);
    expect(m.at(-1).type).toBe('done');
    expect(text(m)).toBe("[(1, 'Ayesha', 17, 'A')]\n");
  }, 180000);
  it('step tracer works through the real worker message protocol, with watches', async () => {
    const m = await w.send({ type: 'trace', code: 'a = 2\nb = a * 3\n', watches: ['a + b'] }, (x) => x.type === 'trace' || x.type === 'error');
    const t = m.at(-1);
    expect(t.type).toBe('trace');
    expect(t.result.steps.map((s) => s.line)).toEqual([1, 2]);
    expect(t.result.steps[1].watch['a + b']).toBe('<NameError>');
    expect(t.result.output).toBe('');
  }, 120000);
});

d('REAL SQL worker (sql.js 1.10.3 / SQLite)', () => {
  let w;
  const call = (msg) => w.send(msg, (m) => m.id === msg.id);
  beforeAll(async () => {
    const initSqlJs = require_('sql.js');
    const dist = path.dirname(require_.resolve('sql.js'));
    w = makeWorker(() => import('../src/workers/sql.worker.js'), (url) => {
      if (/sql-wasm\.js$/.test(url)) globalThis.initSqlJs = (o) => initSqlJs({ ...o, locateFile: (f) => path.join(dist, f) });
    });
    await w.load();
  }, 60000);
  const SETUP = 'CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT); INSERT INTO t VALUES (1,\'a\'),(2,\'b\');';
  it('the CDN file names the app asks for exist in the sql.js package', () => {
    const dist = path.dirname(require_.resolve('sql.js'));
    expect(fs.readFileSync('src/workers/sql.worker.js', 'utf8')).toMatch(/sql\.js@1\.10\.3\/dist\//);
    for (const f of ['sql-wasm.js', 'sql-wasm.wasm']) expect(fs.existsSync(path.join(dist, f)), f).toBe(true);
  });
  it('reset, run, and a persistent practice database', async () => {
    expect((await call({ id: 1, type: 'reset', setup: SETUP })).at(-1).ok).toBe(true);
    const r = (await call({ id: 2, type: 'run', setup: SETUP, sql: 'SELECT * FROM t ORDER BY id;' })).at(-1);
    expect(r.results[0]).toMatchObject({ columns: ['id', 'v'], values: [[1, 'a'], [2, 'b']] });
    await call({ id: 3, type: 'run', setup: SETUP, sql: "INSERT INTO t VALUES (3,'c');" });
    const n = (await call({ id: 4, type: 'run', setup: SETUP, sql: 'SELECT count(*) FROM t;' })).at(-1);
    expect(n.results[0].values[0][0]).toBe(3);
  });
  it('"fresh" uses a clean copy every time and does not touch the practice database', async () => {
    const f = (await call({ id: 5, type: 'fresh', setup: SETUP, sql: 'DELETE FROM t; SELECT count(*) FROM t;' })).at(-1);
    expect(f.results[0].values[0][0]).toBe(0);
    const n = (await call({ id: 6, type: 'run', setup: SETUP, sql: 'SELECT count(*) FROM t;' })).at(-1);
    expect(n.results[0].values[0][0]).toBe(3);
  });
  it('reports SQL errors and caps big results', async () => {
    const e = (await call({ id: 7, type: 'run', setup: SETUP, sql: 'SELEC 1;' })).at(-1);
    expect(e.ok).toBe(false);
    expect(e.error).toMatch(/syntax error/i);
    const big = (await call({ id: 8, type: 'fresh', setup: SETUP, sql: 'WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c WHERE x < 1000) SELECT x FROM c;' })).at(-1);
    expect(big.results[0].values.length).toBe(200);
    expect(big.results[0].total).toBe(1000);
  });
});
