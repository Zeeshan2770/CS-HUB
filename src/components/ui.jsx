import { Component } from 'react';
import { Link } from 'react-router-dom';

const P = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  dash: 'M4 4h7v9H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 15h7v5H4z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  book: 'M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM4 19a2 2 0 012-2h13',
  flask: 'M9 3h6M10 3v6L4 19a2 2 0 002 3h12a2 2 0 002-3l-6-10V3',
  target: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 16a4 4 0 100-8 4 4 0 000 8z',
  refresh: 'M20 11a8 8 0 00-14-4M4 4v4h4M4 13a8 8 0 0014 4M20 20v-4h-4',
  bookmark: 'M6 3h12v18l-6-4-6 4z',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5',
  menu: 'M4 6h16M4 12h16M4 18h16',
  sun: 'M12 16a4 4 0 100-8 4 4 0 000 8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5',
  moon: 'M20 14A8 8 0 1110 4a7 7 0 0010 10z',
  check: 'M5 12l5 5 9-10',
  x: 'M6 6l12 12M18 6L6 18',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  play: 'M7 4l13 8-13 8z',
  chevron: 'M9 6l6 6-6 6',
  panel: 'M4 4h16v16H4zM9 4v16',
  grip: 'M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01',
  timer: 'M12 22a10 10 0 100-20 10 10 0 000 20zM12 7v5l3 3M9 2h6',
  users: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  printer: 'M6 9V3h12v6M6 14h12v7H6zM4 9h16a2 2 0 012 2v5a2 2 0 01-2 2h-2v-4H6v4H4a2 2 0 01-2-2v-5a2 2 0 012-2z',
};

export function Icon({ name, size = 18 }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name] || P.check} />
    </svg>
  );
}

export const Spinner = ({ label = 'Loading' }) => (
  <div className="spinner-wrap" role="status"><span className="spinner" aria-hidden="true" /><span className="sr">{label}</span></div>
);

export const Empty = ({ title, children, action }) => (
  <div className="empty"><h3>{title}</h3>{children && <p>{children}</p>}{action}</div>
);

export const ErrorBox = ({ message, onRetry }) => (
  <div className="errorbox" role="alert">
    <p>{message || 'Something went wrong.'}</p>
    {onRetry && <button className="btn" onClick={onRetry}>Try again</button>}
  </div>
);

export const ProgressBar = ({ value, max, label }) => {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div className="pbar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label || 'Progress'}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
};

export function SaveBadge({ state, onRetry }) {
  if (state === 'idle') return null;
  const t = { saving: 'Saving…', saved: 'Saved', offline: 'Offline. Will retry when you reconnect.', error: 'Could not save.' }[state];
  return (
    <span className={`savebadge sb-${state}`} role="status">
      {t}{(state === 'error' || state === 'offline') && onRetry && <button className="linkbtn" onClick={onRetry}>Retry</button>}
    </span>
  );
}

export const PageHead = ({ title, sub, children }) => (
  <div className="pagehead">
    <div><h1>{title}</h1>{sub && <p className="muted">{sub}</p>}</div>
    {children && <div className="row">{children}</div>}
  </div>
);

export const Crumbs = ({ items }) => (
  <nav className="crumbs" aria-label="Breadcrumb">
    {items.map((it, i) => (
      <span key={i}>{it.to ? <Link to={it.to}>{it.label}</Link> : <span aria-current="page">{it.label}</span>}</span>
    ))}
  </nav>
);

export class ErrorBoundary extends Component {
  state = { err: null };
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { console.error('UI error:', err, info?.componentStack); }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="page narrow">
        <ErrorBox message="This page hit an unexpected error. Your progress is safe." onRetry={() => this.setState({ err: null })} />
        <p><Link to="/">Go to the home page</Link></p>
      </div>
    );
  }
}
