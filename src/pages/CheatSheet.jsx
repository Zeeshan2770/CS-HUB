import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useCatalog } from '../lib/catalog.jsx';
import { useLoad, unwrap } from '../lib/useLoad.js';
import { Crumbs, Empty, Spinner, Icon } from '../components/ui.jsx';

// Which block types count as "reference material" worth cramming before an exam.
const CHEAT_TYPES = ['objectives', 'definition', 'table'];

export default function CheatSheet() {
  const { chapterId } = useParams();
  const { chapterMap, byChapter, loading: catalogLoading } = useCatalog();
  const c = chapterMap[chapterId];
  const secs = byChapter[chapterId] || [];
  const sectionIds = secs.map((s) => s.id);

  const { data: blocks, loading } = useLoad(async () => {
    if (sectionIds.length === 0) return [];
    return supabase.from('lesson_blocks').select('*').in('section_id', sectionIds).in('block_type', CHEAT_TYPES).order('order_index').then(unwrap);
  }, [sectionIds.join(',')]);

  if (catalogLoading || loading) return <div className="page"><Spinner /></div>;
  if (!c) return <div className="page narrow"><Empty title="Chapter not found" action={<Link className="btn" to="/syllabus">Browse the syllabus</Link>}>It may be unpublished or the address is wrong.</Empty></div>;

  const bySection = {};
  (blocks || []).forEach((b) => { (bySection[b.section_id] ||= []).push(b); });
  const hasContent = secs.some((s) => (bySection[s.id] || []).length > 0);

  return (
    <div className="page cheatsheet">
      <Crumbs items={[{ label: 'Syllabus', to: '/syllabus' }, { label: `Chapter ${c.number}`, to: `/chapter/${c.id}` }, { label: 'Cheat sheet' }]} />
      <div className="row between cs-print-title">
        <h1>Chapter {c.number} cheat sheet <small className="muted">— {c.title}</small></h1>
        <button className="btn btn-primary no-print" onClick={() => window.print()}><Icon name="printer" /> Print / Save as PDF</button>
      </div>
      <p className="muted small no-print">Definitions, learning objectives, and reference tables pulled straight from this chapter's lessons — not a separate, hand-written summary. Anything missing here just hasn't been marked as a definition or table block yet.</p>

      {!hasContent ? (
        <Empty title="Nothing to summarise yet">This chapter has no definitions or reference tables marked in its lessons yet.</Empty>
      ) : secs.map((s) => {
        const sb = bySection[s.id] || [];
        if (sb.length === 0) return null;
        return (
          <section key={s.id}>
            <h3>{s.title}</h3>
            {sb.map((b) => {
              if (b.block_type === 'objectives') {
                return (
                  <ul key={b.id} className="cs-obj">
                    {(b.content.items || []).map((it, i) => <li key={i}>{it}</li>)}
                  </ul>
                );
              }
              if (b.block_type === 'definition') {
                return (
                  <div key={b.id} className="cs-def">
                    <b>{b.content.label || 'Definition'}</b>
                    {b.content.text}
                  </div>
                );
              }
              if (b.block_type === 'table') {
                return (
                  <div key={b.id} className="tablewrap">
                    <table className="lt">
                      <thead><tr>{(b.content.headers || []).map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
                      <tbody>{(b.content.rows || []).map((r, i) => <tr key={i}>{r.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody>
                    </table>
                  </div>
                );
              }
              return null;
            })}
          </section>
        );
      })}
    </div>
  );
}
