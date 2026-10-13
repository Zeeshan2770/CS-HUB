import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { friendlyAuthError, useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';
import { PageHead } from '../components/ui.jsx';

const ROLE = { student: 'Student', teacher: 'Teacher', content_editor: 'Content editor', admin: 'Administrator', super_admin: 'Super administrator' };

export default function Profile() {
  const { user, profile, refreshProfile, updatePassword, signOut } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(profile?.full_name || '');
  const [pw, setPw] = useState('');
  const [perr, setPerr] = useState('');

  const saveName = async (e) => {
    e.preventDefault();
    const { error } = await supabase.from('profiles').update({ full_name: name.trim() || null }).eq('id', user.id);
    if (error) toast('Could not save your name.', 'error'); else { toast('Profile saved', 'success'); refreshProfile(); }
  };
  const savePw = async (e) => {
    e.preventDefault(); setPerr('');
    if (pw.length < 8) { setPerr('Use a password with at least 8 characters.'); return; }
    const { error } = await updatePassword(pw);
    if (error) setPerr(friendlyAuthError(error)); else { toast('Password changed', 'success'); setPw(''); }
  };

  return (
    <div className="page narrow">
      <PageHead title="Profile" />
      <section className="card">
        <p><b>Email:</b> {user.email}</p>
        <p><b>Role:</b> {ROLE[profile?.role] || 'Student'}</p>
        <form onSubmit={saveName}>
          <label className="field"><span>Your name</span><input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
          <button className="btn btn-primary">Save name</button>
        </form>
      </section>
      <section className="card">
        <h2>Change password</h2>
        <form onSubmit={savePw}>
          <label className="field"><span>New password (8+ characters)</span><input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
          {perr && <p className="fielderr" role="alert">{perr}</p>}
          <button className="btn" disabled={!pw}>Change password</button>
        </form>
      </section>
      <button className="btn" onClick={signOut}>Sign out</button>
    </div>
  );
}
