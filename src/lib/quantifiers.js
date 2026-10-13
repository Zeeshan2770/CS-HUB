// Chapter 2 (predicate logic, quantifiers): evaluate "for all x" and "there exists x" over a small domain, step by step.
// A tiny safe expression language, no dynamic code execution.
//   numbers, the variable x, + - * / %, comparisons (== != < <= > >=), AND OR NOT (also && || !), parentheses,
//   and the predicates even(x) odd(x) prime(x)
const MAX_DOMAIN = 200;

function lex(src) {
  const t = [];
  const s = String(src);
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const two = s.slice(i, i + 2);
    if (['==', '!=', '<=', '>=', '&&', '||'].includes(two)) { t.push({ k: two }); i += 2; continue; }
    if ('+-*/%()<>,!'.includes(c)) { t.push({ k: c }); i++; continue; }
    if (c === '=') { t.push({ k: '==' }); i++; continue; }
    const num = /^\d+(\.\d+)?/.exec(s.slice(i));
    if (num) { t.push({ k: 'NUM', v: Number(num[0]) }); i += num[0].length; continue; }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
    if (id) {
      const u = id[0].toUpperCase();
      t.push(['AND', 'OR', 'NOT'].includes(u) ? { k: u } : { k: 'ID', v: id[0] });
      i += id[0].length; continue;
    }
    throw new Error(`Unexpected character "${c}"`);
  }
  return t;
}

const isPrime = (n) => { if (!Number.isInteger(n) || n < 2) return false; for (let d = 2; d * d <= n; d++) if (n % d === 0) return false; return true; };
const FUNCS = { even: (n) => Number.isInteger(n) && n % 2 === 0, odd: (n) => Number.isInteger(n) && Math.abs(n % 2) === 1, prime: isPrime };

export function parsePredicate(src, varName = 'x') {
  const toks = lex(src);
  if (!toks.length) throw new Error('Enter a statement about x, for example x > 0');
  let i = 0;
  const peek = () => toks[i]?.k;
  const take = () => toks[i++];
  const orE = () => { let l = andE(); while (peek() === 'OR' || peek() === '||') { take(); l = { op: 'or', l, r: andE() }; } return l; };
  const andE = () => { let l = notE(); while (peek() === 'AND' || peek() === '&&') { take(); l = { op: 'and', l, r: notE() }; } return l; };
  const notE = () => { if (peek() === 'NOT' || peek() === '!') { take(); return { op: 'not', x: notE() }; } return cmp(); };
  const cmp = () => {
    const l = add();
    if (['==', '!=', '<', '<=', '>', '>='].includes(peek())) { const o = take().k; return { op: o, l, r: add() }; }
    return l;
  };
  const add = () => { let l = mul(); while (peek() === '+' || peek() === '-') { const o = take().k; l = { op: o, l, r: mul() }; } return l; };
  const mul = () => { let l = un(); while (['*', '/', '%'].includes(peek())) { const o = take().k; l = { op: o, l, r: un() }; } return l; };
  const un = () => { if (peek() === '-') { take(); return { op: 'neg', x: un() }; } return prim(); };
  const prim = () => {
    const t = take();
    if (!t) throw new Error('The statement ended unexpectedly');
    if (t.k === 'NUM') return { op: 'num', v: t.v };
    if (t.k === 'ID') {
      if (peek() === '(') {
        if (!FUNCS[t.v]) throw new Error(`Unknown function "${t.v}". Use even, odd or prime.`);
        take(); const a = orE();
        if (take()?.k !== ')') throw new Error('Missing closing parenthesis');
        return { op: 'fn', name: t.v, x: a };
      }
      if (t.v !== varName) throw new Error(`Unknown name "${t.v}". Use the variable ${varName}.`);
      return { op: 'var' };
    }
    if (t.k === '(') { const e = orE(); if (take()?.k !== ')') throw new Error('Missing closing parenthesis'); return e; }
    throw new Error(`Unexpected "${t.k}"`);
  };
  const ast = orE();
  if (i < toks.length) throw new Error(`Unexpected "${toks[i].v ?? toks[i].k}"`);
  return ast;
}

