import React from 'react';
import { Mail, Zap, Paperclip, ExternalLink, Download, FileCheck2 } from 'lucide-react';
import { format, formatDistanceToNow, differenceInHours } from 'date-fns';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge, statusToBadgeVariant, statusToLabel } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { documentsApi } from '@/services/api';
import type { Assignment } from '@/types';

interface AssignmentCardProps {
  assignment: Assignment;
  onAnalyze?: (id: string) => void;
  onViewPDF?: (id: string) => void;
  onSendEmail?: (id: string) => void;
  isAnalyzing?: boolean;
  isSendingEmail?: boolean;
}

function getDueDateStyle(dueDate?: string): { text: string; className: string } {
  if (!dueDate) return { text: 'No due date', className: 'text-slate-400' };
  try {
    const d = new Date(dueDate);
    if (isNaN(d.getTime())) return { text: 'No due date', className: 'text-slate-400' };
    const hours = differenceInHours(d, new Date());
    const formatted = format(d, 'MMM d, h:mm a');
    const rel = formatDistanceToNow(d, { addSuffix: true });
    if (hours < 0) return { text: `Closed · ${formatted}`, className: 'text-slate-400' };
    if (hours < 24) return { text: `Due ${rel}`, className: 'text-rose-600 font-medium' };
    if (hours < 72) return { text: `Due ${rel}`, className: 'text-amber-600 font-medium' };
    return { text: `Due ${formatted}`, className: 'text-slate-500' };
  } catch {
    return { text: 'No due date', className: 'text-slate-400' };
  }
}

// Granular statuses handled via statusToBadgeVariant & statusToLabel in Badge.tsx

export function AssignmentCard({
  assignment,
  onAnalyze,
  onViewPDF,
  onSendEmail,
  isAnalyzing,
  isSendingEmail,
}: AssignmentCardProps) {
  const dueStyle = getDueDateStyle(assignment.dueDate);
  const attachments = Array.isArray(assignment.attachments) ? assignment.attachments : [];
  const primaryAttachment = attachments[0];
  const courseTitle =
    assignment.course?.name || (assignment as unknown as { courseName?: string })?.courseName;
  const assignmentId = assignment._id || assignment.id || '';
  const currentStatus = assignment.aiStatus || 'pending';
  const lmsUrl = `https://gulms.galgotiasuniversity.org/mod/assign/view.php?id=${assignment.lmsAssignmentId}`;

  return (
    <Card className="flex flex-col hover:border-slate-900/15">
      <CardBody className="flex flex-1 flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => onViewPDF && assignmentId && onViewPDF(assignmentId)}
              className="text-left w-full"
            >
              <h3 className="truncate text-sm font-semibold text-slate-900 hover:text-indigo-600 transition-colors">
                {assignment.title}
              </h3>
            </button>
            {courseTitle && (
              <Badge variant="info" className="mt-1.5 max-w-full truncate">
                {courseTitle}
              </Badge>
            )}
          </div>
          <Badge variant={statusToBadgeVariant(currentStatus)}>
            {statusToLabel(currentStatus)}
          </Badge>
        </div>

        <div className="space-y-1.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className={dueStyle.className}>{dueStyle.text}</span>
            {assignment.documentId && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                <FileCheck2 className="h-3 w-3" /> PDF Ready
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-slate-500">
            {primaryAttachment ? (
              <a
                href={primaryAttachment.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 truncate max-w-[220px]"
                title={primaryAttachment.filename}
              >
                <Paperclip className="h-3 w-3 shrink-0" />
                <span className="truncate">{primaryAttachment.filename}</span>
              </a>
            ) : (
              <span className="text-slate-400">No attached brief</span>
            )}

            {assignment.emailSent && (
              <span className="inline-flex items-center gap-1 text-emerald-600">
                <Mail className="h-3 w-3" /> Emailed
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 mt-auto pt-2 border-t border-slate-900/[0.06]">
          {(currentStatus === 'pending' || currentStatus === 'failed') && onAnalyze && assignmentId && (
            <Button
              size="sm"
              variant={currentStatus === 'failed' ? 'default' : 'primary'}
              onClick={() => onAnalyze(assignmentId)}
              isLoading={isAnalyzing}
              className="gap-1.5"
            >
              <Zap className="h-3.5 w-3.5" />
              {currentStatus === 'failed' ? 'Retry AI' : 'Generate Draft'}
            </Button>
          )}
          {currentStatus === 'processing' && (
            <Button size="sm" variant="outline" disabled isLoading className="text-xs">
              Processing...
            </Button>
          )}
          {onViewPDF && assignmentId && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onViewPDF(assignmentId)}
            >
              {assignment.documentId ? 'Preview PDF' : 'Details'}
            </Button>
          )}
          {assignment.documentId && (
            <>
              <a href={documentsApi.downloadUrl(assignment.documentId)} target="_blank" rel="noreferrer">
                <Button size="sm" variant="ghost" title="Download PDF">
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </a>
              {onSendEmail && assignmentId && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onSendEmail(assignmentId)}
                  isLoading={isSendingEmail}
                  title="Send email"
                >
                  <Mail className="h-3.5 w-3.5" />
                </Button>
              )}
            </>
          )}
          <a
            href={lmsUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-900"
            title="Open on Galgotias LMS"
          >
            LMS <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </CardBody>
    </Card>
  );
}
