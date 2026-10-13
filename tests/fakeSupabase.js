// A small in-memory stand-in for the Supabase client, used ONLY by the smoke tests.
export const DB = {
  chapters: [
    { id: 'chapter-1', number: 1, title: 'Computer Networks', summary: null, estimated_minutes: null, source_pages: 59, published: true },
    { id: 'chapter-2', number: 2, title: 'Computational Thinking and Algorithm', summary: null, estimated_minutes: null, source_pages: 43, published: true },
  ],
  sections: [
    { id: 's1', chapter_id: 'chapter-1', title: 'What is a network?', order_index: 1, published: true, review_status: 'verified', estimated_minutes: 10 },
    { id: 's2', chapter_id: 'chapter-1', title: 'Network topologies', order_index: 2, published: true, review_status: 'unreviewed', estimated_minutes: null },
    { id: 's3', chapter_id: 'chapter-2', title: 'Propositional logic', order_index: 1, published: true, review_status: 'unreviewed', estimated_minutes: null },
  ],
  lesson_blocks: [
    { id: 'b1', section_id: 's1', order_index: 1, block_type: 'objectives', content: { items: ['Define a network', 'List its benefits'] }, source_page: 3 },
    { id: 'b2', section_id: 's1', order_index: 2, block_type: 'definition', content: { label: 'Network', text: 'A group of connected computers.' }, source_page: 3 },
    { id: 'b3', section_id: 's1', order_index: 3, block_type: 'paragraph', content: { text: 'Networks let devices share data.' } },
    { id: 'b4', section_id: 's1', order_index: 4, block_type: 'subheading', content: { text: 'Benefits' } },
    { id: 'b5', section_id: 's1', order_index: 5, block_type: 'tidbit', content: { label: 'Did you know', text: 'The first network had four nodes.' } },
    { id: 'b6', section_id: 's1', order_index: 6, block_type: 'code_single', content: { label: 'Hello', code: 'print("hi")', runnable: true } },
    { id: 'b7', section_id: 's1', order_index: 7, block_type: 'code_pair', content: { label_original: 'As printed', code_original: 'prnt(1)', label_fixed: 'Fixed', code_fixed: 'print(1)', ocr_note: 'Typo in the book' } },
    { id: 'b8', section_id: 's1', order_index: 8, block_type: 'short_question', content: { question: 'What is a LAN?', answer: 'A local area network.' } },
    { id: 'b9', section_id: 's1', order_index: 9, block_type: 'long_question', content: { question: 'Explain the OSI model.' } },
    { id: 'b10', section_id: 's1', order_index: 10, block_type: 'table', content: { headers: ['Type', 'Range'], rows: [['LAN', 'Building'], ['WAN', 'Country']] } },
    { id: 'b11', section_id: 's1', order_index: 11, block_type: 'paragraph', content: { text: '   ' } },
    { id: 'b12', section_id: 's1', order_index: 12, block_type: 'mystery', content: {} },
    { id: 'b13', section_id: 's1', order_index: 13, block_type: 'image', content: { url: 'javascript:alert(1)', alt: 'x' } },
  ],
  questions_public: [{ id: 'q1', chapter_id: 'chapter-1', section_id: 's1', question: 'Which device joins networks?', options: ['Hub', 'Router'], difficulty: 'easy' }],
  profiles: [], bookmarks: [], study_tasks: [], study_goals: [], quiz_sessions: [], lesson_progress: [], question_attempts: [],
  flagged_questions: [], saved_code: [],
  written_questions_public: [{ id: 'w1', chapter_id: 'chapter-1', section_id: null, kind: 'short', prompt: 'What is a router?', max_marks: 5 }],
  written_questions: [{ id: 'w1', chapter_id: 'chapter-1', section_id: null, kind: 'short', prompt: 'What is a router?', model_answer: 'A router forwards packets.', key_points: [{ label: 'forwards packets', keywords: ['forwards packets', 'routes packets'] }], max_marks: 5, published: true }],
  written_answers: [{ id: 'a1', user_id: 'u9', question_id: 'w1', answer: 'It forwards packets between networks', auto_matched: ['forwards packets'], auto_total: 3, submitted_at: '2026-09-30T10:00:00Z', status: 'submitted', teacher_marks: null, teacher_feedback: null,
    written_questions: { prompt: 'What is a router?', model_answer: 'A router forwards packets.', key_points: [{ label: 'forwards packets', keywords: ['forwards packets'] }], max_marks: 5, kind: 'short' } }], review_cards: [{ question_id: 'q1', due_date: '2020-01-01', interval_days: 1, reps: 0, lapses: 1 }, { question_id: 'q2', due_date: '2999-01-01', interval_days: 7, reps: 3, lapses: 0 }], section_revisions: [], audit_logs: [], questions: [],
};

