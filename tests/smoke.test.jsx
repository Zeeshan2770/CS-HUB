import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('../src/lib/supabase.js', async () => {
  const f = await import('./fakeSupabase.js');
  return { configured: true, supabase: f.makeClient() };
});
import { state, writes } from './fakeSupabase.js';
import App from '../src/App.jsx';

window.scrollTo = () => {};
const USER = { id: 'u1', email: 'tester@example.com' };
const open = (url) => render(<MemoryRouter initialEntries={[url]}><App /></MemoryRouter>);
const h1 = (re) => waitFor(() => expect(screen.getByRole('heading', { level: 1, name: re })).toBeInTheDocument());

beforeEach(() => { cleanup(); state.user = null; state.role = 'student'; writes.length = 0; localStorage.clear(); });

describe('public pages', () => {
  it('home lists the chapters from the catalog', async () => {
    open('/');
    await waitFor(() => expect(screen.getByText('Computer Networks')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Start learning' })).toHaveAttribute('href', '/lesson/s1');
    expect(screen.getAllByRole('link', { name: /Python lab/ }).length).toBeGreaterThan(0);
  });
  it('syllabus shows chapters and topics, and filters', async () => {
    open('/syllabus');
    await waitFor(() => expect(screen.getByText('Network topologies')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Search topics'), { target: { value: 'propositional' } });
    await waitFor(() => expect(screen.queryByText('Network topologies')).not.toBeInTheDocument());
    expect(screen.getByText('Propositional logic')).toBeInTheDocument();
  });
  it('chapter page', async () => {
    open('/chapter/chapter-1');
    await h1(/Chapter 1: Computer Networks/);
    expect(screen.getByText('What is a network?')).toBeInTheDocument();
  });
  it('unknown chapter and lesson show recovery pages', async () => {
    open('/chapter/zzz'); await waitFor(() => expect(screen.getByText('Chapter not found')).toBeInTheDocument());
    cleanup(); open('/lesson/zzz'); await waitFor(() => expect(screen.getByText('Lesson not found')).toBeInTheDocument());
  });
  it('lesson renders every supported block type and hides malformed ones', async () => {
    open('/lesson/s1');
    await h1(/What is a network/);
    await waitFor(() => expect(screen.getByText('Define a network')).toBeInTheDocument());
    expect(screen.getByText('A group of connected computers.', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Networks let devices share data.', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Benefits')).toBeInTheDocument();
    expect(screen.getByText('The first network had four nodes.')).toBeInTheDocument();
    expect(screen.getByText('Typo in the book')).toBeInTheDocument();
    expect(screen.getByText('What is a LAN?')).toBeInTheDocument();
    expect(screen.getByText('Explain the OSI model.', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Range' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Open (corrected code )?in Python lab/ }).length).toBe(2);
    expect(document.querySelector('img')).toBeNull();               // unsafe image URL is not rendered
    expect(screen.queryByText('mystery')).toBeNull();               // malformed blocks do not crash or leak
    expect(screen.getByText(/Which device joins networks/)).toBeInTheDocument(); // knowledge check
    expect(screen.getAllByText(/Sign in/, { selector: 'a' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /Network topologies/ }).length).toBeGreaterThan(1); // next lesson and related list
  });
  it('anonymous progress is kept on this device (local merge source)', async () => {
    open('/lesson/s1');
    const btn = await screen.findByRole('button', { name: 'Mark as completed' });
    fireEvent.click(btn);
    await waitFor(() => expect(screen.getByRole('button', { name: /Completed/ })).toBeInTheDocument());
    expect(JSON.parse(localStorage.getItem('cs12.progress.v1')).s1.completed).toBe(true);
    expect(writes.length).toBe(0); // nothing sent to the database while signed out
  });
  it('search page shows title and text matches with highlighting', async () => {
    open('/search?q=network');
    await waitFor(() => expect(screen.getByText(/share data/)).toBeInTheDocument());
    expect(document.querySelectorAll('mark').length).toBeGreaterThan(0);
  });
  it('labs: index, truth table and subnet calculator work', async () => {
    open('/labs'); await h1(/Interactive labs/);
    cleanup(); open('/labs/logic'); await h1(/Truth table builder/);
    expect(screen.getAllByRole('row').length).toBe(5);
    fireEvent.change(screen.getByLabelText('Logic statement'), { target: { value: 'p OR !p' } });
    fireEvent.click(screen.getByRole('button', { name: 'Build truth table' }));
    await waitFor(() => expect(screen.getByText(/Tautology/)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Logic statement'), { target: { value: 'p AND (' } });
    fireEvent.click(screen.getByRole('button', { name: 'Build truth table' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    cleanup(); open('/labs/subnet'); await h1(/Subnet calculator/);
    expect(screen.getByText('255.255.255.0')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('IPv4 address'), { target: { value: '999.1.1.1' } });
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
  it('python lab renders with editor, run and limits note', async () => {
    open('/labs/python'); await h1(/Python lab/);
    expect(screen.getByLabelText('Python code')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument();
    expect(screen.getByText(/10 seconds per run/)).toBeInTheDocument();
  });
  it('unknown URL shows the 404 page with recovery links', async () => {
    open('/definitely/not/here');
    await h1(/Page not found/);
    expect(screen.getByRole('link', { name: 'Go home' })).toBeInTheDocument();
  });
  it('auth forms: login error is friendly, signup validates length, reset sends', async () => {
    open('/login');
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrongwrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/do not match/));
    cleanup(); open('/signup');
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/at least 8/));
    cleanup(); open('/reset');
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'a@b.co' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    await waitFor(() => expect(screen.getByText(/reset link is on its way/)).toBeInTheDocument());
  });
});

describe('protected pages', () => {
  it.each(['/dashboard', '/practice', '/revision', '/bookmarks', '/planner', '/focus', '/profile', '/admin'])('%s sends signed-out visitors to sign in', async (p) => {
    open(p); await h1(/Sign in/);
  });
  it.each([
    ['/dashboard', /Welcome, Tester/], ['/practice', /Practice and exams/], ['/revision', /Revision center/], ['/bookmarks', /Bookmarks/],
    ['/planner', /Study planner/], ['/profile', /Profile/],
  ])('%s renders for a signed-in student', async (p, re) => {
    state.user = USER; open(p); await h1(re);
  });
  it('dashboard shows honest empty states, no invented numbers', async () => {
    state.user = USER; open('/dashboard'); await h1(/Welcome/);
    expect(screen.getByText('None yet')).toBeInTheDocument();
    expect(screen.getByText('No tasks planned')).toBeInTheDocument();
  });
  it('quiz session shows question navigator, flag and submit', async () => {
    state.user = USER; open('/practice/session/z1');
    await waitFor(() => expect(screen.getByText('Which device joins networks?')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Flag for review' })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Router'));
    expect(screen.getByText(/1 answered, 0 left/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('cs12.quiz.answers.z1')).q1).toBe(1); // survives a refresh
  });
  it('quiz results reveal the answer key only after submission', async () => {
    state.user = USER; open('/practice/results/z1');
    await h1(/Score: 1 of 1/);
    expect(screen.getByText(/correct answer/)).toBeInTheDocument();
    expect(screen.getByText(/Routers connect networks/)).toBeInTheDocument();
  });
});

describe('labs added in the second pass', () => {
  it('logic lab: truth table shows every step, and the quantifier walkthrough decides for-all with a counterexample', async () => {
    open('/labs/logic'); await h1(/Truth table builder/);
    fireEvent.click(screen.getByRole('button', { name: '(p -> q) & (q -> p)' }));
    fireEvent.click(screen.getByLabelText(/Show every step/));
    await waitFor(() => expect(screen.getByRole('columnheader', { name: 'p → q' })).toBeInTheDocument()); // a column for each part
    expect(screen.getByRole('columnheader', { name: 'q → p' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '(p → q) ∧ (q → p)' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Quantifiers/ }));
    await waitFor(() => expect(screen.getByText(/Check "for all x, P\(x\)"/)).toBeInTheDocument());
    const next = screen.getByRole('button', { name: 'Next step' });
    fireEvent.click(next); fireEvent.click(screen.getByRole('button', { name: 'Next step' })); // x = -2 fails immediately
    await waitFor(() => expect(screen.getByText(/Found a counterexample/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Next step' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/^P\(x\)/), { target: { value: 'x +' } });
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
  it('SQL lab shows the exercises, the table and the check button', async () => {
    open('/labs/sql'); await h1(/SQL lab/);
    expect(screen.getByRole('button', { name: 'Check my answer' })).toBeInTheDocument();
    expect(screen.getByLabelText('SQL')).toBeInTheDocument();
    expect(screen.getAllByRole('option').length).toBeGreaterThanOrEqual(8);
    expect(screen.getByText(/students \(id INTEGER PRIMARY KEY/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Exercise \(/), { target: { value: 'primary-key' } });
    expect(screen.getByText(/second student with id 1/)).toBeInTheDocument();
  });
  it('debugger lab opens in edit mode with samples, watches and the start button', async () => {
    open('/labs/debugger'); await h1(/Step-through debugger/);
    expect(screen.getByRole('button', { name: 'Start debugging' })).toBeEnabled();
    expect(screen.getByLabelText(/Watch expressions/)).toBeInTheDocument();
    expect(screen.getByLabelText('Python code to debug').value).toMatch(/calculate_area/);
  });
  it('labs index lists all five labs', async () => {
    open('/labs'); await h1(/Interactive labs/);
    for (const n of ['Python lab', 'Step-through debugger', 'Logic lab', 'SQL lab', 'Subnet calculator']) expect(screen.getByRole('heading', { name: n })).toBeInTheDocument();
  });
  it('dashboard shows a real streak from the server, not a made-up number', async () => {
    state.user = USER; open('/dashboard'); await h1(/Welcome/);
    expect(screen.getByText('current study streak')).toBeInTheDocument();
    expect(screen.getByText(/Longest: 5/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Studied on 3 of the last 14 days/ })).toBeInTheDocument();
  });
  it('revision opens on the spaced-repetition schedule and can reset it', async () => {
    state.user = USER; open('/revision'); await h1(/Revision center/);
    await waitFor(() => expect(screen.getByText((_, el) => el.tagName === 'P' && /1 question is due for review today\. You have 2 in your schedule/.test(el.textContent))).toBeInTheDocument());
    expect(screen.getByText(/Which device joins networks/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('How the schedule works'));
    expect(screen.getByText(/SM-2/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reset my review schedule' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reset schedule' }));
    await waitFor(() => expect(writes.some((w) => w[0] === 'delete' && w[1] === 'review_cards')).toBe(true));
  });
});

describe('admin area', () => {
  it('students are blocked from /admin', async () => {
    state.user = USER; state.role = 'student'; open('/admin');
    await waitFor(() => expect(screen.getByText(/do not have access/)).toBeInTheDocument());
  });
  it('content editor sees overview with live stats but not the users tab', async () => {
    state.user = USER; state.role = 'content_editor'; open('/admin');
    await waitFor(() => expect(screen.getByText('Registered students')).toBeInTheDocument());
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Students and roles' })).toBeNull();
  });
  it('content editor is blocked from the users page', async () => {
    state.user = USER; state.role = 'content_editor'; open('/admin/users');
    await waitFor(() => expect(screen.getByText(/do not have access/)).toBeInTheDocument());
  });
  it('admin can open users; only super admin gets the role selector', async () => {
    state.user = USER; state.role = 'admin'; open('/admin/users');
    await waitFor(() => expect(screen.getByText('kid@example.com')).toBeInTheDocument());
    expect(screen.queryByLabelText(/Role for/)).toBeNull();
    cleanup(); state.role = 'super_admin'; open('/admin/users');
    await waitFor(() => expect(screen.getByLabelText('Role for kid@example.com')).toBeInTheDocument());
  });
  it('lesson editor loads blocks and shows validation problems', async () => {
    state.user = USER; state.role = 'content_editor'; open('/admin/lesson/s1');
    await waitFor(() => expect(screen.getByText('Validate and publish')).toBeInTheDocument());
    expect(screen.getAllByText(/Text is empty|Unknown block type|Image URL must start with https/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Add block' })).toBeInTheDocument();
  });
  it('lesson editor: dragging a block to a new place reorders it (Up/Down buttons still work)', async () => {
    state.user = USER; state.role = 'content_editor'; open('/admin/lesson/s1');
    await waitFor(() => expect(screen.getByText('Validate and publish')).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: /1\. Learning objectives/ })).toBeInTheDocument();
    const handles = screen.getAllByLabelText(/Drag to reorder this block/);
    fireEvent.dragStart(handles[0]);
    const target = screen.getByTestId('block-2');
    fireEvent.dragOver(target); fireEvent.drop(target); fireEvent.dragEnd(handles[0]);
    expect(await screen.findByRole('heading', { name: /3\. Learning objectives/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /1\. Definition/ })).toBeInTheDocument();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Move block up' })[2]); // keyboard-accessible alternative
    expect(await screen.findByRole('heading', { name: /2\. Learning objectives/ })).toBeInTheDocument();
  });
  it('import page validates a bad question CSV with line numbers', async () => {
    state.user = USER; state.role = 'content_editor'; open('/admin/import');
    const input = await screen.findByLabelText('CSV file');
    const file = new File(['chapter_id,question,option_a,option_b,correct\nchapter-1,Fine question?,a,b,B\nnope,Bad one?,a,b,A\n'], 'q.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText(/Line 3: unknown chapter_id/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Import 1 questions' })).toBeEnabled();
  });
});

describe('independence from Claude and the academy', () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const files = [...walk('src'), 'index.html', 'netlify.toml', ...walk('public')];
  it('no Claude artifact links anywhere in the source', () => {
    for (const f of files) expect(fs.readFileSync(f, 'utf8').toLowerCase(), f).not.toMatch(/claude\.ai|artifact\//);
  });
  it('no academy branding in the source', () => {
    for (const f of files) expect(fs.readFileSync(f, 'utf8').toLowerCase(), f).not.toMatch(/youth academy|sir usama/);
  });
  it('no service-role key or secrets in the client', () => {
    for (const f of files) expect(fs.readFileSync(f, 'utf8'), f).not.toMatch(/service_role|eyJhbGciOi/);
  });
  it('no dangerouslySetInnerHTML or JavaScript eval (the Python tracer evaluates watch expressions in the student\'s own sandboxed Python session, which is intended)', () => {
    for (const f of files.filter((x) => (x.endsWith('.jsx') || x.endsWith('.js')) && !x.endsWith('tracerSource.js'))) expect(fs.readFileSync(f, 'utf8'), f).not.toMatch(/dangerouslySetInnerHTML|\beval\(|new Function\(/);
  });
});

describe('written answers and role-aware admin', () => {
  it('student: list shows the question, answering shows an honest automatic check and the model answer, then waits for a teacher', async () => {
    state.user = USER; open('/practice/written'); await h1(/Written questions/);
    await waitFor(() => expect(screen.getByText('What is a router?')).toBeInTheDocument());
    cleanup(); open('/practice/written/w1');
    const box = await screen.findByLabelText('Your answer');
    expect(screen.getByRole('button', { name: 'Submit answer' })).toBeDisabled();
    fireEvent.change(box, { target: { value: 'A router forwards packets between networks.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));
    await waitFor(() => expect(screen.getByText('Automatic key-point check')).toBeInTheDocument());
    expect(writes.some((w) => w[0] === 'rpc' && w[1] === 'submit_written' && w[2].p_question === 'w1')).toBe(true);
    expect(screen.getByText(/not a mark/)).toBeInTheDocument();
    expect(screen.getByText(/Found 1 of 3 key points/)).toBeInTheDocument();
    expect(screen.getAllByText('Found').length).toBe(1);
    expect(screen.getAllByText('Not found').length).toBe(2);
    expect(screen.getByText('A router forwards packets between networks.')).toBeInTheDocument();
    expect(screen.queryByText(/Teacher's mark/)).toBeNull(); // the automatic check never shows a grade
  });
  it('teacher: sees only the Marking tab, can mark within the limit, and cannot reach content tools', async () => {
    state.user = USER; state.role = 'teacher'; open('/admin');
    await h1(/Teacher area/);
    expect(screen.getByRole('link', { name: 'Marking' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Question bank' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Students and roles' })).toBeNull();
    await waitFor(() => expect(screen.getByText('It forwards packets between networks')).toBeInTheDocument()); // redirected to Marking
    expect(screen.getByText(/Student names are hidden/)).toBeInTheDocument();
    const marks = screen.getByLabelText(/Marks \(0 to 5\)/);
    const save = screen.getByRole('button', { name: 'Save mark' });
    expect(save).toBeDisabled();
    fireEvent.change(marks, { target: { value: '9' } }); expect(save).toBeDisabled();   // above the maximum
    fireEvent.change(marks, { target: { value: '4' } }); expect(save).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Feedback for the student'), { target: { value: 'Good' } });
    fireEvent.click(save);
    await waitFor(() => expect(writes.find((w) => w[0] === 'rpc' && w[1] === 'grade_written')?.[2]).toEqual({ p_answer: 'a1', p_marks: 4, p_feedback: 'Good' }));
    cleanup(); open('/admin/questions');
    await waitFor(() => expect(screen.getByText(/do not have access/)).toBeInTheDocument());
    cleanup(); open('/admin/written');
    await waitFor(() => expect(screen.getByText(/do not have access/)).toBeInTheDocument());
  });
  it('student cannot open the teacher area', async () => {
    state.user = USER; state.role = 'student'; open('/admin/grading');
    await waitFor(() => expect(screen.getByText(/do not have access/)).toBeInTheDocument());
  });
  it('editor: writes a written question with key points and it is saved as structured data', async () => {
    state.user = USER; state.role = 'content_editor'; open('/admin/written');
    fireEvent.click(await screen.findByRole('button', { name: 'New written question' }));
    expect(screen.getByRole('button', { name: 'Save question' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Define a protocol.' } });
    fireEvent.change(screen.getByLabelText(/Model answer/), { target: { value: 'A set of rules for communication.' } });
    fireEvent.change(screen.getByLabelText(/Key points for the automatic check/), { target: { value: 'rules: rules | rule\nbad line' } });
    expect(screen.getByText(/Line 2/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save question' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Key points for the automatic check/), { target: { value: 'rules: rules | rule\ncommunication: communicate | communication' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save question' }));
    await waitFor(() => expect(writes.find((w) => w[0] === 'insert' && w[1] === 'written_questions')?.[2]).toMatchObject({
      prompt: 'Define a protocol.', max_marks: 5, published: false,
      key_points: [{ label: 'rules', keywords: ['rules', 'rule'] }, { label: 'communication', keywords: ['communicate', 'communication'] }] }));
  });
  it('lessons list: dragging a lesson renumbers the chapter in one save (Up/Down still present)', async () => {
    state.user = USER; state.role = 'content_editor'; open('/admin/content');
    await waitFor(() => expect(screen.getAllByText('Network topologies').length).toBeGreaterThan(0));
    const handle = screen.getByLabelText(/Drag What is a network\?/);
    fireEvent.dragStart(handle);
    const target = screen.getByTestId('sec-s2');
    fireEvent.dragOver(target); fireEvent.drop(target); fireEvent.dragEnd(handle);
    await waitFor(() => expect(writes.find((w) => w[0] === 'upsert' && w[1] === 'sections')?.[2]).toEqual([
      { id: 's2', chapter_id: 'chapter-1', title: 'Network topologies', order_index: 1 },
      { id: 's1', chapter_id: 'chapter-1', title: 'What is a network?', order_index: 2 }]));
    expect(screen.getAllByRole('button', { name: /Move .* up/ }).length).toBeGreaterThan(0);
  });
  it('python lab shows the browser stand-in notice only when a Tk window exists, and has a chart area hook', async () => {
    open('/labs/python'); await h1(/Python lab/);
    expect(screen.getByText(/sqlite3 module works/)).toBeInTheDocument();
    expect(screen.queryByText(/stand-in for Tkinter/)).toBeNull();
  });
});
