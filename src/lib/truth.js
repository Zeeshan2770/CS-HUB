// Propositional-logic parser and truth-table generator. Uses a small recursive-descent parser, never dynamic code execution.
// Operators (any spelling): NOT ! ~ ¬ | AND & ∧ | OR | ∨ | XOR ^ ⊕ | -> ⇒ (implies) | <-> ⇔ (iff)
const MAX_VARS = 6;

function lex(src) {
  const s = String(src)
    .replace(/<->|<=>|⇔|↔/g, ' IFF ')
    .replace(/->|=>|⇒|→/g, ' IMP ')
    .replace(/&&|&|∧/g, ' AND ')
    .replace(/\|\||\||∨/g, ' OR ')
    .replace(/⊕|\^/g, ' XOR ')
    .replace(/!|~|¬/g, ' NOT ')
    .replace(/\(/g, ' ( ')
    .replace(/\)/g, ' ) ');
  return s.split(/\s+/).filter(Boolean).map((w) => {
    const u = w.toUpperCase();
    if (['AND', 'OR', 'NOT', 'XOR', 'IMP', 'IFF'].includes(u)) return { k: u };
    if (w === '(' || w === ')') return { k: w };
    if (/^[A-Za-z][A-Za-z0-9_]*$/.test(w)) return { k: 'VAR', v: w };
    if (w === '1' || w === '0') return { k: 'CONST', v: w === '1' };
    throw new Error(`Unexpected symbol "${w}"`);
  });
}

export function parse(src) {
  const toks = lex(src);
  if (!toks.length) throw new Error('Enter an expression');
  let i = 0;
  const peek = () => toks[i]?.k;
  const take = () => toks[i++];
  // precedence (low to high): IFF, IMP (right-assoc), OR/XOR, AND, NOT
  function iff() { let l = imp(); while (peek() === 'IFF') { take(); l = { op: 'IFF', l, r: imp() }; } return l; }
  function imp() { const l = or(); if (peek() === 'IMP') { take(); return { op: 'IMP', l, r: imp() }; } return l; }
  function or() { let l = and(); while (peek() === 'OR' || peek() === 'XOR') { const o = take().k; l = { op: o, l, r: and() }; } return l; }
  function and() { let l = not(); while (peek() === 'AND') { take(); l = { op: 'AND', l, r: not() }; } return l; }
  function not() { if (peek() === 'NOT') { take(); return { op: 'NOT', x: not() }; } return atom(); }
  function atom() {
    const t = take();
    if (!t) throw new Error('Expression ended unexpectedly');
    if (t.k === 'VAR') return { op: 'VAR', v: t.v };
    if (t.k === 'CONST') return { op: 'CONST', v: t.v };
    if (t.k === '(') { const e = iff(); if (take()?.k !== ')') throw new Error('Missing closing parenthesis'); return e; }
    throw new Error(`Unexpected "${t.k}"`);
  }
  const ast = iff();
  if (i < toks.length) throw new Error(`Unexpected "${toks[i].v ?? toks[i].k}"`);
  return ast;
}

export function evaluate(n, env) {
  switch (n.op) {
    case 'VAR': return env[n.v];
    case 'CONST': return n.v;
    case 'NOT': return !evaluate(n.x, env);
    case 'AND': return evaluate(n.l, env) && evaluate(n.r, env);
    case 'OR': return evaluate(n.l, env) || evaluate(n.r, env);
    case 'XOR': return evaluate(n.l, env) !== evaluate(n.r, env);
    case 'IMP': return !evaluate(n.l, env) || evaluate(n.r, env);
    case 'IFF': return evaluate(n.l, env) === evaluate(n.r, env);
    default: throw new Error('bad node');
  }
}

export function variables(n, set = new Set()) {
  if (n.op === 'VAR') set.add(n.v);
  else { if (n.l) variables(n.l, set); if (n.r) variables(n.r, set); if (n.x) variables(n.x, set); }
  return set;
}

function envs(vars) {
  const out = [];
  for (let m = 0; m < 1 << vars.length; m++) {
    const env = {};
    vars.forEach((v, idx) => { env[v] = Boolean((m >> (vars.length - 1 - idx)) & 1); });
    out.push(env);
  }
  return out;
}

export function truthTable(src) {
  const ast = parse(src);
  const vars = [...variables(ast)].sort();
  if (vars.length > MAX_VARS) throw new Error(`Use at most ${MAX_VARS} variables`);
  const rows = envs(vars).map((env) => ({ env, result: evaluate(ast, env) }));
  const trues = rows.filter((r) => r.result).length;
  const kind = trues === rows.length ? 'tautology' : trues === 0 ? 'contradiction' : 'contingency';
  return { vars, rows, kind };
}

export function equivalent(a, b) {
  const A = parse(a), B = parse(b);
  const vars = [...new Set([...variables(A), ...variables(B)])].sort();
  if (vars.length > MAX_VARS) throw new Error(`Use at most ${MAX_VARS} variables`);
  for (const env of envs(vars)) if (evaluate(A, env) !== evaluate(B, env)) return { equal: false, counterexample: env };
  return { equal: true };
}

// ----- step-by-step evaluation: one column per sub-expression, in the order Python/maths would evaluate it -----
export function show(n) {
  switch (n.op) {
    case 'VAR': return n.v;
    case 'CONST': return n.v ? '1' : '0';
    case 'NOT': return `¬${n.x.op === 'VAR' || n.x.op === 'CONST' || n.x.op === 'NOT' ? show(n.x) : `(${show(n.x)})`}`;
    default: {
      const sym = { AND: '∧', OR: '∨', XOR: '⊕', IMP: '→', IFF: '↔' }[n.op];
      const w = (m) => (m.op === 'VAR' || m.op === 'CONST' || m.op === 'NOT' ? show(m) : `(${show(m)})`);
      return `${w(n.l)} ${sym} ${w(n.r)}`;
    }
  }
}

function postOrder(n, out) {
  if (n.l) postOrder(n.l, out);
  if (n.r) postOrder(n.r, out);
  if (n.x) postOrder(n.x, out);
  if (n.op !== 'VAR' && n.op !== 'CONST') out.push(n);
  return out;
}

export function truthTableSteps(src) {
  const ast = parse(src);
  const vars = [...variables(ast)].sort();
  if (vars.length > MAX_VARS) throw new Error(`Use at most ${MAX_VARS} variables`);
  const seen = new Set();
  const nodes = postOrder(ast, []).filter((n) => { const k = show(n); if (seen.has(k)) return false; seen.add(k); return true; });
  const cols = nodes.map((n) => ({ label: show(n), node: n }));
  const rows = envs(vars).map((env) => ({ env, cells: cols.map((c) => evaluate(c.node, env)) }));
  const last = rows.map((r) => r.cells[r.cells.length - 1] ?? evaluate(ast, r.env));
  const trues = last.filter(Boolean).length;
  return { vars, labels: cols.map((c) => c.label), rows, kind: trues === rows.length ? 'tautology' : trues === 0 ? 'contradiction' : 'contingency' };
}
