import { parseCSV } from './csv.js';
import { BLOCK_TYPES, validateBlock } from './blocks.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const QUESTION_TEMPLATE =
  'chapter_id,section_id,question,option_a,option_b,option_c,option_d,correct,explanation,difficulty\n' +
  'chapter-1,,"Which device connects different networks?",Switch,Router,Hub,Repeater,B,"A router forwards packets between networks.",easy\n';

// Bulk question import. Returns { valid: [rows ready to insert], errors: [{line, message}] }
export function parseQuestionCSV(text, knownChapterIds = null) {
  const rows = parseCSV(text);
  const errors = [];
  const valid = [];
  if (!rows.length) return { valid, errors: [{ line: 1, message: 'File is empty' }] };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const need = ['chapter_id', 'question', 'option_a', 'option_b', 'correct'];
  const miss = need.filter((h) => !head.includes(h));
  if (miss.length) return { valid, errors: [{ line: 1, message: `Missing column(s): ${miss.join(', ')}` }] };
  const col = (r, n) => (r[head.indexOf(n)] ?? '').trim();
  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    const opts = ['option_a', 'option_b', 'option_c', 'option_d', 'option_e', 'option_f'].map((n) => col(r, n)).filter((x) => x !== '');
    const letter = col(r, 'correct').toUpperCase();
    const ci = 'ABCDEF'.indexOf(letter);
    const diff = (col(r, 'difficulty') || 'medium').toLowerCase();
    const problems = [];
    if (!col(r, 'question') || col(r, 'question').length < 3) problems.push('question is missing or too short');
    if (knownChapterIds && !knownChapterIds.includes(col(r, 'chapter_id'))) problems.push(`unknown chapter_id "${col(r, 'chapter_id')}"`);
    if (opts.length < 2) problems.push('needs at least two options');
    if (letter.length !== 1 || ci < 0) problems.push('correct must be a letter A-F');
    else if (ci >= opts.length) problems.push(`correct answer ${letter} has no matching option`);
    if (!['easy', 'medium', 'hard'].includes(diff)) problems.push('difficulty must be easy, medium or hard');
    if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) problems.push('duplicate options');
    if (problems.length) errors.push({ line, message: problems.join('; ') });
    else valid.push({
      chapter_id: col(r, 'chapter_id'), section_id: col(r, 'section_id') || null, question: col(r, 'question'),
      options: opts, correct_answer: ci, explanation: col(r, 'explanation') || null, difficulty: diff, source_type: 'supplementary',
    });
  });
  return { valid, errors };
}

// Accepts the raw JSON, or the CSV file Supabase downloads for a one-cell JSON result.
export function extractExportJSON(text) {
  const t = String(text).replace(/^\uFEFF/, '').trim();
  if (t.startsWith('{')) return JSON.parse(t);
  const rows = parseCSV(t);
  const cell = rows[1]?.[0];
  if (!cell) throw new Error('Could not find the export data in this file');
  return JSON.parse(cell);
}

// Validate an export from the old project before anything is written.
export function validateExport(data) {
  const errors = [];
  const warnings = [];
  for (const k of ['chapters', 'sections', 'lesson_blocks', 'questions'])
    if (!Array.isArray(data?.[k])) errors.push(`Missing "${k}" list`);
  if (errors.length) return { errors, warnings };
  const chapterIds = new Set(data.chapters.map((c) => c.id));
  const sectionIds = new Set(data.sections.map((s) => s.id));
  data.sections.forEach((s) => { if (!chapterIds.has(s.chapter_id)) errors.push(`Section ${s.id}: unknown chapter ${s.chapter_id}`); });
  data.lesson_blocks.forEach((b, i) => {
    if (!sectionIds.has(b.section_id)) errors.push(`Block #${i + 1}: unknown section ${b.section_id}`);
    else if (!BLOCK_TYPES[b.block_type]) errors.push(`Block #${i + 1}: unknown type ${b.block_type}`);
    else {
      const p = validateBlock(b.block_type, b.content);
      if (p.length) warnings.push(`Block #${i + 1} in ${b.section_id} (${b.block_type}): ${p[0]}`);
    }
    if (!UUID.test(b.id || '')) errors.push(`Block #${i + 1}: id is not a UUID`);
  });
  data.questions.forEach((q, i) => {
    if (!chapterIds.has(q.chapter_id)) errors.push(`Question #${i + 1}: unknown chapter ${q.chapter_id}`);
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6) errors.push(`Question #${i + 1}: needs 2-6 options`);
    else if (!(q.correct_answer >= 0 && q.correct_answer < q.options.length)) errors.push(`Question #${i + 1}: correct_answer out of range`);
    if (!UUID.test(q.id || '')) errors.push(`Question #${i + 1}: id is not a UUID`);
  });
  return { errors, warnings };
}
