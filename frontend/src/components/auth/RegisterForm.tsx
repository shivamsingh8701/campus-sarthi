import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowRight, AlertCircle, ShieldCheck } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuthActions } from '@/hooks/useAuth';

function getPasswordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw) && /[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  if (score <= 1) return { score: 1, label: 'Weak', color: 'bg-rose-400' };
  if (score === 2) return { score: 2, label: 'Fair', color: 'bg-amber-400' };
  if (score === 3) return { score: 3, label: 'Good', color: 'bg-indigo-500' };
  return { score: 4, label: 'Strong', color: 'bg-emerald-500' };
}

export function RegisterForm() {
  const { register } = useAuthActions();
  const navigate = useNavigate();

  const [authType, setAuthType] = useState<'lms' | 'campus'>('lms');
  const [form, setForm] = useState({
    name: '',
    admissionNumber: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setError('');
  };

  const strength = getPasswordStrength(form.password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.admissionNumber.trim()) {
      setError('University admission number is required.');
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    const minLen = authType === 'campus' ? 8 : 6;
    if (form.password.length < minLen) {
      setError(`Password must be at least ${minLen} characters.`);
      return;
    }

    setIsLoading(true);
    const result = await register({
      name: form.name.trim() || undefined,
      admissionNumber: form.admissionNumber.trim().toUpperCase(),
      email: form.email.trim(),
      password: form.password,
      confirmPassword: form.confirmPassword,
      authType,
    });
    setIsLoading(false);

    if (result.success) {
      navigate('/dashboard');
    } else {
      setError(result.message || 'Registration failed.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50/90 border border-indigo-200/70 px-2.5 py-0.5 text-[11px] font-medium text-indigo-700">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>Student Onboarding</span>
        </div>
        <h2 className="text-xl font-semibold text-slate-900 tracking-tight">
          Create your account
        </h2>
        <p className="text-xs text-slate-500">
          Verify your Galgotias University identity once to sync courses, deadlines, and PDF solutions.
        </p>
      </div>

      {/* Registration Mode Selector */}
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-900/[0.04] p-1 border border-slate-900/[0.06]">
        <button
          type="button"
          onClick={() => {
            setAuthType('lms');
            setError('');
          }}
          className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
            authType === 'lms'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Verify via LMS
        </button>
        <button
          type="button"
          onClick={() => {
            setAuthType('campus');
            setError('');
          }}
          className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
            authType === 'campus'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Standalone Password
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3.5">
        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50/90 px-3.5 py-2.5 text-xs text-rose-700">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Full Name"
            type="text"
            placeholder="e.g. Ananya Verma"
            value={form.name}
            onChange={handleChange('name')}
            autoComplete="name"
          />
          <Input
            label="Admission Number"
            type="text"
            placeholder="e.g. 24SCSE101001"
            value={form.admissionNumber}
            onChange={handleChange('admissionNumber')}
            required
          />
        </div>

        <Input
          label="Email Address"
          type="email"
          placeholder="student@galgotiasuniversity.edu.in"
          value={form.email}
          onChange={handleChange('email')}
          required
          autoComplete="email"
        />

        <div className="space-y-1.5">
          <Input
            label={authType === 'lms' ? 'University LMS Password' : 'Create App Password'}
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            value={form.password}
            onChange={handleChange('password')}
            required
            autoComplete="new-password"
            rightElement={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-700 transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
          />
          {form.password.length > 0 && authType === 'campus' && (
            <div className="flex items-center gap-2">
              <div className="flex flex-1 gap-1">
                {[1, 2, 3, 4].map((level) => (
                  <div
                    key={level}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      level <= strength.score ? strength.color : 'bg-slate-200'
                    }`}
                  />
                ))}
              </div>
              <span className="text-[11px] text-slate-500">{strength.label}</span>
            </div>
          )}
          <p className="text-[11px] text-slate-500">
            {authType === 'lms'
              ? 'Verified live against gulms.galgotiasuniversity.org and never stored in plaintext.'
              : 'Minimum 8 characters. Connect Galgotias LMS later from Integrations.'}
          </p>
        </div>

        <Input
          label="Confirm Password"
          type={showConfirm ? 'text' : 'password'}
          placeholder="••••••••"
          value={form.confirmPassword}
          onChange={handleChange('confirmPassword')}
          required
          autoComplete="new-password"
          rightElement={
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              className="rounded-lg p-1 text-slate-400 hover:text-slate-700 transition-colors"
              aria-label={showConfirm ? 'Hide password' : 'Show password'}
            >
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
        />

        <Button type="submit" variant="default" size="lg" isLoading={isLoading} className="w-full mt-1">
          {isLoading
            ? authType === 'lms'
              ? 'Verifying with Galgotias LMS...'
              : 'Creating account...'
            : authType === 'lms'
            ? 'Verify & Create Account'
            : 'Create CampusSarthi Account'}
          {!isLoading && <ArrowRight className="h-4 w-4" />}
        </Button>
      </form>

      <div className="pt-3 border-t border-slate-900/[0.06] text-center">
        <p className="text-xs text-slate-500">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-700">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
