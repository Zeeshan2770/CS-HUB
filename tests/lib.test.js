import { describe, it, expect } from 'vitest';
import { truthTable, equivalent, parse } from '../src/lib/truth.js';
import { subnet, parseIPv4 } from '../src/lib/subnet.js';
import { parseCSV } from '../src/lib/csv.js';
import { parseQuestionCSV, extractExportJSON, validateExport, QUESTION_TEMPLATE } from '../src/lib/importers.js';
import { validateBlock, sectionReadiness, isSafeUrl, blockText } from '../src/lib/blocks.js';
import { tokenize } from '../src/lib/highlight.js';

describe('truth tables', () => {
  it('AND has 4 rows, 1 true, contingency', () => {
    const t = truthTable('p AND q');
    expect(t.rows).toHaveLength(4);
    expect(t.rows.filter((r) => r.result)).toHaveLength(1);
    expect(t.kind).toBe('contingency');
  });
  it('detects tautology and contradiction', () => {
    expect(truthTable('p OR !p').kind).toBe('tautology');
    expect(truthTable('p & ~p').kind).toBe('contradiction');
  });
  it('implication truth values', () => {
    const t = truthTable('p -> q');
    const f = t.rows.filter((r) => !r.result);
    expect(f).toHaveLength(1);
    expect(f[0].env).toEqual({ p: true, q: false });
  });
  it('De Morgan equivalence, and a non-equivalence with counterexample', () => {
    expect(equivalent('!(p & q)', '!p | !q').equal).toBe(true);
    const r = equivalent('p -> q', 'q -> p');
    expect(r.equal).toBe(false);
    expect(r.counterexample).toBeDefined();
  });
  it('precedence: NOT > AND > OR', () => {
    expect(truthTable('a | b & c').rows.filter((r) => r.result)).toHaveLength(5);
  });
  it('rejects garbage and does not eval', () => {
    expect(() => parse('alert(1)')).toThrow();
    expect(() => parse('p AND')).toThrow();
    expect(() => parse('(p AND q')).toThrow();
    expect(() => truthTable('a&b&c&d&e&f&g')).toThrow(/at most/);
  });
});

describe('subnet calculator', () => {
  it('192.168.1.10/24', () => {
    const s = subnet('192.168.1.10', 24);
    expect(s).toMatchObject({ mask: '255.255.255.0', network: '192.168.1.0', broadcast: '192.168.1.255', first: '192.168.1.1', last: '192.168.1.254', usable: 254, class: 'C', private: true });
  });
  it('10.1.2.3/8 and /30 /32', () => {
    expect(subnet('10.1.2.3', 8).network).toBe('10.0.0.0');
    expect(subnet('10.0.0.5', 30).usable).toBe(2);
    expect(subnet('8.8.8.8', 32).usable).toBe(1);
    expect(subnet('8.8.8.8', 0).mask).toBe('0.0.0.0');
    expect(subnet('8.8.8.8', 24).private).toBe(false);
    expect(subnet('172.16.5.4', 12).private).toBe(true);
  });
  it('validates input', () => {
    expect(() => parseIPv4('300.1.1.1')).toThrow();
    expect(() => parseIPv4('1.2.3')).toThrow();
    expect(() => subnet('1.2.3.4', 33)).toThrow();
  });
});

describe('csv + question import', () => {
  it('parses quoted commas and quotes', () => {
    expect(parseCSV('a,b\n"x,1","he said ""hi"""\n')).toEqual([['a', 'b'], ['x,1', 'he said "hi"']]);
  });
  it('template row is valid', () => {
    const r = parseQuestionCSV(QUESTION_TEMPLATE, ['chapter-1']);
    expect(r.errors).toEqual([]);
    expect(r.valid[0]).toMatchObject({ correct_answer: 1, options: ['Switch', 'Router', 'Hub', 'Repeater'] });
  });
  it('reports row-level errors', () => {
    const csv = 'chapter_id,question,option_a,option_b,option_c,correct,difficulty\n' +
      'chapter-1,Ok question?,a,b,,C,easy\n' +
      'chapter-9,Fine?,a,b,,B,hard\n' +
      'nope,Bad chapter?,a,b,,A,medium\n' +
      'chapter-1,x,a,a,,A,medium\n';
    const r = parseQuestionCSV(csv, ['chapter-1', 'chapter-9']);
    expect(r.valid).toHaveLength(1);
    expect(r.errors.map((e) => e.line)).toEqual([2, 4, 5]);
    expect(r.errors[0].message).toMatch(/no matching option/);
  });
  it('missing columns', () => {
    expect(parseQuestionCSV('foo,bar\n1,2').errors[0].message).toMatch(/Missing column/);
  });
});

