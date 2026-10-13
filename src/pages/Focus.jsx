import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.jsx';
import { useCatalog } from '../lib/catalog.jsx';
import { useToast } from '../lib/toast.jsx';
import { useLoad, unwrap } from '../lib/useLoad.js';
import { Icon, PageHead, Spinner, ProgressBar } from '../components/ui.jsx';

const PRESETS = [
  { key: '25-5', label: '25 / 5', focus: 25, brk: 5 },
  { key: '45-10', label: '45 / 10', focus: 45, brk: 10 },
  { key: '15-3', label: '15 / 3', focus: 15, brk: 3 },
  { key: 'custom', label: 'Custom', focus: 25, brk: 5 },
];

const DEFAULT_SETTINGS = {
  presetKey: '25-5',
  customFocus: 25,
  customBreak: 5,
  roundsBeforeLongBreak: 4,
  longBreakMinutes: 20,
  autoStart: false,
  soundOn: true,
  dailyGoalRounds: 4,
};

const SETTINGS_KEY = 'cs12.focus.settings';
const SESSION_KEY = (uid) => `cs12.focus.session.${uid}`;

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch { return { ...DEFAULT_SETTINGS }; }
}
function saveSettings(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } }
function loadSession(uid) {
  try { const raw = localStorage.getItem(SESSION_KEY(uid)); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function saveSession(uid, s) { try { localStorage.setItem(SESSION_KEY(uid), JSON.stringify(s)); } catch { /* storage unavailable */ } }
function clearSession(uid) { try { localStorage.removeItem(SESSION_KEY(uid)); } catch { /* storage unavailable */ } }

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1100].forEach((freq, i) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq;
      const t0 = ctx.currentTime + i * 0.22;
      gain.gain.setValueAtTime(0.001, t0);
      gain.gain.exponentialRampToValueAtTime(0.16, t0 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5);
      osc.start(t0); osc.stop(t0 + 0.55);
    });
  } catch { /* audio unavailable */ }
}

function notify(title, body) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return; // the in-tab toast already covers a visible tab
  try { new Notification(title, { body, icon: '/favicon.svg' }); } catch { /* ignore */ }
}

const todayStartISO = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };
const fmt = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

