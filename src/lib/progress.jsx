import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase.js';
import { useAuth } from './auth.jsx';
import { useCatalog } from './catalog.jsx';

const Ctx = createContext(null);
export const useProgress = () => useContext(Ctx);
const KEY = 'cs12.progress.v1';

export const readLocal = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const writeLocal = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* storage full or blocked */ } };

// Merge rule (documented in README): completion is a union. If a lesson is completed either on this
// device (before signing in) or in the account, it stays completed. Nothing is ever un-completed by a merge.
export function mergeProgress(local, remote) {
  const out = { ...remote };
  Object.entries(local).forEach(([id, v]) => {
    if (v?.completed && !out[id]?.completed) out[id] = { ...(out[id] || {}), completed: true, completed_at: v.at || new Date().toISOString(), needsUpload: true };
  });
  return out;
}

export function ProgressProvider({ children }) {
  const { user } = useAuth();
  const { sectionMap, loading: catLoading } = useCatalog();
  const [map, setMap] = useState({});
  const [ready, setReady] = useState(false);
  const [save, setSave] = useState('idle'); // idle | saving | saved | offline | error
  const lastOp = useRef(null);

  useEffect(() => {
    if (catLoading) return undefined;
    let dead = false;
    (async () => {
      if (!user || !supabase) { setMap(readLocal()); setReady(true); return; }
      const { data, error } = await supabase.from('lesson_progress').select('section_id,completed,completed_at,last_opened_at').eq('user_id', user.id);
      if (dead) return;
      if (error) { setSave('error'); setReady(true); return; }
      const remote = Object.fromEntries(data.map((r) => [r.section_id, r]));
      const merged = mergeProgress(readLocal(), remote);
      const upload = Object.entries(merged).filter(([id, v]) => v.needsUpload && sectionMap[id]);
      if (upload.length) {
        const { error: e2 } = await supabase.from('lesson_progress').upsert(
          upload.map(([section_id, v]) => ({ user_id: user.id, section_id, completed: true, completed_at: v.completed_at })),
          { onConflict: 'user_id,section_id' });
        if (!e2) writeLocal({}); else setSave('error');
      } else if (Object.keys(readLocal()).length) writeLocal({});
      Object.values(merged).forEach((v) => { delete v.needsUpload; });
      if (!dead) { setMap(merged); setReady(true); }
    })();
    return () => { dead = true; };
  }, [user?.id, catLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = useCallback(async (op) => {
    lastOp.current = op;
    if (!navigator.onLine) { setSave('offline'); return false; }
    setSave('saving');
    const { error } = await op();
    if (error) { setSave('error'); return false; }
    setSave('saved');
    return true;
  }, []);

  const setCompleted = useCallback(async (sectionId, completed) => {
    const at = completed ? new Date().toISOString() : null;
    setMap((m) => ({ ...m, [sectionId]: { ...(m[sectionId] || {}), completed, completed_at: at } }));
    if (!user || !supabase) {
      const l = readLocal(); l[sectionId] = { completed, at }; writeLocal(l); setSave('idle'); return;
    }
    await persist(() => supabase.from('lesson_progress').upsert(
      { user_id: user.id, section_id: sectionId, completed, completed_at: at }, { onConflict: 'user_id,section_id' }));
  }, [user, persist]);

  // Records "opened" for signed-in users; sends only last_opened_at so `completed` is untouched.
  const touch = useCallback(async (sectionId) => {
    if (!user || !supabase) return;
    await supabase.from('lesson_progress').upsert({ user_id: user.id, section_id: sectionId, last_opened_at: new Date().toISOString() }, { onConflict: 'user_id,section_id' });
    await supabase.from('profiles').update({ last_section_id: sectionId }).eq('id', user.id);
  }, [user]);

  const retry = useCallback(() => { if (lastOp.current) persist(lastOp.current); }, [persist]);

  useEffect(() => {
    const on = () => { if (lastOp.current && (save === 'offline' || save === 'error')) persist(lastOp.current); };
    window.addEventListener('online', on);
    return () => window.removeEventListener('online', on);
  }, [save, persist]);

  const value = useMemo(() => ({
    map, ready, save, retry, setCompleted, touch,
    isDone: (id) => Boolean(map[id]?.completed),
    doneCount: (ids) => ids.filter((id) => map[id]?.completed).length,
  }), [map, ready, save, retry, setCompleted, touch]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
