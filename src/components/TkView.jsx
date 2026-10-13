import { useEffect, useRef, useState } from 'react';
import { ev, fontCss, parseGeometry } from '../lib/tkTree.js';

// Draws the widget tree produced by the Python tkinter stand-in, and sends user actions back as events.

const ANCHOR = { n: 'flex-start', s: 'flex-end', e: 'flex-end', w: 'flex-start', center: 'center', nw: 'flex-start', ne: 'flex-end', sw: 'flex-start', se: 'flex-end' };
const px = (v) => (typeof v === 'number' ? `${v}px` : v);

function css(node) {
  const s = node.style || {};
  const o = {};
  if (s.bg) o.background = s.bg;
  if (s.fg) o.color = s.fg;
  Object.assign(o, fontCss(s.font));
  if (s.bd || s.relief) {
    const w = Number(s.bd ?? 1) || (s.relief && s.relief !== 'flat' ? 2 : 0);
    if (w) o.border = `${w}px ${s.relief === 'solid' ? 'solid' : s.relief === 'sunken' ? 'inset' : s.relief === 'groove' ? 'groove' : s.relief === 'ridge' ? 'ridge' : 'outset'} #888`;
  }
  const pad = (v) => (Array.isArray(v) ? v.map(px).join(' ') : px(v));
  if (s.padx !== undefined || s.pady !== undefined) o.padding = `${pad(s.pady ?? 0)} ${pad(s.padx ?? 0)}`;
  const k = node.kind;
  const chars = k === 'label' || k === 'button' || k === 'entry' || k === 'text' || k === 'listbox' || k === 'checkbutton' || k === 'radiobutton';
  if (s.width !== undefined && typeof s.width === 'number') o.width = chars ? `calc(${s.width}ch + 16px)` : `${s.width}px`;
  if (s.height !== undefined && typeof s.height === 'number') o.height = k === 'text' || k === 'listbox' ? `${s.height * 1.5 + 0.8}em` : chars ? `${s.height * 1.6}em` : `${s.height}px`;
  if (s.justify) o.textAlign = s.justify;
  if (s.wraplength) o.maxWidth = `${s.wraplength}px`;
  if (s.anchor && (k === 'label' || k === 'button')) { o.display = 'flex'; o.justifyContent = ANCHOR[s.anchor] || 'center'; }
  return o;
}

function useSynced(prop) {
  const [v, setV] = useState(prop);
  const last = useRef(prop);
  useEffect(() => { if (prop !== last.current) { last.current = prop; setV(prop); } }, [prop]);
  return [v, (x) => { last.current = x; setV(x); }];
}

function Entry({ n, send }) {
  const [v, set] = useSynced(n.props.value);
  return <input className="tk-entry" style={css(n)} type={n.props.show ? 'password' : 'text'} value={v} disabled={!n.props.enabled}
    onChange={(e) => { set(e.target.value); send(ev.input(n.id, e.target.value)); }}
    onKeyDown={(e) => send(ev.key(n.id, e.key === 'Enter' ? 'Return' : e.key, e.key.length === 1 ? e.key : ''))} />;
}
function TextArea({ n, send }) {
  const [v, set] = useSynced(n.props.value);
  return <textarea className="tk-text" style={css(n)} value={v} disabled={!n.props.enabled} onChange={(e) => { set(e.target.value); send(ev.input(n.id, e.target.value)); }} />;
}

