import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  FlaskConical,
  HelpCircle,
  CheckCircle2,
} from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuthActions } from '@/hooks/useAuth';

export function LoginForm() {
  const { login, enterDemo } = useAuthActions();
  const navigate = useNavigate();

  const [authMode, setAuthMode] = useState<'lms' | 'campus'>('lms');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [emailForSetup, setEmailForSetup] = useState('');
  const [requiresEmailStep, setRequiresEmailStep] = useState(false);
  const [verifiedAdmission, setVerifiedAdmission] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [showForgotHelp, setShowForgotHelp] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!identifier.trim() || !password) {
      setError('Please enter your admission number and password.');
      return;
    }

    if (requiresEmailStep && !emailForSetup.trim()) {
      setError('Please enter your email address to complete your profile.');
      return;
    }

    setIsLoading(true);
    const result = await login({
      admissionNumber: identifier.trim(),
      identifier: identifier.trim(),
      email: requiresEmailStep ? emailForSetup.trim() : undefined,
      password,
      mode: authMode,
      rememberMe,
    });
    setIsLoading(false);

    if (result.success) {
      navigate('/dashboard');
      return;
    }

    if (result.requiresEmail) {
      setRequiresEmailStep(true);
      setVerifiedAdmission(result.verifiedAdmissionNumber || identifier.trim().toUpperCase());
      return;
    }

    setError(result.message || 'Sign in failed. Please check your credentials.');
  };

  const handleEnterDemo = async () => {
    setError('');
    setIsDemoLoading(true);
    const result = await enterDemo();
    setIsDemoLoading(false);
    if (!result.success) {
      setError(result.message || 'Unable to start Demo Mode.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1.5">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50/90 border border-indigo-200/70 px-2.5 py-0.5 text-[11px] font-medium text-indigo-700">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>Galgotias University Portal</span>
        </div>
        <h2 className="text-xl font-semibold text-slate-900 tracking-tight">
          Sign in to CampusSarthi
        </h2>
        <p className="text-xs text-slate-500">
          {authMode === 'lms'
            ? 'Authenticate directly with your Galgotias LMS credentials to sync live courses and deadlines.'
            : 'Sign in using your independent CampusSarthi application password.'}
        </p>
      </div>

      {/* Mode Segmented Control */}
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-900/[0.04] p-1 border border-slate-900/[0.06]">
        <button
          type="button"
          onClick={() => {
            setAuthMode('lms');
            setError('');
            setRequiresEmailStep(false);
          }}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
            authMode === 'lms'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Galgotias LMS
        </button>
        <button
          type="button"
          onClick={() => {
            setAuthMode('campus');
            setError('');
            setRequiresEmailStep(false);
          }}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
            authMode === 'campus'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          CampusSarthi Password
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/90 px-3.5 py-2.5 text-xs text-rose-700">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {requiresEmailStep && (
          <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/90 px-3.5 py-2.5 text-xs text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
            <span>
              Galgotias LMS verified for <strong>{verifiedAdmission}</strong>. Add your email address below to create your CampusSarthi profile.
            </span>
          </div>
        )}

        <Input
          label={authMode === 'lms' ? 'Admission Number' : 'Admission Number or Email'}
          type="text"
          placeholder={authMode === 'lms' ? 'e.g. 24SCSE101001' : '24SCSE101001 or student@email.com'}
          value={identifier}
          onChange={(e) => {
            setIdentifier(e.target.value);
            if (requiresEmailStep) setRequiresEmailStep(false);
          }}
          required
          autoComplete="username"
        />

        {requiresEmailStep && (
          <Input
            label="Email Address"
            type="email"
            placeholder="you@example.com"
            value={emailForSetup}
            onChange={(e) => setEmailForSetup(e.target.value)}
            required
            autoComplete="email"
          />
        )}

        <Input
          label={authMode === 'lms' ? 'University LMS Password' : 'CampusSarthi Password'}
          type={showPassword ? 'text' : 'password'}
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          rightElement={
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="rounded-lg p-1 text-slate-400 hover:text-slate-700 transition-colors"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
        />

        {/* Remember & Forgot Row */}
        <div className="flex items-center justify-between text-xs">
          <label className="inline-flex items-center gap-2 text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span>Remember session</span>
          </label>
          <button
            type="button"
            onClick={() => setShowForgotHelp((v) => !v)}
            className="inline-flex items-center gap-1 text-slate-500 hover:text-indigo-600 transition-colors font-medium"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            <span>Forgot password?</span>
          </button>
        </div>

        {showForgotHelp && (
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/90 p-3 text-[11px] text-slate-600 space-y-1">
            <p className="font-medium text-slate-800">Password Recovery Guidance</p>
            <p>
              University LMS passwords are managed directly on{' '}
              <a
                href="https://gulms.galgotiasuniversity.org/login/forgot_password.php"
                target="_blank"
                rel="noreferrer"
                className="text-indigo-600 underline"
              >
                gulms.galgotiasuniversity.org
              </a>
              . If you previously set an independent CampusSarthi password, sign in via Galgotias LMS first and update it in Settings.
            </p>
          </div>
        )}

        <Button
          type="submit"
          variant="default"
          size="lg"
          isLoading={isLoading}
          className="w-full"
        >
          {isLoading
            ? authMode === 'lms'
              ? 'Verifying with Galgotias LMS...'
              : 'Signing in...'
            : authMode === 'lms'
            ? requiresEmailStep
              ? 'Finish Setup & Enter Dashboard'
              : 'Connect with Galgotias LMS'
            : 'Continue with CampusSarthi Account'}
          {!isLoading && <ArrowRight className="h-4 w-4" />}
        </Button>

        {/* LMS Status Note */}
        <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Target: gulms.galgotiasuniversity.org
          </span>
          <span>Encrypted cookie session</span>
        </div>
      </form>

      {/* Register + Explicit Optional Demo */}
      <div className="pt-4 border-t border-slate-900/[0.06] space-y-3">
        <p className="text-center text-xs text-slate-500">
          New to CampusSarthi?{' '}
          <Link to="/register" className="font-medium text-indigo-600 hover:text-indigo-700">
            Create student account
          </Link>
        </p>

        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={handleEnterDemo}
            disabled={isDemoLoading || isLoading}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-900/[0.04] transition-colors disabled:opacity-50"
          >
            <FlaskConical className="h-3.5 w-3.5 text-slate-400" />
            <span>{isDemoLoading ? 'Opening Demo Sandbox...' : 'Explore Demo Mode (Sample Data)'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
