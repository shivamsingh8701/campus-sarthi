import React from 'react';
import { Mail, Zap, Paperclip } from 'lucide-react';
import { format, formatDistanceToNow, differenceInHours } from 'date-fns';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { Assignment, AssignmentStatus } from '@/types';

interface AssignmentCardProps {
  assignment: Assignment;
  onAnalyze?: (id: string) => void;
  onViewPDF?: (id: string) => void;
  isAnalyzing?: boolean;
}

function getDueDateStyle(dueDate?: string): { text: string; className: string } {
  if (!dueDate) return { text: 'No due date', className: 'text-gray-400' };
  try {
    const d = new Date(dueDate);
    if (isNaN(d.getTime())) return { text: 'No due date', className: 'text-gray-400' };
    const hours = differenceInHours(d, new Date());
    const text = `Due ${formatDistanceToNow(d, { addSuffix: true })}`;
    if (hours < 0) return { text: `Overdue · ${format(d, 'MMM d')}`, className: 'text-gray-400' };
    if (hours < 24) return { text, className: 'text-red-600 font-medium' };
    if (hours < 72) return { text, className: 'text-orange-600' };
    return { text, className: 'text-gray-500' };
  } catch {
    return { text: 'No due date', className: 'text-gray-400' };
  }
}

const statusVariantMap: Record<AssignmentStatus, 'pending' | 'processing' | 'completed' | 'failed'> = {
  pending: 'pending',
  processing: 'processing',
  completed: 'completed',
  failed: 'failed',
};

export function AssignmentCard({
  assignment,
  onAnalyze,
  onViewPDF,
  isAnalyzing,
}: AssignmentCardProps) {
  const dueStyle = getDueDateStyle(assignment.dueDate);
  const attachments = Array.isArray(assignment.attachments) ? assignment.attachments : [];
  const hasAttachments = attachments.length > 0;
  const courseTitle = assignment.course?.name || (assignment as unknown as { courseName?: string })?.courseName;
  const assignmentId = assignment._id || assignment.id || '';
  const currentStatus = (assignment.aiStatus || 'pending') as AssignmentStatus;

  return (
    <Card className="flex flex-col">
      <CardBody className="flex flex-1 flex-col gap-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-gray-900">
              {assignment.title}
            </h3>
            {courseTitle && (
              <Badge variant="info" className="mt-1">
                {courseTitle}
              </Badge>
            )}
          </div>
          <Badge variant={statusVariantMap[currentStatus] ?? 'pending'}>
            {currentStatus}
          </Badge>
        </div>

        {/* Meta */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className={dueStyle.className}>{dueStyle.text}</span>
          {hasAttachments ? (
            <span className="flex items-center gap-1 text-gray-500">
              <Paperclip className="h-3 w-3" />
              {attachments.length} attachment
              {attachments.length !== 1 ? 's' : ''}
            </span>
          ) : (
            <span className="text-gray-400">No attachments</span>
          )}
          {assignment.emailSent && (
            <span className="flex items-center gap-1 text-green-600">
              <Mail className="h-3 w-3" />
              Emailed
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-auto pt-1">
          {(currentStatus === 'pending' || currentStatus === 'failed') && onAnalyze && assignmentId && (
            <Button
              size="sm"
              variant={currentStatus === 'failed' ? 'default' : 'outline'}
              onClick={() => onAnalyze(assignmentId)}
              isLoading={isAnalyzing}
              className="gap-1.5"
            >
              <Zap className="h-3.5 w-3.5" />
              {currentStatus === 'failed' ? 'Retry Solve (AI)' : 'Solve Draft (AI)'}
            </Button>
          )}
          {currentStatus === 'processing' && (
            <Button
              size="sm"
              variant="outline"
              disabled
              isLoading
              className="gap-1.5 text-xs text-amber-600 border-amber-200"
            >
              Solving in Progress...
            </Button>
          )}
          {currentStatus === 'completed' && onViewPDF && assignmentId && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onViewPDF(assignmentId)}
              className="gap-1.5"
            >
              View Solution (PDF)
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
