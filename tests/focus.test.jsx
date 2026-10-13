import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../src/lib/supabase.js', async () => {
  const f = await import('./fakeSupabase.js');
  return { configured: true, supabase: f.makeClient() };
});
import { DB, state, writes } from './fakeSupabase.js';
import App from '../src/App.jsx';

window.scrollTo = () => {};
const USER = { id: 'u1', email: 'tester@example.com' };
const SESSION_KEY = 'cs12.focus.session.u1';

const open = () => render(<MemoryRouter initialEntries={['/focus']}><App /></MemoryRouter>);
const advance = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const focusInserts = () => writes.filter((w) => w[0] === 'insert' && w[1] === 'focus_sessions').map((w) => w[2]);
const timer = () => screen.getByRole('timer');
const startBtn = () => screen.getByRole('button', { name: 'Start' });
const ready = async () => { await screen.findByRole('heading', { level: 1, name: /Focus Timer/ }); await screen.findByText(/^\d+\/4$/); };

beforeEach(() => {
  cleanup();
  state.user = USER; state.role = 'student';
  writes.length = 0; localStorage.clear();
  DB.focus_sessions = []; DB.study_tasks = [];
});
afterEach(() => { vi.useRealTimers(); DB.focus_sessions = []; DB.study_tasks = []; });