export const state = { user: null, role: 'student' };
export const writes = [];

class Q {
  constructor(table) { this.t = table; this.rows = [...(DB[table] || [])]; this.op = 'select'; this.opts = {}; }
  select(_c, o) { this.opts = o || {}; return this; }
  insert(p) { this.op = 'insert'; writes.push(['insert', this.t, p]); return this; }
  upsert(p) { this.op = 'upsert'; writes.push(['upsert', this.t, p]); return this; }
  update(p) { this.op = 'update'; writes.push(['update', this.t, p]); return this; }
  delete() { this.op = 'delete'; writes.push(['delete', this.t]); return this; }
  eq(c, v) { this.rows = this.rows.filter((r) => r[c] === v); return this; }
  in(c, v) { this.rows = this.rows.filter((r) => v.includes(r[c])); return this; }
  gte(c, v) { this.rows = this.rows.filter((r) => r[c] >= v); return this; }
  lte(c, v) { this.rows = this.rows.filter((r) => r[c] <= v); return this; }
  order() { return this; } limit() { return this; } range() { return this; } ilike() { return this; } neq() { return this; }
  maybeSingle() { return Promise.resolve({ data: this.rows[0] ?? null, error: null }); }
  single() { return this.maybeSingle(); }
  then(res, rej) {
    const base = this.op === 'select' ? { data: this.opts.head ? null : this.rows, error: null, count: this.rows.length } : { data: null, error: null };
    return Promise.resolve(base).then(res, rej);
  }
}

const day = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('en-CA'); };
const RPC = {
  submit_written: { id: 'a2', matched: ['forwards packets'], total: 3, points: ['forwards packets', 'connects networks', 'uses IP addresses'], model_answer: 'A router forwards packets between networks.' },
  my_written: { submissions: [], model_answer: null, points: null },
  grade_written: null,
  my_weak_topics: [],
  my_assignments: [],
  my_streak: { current: 3, longest: 5, active_today: true, today: day(0), recent_days: [day(0), day(1), day(2)] },
  admin_dashboard_stats: { students: 12, active_students_7d: 5, published_chapters: 2, published_sections: 3, draft_sections: 1, unverified_sections: 2, questions: 40, quizzes_submitted: 7, question_attempts: 99 },
  admin_list_students: [{ id: 'u9', email: 'kid@example.com', full_name: 'Kid', role: 'student', created_at: '2026-09-01T00:00:00Z', completed_sections: 3, last_active: null, total_count: 1 }],
  search_content: [{ section_id: 's1', chapter_id: 'chapter-1', section_title: 'What is a network?', snippet: 'a network of computers share data' }],
  grade_answer: { correct: true, correct_answer: 1, explanation: 'Routers connect networks.' },
  resume_quiz: { status: 'in_progress', session_id: 'z1', mode: 'practice', expires_at: null, questions: [{ id: 'q1', question: 'Which device joins networks?', options: ['Hub', 'Router'] }] },
  quiz_review: { session: { score: 1, total: 1, mode: 'practice', submitted_at: '2026-09-02T10:00:00Z' }, items: [{ question_id: 'q1', chapter_id: 'chapter-1', question: 'Which device joins networks?', options: ['Hub', 'Router'], selected: 1, correct: true, correct_answer: 1, explanation: 'Routers connect networks.' }] },
  submit_quiz: { expired: false, score: 1, total: 1 },
};

export function makeClient() {
  return {
    from: (t) => {
      if (t === 'profiles') {
        const q = new Q('profiles');
        q.rows = state.user ? [{ id: state.user.id, email: state.user.email, full_name: 'Tester', role: state.role, last_section_id: 's1' }] : [];
        return q;
      }
      return new Q(t);
    },
    rpc: (name, args) => { writes.push(['rpc', name, args]); return Promise.resolve({ data: RPC[name] ?? null, error: null }); },
    auth: {
      getSession: () => Promise.resolve({ data: { session: state.user ? { user: state.user } : null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: () => Promise.resolve({ data: {}, error: { message: 'Invalid login credentials' } }),
      signUp: () => Promise.resolve({ data: { session: null }, error: null }),
      signOut: () => Promise.resolve({}),
      resetPasswordForEmail: () => Promise.resolve({ error: null }),
      updateUser: () => Promise.resolve({ error: null }),
    },
    storage: { from: () => ({ upload: () => Promise.resolve({ error: null }), getPublicUrl: (p) => ({ data: { publicUrl: `https://x.supabase.co/${p}` } }) }) },
  };
}
