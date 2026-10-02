import { useState, useEffect } from 'react';
import { HardHat, Lock, Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { isStandalone } from '@/lib/installPrompt';
import InstallAppStep, { SetupProgress } from '@/components/app/InstallAppStep';

// Where each kind of login lands, from the portal_role its invite set.
const DESTINATION = {
  customer:        { label: 'my project', href: '/CustomerPortal' },
  subcontractor:   { label: 'my jobs',    href: '/BuilderPortal' },
  project_manager: { label: 'my jobs',    href: '/' },
};
const STEPS = ['Password', 'Install'];

/**
 * Shown when a user arrives via an emailed invite or sign-in link (staff,
 * PMs, subs and customers alike). Supabase has already established a session
 * from the link; they choose a password, then get the same "add Clardy to
 * your phone / computer" guide as a texted portal link (JoinPortal).
 */
export default function SetPassword() {
  const [password, setPassword]     = useState('');
  const [confirm, setConfirm]       = useState('');
  const [showPass, setShowPass]     = useState(false);
  const [loading, setLoading]       = useState(false);
  const [done, setDone]             = useState(false);
  const [account, setAccount]       = useState(null); // { email, portal_role }
  const [error, setError]           = useState('');
  const [sessionReady, setSessionReady] = useState(false);

  // Wait for Supabase to exchange the invite token for a real session
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        setSessionReady(true);
      }
    });
    // Also check if session is already active
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    if (updateErr) {
      setError(updateErr.message);
      setLoading(false);
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    setAccount({ email: user?.email || '', portal_role: user?.user_metadata?.portal_role || null });
    setDone(true);
    if (isStandalone()) setTimeout(() => { window.location.href = destination(user?.user_metadata?.portal_role).href; }, 1800);
  };

  const destination = (role) => DESTINATION[role] || { label: 'the app', href: '/' };
  const goToApp = () => { window.location.href = destination(account?.portal_role).href; };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#f5f0eb', fontFamily: "'Georgia', serif" }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: '#3d3530' }}>
            <HardHat className="w-6 h-6" style={{ color: '#b5965a' }} />
          </div>
          <h1 className="text-2xl font-bold tracking-wide" style={{ color: '#3d3530' }}>Clardy.io</h1>
          <p className="text-sm mt-1" style={{ color: '#7a6e66' }}>Management Platform</p>
        </div>

        {!isStandalone() && <SetupProgress steps={STEPS} current={done ? 1 : 0} />}

        <div className="rounded-2xl p-8 shadow-lg" style={{ backgroundColor: '#fff', border: '1px solid #ddd5c8' }}>
          {done && !isStandalone() ? (
            <InstallAppStep email={account?.email} destination={destination(account?.portal_role).label} onDone={goToApp} />
          ) : done ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <CheckCircle2 className="w-10 h-10" style={{ color: '#16a34a' }} />
              <p className="font-semibold text-slate-900">Password set — welcome!</p>
              <p className="text-sm text-slate-500">Taking you to the app…</p>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-lg font-semibold" style={{ color: '#3d3530' }}>Welcome to Clardy.io</h2>
                <p className="text-sm mt-1" style={{ color: '#7a6e66' }}>Choose a password to finish setting up your account.</p>
              </div>

              {!sessionReady && (
                <div className="mb-4 flex items-center gap-2 text-sm" style={{ color: '#7a6e66' }}>
                  <Loader2 className="w-4 h-4 animate-spin" /> Verifying invite link…
                </div>
              )}

              {error && (
                <div className="mb-4 px-4 py-3 rounded-lg text-sm" style={{ backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold mb-1.5 tracking-wide uppercase" style={{ color: '#5a4f48' }}>
                    New Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#a89e96' }} />
                    <input
                      type={showPass ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      className="w-full pl-9 pr-10 py-2.5 rounded-lg text-sm outline-none transition-all"
                      style={{ border: '1px solid #ddd5c8', color: '#3d3530', backgroundColor: '#faf8f5' }}
                      onFocus={e => (e.target.style.borderColor = '#b5965a')}
                      onBlur={e => (e.target.style.borderColor = '#ddd5c8')}
                    />
                    <button type="button" onClick={() => setShowPass(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: '#a89e96' }}>
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1.5 tracking-wide uppercase" style={{ color: '#5a4f48' }}>
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#a89e96' }} />
                    <input
                      type={showPass ? 'text' : 'password'}
                      required
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      placeholder="Re-enter password"
                      className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm outline-none transition-all"
                      style={{ border: '1px solid #ddd5c8', color: '#3d3530', backgroundColor: '#faf8f5' }}
                      onFocus={e => (e.target.style.borderColor = '#b5965a')}
                      onBlur={e => (e.target.style.borderColor = '#ddd5c8')}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !sessionReady}
                  className="w-full py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-opacity mt-2"
                  style={{ backgroundColor: '#3d3530', color: '#f5f0eb', opacity: (loading || !sessionReady) ? 0.6 : 1 }}
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? 'Setting password…' : 'Set Password & Sign In'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
