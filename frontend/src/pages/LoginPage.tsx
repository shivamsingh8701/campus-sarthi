import React from 'react';
import { BookOpen, Sparkles, FileCheck2, Lock } from 'lucide-react';
import { LoginForm } from '@/components/auth/LoginForm';

const highlights = [
  {
    icon: BookOpen,
    title: 'Direct Galgotias LMS Sync',
    desc: 'Automatic Moodle course, deadline, and question attachment discovery.',
  },
  {
    icon: FileCheck2,
    title: 'Document & PDF Workflows',
    desc: 'Extract assignment questions from DOCX/PDFs into structured PDF study drafts.',
  },
  {
    icon: Sparkles,
    title: 'AI Academic Intelligence',
    desc: 'Prioritized revision briefs and quiz preparation aligned to your syllabus.',
  },
];

export function LoginPage() {
  return (
    <div className="min-h-screen w-full px-4 py-8 sm:px-6 lg:px-10 flex items-center justify-center">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        {/* Left Brand Presentation */}
        <div className="lg:col-span-6 space-y-6 text-center lg:text-left">
          <div className="inline-flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-sm">
              <span className="text-sm font-bold tracking-tight">CS</span>
            </div>
            <div>
              <span className="text-base font-semibold text-slate-900 tracking-tight">
                CampusSarthi AI
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <h1 className="text-3xl sm:text-4xl font-semibold text-slate-900 tracking-tight leading-[1.15]">
              Your Academic Life, Intelligently Organized.
            </h1>
            <p className="text-sm sm:text-base text-slate-600 max-w-md mx-auto lg:mx-0">
              One quiet workspace connecting your Galgotias University LMS courses, assignment briefs, quiz windows, and AI revision notes.
            </p>
          </div>

          <div className="hidden lg:grid grid-cols-1 gap-3 pt-2 max-w-md">
            {highlights.map((item) => {
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

          <div className="hidden lg:flex items-center gap-2 text-xs text-slate-500 pt-1">
            <Lock className="h-3.5 w-3.5 text-slate-400" />
            <span>
              University passwords are validated directly against Galgotias LMS and are never stored in plaintext or sent to AI providers.
            </span>
          </div>
        </div>

        {/* Right Floating Liquid Glass Auth Panel */}
        <div className="lg:col-span-6 flex justify-center lg:justify-end">
          <div className="glass-elevated w-full max-w-md rounded-3xl p-6 sm:p-8">
            <LoginForm />
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
