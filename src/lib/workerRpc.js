// Request/response wrapper around a Web Worker with a hard time limit (the worker is killed on timeout).
export function createWorkerClient(makeWorker) {
  let w = null;
  let seq = 0;
  const pending = new Map();

  const kill = () => { w?.terminate(); w = null; };
  const failAll = (msg) => { pending.forEach((p) => { clearTimeout(p.t); p.reject(new Error(msg)); }); pending.clear(); };
  const ensure = () => {
    if (w) return w;
    w = makeWorker();
    w.onmessage = (e) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      clearTimeout(p.t); pending.delete(e.data.id);
      p.resolve(e.data);
    };
    w.onerror = () => { kill(); failAll('The engine could not start. Check your internet connection and try again.'); };
    return w;
  };

  return {
    call(msg, ms = 8000) {
      return new Promise((resolve, reject) => {
        const id = ++seq;
        const t = setTimeout(() => {
          pending.delete(id); kill();
          reject(new Error(`Stopped: it ran for more than ${ms / 1000} seconds. Check for an endless loop or a very large query.`));
        }, ms);
        pending.set(id, { resolve, reject, t });
        try { ensure().postMessage({ ...msg, id }); } catch (e) { clearTimeout(t); pending.delete(id); reject(e); }
      });
    },
    close() { kill(); failAll('closed'); },
  };
}
