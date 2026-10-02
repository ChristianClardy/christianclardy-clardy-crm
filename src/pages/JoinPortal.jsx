import { useEffect, useRef, useState } from 'react';
import { HardHat, Lock, Eye, EyeOff, Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { isStandalone } from '@/lib/installPrompt';
import InstallAppStep, { SetupProgress } from '@/components/app/InstallAppStep';

// Where a subcontractor lands from the Subcontractor Portal link staff text them
// (/join?t=…, made by /api/invite?action=text-link). Walks them through:
//   1. signing in (the link trades for a one-time Supabase sign-in token),
//   2. choosing a password (an iPhone home-screen app doesn't share Safari's
//      sign-in, so they'll need it there),
//   3. adding Clardy to their home screen / desktop.
const STEPS = ['Sign in', 'Password', 'Install'];
const PORTAL_TITLE = { sub: 'Subcontractor Portal', pm: 'Builder Portal', customer: 'Customer Portal' };

export default function JoinPortal() {
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [account, setAccount] = useState(null); // { email, full_name }
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // StrictMode double-run would redeem twice
    started.current = true;
    const token = new URLSearchParams(window.location.search).get('t');
    (async () => {
      try {
        if (!token) throw new Error('This link is missing its code. Ask Principle Outdoor Living to text you a new one.');
        const res = await fetch('/api/invite?action=redeem', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ t: token }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'Could not sign you in.');
        const { error: otpErr } = await supabase.auth.verifyOtp({ token_hash: json.token_hash, type: 'email' });
        if (otpErr) throw new Error(otpErr.message);
        // Drop the token from the address bar, so "Add to Home Screen" saves
        // the portal itself rather than a sign-in link that expires.
        window.history.replaceState(null, '', json.portal === 'customer' ? '/CustomerPortal' : '/BuilderPortal');
        setAccount({ email: json.email, full_name: json.full_name, portal: json.portal });
        setStep(1);
      } catch (err) {
        setError(err.message);
      }
    })();
  }, []);

  const firstName = account?.full_name?.split(' ')[0];
  const isCustomer = account?.portal === 'customer';
  const openPortal = () => { window.location.href = isCustomer ? '/CustomerPortal' : '/BuilderPortal'; };
  const destination = isCustomer ? 'my project' : 'my jobs';

  return (
    <div className="min-h-screen flex items-start sm:items-center justify-center px-4 py-8" style={{ backgroundColor: '#f5f0eb', fontFamily: "'Georgia', serif" }}>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: '#3d3530' }}>
            <HardHat className="w-6 h-6" style={{ color: '#b5965a' }} />
          </div>
          <h1 className="text-2xl font-bold tracking-wide" style={{ color: '#3d3530' }}>{PORTAL_TITLE[account?.portal] || 'Subcontractor Portal'}</h1>
          <p className="text-sm mt-1" style={{ color: '#7a6e66' }}>Principle Outdoor Living</p>
        </div>

        {!error && <SetupProgress steps={STEPS} current={step} />}

        <div className="rounded-2xl p-6 shadow-lg" style={{ backgroundColor: '#fff', border: '1px solid #ddd5c8' }}>
          {error ? (
            <div className="space-y-4 text-center">
              <AlertTriangle className="w-8 h-8 mx-auto" style={{ color: '#b45309' }} />
              <p className="text-sm" style={{ color: '#3d3530' }}>{error}</p>
              <a href="/login" className="inline-block text-sm font-semibold hover:underline" style={{ color: '#b5965a' }}>Already have a password? Sign in</a>
            </div>
          ) : step === 0 ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm" style={{ color: '#7a6e66' }}>
              <Loader2 className="w-4 h-4 animate-spin" /> Signing you in…
            </div>
          ) : step === 1 ? (
            <PasswordStep
              greeting={firstName ? `Welcome, ${firstName}!` : 'Welcome!'}
              email={account.email}
              onDone={() => setStep(isStandalone() ? 3 : 2)}
            />
          ) : step === 2 ? (
            <InstallAppStep email={account.email} destination={destination} onDone={openPortal} />
          ) : (
            <div className="space-y-4 text-center">
              <p className="text-sm" style={{ color: '#3d3530' }}>You're all set.</p>
              <button onClick={openPortal} className="w-full py-2.5 rounded-lg text-sm font-semibold" style={{ backgroundColor: '#3d3530', color: '#f5f0eb' }}>
                Go to {destination}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PasswordStep({ greeting, email, onDone }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) return setError('Use at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    setSaving(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (err) return setError(err.message);
    onDone();
  };

  const inputStyle = { border: '1px solid #ddd5c8', color: '#3d3530', backgroundColor: '#faf8f5' };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold" style={{ color: '#3d3530' }}>{greeting}</h2>
        <p className="text-sm mt-1" style={{ color: '#7a6e66' }}>
          Create a password for <strong>{email}</strong>. You'll use it to sign in from the app.
        </p>
      </div>
      {error && <div className="px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>{error}</div>}
      {/* Hidden username field so the phone's password manager saves the pair. */}
      <input type="email" autoComplete="username" value={email} readOnly hidden />
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#a89e96' }} />
        <input
          type={show ? 'text' : 'password'} autoComplete="new-password" required value={password}
          onChange={(e) => setPassword(e.target.value)} placeholder="New password (8+ characters)"
          className="w-full pl-9 pr-10 py-3 rounded-lg text-base outline-none" style={inputStyle}
        />
        <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: '#a89e96' }}>
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#a89e96' }} />
        <input
          type={show ? 'text' : 'password'} autoComplete="new-password" required value={confirm}
          onChange={(e) => setConfirm(e.target.value)} placeholder="Type it again"
          className="w-full pl-9 pr-3 py-3 rounded-lg text-base outline-none" style={inputStyle}
        />
      </div>
      <button type="submit" disabled={saving} className="w-full py-3 rounded-lg text-sm font-semibold flex items-center justify-center gap-2" style={{ backgroundColor: '#3d3530', color: '#f5f0eb', opacity: saving ? 0.6 : 1 }}>
        {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save password
      </button>
      <button type="button" onClick={onDone} className="w-full text-xs hover:underline" style={{ color: '#7a6e66' }}>
        I already have a password
      </button>
    </form>
  );
}
