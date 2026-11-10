import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Paperclip,
  Zap,
  FileText,
  Mail,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react';
import { format } from 'date-fns';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorState } from '@/components/ui/ErrorState';
import { useAssignments } from '@/hooks/useAssignments';
import { documentsApi, emailApi } from '@/services/api';
import type { AssignmentStatus } from '@/types';

const statusVariantMap: Record<AssignmentStatus, 'pending' | 'processing' | 'completed' | 'failed'> = {
  pending: 'pending',
  processing: 'processing',
  completed: 'completed',
  failed: 'failed',
};

function safeFormatDate(dateStr?: string, fmt = 'MMM d, yyyy h:mm a'): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? '' : format(d, fmt);
  } catch {
    return '';
  }
}

export function AssignmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { assignment, isLoading, error, getAssignment, analyzeAssignment } = useAssignments();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState(false);

  useEffect(() => {
    if (id) getAssignment(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleAnalyze = async () => {
    if (!id) return;
    setIsAnalyzing(true);
    await analyzeAssignment(id);
    setIsAnalyzing(false);
    getAssignment(id);
  };

  const handleEmail = async () => {
    if (!id) return;
    setIsSendingEmail(true);
    try {
      await emailApi.sendForAssignment(id);
      setEmailSuccess(true);
    } catch {
      // silent
    } finally {
      setIsSendingEmail(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="Assignment" />
        <div className="flex flex-1 items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  if (error || !assignment) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="Assignment" />
        <ErrorState message={error || 'Assignment not found'} onRetry={() => id && getAssignment(id)} />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <TopBar
        title="Assignment Detail"
        actions={
          <Button size="sm" variant="ghost" onClick={() => navigate(-1)} className="gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Button>
        }
      />
      <main className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Header Card */}
        <Card>
          <CardBody>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{assignment.title}</h2>
                {(assignment.course?.name || (assignment as unknown as { courseName?: string })?.courseName) && (
                  <Badge variant="info" className="mt-2">
                    {assignment.course?.name || (assignment as unknown as { courseName?: string })?.courseName}
                  </Badge>
                )}
              </div>
              <Badge variant={statusVariantMap[assignment.aiStatus]}>
                {assignment.aiStatus}
              </Badge>
            </div>
            <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-500">
              {assignment.dueDate && safeFormatDate(assignment.dueDate) && (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Due {safeFormatDate(assignment.dueDate)}
                </span>
              )}
              {assignment.submittedAt && safeFormatDate(assignment.submittedAt, 'MMM d, yyyy') && (
                <span className="flex items-center gap-1.5">
                  <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                  Submitted {safeFormatDate(assignment.submittedAt, 'MMM d, yyyy')}
                </span>
              )}
            </div>
          </CardBody>
        </Card>

        {/* Description */}
        {assignment.description && (
          <Card>
            <CardHeader><h3 className="text-sm font-semibold text-gray-900">Description</h3></CardHeader>
            <CardBody>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{assignment.description}</p>
            </CardBody>
          </Card>
        )}

        {/* Attachments */}
        <Card>
          <CardHeader><h3 className="text-sm font-semibold text-gray-900">Attachments</h3></CardHeader>
          <CardBody>
            {assignment.attachments?.length > 0 ? (
              <ul className="space-y-2">
                {assignment.attachments.map((att, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-sm">
                    <Paperclip className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    <a
                      href={att.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-600 hover:underline truncate"
                    >
                      {att.filename}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400">No attachments</p>
            )}
          </CardBody>
        </Card>

        {/* AI Analysis */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">AI Analysis</h3>
            {assignment.aiStatus === 'pending' && (
              <Button size="sm" onClick={handleAnalyze} isLoading={isAnalyzing} className="gap-1.5">
                <Zap className="h-3.5 w-3.5" />
                Analyze with AI
              </Button>
            )}
          </CardHeader>
          <CardBody>
            {assignment.aiStatus === 'pending' && (
              <p className="text-sm text-gray-500">
                Click "Analyze with AI" to extract questions and generate a document.
              </p>
            )}
            {assignment.aiStatus === 'processing' && (
              <div className="flex items-center gap-2 text-sm text-blue-600">
                <LoadingSpinner size="sm" className="text-blue-500" />
                Analysis in progress…
              </div>
            )}
            {assignment.aiStatus === 'failed' && (
              <div className="flex items-start gap-2">
                <XCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-red-700">Analysis failed.</p>
                  {assignment.errorMessage && (
                    <p className="text-xs text-red-500 mt-1">{assignment.errorMessage}</p>
                  )}
                  <Button size="sm" variant="outline" className="mt-2" onClick={handleAnalyze} isLoading={isAnalyzing}>
                    Retry
                  </Button>
                </div>
              </div>
            )}
            {assignment.aiStatus === 'completed' && (
              <div className="space-y-3">
                {assignment.questionsExtracted && assignment.questionsExtracted.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">Extracted Questions</p>
                    <ul className="space-y-1">
                      {assignment.questionsExtracted.map((q, idx) => (
                        <li key={idx} className="text-sm text-gray-700 flex gap-2">
                          <span className="text-gray-400 flex-shrink-0">{idx + 1}.</span>
                          {q}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {assignment.documentId && (
                  <div className="flex gap-2 pt-2">
                    <a href={documentsApi.downloadUrl(assignment.documentId)} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="secondary" className="gap-1.5">
                        <FileText className="h-3.5 w-3.5" />
                        View Generated PDF
                      </Button>
                    </a>
                    {!assignment.emailSent && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleEmail}
                        isLoading={isSendingEmail}
                        className="gap-1.5"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        {emailSuccess ? 'Sent!' : 'Email to me'}
                      </Button>
                    )}
                    {assignment.emailSent && (
                      <span className="flex items-center gap-1 text-xs text-green-600">
                        <Mail className="h-3.5 w-3.5" />
                        Emailed {assignment.emailSentAt ? format(new Date(assignment.emailSentAt), 'MMM d') : ''}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardBody>
        </Card>
      </main>
    </div>
  );
}

export default AssignmentDetailPage