describe('focus timer', () => {
  it('renders ready to start with an empty daily goal', async () => {
    open();
    await ready();
    expect(timer()).toHaveTextContent('25:00');
    expect(startBtn()).toBeInTheDocument();
    expect(screen.getByText('0/4')).toBeInTheDocument();
  });

  it('counts down once started, and Pause freezes it', async () => {
    open(); await ready();
    vi.useFakeTimers();
    fireEvent.click(startBtn());
    await advance(3000);
    expect(timer()).toHaveTextContent('24:57');
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await advance(10000);
    expect(timer()).toHaveTextContent('24:57');
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
  });

  it('space bar starts and pauses', async () => {
    open(); await ready();
    fireEvent.keyDown(window, { code: 'Space' });
    expect(await screen.findByRole('button', { name: 'Pause' })).toBeInTheDocument();
    fireEvent.keyDown(window, { code: 'Space' });
    expect(await screen.findByRole('button', { name: /Start|Resume/ })).toBeInTheDocument();
  });

  it('stopping early logs only the minutes actually spent, as not completed', async () => {
    open(); await ready();
    vi.useFakeTimers();
    fireEvent.click(startBtn());
    await advance(5 * 60 * 1000);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Stop & log/ })); });
    const ins = focusInserts();
    expect(ins).toHaveLength(1);
    expect(ins[0]).toMatchObject({ user_id: 'u1', planned_minutes: 25, actual_minutes: 5, completed: false });
    expect(timer()).toHaveTextContent('25:00');
  });

  it('REGRESSION: logged minutes follow the wall clock, not timer ticks (background tabs throttle timers)', async () => {
    open(); await ready();
    vi.useFakeTimers();
    fireEvent.click(startBtn());
    // Simulate a throttled background tab: 10 real minutes pass but the interval only fires once.
    await act(async () => { vi.setSystemTime(new Date(Date.now() + 10 * 60 * 1000)); });
    await advance(1000);
    expect(timer()).toHaveTextContent('14:59');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Stop & log/ })); });
    expect(focusInserts()[0]).toMatchObject({ actual_minutes: 10, completed: false });
  });

  it('pausing does not count paused time as study time', async () => {
    open(); await ready();
    vi.useFakeTimers();
    fireEvent.click(startBtn());
    await advance(2 * 60 * 1000);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await advance(30 * 60 * 1000); // wandered off for half an hour
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Stop & log/ })); });
    expect(focusInserts()[0]).toMatchObject({ actual_minutes: 2 });
  });

  it('completing a round logs it as completed and starts a 5-minute break', async () => {
    open(); await ready();
    vi.useFakeTimers();
    fireEvent.click(startBtn());
    await advance(25 * 60 * 1000 + 2000);
    const ins = focusInserts();
    expect(ins).toHaveLength(1);
    expect(ins[0]).toMatchObject({ actual_minutes: 25, planned_minutes: 25, completed: true });
    expect(timer()).toHaveTextContent('05:00');
    expect(timer()).toHaveTextContent('Break');
  });

  it('the 4th completed round of the day earns a long break', async () => {
    const now = new Date().toISOString();
    DB.focus_sessions = [1, 2, 3].map((n) => ({ id: `f${n}`, user_id: 'u1', created_at: now, actual_minutes: 25, completed: true, chapter_id: null, task_id: null }));
    open();
    await screen.findByText('3/4');
    vi.useFakeTimers();
    fireEvent.click(startBtn());
    await advance(25 * 60 * 1000 + 2000);
    expect(timer()).toHaveTextContent('20:00');
    expect(timer()).toHaveTextContent('Long break');
  });

  it('a linked task is marked done when its round completes, and the session records the task', async () => {
    DB.study_tasks = [{ id: 't1', user_id: 'u1', title: 'Revise OSI layers', chapter_id: null, due_date: null, completed: false }];
    open(); await ready();
    await screen.findByRole('option', { name: 'Revise OSI layers' });
    fireEvent.change(screen.getByLabelText(/Working on a task/), { target: { value: 't1' } });
    vi.useFakeTimers();
    fireEvent.click(startBtn());
    await advance(25 * 60 * 1000 + 2000);
    expect(focusInserts()[0]).toMatchObject({ task_id: 't1', completed: true });
    expect(writes.some((w) => w[0] === 'update' && w[1] === 'study_tasks' && w[2].completed === true)).toBe(true);
  });

  it('a task is NOT marked done when you stop early', async () => {
    DB.study_tasks = [{ id: 't1', user_id: 'u1', title: 'Revise OSI layers', chapter_id: null, due_date: null, completed: false }];
    open(); await ready();
    await screen.findByRole('option', { name: 'Revise OSI layers' });
    fireEvent.change(screen.getByLabelText(/Working on a task/), { target: { value: 't1' } });
    vi.useFakeTimers();
    fireEvent.click(startBtn());
    await advance(3 * 60 * 1000);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Stop & log/ })); });
    expect(writes.some((w) => w[0] === 'update' && w[1] === 'study_tasks')).toBe(false);
  });

  it('survives a reload: resumes from the real clock instead of resetting to 25:00', async () => {
    open(); await ready();
    vi.useFakeTimers();
    fireEvent.click(startBtn());
    await advance(60 * 1000);
    cleanup();                       // tab closed mid-round
    await advance(4 * 60 * 1000);    // 4 more minutes pass while away
    open();
    await advance(0);
    await advance(0);
    expect(timer()).toHaveTextContent('20:00');
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('REGRESSION: a round that finished while the tab was closed is logged with its chapter, and does not auto-start another', async () => {
    localStorage.setItem('cs12.focus.settings', JSON.stringify({ autoStart: true }));
    localStorage.setItem(SESSION_KEY, JSON.stringify({ mode: 'focus', phaseEndsAt: Date.now() - 60 * 1000, totalSeconds: 1500, chapterId: 'chapter-1', taskId: '' }));
    open();
    await waitFor(() => expect(focusInserts()).toHaveLength(1));
    expect(focusInserts()[0]).toMatchObject({ actual_minutes: 25, completed: true, chapter_id: 'chapter-1' });
    await waitFor(() => expect(timer()).toHaveTextContent('05:00'));
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument(); // not running
    expect(screen.queryByText(/Focus round complete/)).toBeNull();            // no alert for something that already happened
  });

  it('restores a running session and keeps it saved', async () => {
    const ends = Date.now() + 10 * 60 * 1000;
    localStorage.setItem(SESSION_KEY, JSON.stringify({ mode: 'focus', phaseEndsAt: ends, totalSeconds: 1500, chapterId: '', taskId: '' }));
    open();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument());
    expect(JSON.parse(localStorage.getItem(SESSION_KEY)).phaseEndsAt).toBe(ends);
  });

  it('presets and settings are locked once a round is under way', async () => {
    open(); await ready();
    fireEvent.click(startBtn());
    await screen.findByRole('button', { name: 'Pause' });
    expect(screen.getByRole('button', { name: '45 / 10' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Timer settings' })).toBeDisabled();
  });

  it('switching preset changes the length', async () => {
    open(); await ready();
    fireEvent.click(screen.getByRole('button', { name: '45 / 10' }));
    expect(timer()).toHaveTextContent('45:00');
  });
});
