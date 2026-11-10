import React from 'react';
import { LoginForm } from '@/components/auth/LoginForm';

export function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Campus<span className="text-indigo-600">Pilot</span> <span className="text-sm bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-mono font-medium ml-0.5">AI</span>
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Intelligent Student LMS Assistant for Galgotias University
          </p>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-7 shadow-sm">
          <h2 className="mb-5 text-sm font-semibold text-gray-900">Sign in to your account</h2>
          <LoginForm />
        </div>
      </div>
    </div>
  );
}

export default LoginPage