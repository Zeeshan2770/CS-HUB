import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { friendlyAuthError, useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';
import { Spinner } from '../components/ui.jsx';

function Shell({ title, children, foot }) {
  return (
    <div className="page narrow">
      <div className="card authcard">
        <h1>{title}</h1>
        {children}
      </div>
      {foot && <p className="center muted">{foot}</p>}
    </div>
  );
}
const Err = ({ msg }) => (msg ? <p className="fielderr" role="alert">{msg}</p> : null);

export function Login() {
  const { signIn, user, loading } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const to = loc.state?.from || '/dashboard';
  if (loading) return <Spinner />;
  if (user) return <Navigate to={to} replace />;
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    const { error } = await signIn(email.trim(), password);
    setBusy(false);
    if (error) setErr(friendlyAuthError(error)); else nav(to, { replace: true });
  };
  return (
    <Shell title="Sign in" foot={<>New here? <Link to="/signup">Create an account</Link></>}>
      <form onSubmit={submit} noValidate>
        <label className="field"><span>Email</span><input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="field"><span>Password</span><input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <Err msg={err} />
        <button className="btn btn-primary block" disabled={busy || !email || !password}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="center"><Link to="/reset">Forgot your password?</Link></p>
      </form>
    </Shell>
  );
}

export function Signup() {
  const { signUp, user, loading } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  if (loading) return <Spinner />;
  if (user) return <Navigate to="/dashboard" replace />;
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    if (f.password.length < 8) { setErr('Use a password with at least 8 characters.'); return; }
    setBusy(true);
    const { data, error } = await signUp(f.email.trim(), f.password, f.name.trim());
    setBusy(false);
    if (error) { setErr(friendlyAuthError(error)); return; }
    if (data.session) nav('/dashboard', { replace: true }); else setSent(true);
  };
  if (sent) return <Shell title="Check your email"><p>We sent a confirmation link to <b>{f.email}</b>. Open it, then sign in.</p><Link className="btn" to="/login">Go to sign in</Link></Shell>;
  return (
    <Shell title="Create your account" foot={<>Already registered? <Link to="/login">Sign in</Link></>}>
      <form onSubmit={submit} noValidate>
        <label className="field"><span>Your name</span><input autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="field"><span>Email</span><input type="email" autoComplete="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <label className="field"><span>Password (8+ characters)</span><input type="password" autoComplete="new-password" required minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
        <Err msg={err} />
        <button className="btn btn-primary block" disabled={busy || !f.email || !f.password}>{busy ? 'Creating account…' : 'Create account'}</button>
      </form>
    </Shell>
  );
}

export function Reset() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    const { error } = await resetPassword(email.trim());
    setBusy(false);
    if (error) setErr(friendlyAuthError(error)); else setSent(true);
  };
  return (
    <Shell title="Reset your password" foot={<Link to="/login">Back to sign in</Link>}>
      {sent ? <p>If an account exists for <b>{email}</b>, a reset link is on its way. It can take a few minutes.</p> : (
        <form onSubmit={submit} noValidate>
          <label className="field"><span>Email</span><input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <Err msg={err} />
          <button className="btn btn-primary block" disabled={busy || !email}>{busy ? 'Sending…' : 'Send reset link'}</button>
        </form>
      )}
    </Shell>
  );
}

export function UpdatePassword() {
  const { session, loading, updatePassword } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [waited, setWaited] = useState(false);
  useEffect(() => { const t = setTimeout(() => setWaited(true), 2500); return () => clearTimeout(t); }, []);
  if (loading || (!session && !waited)) return <Spinner />;
  if (!session) return <Shell title="Link expired"><p>This reset link is invalid or has expired.</p><Link className="btn" to="/reset">Request a new link</Link></Shell>;
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    if (pw.length < 8) { setErr('Use a password with at least 8 characters.'); return; }
    const { error } = await updatePassword(pw);
    if (error) setErr(friendlyAuthError(error)); else { toast('Password updated', 'success'); nav('/dashboard', { replace: true }); }
  };
  return (
    <Shell title="Choose a new password">
      <form onSubmit={submit} noValidate>
        <label className="field"><span>New password (8+ characters)</span><input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
        <Err msg={err} />
        <button className="btn btn-primary block" disabled={!pw}>Save password</button>
      </form>
    </Shell>
  );
}