function CanvasView({ n, send }) {
  const w = n.style.width || 200, h = n.style.height || 150;
  const o = (i, k, d) => i.opts[k] ?? d;
  return (
    <svg className="tk-canvas" width={w} height={h} style={{ background: n.style.bg || '#fff' }} role="img" aria-label="Canvas drawing"
      onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); send(ev.mouse(n.id, Math.round(e.clientX - r.left), Math.round(e.clientY - r.top))); }}>
      {n.props.items.map((i) => {
        const [a, b, c, d] = i.coords;
        const fill = o(i, 'fill', i.type === 'line' ? '#000' : 'none'), stroke = o(i, 'outline', '#000'), sw = o(i, 'width', 1);
        if (i.type === 'rect') return <rect key={i.id} x={Math.min(a, c)} y={Math.min(b, d)} width={Math.abs(c - a)} height={Math.abs(d - b)} fill={fill} stroke={o(i, 'outline', '#000')} strokeWidth={sw} />;
        if (i.type === 'oval') return <ellipse key={i.id} cx={(a + c) / 2} cy={(b + d) / 2} rx={Math.abs(c - a) / 2} ry={Math.abs(d - b) / 2} fill={fill} stroke={stroke} strokeWidth={sw} />;
        if (i.type === 'line') { const pts = []; for (let k = 0; k < i.coords.length; k += 2) pts.push(`${i.coords[k]},${i.coords[k + 1]}`); return <polyline key={i.id} points={pts.join(' ')} fill="none" stroke={fill} strokeWidth={sw} />; }
        if (i.type === 'polygon') { const pts = []; for (let k = 0; k < i.coords.length; k += 2) pts.push(`${i.coords[k]},${i.coords[k + 1]}`); return <polygon key={i.id} points={pts.join(' ')} fill={fill} stroke={stroke} strokeWidth={sw} />; }
        if (i.type === 'text') return <text key={i.id} x={a} y={b} fill={o(i, 'fill', '#000')} textAnchor="middle" dominantBaseline="middle" style={fontCss(o(i, 'font', null))}>{String(o(i, 'text', ''))}</text>;
        if (i.type === 'arc') return <ellipse key={i.id} cx={(a + c) / 2} cy={(b + d) / 2} rx={Math.abs(c - a) / 2} ry={Math.abs(d - b) / 2} fill="none" stroke={stroke} strokeWidth={sw} strokeDasharray="4 3" />;
        return null;
      })}
    </svg>
  );
}