export default function Focus() {
  const { user } = useAuth();
  const { chapters } = useCatalog();
  const toast = useToast();

  const [settings, setSettings] = useState(loadSettings);
  const [showSettings, setShowSettings] = useState(false);

  const preset = PRESETS.find((p) => p.key === settings.presetKey) || PRESETS[0];
  const focusMin = settings.presetKey === 'custom' ? settings.customFocus : preset.focus;
  const breakMin = settings.presetKey === 'custom' ? settings.customBreak : preset.brk;

  const [mode, setMode] = useState('focus'); // 'focus' | 'break' | 'long_break'
  const [running, setRunning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(focusMin * 60);
  const [chapterId, setChapterId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [phaseEndsAt, setPhaseEndsAt] = useState(null); // ms epoch; set only while running

  const wakeLockRef = useRef(null);
  const restoreStarted = useRef(false);
  const roundsRef = useRef(0); // always the latest "rounds completed today", safe to read inside timers

  const { data: today, reload: reloadToday } = useLoad(async () => {
    if (!user) return { rounds: 0, minutes: 0, recent: [] };
    const since = todayStartISO();
    const [agg, recent] = await Promise.all([
      supabase.from('focus_sessions').select('actual_minutes, completed').eq('user_id', user.id).gte('created_at', since).then(unwrap),
      supabase.from('focus_sessions').select('id, created_at, actual_minutes, completed, chapter_id, task_id').eq('user_id', user.id).order('created_at', { ascending: false }).limit(6).then(unwrap),
    ]);
    const rounds = agg.filter((r) => r.completed).length;
    const minutes = agg.reduce((a, r) => a + (r.actual_minutes || 0), 0);
    return { rounds, minutes, recent };
  }, [user?.id]);
  roundsRef.current = today?.rounds || 0;

  const { data: week } = useLoad(async () => {
    if (!user) return [];
    const since = new Date(Date.now() - 6 * 86400000); since.setHours(0, 0, 0, 0);
    const rows = await supabase.from('focus_sessions').select('created_at, actual_minutes').eq('user_id', user.id).gte('created_at', since.toISOString()).then(unwrap);
    const byDay = {};
    for (let i = 0; i < 7; i++) { const d = new Date(since.getTime() + i * 86400000); byDay[d.toDateString()] = 0; }
    rows.forEach((r) => { const k = new Date(r.created_at).toDateString(); if (k in byDay) byDay[k] += r.actual_minutes || 0; });
    return Object.entries(byDay).map(([k, v]) => ({ label: new Date(k).toLocaleDateString(undefined, { weekday: 'short' }), minutes: v }));
  }, [user?.id, today]);

  const { data: openTasks } = useLoad(async () => {
    if (!user) return [];
    return supabase.from('study_tasks').select('id, title, chapter_id').eq('user_id', user.id).eq('completed', false).order('due_date', { nullsFirst: false }).limit(50).then(unwrap);
  }, [user?.id]);

  const totalSeconds = mode === 'focus' ? focusMin * 60 : mode === 'long_break' ? settings.longBreakMinutes * 60 : breakMin * 60;
  const atStart = !running && secondsLeft === totalSeconds;

  // Elapsed focus time is derived from the wall clock, never from counting timer ticks:
  // browsers throttle timers in background tabs, which would silently under-count real study time.
  const remainingNow = () => (running && phaseEndsAt ? Math.max(0, Math.round((phaseEndsAt - Date.now()) / 1000)) : secondsLeft);
  const elapsedNow = () => (mode === 'focus' ? Math.max(0, totalSeconds - remainingNow()) : 0);

  // ---- restore an in-progress session after a reload / closed tab ----
  useEffect(() => {
    if (!user || restoreStarted.current) return;
    restoreStarted.current = true;
    const saved = loadSession(user.id);
    if (saved) {
      setMode(saved.mode); setChapterId(saved.chapterId || ''); setTaskId(saved.taskId || '');
      if (saved.phaseEndsAt) {
        const remain = Math.round((saved.phaseEndsAt - Date.now()) / 1000);
        if (remain <= 0) {
          // It finished while the tab was closed -- log it with the chapter/task it was started with.
          finishPhase(saved.mode, Math.round((saved.totalSeconds || 0) / 60), saved.chapterId || '', saved.taskId || '', true);
        } else {
          setSecondsLeft(remain); setPhaseEndsAt(saved.phaseEndsAt); setRunning(true);
        }
      } else if (typeof saved.secondsLeft === 'number') {
        setSecondsLeft(saved.secondsLeft);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ---- countdown (display is always derived from the wall clock) ----
  useEffect(() => {
    if (!running || !phaseEndsAt) return;
    const id = setInterval(() => {
      const remain = Math.round((phaseEndsAt - Date.now()) / 1000);
      if (remain <= 0) { clearInterval(id); handleComplete(); return; }
      setSecondsLeft(remain);
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, phaseEndsAt, mode]);

  // ---- persist the current state so a reload / closed tab can pick it back up ----
  useEffect(() => {
    if (!user) return;
    if (running && phaseEndsAt) saveSession(user.id, { mode, phaseEndsAt, totalSeconds, chapterId, taskId });
    else saveSession(user.id, { mode, phaseEndsAt: null, secondsLeft, totalSeconds, chapterId, taskId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, phaseEndsAt, mode, secondsLeft, chapterId, taskId]);

  useEffect(() => {
    const original = 'Focus Timer · CS Compass';
    document.title = running ? `${fmt(secondsLeft)} · ${mode === 'focus' ? 'Focus' : 'Break'}` : original;
    return () => { document.title = original; };
  }, [secondsLeft, running, mode]);

  useEffect(() => {
    if (!running) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [running]);

  useEffect(() => {
    async function manage() {
      if (running && 'wakeLock' in navigator) {
        try { wakeLockRef.current = await navigator.wakeLock.request('screen'); } catch { /* denied or unsupported */ }
      } else if (wakeLockRef.current) {
        try { await wakeLockRef.current.release(); } catch { /* already released */ }
        wakeLockRef.current = null;
      }
    }
    manage();
    return () => { if (wakeLockRef.current) wakeLockRef.current.release().catch(() => {}); };
  }, [running]);

  useEffect(() => {
    const handler = (e) => {
      if (e.code !== 'Space') return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
      e.preventDefault();
      if (running) pause(); else start();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, secondsLeft, mode]);

  async function logSession(actualMinutes, completed, chId = chapterId, tkId = taskId) {
    if (!user?.id || actualMinutes <= 0) return;
    const { error } = await supabase.from('focus_sessions').insert({
      user_id: user.id, chapter_id: chId || null, task_id: tkId || null,
      planned_minutes: focusMin, actual_minutes: actualMinutes, completed,
    });
    if (error) toast('Could not save that focus session.', 'error');
    else reloadToday();
  }

  async function completeTask(tkId) {
    if (!tkId) return;
    const { error } = await supabase.from('study_tasks').update({ completed: true, completed_at: new Date().toISOString() }).eq('id', tkId);
    const t = (openTasks || []).find((x) => x.id === tkId);
    if (!error && t) toast(`Marked "${t.title}" as done.`, 'success');
  }

  function nextModeAfterFocus() {
    return (roundsRef.current + 1) % settings.roundsBeforeLongBreak === 0 ? 'long_break' : 'break';
  }

  async function finishPhase(finishedMode, focusMinutesDone, chId, tkId, fromRestore = false) {
    setRunning(false); setPhaseEndsAt(null);
    if (finishedMode === 'focus') {
      const mins = Math.max(1, focusMinutesDone);
      await logSession(mins, true, chId, tkId);
      if (tkId) await completeTask(tkId);
      if (!fromRestore) {
        if (settings.soundOn) beep();
        notify('Focus round complete', `${mins} min logged. Time for a break.`);
        toast(`Focus round complete — ${mins} min logged.`, 'success');
      }
      const next = nextModeAfterFocus();
      const secs = (next === 'long_break' ? settings.longBreakMinutes : breakMin) * 60;
      setMode(next); setSecondsLeft(secs);
      if (settings.autoStart && !fromRestore) beginPhase(next, secs);
    } else {
      if (!fromRestore) {
        if (settings.soundOn) beep();
        notify('Break over', 'Ready for another focus round?');
        toast('Break over — ready for another round?', 'success');
      }
      setMode('focus'); setSecondsLeft(focusMin * 60);
      if (settings.autoStart && !fromRestore) beginPhase('focus', focusMin * 60);
    }
  }

  function handleComplete() {
    finishPhase(mode, focusMin, chapterId, taskId);
  }

  function beginPhase(m, secs) {
    setMode(m); setSecondsLeft(secs); setPhaseEndsAt(Date.now() + secs * 1000); setRunning(true);
  }

  function start() {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission();
    setPhaseEndsAt(Date.now() + secondsLeft * 1000); setRunning(true);
  }
  function pause() {
    setSecondsLeft(remainingNow()); setRunning(false); setPhaseEndsAt(null);
  }

  function stopEarly() {
    const mins = Math.round(elapsedNow() / 60);
    setRunning(false); setPhaseEndsAt(null);
    if (mode === 'focus' && mins > 0) { logSession(mins, false); toast(`Stopped early — ${mins} min still logged.`, 'success'); }
    setMode('focus'); setSecondsLeft(focusMin * 60);
    if (user) clearSession(user.id);
  }

  function choosePreset(key) {
    if (!atStart) return;
    const next = { ...settings, presetKey: key };
    setSettings(next); saveSettings(next);
    setMode('focus');
    const f = key === 'custom' ? settings.customFocus : PRESETS.find((p) => p.key === key).focus;
    setSecondsLeft(f * 60);
  }

  function updateSetting(patch) {
    const next = { ...settings, ...patch };
    setSettings(next); saveSettings(next);
    if (atStart && mode === 'focus' && ('customFocus' in patch)) setSecondsLeft(patch.customFocus * 60);
  }

  const pct = Math.round(((totalSeconds - secondsLeft) / totalSeconds) * 100);
  const selectedTask = useMemo(() => (openTasks || []).find((t) => t.id === taskId), [openTasks, taskId]);
  const chapterTitle = (id) => chapters.find((c) => c.id === id)?.title;

  return (
    <div className="page">
      <PageHead title="Focus Timer" sub="Pomodoro-style study sessions. Survives reloads and tab switches, and logs the time you actually spent." />

      <div className="focus-layout">
        <div className="card focus-card">
          <div className="focus-presets">
            {PRESETS.map((p) => (
              <button key={p.key} className={`btn btn-sm ${settings.presetKey === p.key ? 'btn-on' : ''}`}
                disabled={!atStart} onClick={() => choosePreset(p.key)}>{p.label}</button>
            ))}
            <button className="iconbtn" title="Timer settings" aria-label="Timer settings" onClick={() => setShowSettings((v) => !v)} disabled={!atStart}><Icon name="grip" size={16} /></button>
          </div>

          {settings.presetKey === 'custom' && atStart && (
            <div className="row focus-custom">
              <label className="field inline"><span>Focus min</span><input type="number" min="5" max="120" value={settings.customFocus} onChange={(e) => updateSetting({ customFocus: Math.min(120, Math.max(5, Number(e.target.value) || 5)) })} /></label>
              <label className="field inline"><span>Break min</span><input type="number" min="1" max="60" value={settings.customBreak} onChange={(e) => updateSetting({ customBreak: Math.min(60, Math.max(1, Number(e.target.value) || 1)) })} /></label>
            </div>
          )}

          {showSettings && atStart && (
            <div className="focus-settings no-print">
              <label className="row between"><span>Auto-start next phase</span><input type="checkbox" checked={settings.autoStart} onChange={(e) => updateSetting({ autoStart: e.target.checked })} /></label>
              <label className="row between"><span>Sound on completion</span><input type="checkbox" checked={settings.soundOn} onChange={(e) => updateSetting({ soundOn: e.target.checked })} /></label>
              <label className="row between"><span>Rounds before long break</span><input type="number" min="2" max="8" value={settings.roundsBeforeLongBreak} onChange={(e) => updateSetting({ roundsBeforeLongBreak: Math.min(8, Math.max(2, Number(e.target.value) || 2)) })} /></label>
              <label className="row between"><span>Long break (min)</span><input type="number" min="5" max="60" value={settings.longBreakMinutes} onChange={(e) => updateSetting({ longBreakMinutes: Math.min(60, Math.max(5, Number(e.target.value) || 5)) })} /></label>
              <label className="row between"><span>Daily goal (rounds)</span><input type="number" min="1" max="16" value={settings.dailyGoalRounds} onChange={(e) => updateSetting({ dailyGoalRounds: Math.min(16, Math.max(1, Number(e.target.value) || 1)) })} /></label>
            </div>
          )}

          <div className="focus-ring" style={{ '--pct': `${pct}%` }} role="timer" aria-label={`${fmt(secondsLeft)} remaining, ${mode}`}>
            <div className="focus-time">{fmt(secondsLeft)}</div>
            <div className="focus-mode">{mode === 'focus' ? 'Focus' : mode === 'long_break' ? 'Long break' : 'Break'}</div>
          </div>

          <div className="focus-controls">
            {!running ? (
              <button className="btn btn-primary btn-lg" onClick={start}>{atStart ? 'Start' : 'Resume'}</button>
            ) : (
              <button className="btn btn-lg" onClick={pause}>Pause</button>
            )}
            <button className="btn" onClick={stopEarly} disabled={atStart}>Stop &amp; log</button>
          </div>
          <p className="muted small no-print">Space bar also starts/pauses.</p>

          {mode === 'focus' && atStart && (
            <div className="focus-linkrow">
              <div className="focus-chapter">
                <label htmlFor="focus-chapter">Chapter (optional)</label>
                <select id="focus-chapter" value={chapterId} onChange={(e) => setChapterId(e.target.value)}>
                  <option value="">No specific chapter</option>
                  {chapters.map((c) => <option key={c.id} value={c.id}>Ch.{c.number} — {c.title}</option>)}
                </select>
              </div>
              <div className="focus-chapter">
                <label htmlFor="focus-task">Working on a task (optional)</label>
                <select id="focus-task" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                  <option value="">No specific task</option>
                  {(openTasks || []).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
              </div>
            </div>
          )}
          {(chapterId || selectedTask) && !atStart && mode === 'focus' && (
            <p className="muted small">Working on: {selectedTask ? selectedTask.title : chapterTitle(chapterId)}{selectedTask && ' · marked done when the round completes'}</p>
          )}
        </div>

        <div className="focus-side">
          <div className="card">
            <h2>Today</h2>
            {!today ? <Spinner /> : (
              <>
                <div className="row between"><span className="muted">Goal: {settings.dailyGoalRounds} rounds</span><b>{today.rounds}/{settings.dailyGoalRounds}</b></div>
                <ProgressBar value={today.rounds} max={settings.dailyGoalRounds} label="Daily focus goal" />
                <p className="muted small">{today.minutes} min focused today{today.rounds >= settings.dailyGoalRounds ? ' — goal reached' : ''}</p>
              </>
            )}
          </div>

          <div className="card">
            <h2>This week</h2>
            {!week ? <Spinner /> : (
              <div className="focus-weekchart" role="img" aria-label={`Focus minutes per day this week: ${week.map((d) => `${d.label} ${d.minutes}`).join(', ')}`}>
                {week.map((d, i) => {
                  const max = Math.max(1, ...week.map((x) => x.minutes));
                  return (
                    <div key={i} className="focus-weekbar">
                      <div className="bar" style={{ height: `${Math.max(3, (d.minutes / max) * 60)}px` }} title={`${d.minutes} min`} />
                      <small>{d.label[0]}</small>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="card">
            <h2>Recent sessions</h2>
            {!today ? <Spinner /> : today.recent.length === 0 ? (
              <p className="muted small">No sessions logged yet — start your first round.</p>
            ) : (
              <ul className="plain focus-recent">
                {today.recent.map((r) => (
                  <li key={r.id} className="row between">
                    <span>{r.chapter_id ? chapterTitle(r.chapter_id) || 'Chapter' : 'General study'}{!r.completed && <small className="muted"> (stopped early)</small>}</span>
                    <b>{r.actual_minutes} min</b>
                  </li>
                ))}
              </ul>
            )}
            <Link className="btn btn-sm" to="/planner">Open Planner</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