function ev(n, x) {
  const num = (v) => { if (typeof v !== 'number') throw new Error('Expected a number here'); return v; };
  const bool = (v) => { if (typeof v !== 'boolean') throw new Error('Expected a true/false condition here (for example x > 2)'); return v; };
  switch (n.op) {
    case 'num': return n.v;
    case 'var': return x;
    case 'neg': return -num(ev(n.x, x));
    case '+': return num(ev(n.l, x)) + num(ev(n.r, x));
    case '-': return num(ev(n.l, x)) - num(ev(n.r, x));
    case '*': return num(ev(n.l, x)) * num(ev(n.r, x));
    case '/': { const d = num(ev(n.r, x)); if (d === 0) throw new Error(`Division by zero when x = ${x}`); return num(ev(n.l, x)) / d; }
    case '%': { const d = num(ev(n.r, x)); if (d === 0) throw new Error(`Division by zero when x = ${x}`); return num(ev(n.l, x)) % d; }
    case '==': return ev(n.l, x) === ev(n.r, x);
    case '!=': return ev(n.l, x) !== ev(n.r, x);
    case '<': return num(ev(n.l, x)) < num(ev(n.r, x));
    case '<=': return num(ev(n.l, x)) <= num(ev(n.r, x));
    case '>': return num(ev(n.l, x)) > num(ev(n.r, x));
    case '>=': return num(ev(n.l, x)) >= num(ev(n.r, x));
    case 'and': return bool(ev(n.l, x)) && bool(ev(n.r, x));
    case 'or': return bool(ev(n.l, x)) || bool(ev(n.r, x));
    case 'not': return !bool(ev(n.x, x));
    case 'fn': return FUNCS[n.name](num(ev(n.x, x)));
    default: throw new Error('bad node');
  }
}

export function parseDomain(src) {
  const s = String(src).trim();
  if (!s) throw new Error('Enter the domain, for example 1..10 or 2, 4, 6');
  const range = /^(-?\d+)\s*\.\.\s*(-?\d+)$/.exec(s);
  let out;
  if (range) {
    const a = Number(range[1]), b = Number(range[2]);
    if (b < a) throw new Error('A range must go from a smaller to a larger number, like 1..10');
    out = Array.from({ length: b - a + 1 }, (_, k) => a + k);
  } else {
    out = s.split(',').map((p) => p.trim()).filter(Boolean).map((p) => { const n = Number(p); if (!Number.isFinite(n)) throw new Error(`"${p}" is not a number`); return n; });
  }
  if (!out.length) throw new Error('The domain is empty');
  if (out.length > MAX_DOMAIN) throw new Error(`Use at most ${MAX_DOMAIN} values`);
  return out;
}

// Evaluate a predicate P(x) for every element, then derive the quantified statements.
export function evaluateQuantifiers(predicate, domainSrc) {
  const ast = parsePredicate(predicate);
  const domain = parseDomain(domainSrc);
  const rows = domain.map((x) => ({ x, value: ev(ast, x) }));
  if (rows.some((r) => typeof r.value !== 'boolean')) throw new Error('The statement must be true or false for each x (for example x > 2, not x + 2)');
  const counter = rows.find((r) => !r.value);
  const witness = rows.find((r) => r.value);
  const negRows = rows.map((r) => ({ x: r.x, value: !r.value }));
  return {
    rows,
    forAll: { value: !counter, counterexample: counter?.x },
    exists: { value: Boolean(witness), witness: witness?.x },
    // The textbook's negation rules: not(for all x P) is the same as (exists x not P), and not(exists x P) is the same as (for all x not P)
    negation: {
      notForAll: !rows.every((r) => r.value),
      existsNot: negRows.some((r) => r.value),
      notExists: !rows.some((r) => r.value),
      forAllNot: negRows.every((r) => r.value),
    },
  };
}

// The same evaluation as a list of steps a learner can walk through. Stops early where logic allows.
export function quantifierSteps(predicate, domainSrc, quantifier) {
  const { rows } = evaluateQuantifiers(predicate, domainSrc);
  const steps = [];
  const isAll = quantifier === 'forAll';
  const sym = isAll ? '∀' : '∃';
  steps.push({ text: isAll ? `Check "for all x, P(x)": it is true only if P(x) holds for every value in the domain. One failure is enough to make it false.` : `Check "there exists x, P(x)": it is true as soon as P(x) holds for one value. It is false only if every value fails.`, upto: 0, result: null });
  for (let k = 0; k < rows.length; k++) {
    const r = rows[k];
    const stop = isAll ? !r.value : r.value;
    steps.push({ text: `Try x = ${r.x}: P(${r.x}) is ${r.value ? 'true' : 'false'}.${stop ? (isAll ? ` Found a counterexample, so ${sym}x P(x) is false. We can stop.` : ` Found a witness, so ${sym}x P(x) is true. We can stop.`) : ''}`, upto: k + 1, result: stop ? !isAll : null, stop });
    if (stop) return steps;
  }
  steps.push({ text: isAll ? `Every value made P(x) true, so ${sym}x P(x) is true.` : `No value made P(x) true, so ${sym}x P(x) is false.`, upto: rows.length, result: isAll, stop: true });
  return steps;
}
