import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase.js';

const Ctx = createContext(null);
export const useCatalog = () => useContext(Ctx);

export function CatalogProvider({ children }) {
  const [s, setS] = useState({ loading: Boolean(supabase), error: null, chapters: [], sections: [] });

  const load = useCallback(async () => {
    if (!supabase) return;
    setS((x) => ({ ...x, loading: true, error: null }));
    try {
      const [c, sec] = await Promise.all([
        supabase.from('chapters').select('id,number,title,summary,estimated_minutes,source_pages').eq('published', true).order('number'),
        supabase.from('sections').select('id,chapter_id,title,order_index,estimated_minutes,review_status').eq('published', true).order('order_index'),
      ]);
      if (c.error) throw c.error;
      if (sec.error) throw sec.error;
      setS({ loading: false, error: null, chapters: c.data, sections: sec.data });
    } catch (e) {
      setS((x) => ({ ...x, loading: false, error: e.message || 'Could not load the syllabus' }));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const value = useMemo(() => {
    const byChapter = {};
    s.sections.forEach((x) => { (byChapter[x.chapter_id] ||= []).push(x); });
    Object.values(byChapter).forEach((a) => a.sort((p, q) => p.order_index - q.order_index));
    const chapterMap = Object.fromEntries(s.chapters.map((c) => [c.id, c]));
    const flat = s.chapters.flatMap((c) => byChapter[c.id] || []);
    const sectionMap = Object.fromEntries(flat.map((x) => [x.id, x]));
    return { ...s, byChapter, chapterMap, flat, sectionMap, reload: load };
  }, [s, load]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
