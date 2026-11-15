import React, { useState, useEffect } from 'react';
import {
  Eye,
  EyeOff,
  Lock,
  User,
  AlertCircle,
  HelpCircle,
  ShieldCheck,
  Loader2,
  CheckCircle2,
  Mail,
  UserCheck,
} from 'lucide-react';
import { WurthLogo } from './WurthLogo';
import { ApiError, apiBootstrapAdmin, apiLogin } from '../services/api';
import type { UserProfile } from '../types';

interface LoginScreenProps {
  bootstrapInitialized: boolean;
  onLoginSuccess: (user: UserProfile) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  bootstrapInitialized,
  onLoginSuccess,
}) => {
  // Standard Sign-In State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // One-Time Initial Administrator Setup State (only shown when !bootstrapInitialized)
  const [isBootstrapLocked, setIsBootstrapLocked] = useState(bootstrapInitialized);
  const [setupMode, setSetupMode] = useState(!bootstrapInitialized);
  const [adminDisplayName, setAdminDisplayName] = useState('IT System Administrator');
  const [adminEmail, setAdminEmail] = useState('it.admin@wurth.lk');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirmPassword, setSetupConfirmPassword] = useState('');
  const [showSetupPassword, setShowSetupPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [showResetHelp, setShowResetHelp] = useState(false);

  useEffect(() => {
    setIsBootstrapLocked(bootstrapInitialized);
    setSetupMode(!bootstrapInitialized);
  }, [bootstrapInitialized]);

  const hasMinLen = setupPassword.length >= 8;
  const hasUpperLower = /[a-z]/.test(setupPassword) && /[A-Z]/.test(setupPassword);
  const hasNumOrSymbol = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(setupPassword);
  const passwordsMatch =
    setupPassword.length > 0 && setupPassword === setupConfirmPassword;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = username.trim();
    if (!cleanUser || !password) {
      setErrorMsg('Please enter both your username and password.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);
    try {
      const user = await apiLogin(cleanUser, password);
      onLoginSuccess(user);
    } catch (err) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : 'Invalid username or password.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleBootstrapSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    if (!hasMinLen || !hasUpperLower || !hasNumOrSymbol) {
      setErrorMsg(
        'Password must be at least 8 characters and include uppercase, lowercase, and a number or symbol.'
      );
      return;
    }
    if (!passwordsMatch) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const user = await apiBootstrapAdmin({
        password: setupPassword,
        confirmPassword: setupConfirmPassword,
        displayName: adminDisplayName.trim() || 'IT System Administrator',
        email: adminEmail.trim() || 'it.admin@wurth.lk',
      });
      onLoginSuccess(user);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        // Already initialized elsewhere — transition cleanly to standard sign in
        setIsBootstrapLocked(true);
        setSetupMode(false);
        setUsername('it.admin');
        setInfoMsg(
          'The System Administrator account (it.admin) is already initialized. Please sign in below.'
        );
        return;
      }
      const msg =
        err instanceof Error && err.message
          ? err.message
          : 'Unable to complete initial administrator setup.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-white flex flex-col justify-between relative overflow-x-hidden">
      {/* Top Corporate Accent Stripe */}
      <div className="h-1.5 w-full bg-[#CC0000]" />

      {/* Main Centered Container */}
      <main className="flex-1 flex items-center justify-center px-4 py-8 sm:px-6">
        <div className="w-full max-w-md space-y-6">
          {/* Brand Header */}
          <div className="flex flex-col items-center text-center space-y-3">
            <WurthLogo size="lg" showSubtitle={false} />
            <div className="space-y-1">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                WÜRTH Recovery Intelligence
              </h1>
              <p className="text-xs text-slate-500">
                Returned-Cheque Risk Analytics &amp; Recovery Governance Portal
              </p>
            </div>
          </div>

          {/* Card */}
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 sm:p-8 space-y-5">
            {setupMode ? (
              <>
                <div className="border-b border-slate-100 pb-3 flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                      Initial System Administrator Setup
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      One-time activation for the primary administrator account (
                      <code className="font-mono text-slate-800">it.admin</code>).
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-50 text-[#CC0000] border border-red-200 text-[10px] font-semibold uppercase tracking-wide shrink-0">
                    <ShieldCheck className="w-3 h-3" />
                    One-Time
                  </span>
                </div>

                <div className="p-3 rounded-md bg-slate-50 border border-slate-200 text-[11px] text-slate-700 leading-relaxed">
                  No administrator account exists in this environment yet. Set a strong
                  password below to activate <code className="font-mono font-semibold">it.admin</code>.
                  After activation, this setup screen locks permanently and additional users can
                  be created under <strong>User Management</strong>.
                </div>

                {errorMsg && (
                  <div
                    role="alert"
                    className="p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2"
                  >
                    <AlertCircle className="w-4 h-4 text-[#CC0000] shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <form onSubmit={handleBootstrapSubmit} className="space-y-3.5" noValidate>
                  <div>
                    <label
                      htmlFor="setup-username"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Administrator Username
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="setup-username"
                        type="text"
                        readOnly
                        value="it.admin"
                        className="w-full pl-9 pr-20 py-2 text-sm font-mono font-semibold text-slate-800 bg-slate-100 border border-slate-300 rounded-md cursor-not-allowed"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-500 uppercase">
                        System Admin
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="setup-name"
                        className="block text-xs font-semibold text-slate-700 mb-1"
                      >
                        Full Name
                      </label>
                      <div className="relative">
                        <UserCheck className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="setup-name"
                          type="text"
                          disabled={loading}
                          value={adminDisplayName}
                          onChange={(e) => setAdminDisplayName(e.target.value)}
                          className="w-full pl-8 pr-2.5 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-300 rounded-md focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000]"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="setup-email"
                        className="block text-xs font-semibold text-slate-700 mb-1"
                      >
                        Corporate Email
                      </label>
                      <div className="relative">
                        <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="setup-email"
                          type="email"
                          disabled={loading}
                          value={adminEmail}
                          onChange={(e) => setAdminEmail(e.target.value)}
                          className="w-full pl-8 pr-2.5 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-300 rounded-md focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000]"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="setup-password"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Create Administrator Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="setup-password"
                        type={showSetupPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        autoFocus
                        disabled={loading}
                        value={setupPassword}
                        onChange={(e) => setSetupPassword(e.target.value)}
                        placeholder="Enter a strong password"
                        className="w-full pl-9 pr-10 py-2 text-sm text-slate-900 bg-slate-50 border border-slate-300 rounded-md focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSetupPassword(!showSetupPassword)}
                        aria-label={showSetupPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
                      >
                        {showSetupPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="setup-confirm-password"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Confirm Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="setup-confirm-password"
                        type={showSetupPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        disabled={loading}
                        value={setupConfirmPassword}
                        onChange={(e) => setSetupConfirmPassword(e.target.value)}
                        placeholder="Re-enter password"
                        className="w-full pl-9 pr-3 py-2 text-sm text-slate-900 bg-slate-50 border border-slate-300 rounded-md focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000]"
                      />
                    </div>
                  </div>

                  {/* Password complexity indicators */}
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-md grid grid-cols-2 gap-1.5 text-[11px]">
                    <div
                      className={`flex items-center gap-1.5 ${
                        hasMinLen ? 'text-emerald-700 font-medium' : 'text-slate-500'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>8+ characters</span>
                    </div>
                    <div
                      className={`flex items-center gap-1.5 ${
                        hasUpperLower ? 'text-emerald-700 font-medium' : 'text-slate-500'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Upper &amp; lowercase</span>
                    </div>
                    <div
                      className={`flex items-center gap-1.5 ${
                        hasNumOrSymbol ? 'text-emerald-700 font-medium' : 'text-slate-500'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Number or symbol</span>
                    </div>
                    <div
                      className={`flex items-center gap-1.5 ${
                        passwordsMatch ? 'text-emerald-700 font-medium' : 'text-slate-500'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Passwords match</span>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 bg-[#CC0000] hover:bg-[#B00000] disabled:bg-red-400 text-white text-sm font-semibold rounded-md shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Activating Administrator...</span>
                      </>
                    ) : (
                      <span>Activate it.admin &amp; Sign In</span>
                    )}
                  </button>

                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMsg(null);
                        setSetupMode(false);
                      }}
                      className="text-[11px] font-medium text-slate-500 hover:text-[#CC0000] underline cursor-pointer"
                    >
                      Already configured? Switch to Sign In
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <div className="border-b border-slate-100 pb-3">
                  <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                    Enterprise Sign In
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Sign in with your assigned WÜRTH company username and password.
                  </p>
                </div>

                {infoMsg && (
                  <div className="p-3 rounded-md bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                    <span>{infoMsg}</span>
                  </div>
                )}

                {errorMsg && (
                  <div
                    role="alert"
                    className="p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2"
                  >
                    <AlertCircle className="w-4 h-4 text-[#CC0000] shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <form onSubmit={handleLoginSubmit} className="space-y-4" noValidate>
                  <div>
                    <label
                      htmlFor="login-username"
                      className="block text-xs font-semibold text-slate-700 mb-1.5"
                    >
                      Username
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="login-username"
                        name="username"
                        type="text"
                        autoComplete="username"
                        autoFocus
                        disabled={loading}
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="e.g. it.admin"
                        className="w-full pl-9 pr-3 py-2 text-sm text-slate-900 bg-slate-50 border border-slate-300 rounded-md focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] transition-colors disabled:opacity-60"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label
                        htmlFor="login-password"
                        className="block text-xs font-semibold text-slate-700"
                      >
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowResetHelp(!showResetHelp)}
                        className="text-[11px] font-medium text-[#CC0000] hover:underline inline-flex items-center gap-1"
                      >
                        <HelpCircle className="w-3 h-3" />
                        <span>Password Reset Help</span>
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="login-password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        disabled={loading}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        className="w-full pl-9 pr-10 py-2 text-sm text-slate-900 bg-slate-50 border border-slate-300 rounded-md focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#CC0000]/20 focus:border-[#CC0000] transition-colors disabled:opacity-60"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {showResetHelp && (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-600 space-y-1">
                      <div className="font-semibold text-slate-800">
                        Administrator-Assisted Password Recovery
                      </div>
                      <p className="leading-relaxed text-[11px]">
                        Self-service external resets are disabled for internal financial
                        governance. Contact your IT System Administrator (<code>it.admin</code>)
                        to verify your identity, issue a temporary password, and unlock your
                        account.
                      </p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 bg-[#CC0000] hover:bg-[#B00000] disabled:bg-red-400 text-white text-sm font-semibold rounded-md shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Authenticating...</span>
                      </>
                    ) : (
                      <span>Sign In</span>
                    )}
                  </button>

                  {!isBootstrapLocked && (
                    <div className="text-center pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setErrorMsg(null);
                          setSetupMode(true);
                        }}
                        className="text-[11px] font-medium text-[#CC0000] hover:underline cursor-pointer"
                      >
                        First-time setup? Activate initial it.admin account
                      </button>
                    </div>
                  )}
                </form>
              </>
            )}
          </div>
        </div>
      </main>

      {/* Required Corporate Footer */}
      <footer className="py-4 px-4 text-center border-t border-slate-100 bg-slate-50/60">
        <p className="text-[11px] font-medium text-slate-500 tracking-wide">
          WÜRTH Lanka (PVT) LTD | Internal Business Application
        </p>
      </footer>
    </div>
  );
};

