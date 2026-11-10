import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuthActions } from '@/hooks/useAuth';

function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { score, label: 'Weak', color: 'bg-red-400' };
  if (score === 2) return { score, label: 'Fair', color: 'bg-yellow-400' };
  if (score === 3) return { score, label: 'Good', color: 'bg-blue-400' };
  return { score, label: 'Strong', color: 'bg-green-500' };
}

export function RegisterForm() {
  const navigate = useNavigate();
  const { register, login } = useAuthActions();

  const [form, setForm] = useState({
    admissionNumber: '',
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const strength = getPasswordStrength(form.password);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);
    const result = await register({
      admissionNumber: form.admissionNumber,
      name: form.name,
      email: form.email,
      password: form.password,
      confirmPassword: form.confirmPassword,
    });

    if (result.success) {
      // Automatic sign in immediately following successful account creation
      const loginRes = await login(form.admissionNumber || form.email, form.password);
      setIsLoading(false);
      if (loginRes.success) {
        navigate('/dashboard');
        return;
      }
      setSuccess(true);
    } else {
      setIsLoading(false);
      setError(result.message || 'Registration failed');
    }
  };

  if (success) {
    return (
      <div className="rounded-lg bg-green-50 border border-green-200 px-5 py-4 text-sm text-green-800">
        <p className="font-medium">🎉 Account created successfully!</p>
        <p className="mt-1 text-green-700">
          Your account is ready.{' '}
          <a href="/login" className="font-medium underline">
            Sign in now
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Admission Number"
        name="admissionNumber"
        placeholder="e.g. 21SCSE101001"
        value={form.admissionNumber}
        onChange={handleChange}
        required
      />
      <Input
        label="Student Full Name"
        name="name"
        placeholder="e.g. Aarav Sharma"
        value={form.name}
        onChange={handleChange}
        required
      />
      <Input
        label="Email"
        name="email"
        type="email"
        placeholder="you@example.com"
        value={form.email}
        onChange={handleChange}
        required
        autoComplete="email"
      />
      <div className="space-y-1.5">
        <Input
          label="Password"
          name="password"
          type="password"
          placeholder="••••••••"
          value={form.password}
          onChange={handleChange}
          required
          autoComplete="new-password"
        />
        {form.password && (
          <div className="flex items-center gap-2">
            <div className="flex flex-1 gap-1">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    n <= strength.score ? strength.color : 'bg-gray-200'
                  }`}
                />
              ))}
            </div>
            <span className="text-xs text-gray-500">{strength.label}</span>
          </div>
        )}
      </div>
      <Input
        label="Confirm Password"
        name="confirmPassword"
        type="password"
        placeholder="••••••••"
        value={form.confirmPassword}
        onChange={handleChange}
        required
        autoComplete="new-password"
      />

      {error && (
        <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" isLoading={isLoading}>
        Create Account
      </Button>

      <p className="text-center text-xs text-gray-500">
        Already have an account?{' '}
        <a href="/login" className="font-medium text-indigo-600 hover:underline">
          Sign in
        </a>
      </p>
    </form>
  );
}
