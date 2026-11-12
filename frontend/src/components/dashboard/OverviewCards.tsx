import React from 'react';
import { FileText, Clock, BookOpen, Download, AlertCircle } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import type { Assignment, Quiz, Document, Course } from '@/types';
import { formatDistanceToNow } from 'date-fns';

interface OverviewCardsProps {
  assignments: Assignment[];
  quizzes: Quiz[];
  documents: Document[];
  courses?: Course[];
}

function safeFormatDistance(dateStr?: string | null): string {
  if (!dateStr) return 'None upcoming';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'None upcoming';
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return 'None upcoming';
  }
}

export function OverviewCards({
  assignments = [],
  quizzes = [],
  documents = [],
  courses = [],
}: OverviewCardsProps) {
  const safeAssignments = Array.isArray(assignments) ? assignments : [];
  const safeQuizzes = Array.isArray(quizzes) ? quizzes : [];
  const safeDocuments = Array.isArray(documents) ? documents : [];
  const safeCourses = Array.isArray(courses) ? courses : [];

  const pendingAssignments = safeAssignments.filter(
    (a) => a.aiStatus === 'pending' || a.aiStatus === 'processing'
  );

  const upcomingQuizzes = safeQuizzes.filter((q) => {
    const closeTimeStr = q.closesAt || (q as unknown as { closeTime?: string })?.closeTime;
    if (!closeTimeStr) return true;
    try {
      const d = new Date(closeTimeStr);
      return !isNaN(d.getTime()) && d > new Date();
    } catch {
      return true;
    }
  });

  const nextDeadline = safeAssignments
    .filter((a) => {
      if (!a.dueDate) return false;
      try {
        const d = new Date(a.dueDate);
        return !isNaN(d.getTime()) && d > new Date();
      } catch {
        return false;
      }
    })
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())[0];

  const stats = [
    {
      label: 'Pending Assignments',
      value: pendingAssignments.length,
      icon: <FileText className="h-4 w-4 text-indigo-600" />,
      bg: 'bg-indigo-50/90 border-indigo-200/60',
    },
    {
      label: 'Upcoming Quizzes',
      value: upcomingQuizzes.length,
      icon: <Clock className="h-4 w-4 text-blue-600" />,
      bg: 'bg-blue-50/90 border-blue-200/60',
    },
    {
      label: 'Enrolled Courses',
      value: safeCourses.length,
      icon: <BookOpen className="h-4 w-4 text-slate-700" />,
      bg: 'bg-slate-100/90 border-slate-200/60',
    },
    {
      label: 'Completed AI Docs',
      value: safeDocuments.length,
      icon: <Download className="h-4 w-4 text-emerald-600" />,
      bg: 'bg-emerald-50/90 border-emerald-200/60',
    },
    {
      label: 'Next Deadline',
      value: nextDeadline?.dueDate ? safeFormatDistance(nextDeadline.dueDate) : 'None upcoming',
      sub: nextDeadline?.title,
      icon: <AlertCircle className="h-4 w-4 text-amber-600" />,
      bg: 'bg-amber-50/90 border-amber-200/60',
      isText: true,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardBody className="flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium text-slate-500">{stat.label}</p>
              <div className={`flex h-7 w-7 items-center justify-center rounded-xl border ${stat.bg}`}>
                {stat.icon}
              </div>
            </div>
            <div>
              <p
                className={`font-semibold text-slate-900 tracking-tight ${
                  stat.isText ? 'text-sm capitalize' : 'text-2xl'
                }`}
              >
                {stat.value}
              </p>
              {stat.sub && (
                <p className="text-[11px] text-slate-500 truncate mt-0.5">{stat.sub}</p>
              )}
            </div>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
