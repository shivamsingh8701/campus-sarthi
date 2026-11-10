import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuthActions } from '@/hooks/useAuth';
import { Sparkles } from 'lucide-react';

export const DEMO_CREDENTIALS = {
  email: 'demo@galgotiasuniversity.org',
  password: 'DemoStudent@123',
  admissionNumber: '21SCSE101001',
  lmsPassword: 'DemoLMSPassword@123',
};

export function LoginForm() {
  const navigate = useNavigate();
  const { login } = useAuthActions();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const executeLogin = async (loginEmail: string, loginPass: string) => {
    setError('');
    setIsLoading(true);
    const result = await login(loginEmail, loginPass);
    setIsLoading(false);
    if (result.success) {
      navigate('/dashboard');
    } else {
      setError(result.message || 'Login failed');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeLogin(email, password);
  };

  const handleDemoLogin = async () => {
    setEmail(DEMO_CREDENTIALS.email);
    setPassword(DEMO_CREDENTIALS.password);
    await executeLogin(DEMO_CREDENTIALS.email, DEMO_CREDENTIALS.password);
  };

  return (
    <div className="space-y-4">
      {/* Quick Demo Access Card */}
      <div className="rounded-lg border border-indigo-100 bg-indigo-50/70 p-3 text-xs text-indigo-900">
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold flex items-center gap-1.5 text-indigo-700">
            <Sparkles className="h-3.5 w-3.5" /> Demo Account
          </span>
          <button
            type="button"
            onClick={handleDemoLogin}
            disabled={isLoading}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-800 underline disabled:opacity-50"
          >
            Auto Sign In
          </button>
        </div>
        <div className="space-y-0.5 text-gray-600 font-mono text-[11px] select-all">
          <div><span className="text-gray-400 select-none">ID: </span>{DEMO_CREDENTIALS.email}</div>
          <div><span className="text-gray-400 select-none">PW: </span>{DEMO_CREDENTIALS.password}</div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Admission Number or University Email"
          type="text"
          placeholder="e.g. 21SCSE101001 or you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="username"
        />
        <Input
          label="Password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />

        {error && (
          <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" isLoading={isLoading}>
          Sign In
        </Button>

        <p className="text-center text-xs text-gray-500">
          Don&apos;t have an account?{' '}
          <a href="/register" className="font-medium text-indigo-600 hover:underline">
            Create one
          </a>
        </p>
      </form>
    </div>
  );
}
