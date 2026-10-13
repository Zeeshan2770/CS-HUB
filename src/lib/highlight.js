// Tiny Python tokenizer for syntax colouring. Rendered as React text nodes (no HTML injection).
const KW = new Set('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield self'.split(' '));
const BUILTIN = new Set('print input len range int float str list dict set tuple open type isinstance super enumerate zip map filter sorted sum min max abs round bool'.split(' '));
const RE = /(#[^\n]*)|("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)|(\s+)|([\s\S])/g;

export function tokenize(code) {
  const out = [];
  const src = String(code ?? '');
  const re = new RegExp(RE.source, 'g');
  let m;
  while ((m = re.exec(src)) !== null) {
    if (m[1]) out.push({ t: 'c', s: m[1] });
    else if (m[2]) out.push({ t: 's', s: m[2] });
    else if (m[3]) out.push({ t: 'n', s: m[3] });
    else if (m[4]) out.push({ t: KW.has(m[4]) ? 'k' : BUILTIN.has(m[4]) ? 'b' : 'i', s: m[4] });
    else out.push({ t: 'p', s: m[0] });
  }
  return out;
}
