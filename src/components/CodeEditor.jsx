import { useRef } from 'react';

// A plain textarea with a line-number gutter. Tab inserts spaces; Esc then Tab leaves the field (keyboard users).
export default function CodeEditor({ value, onChange, label = 'Code', height = 380, mono = true }) {
  const gut = useRef(null);
  const esc = useRef(false);
  const lines = value.split('\n').length;
  const onKey = (e) => {
    if (e.key === 'Escape') { esc.current = true; return; }
    if (e.key === 'Tab' && !e.shiftKey && !esc.current) {
      e.preventDefault();
      const t = e.target, s = t.selectionStart;
      onChange(value.slice(0, s) + '    ' + value.slice(t.selectionEnd));
      requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = s + 4; });
    }
    if (e.key !== 'Tab' && e.key !== 'Shift') esc.current = false;
  };
  return (
    <div className="editor" style={{ height }}>
      <div className="gutter" ref={gut} aria-hidden="true">{Array.from({ length: lines }, (_, i) => <div key={i}>{i + 1}</div>)}</div>
      <textarea aria-label={label} spellCheck={false} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKey}
        onScroll={(e) => { if (gut.current) gut.current.scrollTop = e.target.scrollTop; }} />
    </div>
  );
}
