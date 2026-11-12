import React from 'react';
import { ShieldCheck, Layers, MailCheck } from 'lucide-react';
import { RegisterForm } from '@/components/auth/RegisterForm';

const onboardingSteps = [
  {
    icon: ShieldCheck,
    title: 'Authentic University Verification',
    desc: 'Validates your admission number against Galgotias LMS without caching passwords.',
  },
  {
    icon: Layers,
    title: 'Isolated Student Workspace',
    desc: 'Your courses, extracted documents, and quiz solutions stay scoped to your account.',
  },
  {
    icon: MailCheck,
    title: 'Email Delivery Alerts',
    desc: 'Receive completed PDF solution drafts and upcoming deadline reminders.',
  },
];

export function RegisterPage() {
  return (
    <div className="min-h-screen w-full px-4 py-8 sm:px-6 lg:px-10 flex items-center justify-center">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        {/* Left Brand Presentation */}
        <div className="lg:col-span-6 space-y-6 text-center lg:text-left">
          <div className="inline-flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-sm">
              <span className="text-sm font-bold tracking-tight">CS</span>
            </div>
            <span className="text-base font-semibold text-slate-900 tracking-tight">
              CampusSarthi AI
            </span>
          </div>

          <div className="space-y-3">
            <h1 className="text-3xl sm:text-4xl font-semibold text-slate-900 tracking-tight leading-[1.15]">
              Your Academic Life, Intelligently Organized.
            </h1>
            <p className="text-sm sm:text-base text-slate-600 max-w-md mx-auto lg:mx-0">
              Set up your personal academic workspace in seconds with genuine Galgotias LMS connectivity.
            </p>
          </div>

          <div className="hidden lg:grid grid-cols-1 gap-3 pt-2 max-w-md">
            {onboardingSteps.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="glass-surface rounded-2xl p-3.5 flex items-start gap-3 text-left"
                >
                  <div className="h-8 w-8 rounded-xl bg-slate-900/[0.04] flex items-center justify-center shrink-0 text-indigo-600">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-900">{item.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Floating Liquid Glass Panel */}
        <div className="lg:col-span-6 flex justify-center lg:justify-end">
          <div className="glass-elevated w-full max-w-md rounded-3xl p-6 sm:p-8">
            <RegisterForm />
          </div>
        </div>
      </div>
    </div>
  );
}

export default RegisterPage;
