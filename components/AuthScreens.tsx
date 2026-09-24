import React, { useState, useEffect } from 'react';
import { Shield, Lock, Mail, User, Eye, EyeOff, AlertTriangle, CheckCircle, ArrowRight, Upload } from 'lucide-react';
import { userAdminSetup, userLogin, userGetLicenseAdminEmail, LocalUser, pickFile, restoreBackup } from '../electron-api';

// ─── ADMIN SETUP SCREEN (FIRST RUN) ──────────────────────────────────────────
export const AdminSetupScreen: React.FC<{
  onSetupComplete: (adminUser: LocalUser) => void;
  onRestoreComplete?: () => void;
}> = ({ onSetupComplete, onRestoreComplete }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [licenseEmailFound, setLicenseEmailFound] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const licEmail = await userGetLicenseAdminEmail();
        if (licEmail) {
          setEmail(licEmail);
          setLicenseEmailFound(true);
        }
      } catch (e) {
        console.error('Failed to get license admin email:', e);
      }
    })();
  }, []);

  const [restoring, setRestoring] = useState(false);

  const handleDirectRestore = async () => {
    try {
      const filePath = await pickFile([{ name: 'Billing Backup', extensions: ['json'] }]);
      if (!filePath) return;
      setRestoring(true);
      setError(null);
      const res = await restoreBackup(filePath);
      if (res.success) {
        if (onRestoreComplete) {
          onRestoreComplete();
        } else {
          window.location.reload();
        }
      } else {
        setError(`Restore failed: ${res.error}`);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to restore backup.');
    } finally {
      setRestoring(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Please enter your full name.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 4) {
      setError('Password must be at least 4 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await userAdminSetup(name.trim(), email.trim(), password);
      if (res.success && res.user) {
        onSetupComplete(res.user);
      } else {
        setError(res.error || 'Failed to complete setup.');
      }
    } catch (e: any) {
      setError(e.message || 'Setup error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl text-white">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/20">
            <Shield className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Setup Administrator</h1>
          <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
            Welcome to Universal Billing System. Create your primary local administrator account to manage your business, bills, and colleague access.
          </p>
          {licenseEmailFound && (
            <div className="mt-3 inline-flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] px-3 py-1 rounded-full font-medium">
              <CheckCircle size={13} /> License admin email verified
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-center gap-2">
            <AlertTriangle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
              Admin Full Name
            </label>
            <div className="relative">
              <User className="absolute left-3.5 top-3 text-slate-500 pointer-events-none" size={16} />
              <input
                type="text"
                required
                placeholder="e.g. Rajesh Sharma"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                Admin Email Address
              </label>
              {licenseEmailFound && (
                <span className="text-[10px] text-amber-400/90 font-medium flex items-center gap-1">
                  <Lock size={10} /> Locked to License
                </span>
              )}
            </div>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3 text-slate-500 pointer-events-none" size={16} />
              <input
                type="email"
                required
                placeholder="admin@yourbusiness.com"
                value={email}
                readOnly={licenseEmailFound}
                onChange={e => {
                  if (!licenseEmailFound) setEmail(e.target.value);
                }}
                className={`w-full bg-slate-800/80 border rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none transition-all ${
                  licenseEmailFound
                    ? 'border-emerald-500/50 text-emerald-300 bg-slate-800/40 cursor-not-allowed'
                    : 'border-slate-700 text-white placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                }`}
              />
            </div>
            {licenseEmailFound && (
              <p className="text-[11px] text-slate-400 mt-1">
                This administrator email is assigned to this license key and cannot be changed.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
              Admin Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3 text-slate-500 pointer-events-none" size={16} />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="Minimum 4 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-3 text-slate-400 hover:text-white"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
              Confirm Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3 text-slate-500 pointer-events-none" size={16} />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="Repeat password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || restoring}
            className="w-full mt-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? 'Setting Up...' : 'Complete Setup & Launch'} <ArrowRight size={16} />
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-800 text-center">
          <p className="text-xs text-slate-400 mb-2.5">
            Already have a backup file from this or another computer?
          </p>
          <button
            type="button"
            disabled={loading || restoring}
            onClick={handleDirectRestore}
            className="w-full py-2.5 px-4 rounded-xl border border-slate-700 bg-slate-800/60 hover:bg-slate-800 text-xs font-semibold text-slate-300 hover:text-white transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Upload size={14} className="text-indigo-400" />
            {restoring ? 'Restoring Backup...' : 'Restore from Backup (.json)'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── LOGIN SCREEN ────────────────────────────────────────────────────────────
export const LoginScreen: React.FC<{
  onLoginSuccess: (user: LocalUser) => void;
}> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState(() => localStorage.getItem('last_user_email') || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('Please enter your email.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    try {
      const res = await userLogin(email.trim(), password);
      if (res.success && res.user) {
        localStorage.setItem('last_user_email', email.trim());
        onLoginSuccess(res.user);
      } else {
        setError(res.error || 'Invalid credentials or inactive account.');
      }
    } catch (e: any) {
      setError(e.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl text-white">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/20">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Sign In</h1>
          <p className="text-xs text-slate-400 mt-1.5">
            Universal Billing System • Sign in with your colleague or admin account
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-center gap-2">
            <AlertTriangle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3 text-slate-500 pointer-events-none" size={16} />
              <input
                type="email"
                required
                placeholder="colleague@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3 text-slate-500 pointer-events-none" size={16} />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="Enter your password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-3 text-slate-400 hover:text-white"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? 'Signing In...' : 'Sign In'} <ArrowRight size={16} />
          </button>
        </form>
      </div>
    </div>
  );
};