function Widget({ n, send }) {
  const p = n.props;
  const st = css(n);
  const bound = (seqs) => n.binds.some((b) => seqs.includes(b));
  const mouse = bound(['<Button-1>', '<ButtonPress-1>', '<1>']) && n.kind !== 'canvas'
    ? { onClick: (e) => send(ev.mouse(n.id, Math.round(e.nativeEvent.offsetX), Math.round(e.nativeEvent.offsetY))) } : {};
  const dbl = bound(['<Double-Button-1>', '<Double-1>']) ? { onDoubleClick: (e) => send(ev.mouse(n.id, Math.round(e.nativeEvent.offsetX), Math.round(e.nativeEvent.offsetY), 2)) } : {};
  switch (n.kind) {
    case 'label': return <span className="tk-label" style={st} {...mouse} {...dbl}>{p.text}</span>;
    case 'button': return <button type="button" className="tk-btn" style={st} disabled={!p.enabled} onClick={() => send(ev.click(n.id))}>{p.text}</button>;
    case 'entry': return <Entry n={n} send={send} />;
    case 'text': return <TextArea n={n} send={send} />;
    case 'checkbutton': return <label className="tk-check" style={st}><input type="checkbox" checked={p.checked} disabled={!p.enabled} onChange={(e) => send(ev.change(n.id, e.target.checked))} /> {p.text}</label>;
    case 'radiobutton': return <label className="tk-check" style={st}><input type="radio" name={p.group} checked={p.checked} disabled={!p.enabled} onChange={() => send(ev.change(n.id, true))} /> {p.text}</label>;
    case 'scale': return <input className="tk-scale" type="range" style={{ ...st, ...(p.orient === 'vertical' ? { writingMode: 'vertical-lr', direction: 'rtl', height: st.height || '120px' } : {}) }} min={p.min} max={p.max} step={p.step || 1} value={p.value} aria-label="Scale" onChange={(e) => send(ev.change(n.id, Number(e.target.value)))} />;
    case 'listbox': return (
      <ul className="tk-list" style={st} role="listbox" aria-multiselectable={p.mode === 'multiple' || p.mode === 'extended'}>
        {p.items.map((it, i) => <li key={i} role="option" aria-selected={p.selected.includes(i)} className={p.selected.includes(i) ? 'sel' : ''} tabIndex={0}
          onClick={() => send(ev.change(n.id, p.mode === 'multiple' ? (p.selected.includes(i) ? p.selected.filter((x) => x !== i) : [...p.selected, i]) : [i]))}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') send(ev.change(n.id, [i])); }}>{it}</li>)}
      </ul>);
    case 'combobox': return <select className="tk-entry" style={st} value={p.value} aria-label="Choose" onChange={(e) => send(ev.change(n.id, e.target.value))}>{!p.values.includes(p.value) && <option value={p.value}>{p.value}</option>}{p.values.map((v) => <option key={v}>{v}</option>)}</select>;
    case 'canvas': return <CanvasView n={n} send={send} />;
    case 'separator': return <hr className="tk-sep" />;
    case 'progress': return <progress value={p.value} max={p.max} />;
    default: return null;
  }
}

// Place pack / grid / place children inside a container.
function Children({ node, send }) {
  const kids = node.children.filter((c) => c.geo && c.kind !== 'toplevel');
  if (!kids.length) return null;
  const mgr = kids[0].geo.m;
  const pad = (o) => { const f = (v) => (Array.isArray(v) ? v.map(px).join(' ') : px(v)); return o.padx !== undefined || o.pady !== undefined ? { margin: `${f(o.pady ?? 0)} ${f(o.padx ?? 0)}` } : {}; };
  const sendBind = (n) => ({ onKeyDown: n.binds.some((b) => b === '<Key>' || b === '<KeyPress>') ? (e) => send(ev.key(n.id, e.key, e.key.length === 1 ? e.key : '')) : undefined });

  if (mgr === 'grid') {
    const maxCol = Math.max(...kids.map((k) => (k.geo.o.column || 0) + (k.geo.o.columnspan || 1)));
    const cols = Array.from({ length: maxCol }, (_, i) => (node.cols[String(i)] ? 'minmax(0,1fr)' : 'auto')).join(' ');
    const rowsN = Math.max(...kids.map((k) => (k.geo.o.row || 0) + (k.geo.o.rowspan || 1)));
    const rows = Array.from({ length: rowsN }, (_, i) => (node.rows[String(i)] ? 'minmax(0,1fr)' : 'auto')).join(' ');
    return (
      <div className="tk-grid" style={{ display: 'grid', gridTemplateColumns: cols, gridTemplateRows: rows }}>
        {kids.map((k) => {
          const o = k.geo.o, sticky = String(o.sticky || '');
          const st = { gridColumn: `${(o.column || 0) + 1} / span ${o.columnspan || 1}`, gridRow: `${(o.row || 0) + 1} / span ${o.rowspan || 1}`, ...pad(o),
            justifySelf: sticky.includes('e') && sticky.includes('w') ? 'stretch' : sticky.includes('e') ? 'end' : sticky.includes('w') ? 'start' : 'center',
            alignSelf: sticky.includes('n') && sticky.includes('s') ? 'stretch' : sticky.includes('s') ? 'end' : sticky.includes('n') ? 'start' : 'center' };
          return <div key={k.id} style={st}><Node n={k} send={send} /></div>;
        })}
      </div>);
  }
  if (mgr === 'place') {
    return (
      <div className="tk-place" style={{ position: 'relative', minHeight: node.style.height ? undefined : '100%', width: '100%', height: '100%' }}>
        {kids.map((k) => {
          const o = k.geo.o;
          const t = { nw: '0,0', n: '-50%,0', ne: '-100%,0', w: '0,-50%', center: '-50%,-50%', e: '-100%,-50%', sw: '0,-100%', s: '-50%,-100%', se: '-100%,-100%' }[o.anchor || 'nw'] || '0,0';
          const st = { position: 'absolute', left: o.relx !== undefined ? `${o.relx * 100}%` : px(o.x || 0), top: o.rely !== undefined ? `${o.rely * 100}%` : px(o.y || 0),
            width: o.width !== undefined ? px(o.width) : undefined, height: o.height !== undefined ? px(o.height) : undefined, transform: `translate(${t.split(',')[0]},${t.split(',')[1]})` };
          return <div key={k.id} style={st}><Node n={k} send={send} /></div>;
        })}
      </div>);
  }
  // pack: consecutive left/right children form a row; top/bottom stack in a column
  const groups = [];
  kids.forEach((k) => {
    const side = k.geo.o.side || 'top', horiz = side === 'left' || side === 'right';
    const g = groups[groups.length - 1];
    if (g && g.horiz === horiz && horiz) g.items.push(k); else groups.push({ horiz, items: [k] });
  });
  const firstBottom = kids.findIndex((k) => k.geo.o.side === 'bottom');
  return (
    <div className="tk-pack" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '100%' }}>
      {groups.map((g, gi) => {
        const wrap = (k, row) => {
          const o = k.geo.o, fill = o.fill || 'none', side = o.side || 'top';
          const st = { ...pad(o), flex: o.expand ? '1 1 auto' : '0 0 auto' };
          if (row) { if (fill === 'y' || fill === 'both') st.alignSelf = 'stretch'; if (side === 'right') st.order = 1; }
          else { if (fill === 'x' || fill === 'both') st.alignSelf = 'stretch'; else if (o.anchor) st.alignSelf = ANCHOR[o.anchor]; if (o.expand) st.display = 'flex'; }
          if (fill !== 'none' && o.expand) { st.display = 'flex'; st.flexDirection = 'column'; st.justifyContent = 'stretch'; }
          return <div key={k.id} style={st} {...sendBind(k)}><Node n={k} send={send} /></div>;
        };
        const top = kids.indexOf(g.items[0]) === firstBottom ? { marginTop: 'auto' } : {};
        if (!g.horiz) return wrap(g.items[0], false) && <div key={gi} style={{ display: 'contents' }}>{[g.items[0]].map((k) => <div key={k.id} style={{ ...top, alignSelf: k.geo.o.fill === 'x' || k.geo.o.fill === 'both' ? 'stretch' : 'center', display: 'flex', justifyContent: 'center', flex: k.geo.o.expand ? '1 1 auto' : '0 0 auto', ...pad(k.geo.o) }}><Node n={k} send={send} /></div>)}</div>;
        const left = g.items.filter((k) => (k.geo.o.side || 'left') === 'left'), right = g.items.filter((k) => k.geo.o.side === 'right');
        return (<div key={gi} style={{ display: 'flex', width: '100%', gap: 0, ...top }}>{left.map((k) => wrap(k, true))}{right.length > 0 && <div style={{ marginLeft: 'auto', display: 'flex' }}>{right.map((k) => wrap(k, true))}</div>}</div>);
      })}
    </div>
  );
}

