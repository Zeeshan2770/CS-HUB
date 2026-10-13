import { useCallback, useEffect, useRef, useState } from 'react';

// Runs an async loader; returns { data, error, loading, reload }. Ignores results from stale runs.
export function useLoad(fn, deps = []) {
  const [s, setS] = useState({ data: null, error: null, loading: true });
  const run = useRef(0);
  const load = useCallback(async () => {
    const id = ++run.current;
    setS((x) => ({ ...x, loading: true, error: null }));
    try {
      const data = await fn();
      if (id === run.current) setS({ data, error: null, loading: false });
    } catch (e) {
      if (id === run.current) setS({ data: null, error: e?.message || 'Something went wrong', loading: false });
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  return { ...s, reload: load };
}

export const unwrap = ({ data, error }) => { if (error) throw error; return data; };
