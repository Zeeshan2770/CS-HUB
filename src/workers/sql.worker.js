// Runs student SQL in SQLite (sql.js, WebAssembly) inside a Web Worker. Loaded from jsDelivr on first use.
const BASE = 'https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/';
let SQL = null;
let db = null;
const MAX_ROWS = 200;

async function init() {
  if (SQL) return;
  self.importScripts(BASE + 'sql-wasm.js');
  SQL = await self.initSqlJs({ locateFile: (f) => BASE + f });
}

function execOn(database, sql) {
  const raw = database.exec(sql);
  return {
    results: raw.map((r) => ({ columns: r.columns, values: r.values.slice(0, MAX_ROWS), total: r.values.length })),
    changes: database.getRowsModified(),
  };
}

self.onmessage = async (e) => {
  const { id, type, setup, sql } = e.data;
  try {
    await init();
    if (type === 'reset') {
      if (db) db.close();
      db = new SQL.Database();
      db.exec(setup);
      self.postMessage({ id, ok: true, results: [], changes: 0 });
    } else if (type === 'run') {
      if (!db) { db = new SQL.Database(); db.exec(setup); }
      self.postMessage({ id, ok: true, ...execOn(db, sql) });
    } else if (type === 'fresh') {
      const tmp = new SQL.Database();
      try { tmp.exec(setup); self.postMessage({ id, ok: true, ...execOn(tmp, sql) }); } finally { tmp.close(); }
    }
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.message ? err.message : err) });
  }
};
