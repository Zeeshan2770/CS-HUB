import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase.js';
import { useToast } from './toast.jsx';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

const STAFF = ['content_editor', 'admin', 'super_admin'];

export function friendlyAuthError(err) {
  const m = (err?.message || String(err || '')).toLowerCase();
  if (m.includes('invalid login')) return 'That email and password do not match. Check them and try again.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'An account with this email already exists. Sign in instead.';
  if (m.includes('password') && (m.includes('short') || m.includes('at least') || m.includes('weak'))) return 'Choose a longer password (at least 8 characters).';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Wait a few minutes, then try again.';
  if (m.includes('email') && m.includes('invalid')) return 'Enter a valid email address.';
  if (m.includes('fetch') || m.includes('network')) return 'Could not reach the server. Check your connection and try again.';
  if (m.includes('not confirmed')) return 'Confirm your email first: open the link we sent you.';
  return err?.message || 'Something went wrong. Try again.';
}

export function AuthProvider({ children }) {
  const toast = useToast();
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const manualOut = useRef(false);
  const uid = session?.user?.id;

  useEffect(() => {
    if (!supabase) return undefined;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_OUT') {
        if (!manualOut.current) toast('Your session ended. Sign in again to continue.', 'info');
        manualOut.current = false;
        setProfile(null);
      }
    });
    return () => data.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadProfile = useCallback(async () => {
    if (!supabase || !uid) return;
    const { data } = await supabase.from('profiles').select('id,email,full_name,role,last_section_id,tz').eq('id', uid).maybeSingle();
    setProfile(data || { id: uid, role: 'student', missing: true });
    // Keep the saved timezone current: streaks and review dates use the student's local day.
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (data && tz && data.tz !== tz) supabase.from('profiles').update({ tz }).eq('id', uid).then(() => {});
    } catch { /* timezone unavailable: server keeps UTC */ }
  }, [uid]);

  useEffect(() => { if (uid) loadProfile(); else setProfile(null); }, [uid, loadProfile]);

  const value = useMemo(() => {
    const role = profile?.role || null;
    return {
      session, user: session?.user || null, profile, role, loading,
      isStaff: STAFF.includes(role), isTeacher: role === 'teacher' || STAFF.includes(role), isAdmin: role === 'admin' || role === 'super_admin', isSuper: role === 'super_admin',
      refreshProfile: loadProfile,
      signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
      signUp: (email, password, fullName) =>
        supabase.auth.signUp({ email, password, options: { data: { full_name: fullName || '' } } }),
      signOut: async () => { manualOut.current = true; await supabase.auth.signOut(); },
      resetPassword: (email) =>
        supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/update-password` }),
      updatePassword: (password) => supabase.auth.updateUser({ password }),
    };
  }, [session, profile, loading, loadProfile]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