describe('old-project export', () => {
  const good = {
    chapters: [{ id: 'c1' }], sections: [{ id: 's1', chapter_id: 'c1' }],
    lesson_blocks: [{ id: '11111111-1111-1111-1111-111111111111', section_id: 's1', block_type: 'paragraph', content: { text: 'hi' } }],
    questions: [{ id: '22222222-2222-2222-2222-222222222222', chapter_id: 'c1', options: ['a', 'b'], correct_answer: 1 }],
  };
  it('accepts raw JSON and the Supabase CSV wrapper', () => {
    const json = JSON.stringify(good);
    expect(extractExportJSON(json).chapters).toHaveLength(1);
    const csv = 'export\n"' + json.replace(/"/g, '""') + '"\n';
    expect(extractExportJSON(csv).sections[0].id).toBe('s1');
  });
  it('validates references', () => {
    expect(validateExport(good).errors).toEqual([]);
    const bad = { ...good, lesson_blocks: [{ ...good.lesson_blocks[0], section_id: 'zzz' }], questions: [{ ...good.questions[0], correct_answer: 7 }] };
    expect(validateExport(bad).errors.length).toBe(2);
    expect(validateExport({}).errors.length).toBeGreaterThan(0);
  });
});

describe('block validation', () => {
  it('flags malformed content without throwing', () => {
    expect(validateBlock('paragraph', null)).toHaveLength(1);
    expect(validateBlock('paragraph', { text: '  ' })).toHaveLength(1);
    expect(validateBlock('mystery', {})).toHaveLength(1);
    expect(validateBlock('table', { headers: ['a', 'b'], rows: [['1']] })).toHaveLength(1);
    expect(validateBlock('table', { headers: ['a'], rows: [['1']] })).toEqual([]);
    expect(validateBlock('objectives', { items: ['', ' '] })).toHaveLength(1);
    expect(validateBlock('image', { url: 'javascript:alert(1)', alt: 'x' })).toHaveLength(1);
    expect(validateBlock('image', { url: 'https://a.b/c.png', alt: 'x' })).toEqual([]);
  });
  it('url safety', () => {
    expect(isSafeUrl('http://x.y')).toBe(false);
    expect(isSafeUrl('data:text/html,<script>')).toBe(false);
    expect(isSafeUrl('https://x.y/z.png')).toBe(true);
  });
  it('readiness reports errors and warnings', () => {
    const r = sectionReadiness({ review_status: 'unreviewed' }, [{ block_type: 'paragraph', content: { text: '' } }]);
    expect(r.errors.length).toBe(1);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(sectionReadiness({ review_status: 'verified' }, []).errors[0]).toMatch(/no content/);
  });
  it('blockText tolerates junk', () => {
    expect(blockText('table', { headers: 'x', rows: null })).toBeTypeOf('string');
    expect(blockText('paragraph', undefined)).toBe('');
  });
});

describe('highlighter', () => {
  it('tokenizes and round-trips text exactly', () => {
    const src = 'def f(x):\n    return x + 1  # add\nprint("hi", \'a\', 3.5)\n';
    const toks = tokenize(src);
    expect(toks.map((t) => t.s).join('')).toBe(src);
    expect(toks.find((t) => t.s === 'def').t).toBe('k');
    expect(toks.find((t) => t.s === '# add').t).toBe('c');
    expect(toks.find((t) => t.s === '3.5').t).toBe('n');
  });
});

import { evaluateQuantifiers, quantifierSteps, parseDomain, parsePredicate } from '../src/lib/quantifiers.js';
import { truthTableSteps } from '../src/lib/truth.js';
import { reorder } from '../src/lib/reorder.js';

describe('quantifiers (Chapter 2: for all / there exists)', () => {
  it('textbook example: for all x, x > 0 over 1..5 is true; over -2..2 it is false with a counterexample', () => {
    expect(evaluateQuantifiers('x > 0', '1..5').forAll.value).toBe(true);
    const r = evaluateQuantifiers('x > 0', '-2..2');
    expect(r.forAll).toEqual({ value: false, counterexample: -2 });
    expect(r.exists).toEqual({ value: true, witness: 1 });
  });
  it('exists and negation rules agree', () => {
    const r = evaluateQuantifiers('x % 2 == 0', '1..9');
    expect(r.exists).toEqual({ value: true, witness: 2 });
    expect(r.forAll.value).toBe(false);
    expect(r.negation.notForAll).toBe(r.negation.existsNot);
    expect(r.negation.notExists).toBe(r.negation.forAllNot);
    const t = evaluateQuantifiers('x > 100', '1..9');
    expect(t.exists.value).toBe(false);
    expect(t.negation.notExists).toBe(true);
    expect(t.negation.forAllNot).toBe(true);
  });
  it('supports and/or/not, parentheses and helper predicates', () => {
    expect(evaluateQuantifiers('prime(x) AND odd(x)', '2,3,4,5').rows.filter((r) => r.value).map((r) => r.x)).toEqual([3, 5]);
    expect(evaluateQuantifiers('NOT (x < 3) && x <= 4', '1..6').rows.filter((r) => r.value).map((r) => r.x)).toEqual([3, 4]);
    expect(evaluateQuantifiers('x * x == 16 or x = 1', '-4,1,2,4').rows.map((r) => r.value)).toEqual([true, true, false, true]);
  });
  it('steps stop early on a counterexample or a witness, and cover the whole domain otherwise', () => {
    const a = quantifierSteps('x > 0', '1,2,-3,4', 'forAll');
    expect(a.at(-1).text).toMatch(/counterexample/);
    expect(a).toHaveLength(1 + 3);
    const b = quantifierSteps('x > 100', '1..3', 'exists');
    expect(b.at(-1).text).toMatch(/is false/);
    expect(b).toHaveLength(1 + 3 + 1);
    expect(quantifierSteps('x > 0', '1..3', 'forAll').at(-1).result).toBe(true);
  });
  it('rejects bad input with clear messages and never executes code', () => {
    expect(() => parsePredicate('alert(1)')).toThrow(/Unknown function/);
    expect(() => parsePredicate('y > 1')).toThrow(/Unknown name/);
    expect(() => parsePredicate('x >')).toThrow();
    expect(() => evaluateQuantifiers('x + 2', '1..3')).toThrow(/true or false/);
    expect(() => evaluateQuantifiers('1 / (x - 2) > 0', '1..3')).toThrow(/Division by zero/);
    expect(() => parseDomain('')).toThrow();
    expect(() => parseDomain('5..1')).toThrow();
    expect(() => parseDomain('a, b')).toThrow(/not a number/);
    expect(() => parseDomain('1..500')).toThrow(/at most/);
    expect(() => parsePredicate('x; process.exit()')).toThrow();
  });
});

describe('truth table steps', () => {
  it('one column per sub-expression, last column is the whole statement', () => {
    const t = truthTableSteps('(p -> q) & !q');
    expect(t.labels).toEqual(['p → q', '¬q', '(p → q) ∧ ¬q']);
    const row = t.rows.find((r) => r.env.p === false && r.env.q === false);
    expect(row.cells).toEqual([true, true, true]);
    expect(t.kind).toBe('contingency');
  });
  it('shows repeated sub-expressions once', () => {
    expect(truthTableSteps('(p & q) | (p & q)').labels).toEqual(['p ∧ q', '(p ∧ q) ∨ (p ∧ q)']);
    expect(truthTableSteps('p | !p').kind).toBe('tautology');
  });
});

describe('reorder (drag and drop)', () => {
  it('moves items and ignores impossible moves', () => {
    expect(reorder(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(reorder(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    const l = ['a', 'b'];
    expect(reorder(l, 1, 1)).toBe(l);
    expect(reorder(l, 5, 0)).toBe(l);
    expect(reorder(l, 0, -1)).toBe(l);
    expect(l).toEqual(['a', 'b']); // original not mutated
  });
});

import { splitCards, latestWrong } from '../src/pages/Revision.jsx';
describe('revision queue helpers', () => {
  it('splits cards into due and upcoming by local date', () => {
    const cards = [{ question_id: 'a', due_date: '2026-10-01' }, { question_id: 'b', due_date: '2026-10-02' }, { question_id: 'c', due_date: '2026-10-05' }, { question_id: 'd', due_date: '2026-10-05' }];
    const r = splitCards(cards, '2026-10-02');
    expect(r.due.map((c) => c.question_id)).toEqual(['a', 'b']);
    expect(r.later).toEqual([['2026-10-05', 2]]);
  });
  it('a question needs revision only if its latest attempt was wrong', () => {
    const att = [{ question_id: 'q1', is_correct: true }, { question_id: 'q1', is_correct: false }, { question_id: 'q2', is_correct: false }];
    expect(latestWrong(att)).toEqual(['q2']);
  });
});

import { parseKeyPoints, formatKeyPoints } from '../src/lib/written.js';
describe('written question key points', () => {
  it('parses one key point per line and round-trips', () => {
    const r = parseKeyPoints('forwards packets: forwards packets | routes packets\nconnects networks: network\n\n');
    expect(r.errors).toEqual([]);
    expect(r.points).toEqual([{ label: 'forwards packets', keywords: ['forwards packets', 'routes packets'] }, { label: 'connects networks', keywords: ['network'] }]);
    expect(parseKeyPoints(formatKeyPoints(r.points)).points).toEqual(r.points);
  });
  it('reports a clear message for each bad line', () => {
    const r = parseKeyPoints('no colon here\nlabel only:\n: no label\nok: fine');
    expect(r.points).toHaveLength(1);
    expect(r.errors).toHaveLength(3);
    expect(r.errors[0]).toMatch(/Line 1/);
    expect(parseKeyPoints(Array.from({ length: 13 }, (_, i) => `p${i}: k`).join('\n')).errors.at(-1)).toMatch(/at most 12/);
    expect(parseKeyPoints('').points).toEqual([]);
  });
});
