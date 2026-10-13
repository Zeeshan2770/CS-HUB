// Key points for written questions. Authors type one per line:  label: keyword one | keyword two
export function parseKeyPoints(text) {
  const points = [];
  const errors = [];
  String(text || '').split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const at = line.indexOf(':');
    if (at < 1) { errors.push(`Line ${i + 1}: write it as  label: keyword | another keyword`); return; }
    const label = line.slice(0, at).trim();
    const keywords = line.slice(at + 1).split('|').map((k) => k.trim()).filter(Boolean);
    if (!label) errors.push(`Line ${i + 1}: the label is empty`);
    else if (!keywords.length) errors.push(`Line ${i + 1}: add at least one keyword after the colon`);
    else if (label.length > 120 || keywords.some((k) => k.length > 80)) errors.push(`Line ${i + 1}: label or keyword is too long`);
    else points.push({ label, keywords });
  });
  if (points.length > 12) errors.push('Use at most 12 key points.');
  return { points, errors };
}

export const formatKeyPoints = (kp) => (Array.isArray(kp) ? kp : []).map((p) => `${p.label}: ${(p.keywords || []).join(' | ')}`).join('\n');

export const AUTO_NOTE = 'The automatic check only looks for key words your teacher expects. It cannot tell whether your answer is correct or well written, and it is not a mark. Only your teacher\'s mark counts.';