function Node({ n, send }) {
  if (n.kind === 'frame' || n.kind === 'labelframe') {
    return (
      <div className={`tk-frame ${n.kind}`} style={css(n)} role={n.kind === 'labelframe' ? 'group' : undefined} aria-label={n.props.text}>
        {n.kind === 'labelframe' && <span className="tk-legend">{n.props.text}</span>}
        <Children node={n} send={send} />
      </div>);
  }
  return <Widget n={n} send={send} />;
}

function WindowFrame({ n, send, root }) {
  const size = parseGeometry(n.props.geometry);
  const style = size ? { width: size.w, height: size.h } : { minWidth: 260, minHeight: 100 };
  return (
    <div className="tk-window" role="dialog" aria-label={n.props.title}>
      <div className="tk-titlebar"><span>{n.props.title || 'tk'}</span><button type="button" aria-label="Close window" onClick={() => send(ev.close(n.id))}>×</button></div>
      <div className="tk-body" style={{ ...style, background: n.style.bg || undefined }} tabIndex={0}
        onKeyDown={(e) => { if (e.target === e.currentTarget || !n.binds.length) send(ev.key(n.id, e.key === 'Enter' ? 'Return' : e.key, e.key.length === 1 ? e.key : '')); }}>
        <Children node={n} send={send} />
      </div>
    </div>
  );
}

export default function TkView({ state, send }) {
  const [shown, setShown] = useState([]);
  useEffect(() => { if (state?.alerts?.length) setShown((a) => [...a, ...state.alerts]); }, [state]);
  if (!state) return null;
  if (state.closed || !state.tree) return <p className="hint" role="status">The window was closed.</p>;
  const tops = state.tree.children.filter((c) => c.kind === 'toplevel');
  return (
    <div className="tkview">
      <WindowFrame n={state.tree} send={send} root />
      {tops.map((t) => <WindowFrame key={t.id} n={t} send={send} />)}
      {shown.length > 0 && (
        <div className="modal-back"><div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="tk-al">
          <h3 id="tk-al">{shown[0].title || 'Message'}</h3>
          <p>{shown[0].message}</p>{shown[0].note && <p className="hint">{shown[0].note}</p>}
          <div className="row end"><button className="btn btn-primary" autoFocus onClick={() => setShown((a) => a.slice(1))}>OK</button></div>
        </div></div>)}
    </div>
  );
}
