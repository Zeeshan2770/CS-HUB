import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useCatalog } from '../lib/catalog.jsx';
import { Empty, ErrorBox, PageHead, Spinner } from '../components/ui.jsx';

export function Highlight({ text, term }) {
  if (!term) return text;
  const parts = [];
  const lower = text.toLowerCase();
  const t = term.toLowerCase();
  let i = 0, at;
  while ((at = lower.indexOf(t, i)) !== -1) {
    parts.push(text.slice(i, at), <mark key={at}>{text.slice(at, at + t.length)}</mark>);
    i = at + t.length;
  }
  parts.push(text.slice(i));
  return parts.map((p, n) => <Fragment key={n}>{p}</Fragment>);
}

export default function Search() {
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') || '').trim();
  const [ch, setCh] = useState('all');
  const { chapters, sections, chapterMap } = useCatalog();
  const [st, setSt] = useState({ loading: false, rows: [], error: null });

  const titleHits = useMemo(() => {
    const n = q.toLowerCase();
    return n.length < 2 ? [] : sections.filter((s) => s.title.toLowerCase().includes(n) && (ch === 'all' || s.chapter_id === ch));
  }, [q, sections, ch]);

  useEffect(() => {
    if (q.length < 2) { setSt({ loading: false, rows: [], error: null }); return undefined; }
    let dead = false;
    setSt((s) => ({ ...s, loading: true, error: null }));
    supabase.rpc('search_content', { p_query: q, p_chapter: ch === 'all' ? null : ch, p_limit: 40 }).then(({ data, error }) => {
      if (dead) return;
      setSt({ loading: false, rows: data || [], error: error ? 'Search is unavailable right now.' : null });
    });
    return () => { dead = true; };
  }, [q, ch]);

  const grouped = useMemo(() => {
    const m = new Map();
    st.rows.forEach((r) => { if (!m.has(r.section_id)) m.set(r.section_id, { ...r, snippets: [] }); if (m.get(r.section_id).snippets.length < 2) m.get(r.section_id).snippets.push(r.snippet); });
    return [...m.values()];
  }, [st.rows]);

  return (
    <div className="page">
      <PageHead title="Search" sub={q ? `Results for “${q}”` : 'Search lesson titles and lesson text.'} />
      <div className="row filters">
        <label className="field inline"><span>Search</span><input type="search" value={q} onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {})} /></label>
        <label className="field inline"><span>Chapter</span>
          <select value={ch} onChange={(e) => setCh(e.target.value)}><option value="all">All chapters</option>{chapters.map((c) => <option key={c.id} value={c.id}>{c.number}. {c.title}</option>)}</select>
        </label>
      </div>
      {q.length < 2 ? <Empty title="Type at least two letters">Search matches lesson titles and the text inside lessons.</Empty> : (
        <>
          {titleHits.length > 0 && (<section><h2>Topics</h2><ul className="results">{titleHits.map((s) => (
            <li key={s.id}><Link to={`/lesson/${s.id}`}><Highlight text={s.title} term={q} /></Link><small className="muted"> Chapter {chapterMap[s.chapter_id]?.number}</small></li>))}</ul></section>)}
          <section><h2>Inside lessons</h2>
            {st.loading ? <Spinner /> : st.error ? <ErrorBox message={st.error} /> : grouped.length === 0 ? <p className="muted">No matches in lesson text.</p> : (
              <ul className="results">{grouped.map((r) => (
                <li key={r.section_id}><Link to={`/lesson/${r.section_id}`}>{r.section_title}</Link><small className="muted"> Chapter {chapterMap[r.chapter_id]?.number}</small>
                  {r.snippets.map((s, n) => <p key={n} className="snip">…<Highlight text={s.replace(/\s+/g, ' ')} term={q} />…</p>)}</li>))}</ul>)}
          </section>
          {!st.loading && titleHits.length === 0 && grouped.length === 0 && <Empty title="Nothing found">Try a shorter or different word.</Empty>}
        </>
      )}
    </div>
  );
}
