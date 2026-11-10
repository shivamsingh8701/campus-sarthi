import React from 'react';
import { Clock, Calendar, CheckCircle2, Sparkles } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { Quiz } from '@/types';

interface QuizCardProps {
  quiz: Quiz;
  onViewSolution?: (quizId: string) => void;
}

function getQuizDates(quiz: Quiz) {
  const q = quiz as unknown as {
    openTime?: string;
    closeTime?: string;
    timeLimitSeconds?: number;
    maxAttempts?: number;
    courseName?: string;
    attemptsUsed?: number;
    status?: string;
  };

  const openStr = quiz.opensAt || q.openTime;
  const closeStr = quiz.closesAt || q.closeTime;

  let openDate: Date | null = null;
  let closeDate: Date | null = null;

  try {
    if (openStr) {
      const d = new Date(openStr);
      if (!isNaN(d.getTime())) openDate = d;
    }
  } catch {
    openDate = null;
  }

  try {
    if (closeStr) {
      const d = new Date(closeStr);
      if (!isNaN(d.getTime())) closeDate = d;
    }
  } catch {
    closeDate = null;
  }

  const courseTitle = quiz.course?.name || q.courseName;
  const timeLimit = quiz.timeLimitMinutes || (q.timeLimitSeconds ? Math.round(q.timeLimitSeconds / 60) : undefined);
  const allowedAttempts = quiz.allowedAttempts || q.maxAttempts;
  const attemptsUsed = quiz.attemptsUsed ?? q.attemptsUsed ?? 0;
  const rawStatus = q.status;

  return { openDate, closeDate, courseTitle, timeLimit, allowedAttempts, attemptsUsed, rawStatus };
}

function getQuizStatus(
  closeDate: Date | null,
  openDate: Date | null,
  attemptsUsed: number,
  rawStatus?: string
): { label: string; variant: 'active' | 'expired' | 'pending' | 'success' } {
  const isDone =
    attemptsUsed > 0 ||
    ['completed', 'submitted', 'attempted', 'finished'].includes((rawStatus || '').toLowerCase());
  if (isDone) return { label: 'Submitted', variant: 'success' };

  const now = new Date();
  if (closeDate && closeDate < now) return { label: 'Closed', variant: 'expired' };
  if (openDate && openDate > now) return { label: 'Upcoming', variant: 'pending' };
  return { label: 'Open', variant: 'active' };
}

export function QuizCard({ quiz, onViewSolution }: QuizCardProps) {
  const { openDate, closeDate, courseTitle, timeLimit, allowedAttempts, attemptsUsed, rawStatus } =
    getQuizDates(quiz);
  const status = getQuizStatus(closeDate, openDate, attemptsUsed, rawStatus);

  return (
    <Card className="hover:border-indigo-200 transition-colors flex flex-col justify-between">
      <CardBody className="space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-gray-900">{quiz.title}</h3>
            {courseTitle && (
              <Badge variant="info" className="mt-1">
                {courseTitle}
              </Badge>
            )}
          </div>
          <Badge variant={status.variant}>
            {status.variant === 'success' && <CheckCircle2 className="mr-1 h-3 w-3 inline" />}
            {status.label}
          </Badge>
        </div>

        {/* Meta */}
        <div className="space-y-1.5 text-xs text-gray-500">
          {openDate && (
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
              <span>Opens {format(openDate, 'MMM d, h:mm a')}</span>
            </div>
          )}
          {closeDate && (
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
              <span>
                Closes {format(closeDate, 'MMM d, h:mm a')}
                {closeDate > new Date() && (
                  <span className="ml-1 text-gray-400">
                    ({formatDistanceToNow(closeDate, { addSuffix: true })})
                  </span>
                )}
              </span>
            </div>
          )}
          {timeLimit && (
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{timeLimit} min limit</span>
            </div>
          )}
          {allowedAttempts && (
            <span className={attemptsUsed > 0 ? 'text-emerald-700 font-medium' : ''}>
              {attemptsUsed}/{allowedAttempts} attempts used
            </span>
          )}
        </div>

        {/* AI Solution Action Button */}
        {onViewSolution && (
          <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onViewSolution(quiz._id || quiz.id || quiz.lmsQuizId)}
              className="w-full text-xs gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50 h-8"
            >
              <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
              <span>{status.variant === 'success' ? 'Post-Submission Solutions' : 'Quiz Solution Guide'}</span>
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
export default QuizCard;
