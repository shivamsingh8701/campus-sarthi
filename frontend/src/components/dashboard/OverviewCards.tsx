import React from 'react';
import { FileText, Clock, Download, AlertCircle } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import type { Assignment, Quiz, Document } from '@/types';
import { formatDistanceToNow } from 'date-fns';

interface OverviewCardsProps {
  assignments: Assignment[];
  quizzes: Quiz[];
  documents: Document[];
}

function safeFormatDistance(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return '—';
  }
}

export function OverviewCards({ assignments = [], quizzes = [], documents = [] }: OverviewCardsProps) {
  const safeAssignments = Array.isArray(assignments) ? assignments : [];
  const safeQuizzes = Array.isArray(quizzes) ? quizzes : [];
  const safeDocuments = Array.isArray(documents) ? documents : [];

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
      icon: <FileText className="h-5 w-5 text-indigo-600" />,
      bg: 'bg-indigo-50',
    },
    {
      label: 'Upcoming Quizzes',
      value: upcomingQuizzes.length,
      icon: <Clock className="h-5 w-5 text-blue-600" />,
      bg: 'bg-blue-50',
    },
    {
      label: 'Generated Documents',
      value: safeDocuments.length,
      icon: <Download className="h-5 w-5 text-green-600" />,
      bg: 'bg-green-50',
    },
    {
      label: 'Next Deadline',
      value: nextDeadline?.dueDate ? safeFormatDistance(nextDeadline.dueDate) : '—',
      icon: <AlertCircle className="h-5 w-5 text-orange-600" />,
      bg: 'bg-orange-50',
      isText: true,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardBody className="flex items-start gap-3">
            <div className={`flex-shrink-0 rounded-lg p-2 ${stat.bg}`}>
              {stat.icon}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 truncate">{stat.label}</p>
              <p
                className={`mt-0.5 font-semibold text-gray-900 ${
                  stat.isText ? 'text-sm' : 'text-2xl'
                }`}
              >
                {stat.value}
              </p>
            </div>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
