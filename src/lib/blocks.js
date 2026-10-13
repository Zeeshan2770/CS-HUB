// Lesson block model: metadata, validation and plain-text extraction.
// Validation never throws: it returns a list of human-readable problems.

export const BLOCK_TYPES = {
  objectives: { label: 'Learning objectives', blank: () => ({ items: [''] }) },
  definition: { label: 'Definition', blank: () => ({ label: 'Definition', text: '' }) },
  paragraph: { label: 'Paragraph', blank: () => ({ text: '' }) },
  subheading: { label: 'Subheading', blank: () => ({ text: '' }) },
  tidbit: { label: 'Note / tidbit', blank: () => ({ label: 'Note', text: '' }) },
  code_single: { label: 'Code example', blank: () => ({ label: 'Example', code: '', runnable: true, editor_id: '', note: '' }) },
  code_pair: {
    label: 'Code: original and fixed',
    blank: () => ({ label_original: 'As printed', code_original: '', label_fixed: 'Corrected', code_fixed: '', editor_id: '', ocr_note: '' }),
  },
  short_question: { label: 'Short question', blank: () => ({ question: '', answer: '' }) },
  long_question: { label: 'Long question', blank: () => ({ question: '', answer: '' }) },
  table: { label: 'Table', blank: () => ({ headers: ['Column 1', 'Column 2'], rows: [['', '']] }) },
  image: { label: 'Image', blank: () => ({ url: '', alt: '', caption: '' }) },
};

const isStr = (v) => typeof v === 'string';
const nonEmpty = (v) => isStr(v) && v.trim().length > 0;

export function isSafeUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateBlock(type, c) {
  const errs = [];
  if (!BLOCK_TYPES[type]) return [`Unknown block type "${type}"`];
  if (!c || typeof c !== 'object' || Array.isArray(c)) return ['Block content is missing or malformed'];
  switch (type) {
    case 'objectives':
      if (!Array.isArray(c.items) || c.items.filter(nonEmpty).length === 0) errs.push('Add at least one objective');
      break;
    case 'definition':
    case 'tidbit':
      if (!nonEmpty(c.label)) errs.push('Label is empty');
      if (!nonEmpty(c.text)) errs.push('Text is empty');
      break;
    case 'paragraph':
    case 'subheading':
      if (!nonEmpty(c.text)) errs.push('Text is empty');
      break;
    case 'code_single':
      if (!nonEmpty(c.code)) errs.push('Code is empty');
      break;
    case 'code_pair':
      if (!nonEmpty(c.code_original)) errs.push('Original code is empty');
      if (!nonEmpty(c.code_fixed)) errs.push('Corrected code is empty');
      break;
    case 'short_question':
      if (!nonEmpty(c.question)) errs.push('Question is empty');
      if (!nonEmpty(c.answer)) errs.push('Answer is empty');
      break;
    case 'long_question':
      if (!nonEmpty(c.question)) errs.push('Question is empty');
      break;
    case 'table':
      if (!Array.isArray(c.headers) || c.headers.length === 0) errs.push('Table needs at least one header');
      else if (!Array.isArray(c.rows) || c.rows.length === 0) errs.push('Table needs at least one row');
      else if (c.rows.some((r) => !Array.isArray(r) || r.length !== c.headers.length))
        errs.push('Every row must have the same number of cells as the headers');
      break;
    case 'image':
      if (!isSafeUrl(c.url)) errs.push('Image URL must start with https://');
      if (!nonEmpty(c.alt)) errs.push('Add alt text describing the image');
      break;
  }
  return errs;
}

export function blockText(type, c) {
  if (!c) return '';
  const j = (a) => (Array.isArray(a) ? a.join(' ') : '');
  switch (type) {
    case 'objectives': return j(c.items);
    case 'definition': case 'tidbit': return `${c.label || ''} ${c.text || ''}`;
    case 'paragraph': case 'subheading': return c.text || '';
    case 'code_single': return `${c.label || ''} ${c.code || ''}`;
    case 'code_pair': return `${c.code_original || ''} ${c.code_fixed || ''}`;
    case 'short_question': case 'long_question': return `${c.question || ''} ${c.answer || ''}`;
    case 'table': return `${j(c.headers)} ${(c.rows || []).map(j).join(' ')}`;
    case 'image': return `${c.alt || ''} ${c.caption || ''}`;
    default: return '';
  }
}

// Publish readiness for a section: returns { errors: [...], warnings: [...] }
export function sectionReadiness(section, blocks) {
  const errors = [];
  const warnings = [];
  if (!blocks.length) errors.push('This lesson has no content blocks.');
  blocks.forEach((b, i) => {
    validateBlock(b.block_type, b.content).forEach((e) => errors.push(`Block ${i + 1} (${BLOCK_TYPES[b.block_type]?.label || b.block_type}): ${e}`));
  });
  if (!blocks.some((b) => b.block_type === 'objectives')) warnings.push('No learning objectives block.');
  if (section.review_status !== 'verified') warnings.push('Content has not been marked as verified against the PDF.');
  if (blocks.length && !blocks.some((b) => b.source_page)) warnings.push('No source page recorded on any block.');
  return { errors, warnings };
}
