import { Link } from 'react-router-dom';
import { BLOCK_TYPES, isSafeUrl, validateBlock } from '../lib/blocks.js';
import { tokenize } from '../lib/highlight.js';
import { useToast } from '../lib/toast.jsx';

export function Code({ code }) {
  return (
    <pre className="code" tabIndex={0}><code>
      {tokenize(code).map((t, i) => (t.t === 'p' || t.t === 'i' ? t.s : <span key={i} className={`tk-${t.t}`}>{t.s}</span>))}
    </code></pre>
  );
}

function CodeCard({ label, code, tone }) {
  const toast = useToast();
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); toast('Code copied', 'success'); } catch { toast('Copy is blocked in this browser', 'error'); }
  };
  return (
    <figure className={`codecard ${tone || ''}`}>
      <figcaption><span>{label}</span><button className="linkbtn" onClick={copy}>Copy</button></figcaption>
      <Code code={code} />
    </figure>
  );
}

const Pg = ({ n }) => (n ? <span className="pg" title="Page in the source PDF">p. {n}</span> : null);

function Body({ b, showErrors }) {
  const c = b.content;
  switch (b.block_type) {
    case 'objectives':
      return (<div className="obj"><h3>Learning objectives <Pg n={b.source_page} /></h3><ul>{c.items.filter(Boolean).map((x, i) => <li key={i}>{x}</li>)}</ul></div>);
    case 'definition':
      return (<div className="def"><span className="tag">{c.label}</span><p>{c.text} <Pg n={b.source_page} /></p></div>);
    case 'paragraph':
      return <p className="para">{c.text} <Pg n={b.source_page} /></p>;
    case 'subheading':
      return <h3 className="sub">{c.text}</h3>;
    case 'tidbit':
      return (<aside className="note"><strong>{c.label}</strong><p>{c.text}</p></aside>);
    case 'code_single':
      return (
        <div className="codeblock">
          <CodeCard label={c.label || 'Code'} code={c.code} />
          {c.runnable === false ? (
            <p className="hint">{c.note || 'Read-only: this code needs desktop Python (for example Tkinter), so it cannot run in the browser lab. Copy it and run it on your own computer.'}</p>
          ) : (
            <>
              {c.note && <p className="hint">{c.note}</p>}
              <Link className="btn btn-sm" to="/labs/python" state={{ code: c.code, title: c.label }}>Open in Python lab</Link>
            </>
          )}
        </div>
      );
    case 'code_pair':
      return (
        <div className="codeblock">
          <div className="pair">
            <CodeCard label={c.label_original || 'As printed'} code={c.code_original} tone="orig" />
            <CodeCard label={c.label_fixed || 'Corrected'} code={c.code_fixed} tone="fixed" />
          </div>
          {c.ocr_note && <p className="hint">{c.ocr_note}</p>}
          <Link className="btn btn-sm" to="/labs/python" state={{ code: c.code_fixed, title: c.label_fixed }}>Open corrected code in Python lab</Link>
        </div>
      );
    case 'short_question':
      return (<details className="qa"><summary>{c.question}</summary><div className="ans">{c.answer}</div></details>);
    case 'long_question':
      return c.answer ? (
        <details className="qa long"><summary>{c.question}</summary><div className="ans">{c.answer}</div></details>
      ) : (<div className="qa long"><p><strong>Practice.</strong> {c.question}</p><p className="hint">Write your own full answer, then compare it with your notes or ask your teacher.</p></div>);
    case 'table':
      return (
        <div className="tablewrap"><table className="lt">
          <thead><tr>{c.headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
          <tbody>{c.rows.map((r, i) => <tr key={i}>{r.map((x, j) => <td key={j}>{x}</td>)}</tr>)}</tbody>
        </table></div>
      );
    case 'image':
      return isSafeUrl(c.url) ? (
        <figure className="fig"><img src={c.url} alt={c.alt || ''} loading="lazy" />{c.caption && <figcaption>{c.caption}</figcaption>}</figure>
      ) : null;
    default:
      return null;
  }
}

export default function BlockRenderer({ blocks, showErrors = false }) {
  return (
    <div className="lesson-body">
      {blocks.map((b, i) => {
        const errs = validateBlock(b.block_type, b.content);
        if (errs.length) {
          return showErrors ? (
            <div key={b.id || i} className="blockerr" role="alert">
              {BLOCK_TYPES[b.block_type]?.label || b.block_type}: {errs.join('; ')}
            </div>
          ) : null;
        }
        return <Body key={b.id || i} b={b} />;
      })}
    </div>
  );
}
