// The contract between the Python tkinter stand-in (worker) and the page that draws it.
// Events the page sends to Python:
export const ev = {
  click: (id) => ({ type: 'click', id }),
  input: (id, value) => ({ type: 'input', id, value }),
  change: (id, value) => ({ type: 'change', id, value }),
  mouse: (id, x, y, count = 1) => ({ type: 'mouse', id, x, y, num: 1, count }),
  key: (id, keysym, char = '') => ({ type: 'key', id, keysym, char }),
  close: (id) => ({ type: 'close', id }),
};

const KINDS = new Set(['tk', 'toplevel', 'frame', 'labelframe', 'label', 'button', 'checkbutton', 'radiobutton', 'entry', 'text', 'listbox', 'scale', 'combobox', 'canvas', 'separator', 'progress']);
const MANAGERS = new Set(['pack', 'grid', 'place']);

// Returns a list of problems (empty = the tree is well formed).
export function validateTree(n, path = 'root') {
  const errs = [];
  if (!n || typeof n !== 'object') return [`${path}: not an object`];
  if (!Number.isInteger(n.id)) errs.push(`${path}: id must be an integer`);
  if (!KINDS.has(n.kind)) errs.push(`${path}: unknown kind ${n.kind}`);
  if (typeof n.props !== 'object' || n.props === null) errs.push(`${path}: props missing`);
  if (n.geo !== null && n.geo !== undefined && !(MANAGERS.has(n.geo?.m) && typeof n.geo.o === 'object')) errs.push(`${path}: bad geometry`);
  if (!Array.isArray(n.binds)) errs.push(`${path}: binds must be a list`);
  if (!Array.isArray(n.children)) errs.push(`${path}: children must be a list`);
  else n.children.forEach((c, i) => errs.push(...validateTree(c, `${path}/${c?.kind ?? i}`)));
  return errs;
}

// "400x300" or "400x300+10+10" -> {w, h}
export function parseGeometry(g) {
  const m = /^(\d+)x(\d+)/.exec(String(g || ''));
  return m ? { w: Number(m[1]), h: Number(m[2]) } : null;
}

// Tk fonts: ("Arial", 14, "bold") or "Arial 14 bold" -> CSS
export function fontCss(f) {
  if (!f) return {};
  let family, size, rest = [];
  if (Array.isArray(f)) [family, size, ...rest] = f;
  else { const p = String(f).split(/\s+/); family = p[0]; size = p[1]; rest = p.slice(2); }
  const css = {};
  if (family) css.fontFamily = `"${String(family).replace(/"/g, '')}", system-ui, sans-serif`;
  const n = Number(size);
  if (Number.isFinite(n) && n !== 0) css.fontSize = n < 0 ? `${-n}px` : `${Math.round(n * 1.333)}px`;
  const flags = rest.flatMap((x) => String(x).split(/\s+/));
  if (flags.includes('bold')) css.fontWeight = 700;
  if (flags.includes('italic')) css.fontStyle = 'italic';
  if (flags.includes('underline')) css.textDecoration = 'underline';
  return css;
}
