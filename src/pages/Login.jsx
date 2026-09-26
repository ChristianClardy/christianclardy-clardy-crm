import { useState, useEffect } from 'react';
import { HardHat, Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function Login() {
  // No sign-up: accounts only come from invites (Settings, or a sub's
  // Subcontractor Portal invite), and public sign-ups are off in Supabase.
  const [mode, setMode]         = useState('login');   // 'login' | 'reset' | 'update_password'
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [message, setMessage]   = useState(null);   // { type: 'success'|'error', text }

  // Detect when Supabase redirects back with a password recovery token
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('update_password');
        setMessage({ type: 'success', text: 'Enter your new password below.' });
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const clearMessage = () => setMessage(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    clearMessage();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      window.location.href = '/';
    }
    setLoading(false);
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setLoading(true);
    clearMessage();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setMessage({ type: 'success', text: 'Password reset link sent — check your inbox.' });
    }
    setLoading(false);
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    clearMessage();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setMessage({ type: 'success', text: 'Password updated! Signing you in…' });
      setTimeout(() => { window.location.href = '/'; }, 1500);
    }
    setLoading(false);
  };

  const submit = mode === 'login'            ? handleLogin
               : mode === 'update_password'  ? handleUpdatePassword
               :                               handleReset;

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#f5f0eb', fontFamily: "'Georgia', serif" }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: '#3d3530' }}>
            <HardHat className="w-6 h-6" style={{ color: '#b5965a' }} />
          </div>
          <h1 className="text-2xl font-bold tracking-wide" style={{ color: '#3d3530' }}>Clardy.io</h1>
          <p className="text-sm mt-1" style={{ color: '#7a6e66' }}>Management Platform</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-8 shadow-lg" style={{ backgroundColor: '#fff', border: '1px solid #ddd5c8' }}>
          <h2 className="text-lg font-semibold mb-6" style={{ color: '#3d3530' }}>
            {mode === 'login' ? 'Sign in' : mode === 'update_password' ? 'Set new password' : 'Reset password'}
          </h2>

          {message && (
            <div
              className="mb-4 px-4 py-3 rounded-lg text-sm"
              style={{
                backgroundColor: message.type === 'error' ? '#fef2f2' : '#f0fdf4',
                color:           message.type === 'error' ? '#b91c1c' : '#15803d',
                border:          `1px solid ${message.type === 'error' ? '#fecaca' : '#bbf7d0'}`,
              }}
            >
              {message.text}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            {mode !== 'update_password' && <div>
              <label className="block text-xs font-semibold mb-1.5 tracking-wide uppercase" style={{ color: '#5a4f48' }}>
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#a89e96' }} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm outline-none transition-all"
                  style={{ border: '1px solid #ddd5c8', color: '#3d3530', backgroundColor: '#faf8f5' }}
                  onFocus={e => (e.target.style.borderColor = '#b5965a')}
                  onBlur={e => (e.target.style.borderColor = '#ddd5c8')}
                />
              </div>
            </div>}

            {(mode !== 'reset') && (
              <div>
                <label className="block text-xs font-semibold mb-1.5 tracking-wide uppercase" style={{ color: '#5a4f48' }}>
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#a89e96' }} />
                  <input
                    type={showPass ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-10 py-2.5 rounded-lg text-sm outline-none transition-all"
                    style={{ border: '1px solid #ddd5c8', color: '#3d3530', backgroundColor: '#faf8f5' }}
                    onFocus={e => (e.target.style.borderColor = '#b5965a')}
                    onBlur={e => (e.target.style.borderColor = '#ddd5c8')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: '#a89e96' }}
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-opacity mt-2"
              style={{ backgroundColor: '#3d3530', color: '#f5f0eb', opacity: loading ? 0.7 : 1 }}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'login' ? 'Sign in' : mode === 'update_password' ? 'Update password' : 'Send reset link'}
            </button>
          </form>

          {/* Mode switchers */}
          <div className="mt-6 space-y-2 text-center text-sm" style={{ color: '#7a6e66' }}>
            {mode === 'login' && (
              <>
                <p>
                  <button onClick={() => { setMode('reset'); clearMessage(); }} className="hover:underline" style={{ color: '#a89e96' }}>
                    Forgot password?
                  </button>
                </p>
                <p className="text-xs">Need an account? Ask your Principle Outdoor Living admin for an invite.</p>
              </>
            )}
            {mode === 'reset' && (
              <p>
                <button onClick={() => { setMode('login'); clearMessage(); }} className="font-semibold hover:underline" style={{ color: '#b5965a' }}>
                  Back to sign in
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
