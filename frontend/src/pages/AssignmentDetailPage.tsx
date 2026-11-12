import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Paperclip,
  Sparkles,
  FileText,
  Mail,
  CheckCircle,
  XCircle,
  Clock,
  ExternalLink,
  Download,
  RefreshCw,
  Eye,
  AlertTriangle,
  Upload,
  ShieldCheck,
  ListChecks,
} from 'lucide-react';
import { format } from 'date-fns';
import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { Badge, statusToBadgeVariant, statusToLabel } from '@/components/ui/Badge';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorState } from '@/components/ui/ErrorState';
import { useAssignments } from '@/hooks/useAssignments';
import { assignmentsApi, documentsApi, emailApi } from '@/services/api';
import type { AssignmentStatus } from '@/types';

const ACTIVE_PIPELINE_STATUSES = new Set<AssignmentStatus>([
  'discovering_attachments',
  'downloading',
  'validating_document',
  'extracting',
  'generating_solution',
  'verifying_solution',
  'generating_pdf',
  'processing',
]);

const PIPELINE_STEPS: Array<{ key: AssignmentStatus[]; label: string }> = [
  { key: ['discovering_attachments', 'downloading'], label: 'Download Document' },
  { key: ['validating_document'], label: 'Validate Signature' },
  { key: ['extracting', 'extracted'], label: 'Extract Questions' },
  { key: ['generating_solution'], label: 'Generate Solution' },
  { key: ['verifying_solution'], label: 'Verify Accuracy' },
  { key: ['generating_pdf', 'completed'], label: 'Build A4 PDF' },
];

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function safeFormatDate(dateStr?: string, fmt = 'MMM d, yyyy · h:mm a'): string {
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
  const {
    assignment,
    isLoading,
    error,
    getAssignment,
    extractDocument,
    generateSolution,
    uploadDocument,
  } = useAssignments();

  const [isExtracting, setIsExtracting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showQuestions, setShowQuestions] = useState(true);
  const [showRawText, setShowRawText] = useState(false);
  const [showPdfPreview, setShowPdfPreview] = useState(true);
  const [showOriginalPreview, setShowOriginalPreview] = useState(false);
  const [actionBanner, setActionBanner] = useState<{ ok: boolean; msg: string; reauth?: boolean } | null>(null);

  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [emailPreview, setEmailPreview] = useState<{
    to: string;
    subject: string;
    attachmentFilename?: string | null;
    alreadySent: boolean;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (id) getAssignment(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Poll silently while pipeline is actively running on backend
  const isPipelineBusy = assignment ? ACTIVE_PIPELINE_STATUSES.has(assignment.aiStatus) : false;
  useEffect(() => {
    if (!id || !isPipelineBusy) return;
    const timer = setInterval(() => {
      void getAssignment(id, { silent: true });
    }, 2200);
    return () => clearInterval(timer);
  }, [id, isPipelineBusy, getAssignment]);

  // Load email preview once PDF is ready
  useEffect(() => {
    if (!id || !assignment?.documentId) return;
    emailApi
      .previewForAssignment(id)
      .then((res) => {
        if (res.success) setEmailPreview(res.data);
      })
      .catch(() => {});
  }, [id, assignment?.documentId, assignment?.emailSent]);

  const handleExtract = async (force = false) => {
    if (!id) return;
    setActionBanner(null);
    setIsExtracting(true);
    const res = await extractDocument(id, force);
    setIsExtracting(false);
    setActionBanner({
      ok: res.success,
      msg: res.message || (res.success ? 'Document extracted cleanly.' : 'Document extraction failed.'),
      reauth: res.requiresReauth,
    });
    await getAssignment(id, { silent: true });
  };

  const handleGenerateSolution = async (forceExtract = false) => {
    if (!id) return;
    setActionBanner(null);
    setIsGenerating(true);
    const res = await generateSolution(id, forceExtract);
    setIsGenerating(false);
    if (!res.success && res.message) {
      setActionBanner({ ok: false, msg: res.message });
    }
    await getAssignment(id, { silent: true });
  };

  const handleManualFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setActionBanner(null);
    setIsUploading(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read selected file'));
        reader.readAsDataURL(file);
      });
      const res = await uploadDocument(id, file.name, base64, false);
      setActionBanner({
        ok: res.success,
        msg: res.message || (res.success ? 'Uploaded and extracted document.' : 'Upload failed.'),
      });
      await getAssignment(id, { silent: true });
    } catch (err) {
      setActionBanner({
        ok: false,
        msg: err instanceof Error ? err.message : 'Failed to upload document.',
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleEmail = async (force = false) => {
    if (!id) return;
    setIsSendingEmail(true);
    setEmailStatus(null);
    try {
      const res = await emailApi.sendForAssignment(id, force);
      setEmailStatus({ ok: true, msg: res.message || 'Solution PDF emailed successfully.' });
      await getAssignment(id, { silent: true });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string; alreadySent?: boolean } }; message?: string };
      setEmailStatus({
        ok: false,
        msg: e.response?.data?.error || e.message || 'Email delivery failed.',
      });
    } finally {
      setIsSendingEmail(false);
    }
  };

  if (isLoading && !assignment) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="Assignment" />
        <div className="flex flex-1 items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  if (error && !assignment) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="Assignment" />
        <ErrorState message={error} onRetry={() => id && getAssignment(id)} />
      </div>
    );
  }

  if (!assignment) return null;

  const courseTitle = assignment.course?.name || assignment.courseName;
  const lmsUrl = `https://gulms.galgotiasuniversity.org/mod/assign/view.php?id=${assignment.lmsAssignmentId}`;
  const docId = assignment.document?.id || assignment.documentId;
  const downloadPdfUrl = docId ? documentsApi.downloadUrl(docId) : null;
  const previewPdfUrl = docId ? documentsApi.previewUrl(docId) : null;

  const origDocs = assignment.originalDocuments ?? [];
  const primaryValidatedDoc = origDocs.find((d) => d.downloadStatus === 'validated');
  const extraction = assignment.extractedContent ?? null;
  const detectedQs = extraction?.detectedQuestions ?? [];
  const hasFailed =
    assignment.aiStatus === 'failed' ||
    assignment.aiStatus === 'download_failed' ||
    assignment.aiStatus === 'extraction_failed';

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <TopBar
        title="Assignment Workspace"
        subtitle={courseTitle}
        actions={
          <div className="flex items-center gap-2">
            <a href={lmsUrl} target="_blank" rel="noreferrer">
              <Button size="sm" variant="outline" className="gap-1.5 rounded-full">
                <span>Open LMS</span>
                <ExternalLink className="h-3 w-3" />
              </Button>
            </a>
            <Button size="sm" variant="ghost" onClick={() => navigate(-1)} className="gap-1.5 rounded-full">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </Button>
          </div>
        }
      />

      <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 max-w-5xl">
        {actionBanner && (
          <div
            className={`glass-surface rounded-2xl px-4 py-3 text-xs flex flex-wrap items-center justify-between gap-3 ${
              actionBanner.ok
                ? 'border-emerald-200 bg-emerald-50/80 text-emerald-800'
                : 'border-rose-200 bg-rose-50/80 text-rose-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {actionBanner.ok ? (
                <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
              )}
              <span>{actionBanner.msg}</span>
            </div>
            {(actionBanner.reauth || assignment.requiresReauth) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate('/dashboard/integrations')}
                className="rounded-full"
              >
                Reconnect LMS Session
              </Button>
            )}
          </div>
        )}

        {/* ── SECTION 1: Assignment Details ──────────────────────────────────── */}
        <Card>
          <CardBody className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  {courseTitle && <Badge variant="info">{courseTitle}</Badge>}
                  {assignment.submissionStatus && (
                    <Badge variant="default">{assignment.submissionStatus}</Badge>
                  )}
                </div>
                <h2 className="text-lg font-semibold text-slate-900">{assignment.title}</h2>
              </div>
              <Badge variant={statusToBadgeVariant(assignment.aiStatus)}>
                {statusToLabel(assignment.aiStatus)}
              </Badge>
            </div>

            <div className="flex flex-wrap gap-4 text-xs text-slate-500">
              {assignment.dueDate && safeFormatDate(assignment.dueDate) && (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                  Due {safeFormatDate(assignment.dueDate)}
                </span>
              )}
              {assignment.emailSent && (
                <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                  <Mail className="h-3.5 w-3.5" />
                  Emailed {assignment.emailSentAt ? safeFormatDate(assignment.emailSentAt, 'MMM d, yyyy') : ''}
                </span>
              )}
            </div>

            {assignment.description && (
              <div className="rounded-2xl bg-white/55 border border-slate-900/[0.06] p-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  LMS Description & Brief
                </p>
                <p className="text-xs sm:text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {assignment.description}
                </p>
              </div>
            )}
          </CardBody>
        </Card>

        {/* ── SECTION 2: Original Attachment ─────────────────────────────────── */}
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Original Assignment Document</h3>
              <p className="text-[11px] text-slate-500">
                Authentic files discovered and verified from your Galgotias LMS session
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleExtract(origDocs.length > 0)}
                isLoading={isExtracting}
                disabled={isPipelineBusy}
                className="gap-1.5 rounded-full"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {origDocs.length > 0 ? 'Regenerate Extraction' : 'Discover & Extract'}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.doc,.txt"
                className="hidden"
                onChange={handleManualFileUpload}
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => fileInputRef.current?.click()}
                isLoading={isUploading}
                className="gap-1.5 rounded-full text-slate-600"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload Local File
              </Button>
            </div>
          </CardHeader>

          <CardBody className="space-y-3">
            {origDocs.length > 0 ? (
              <div className="space-y-2.5">
                {origDocs.map((docItem, idx) => (
                  <div
                    key={idx}
                    className="rounded-2xl bg-white/65 border border-slate-900/[0.07] p-3.5 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Paperclip className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                        <span className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
                          {docItem.filename}
                        </span>
                        <Badge variant="info" className="uppercase text-[10px]">
                          {docItem.format}
                        </Badge>
                        <Badge
                          variant={docItem.downloadStatus === 'failed' ? 'failed' : 'success'}
                          className="text-[10px]"
                        >
                          {docItem.downloadStatus === 'validated' ? 'Verified' : docItem.downloadStatus}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-3 text-[11px] text-slate-500 pl-5">
                        <span>Size: {formatBytes(docItem.sizeBytes)}</span>
                        <span>
                          Pages: {docItem.pageCount != null ? docItem.pageCount : '—'}
                        </span>
                        {docItem.downloadedAt && (
                          <span>Fetched: {safeFormatDate(docItem.downloadedAt, 'MMM d, h:mm a')}</span>
                        )}
                      </div>
                      {docItem.validationError && (
                        <p className="text-[11px] text-rose-600 pl-5">{docItem.validationError}</p>
                      )}
                    </div>

                    {docItem.downloadStatus === 'validated' && id && (
                      <div className="flex flex-wrap items-center gap-2">
                        {docItem.format === 'pdf' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setShowOriginalPreview((v) => !v)}
                            className="gap-1.5 rounded-full"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            {showOriginalPreview ? 'Hide Preview' : 'View Original Document'}
                          </Button>
                        )}
                        <a
                          href={assignmentsApi.originalDocumentUrl(id, docItem.index, false)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Button size="sm" variant="outline" className="gap-1.5 rounded-full">
                            <ExternalLink className="h-3.5 w-3.5" />
                            Open
                          </Button>
                        </a>
                        <a
                          href={assignmentsApi.originalDocumentUrl(id, docItem.index, true)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Button size="sm" variant="default" className="gap-1.5 rounded-full">
                            <Download className="h-3.5 w-3.5" />
                            Download Original
                          </Button>
                        </a>
                      </div>
                    )}
                  </div>
                ))}

                {showOriginalPreview && primaryValidatedDoc?.format === 'pdf' && id && (
                  <div className="rounded-2xl overflow-hidden border border-slate-900/10 bg-white mt-2">
                    <iframe
                      src={assignmentsApi.originalDocumentUrl(id, primaryValidatedDoc.index, false)}
                      title="Original LMS Question Document"
                      className="w-full h-[460px]"
                    />
                  </div>
                )}
              </div>
            ) : assignment.attachments?.length > 0 ? (
              <div className="space-y-2">
                {assignment.attachments.map((att, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-3 rounded-xl bg-white/60 border border-slate-900/[0.06] px-3.5 py-2.5 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Paperclip className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="font-medium text-slate-800 truncate">{att.filename}</span>
                      <Badge variant="pending" className="text-[10px]">
                        Not Downloaded Yet
                      </Badge>
                    </div>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => handleExtract(true)}
                      isLoading={isExtracting}
                      className="gap-1.5 rounded-full shrink-0"
                    >
                      <Download className="h-3 w-3" />
                      Fetch & Validate
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                No attachment cached yet. Click &ldquo;Discover & Extract&rdquo; to inspect the live LMS assignment activity or upload a question PDF/DOCX/DOC file.
              </p>
            )}
          </CardBody>
        </Card>

        {/* ── SECTION 3: Extracted Questions ─────────────────────────────────── */}
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-indigo-600" />
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Extracted Content & Questions</h3>
                <p className="text-[11px] text-slate-500">
                  Review authentic questions before generating your verified solution PDF
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {extraction && (
                <Badge
                  variant={
                    extraction.extractionConfidence === 'high'
                      ? 'success'
                      : extraction.extractionConfidence === 'medium'
                      ? 'warning'
                      : 'failed'
                  }
                >
                  Confidence: {extraction.extractionConfidence} · {detectedQs.length} Question
                  {detectedQs.length === 1 ? '' : 's'}
                </Badge>
              )}
              {detectedQs.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowQuestions((s) => !s)}
                  className="rounded-full text-xs"
                >
                  {showQuestions ? 'Collapse' : 'View Extracted Questions'}
                </Button>
              )}
            </div>
          </CardHeader>

          <CardBody className="space-y-3">
            {extraction ? (
              <>
                {extraction.visualFlags && extraction.visualFlags.length > 0 && (
                  <div className="rounded-2xl bg-amber-50/85 border border-amber-200 px-3.5 py-2.5 text-xs text-amber-900 flex items-start gap-2.5">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-semibold">Visual / Scanned Document Notice</p>
                      <ul className="list-disc pl-4 space-y-0.5">
                        {extraction.visualFlags.map((flag, i) => (
                          <li key={i}>{flag}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {extraction.warnings && extraction.warnings.length > 0 && (
                  <div className="rounded-xl bg-slate-100/80 border border-slate-200 px-3 py-2 text-[11px] text-slate-600">
                    {extraction.warnings.join(' · ')}
                  </div>
                )}

                {showQuestions && detectedQs.length > 0 && (
                  <div className="space-y-2">
                    {detectedQs.map((q) => (
                      <div
                        key={q.id}
                        className="rounded-2xl bg-white/60 border border-slate-900/[0.06] px-4 py-3 text-xs space-y-1.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-indigo-700">{q.numberLabel}</span>
                          <div className="flex items-center gap-1.5">
                            {q.marksHint && (
                              <Badge variant="default" className="text-[10px]">
                                {q.marksHint}
                              </Badge>
                            )}
                            {q.sourcePage != null && (
                              <Badge variant="info" className="text-[10px]">
                                Page {q.sourcePage}
                              </Badge>
                            )}
                            {q.requiresVisualContext && (
                              <Badge variant="warning" className="text-[10px]">
                                Diagram Ref
                              </Badge>
                            )}
                          </div>
                        </div>
                        <p className="text-slate-800 whitespace-pre-wrap leading-relaxed">
                          {q.questionText}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {detectedQs.length === 0 && (
                  <p className="text-xs text-slate-600">
                    Raw text extracted ({extraction.charCount.toLocaleString()} characters across{' '}
                    {extraction.totalPages} page(s)), but no numbered markers were auto-split. Full document text will be sent to AI.
                  </p>
                )}

                {extraction.rawTextPreview && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowRawText((v) => !v)}
                      className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700"
                    >
                      {showRawText ? 'Hide Raw Document Text' : 'Inspect Raw Extracted Text'}
                    </button>
                    {showRawText && (
                      <pre className="mt-2 max-h-60 overflow-auto rounded-xl bg-slate-950/[0.04] border border-slate-900/10 p-3 text-[11px] text-slate-700 whitespace-pre-wrap">
                        {extraction.rawTextPreview}
                      </pre>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-slate-500">
                No extraction snapshot recorded yet. Extract questions from the attached LMS document first, or generate a solution directly (auto-extracts first).
              </p>
            )}
          </CardBody>
        </Card>

        {/* ── SECTION 4: AI Solution Generation Pipeline ─────────────────────── */}
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-600" />
              <div>
                <h3 className="text-sm font-semibold text-slate-900">AI Solution Engine</h3>
                <p className="text-[11px] text-slate-500">
                  Gemini comprehension & drafting · OpenAI verification · A4 PDF builder
                </p>
              </div>
            </div>

            <Button
              size="sm"
              variant="primary"
              onClick={() => handleGenerateSolution(false)}
              isLoading={isGenerating || isPipelineBusy}
              className="gap-1.5 rounded-full"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {assignment.aiStatus === 'completed'
                ? 'Regenerate Solution'
                : hasFailed
                ? 'Retry Solution Pipeline'
                : 'Generate Solution PDF'}
            </Button>
          </CardHeader>

          <CardBody className="space-y-4">
            {/* Step Progress Track */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {PIPELINE_STEPS.map((step, idx) => {
                const currentIdx = PIPELINE_STEPS.findIndex((s) =>
                  s.key.includes(assignment.aiStatus)
                );
                const isDone =
                  assignment.aiStatus === 'completed' || (currentIdx > idx && !hasFailed);
                const isActive = step.key.includes(assignment.aiStatus) && isPipelineBusy;

                return (
                  <div
                    key={step.label}
                    className={`rounded-xl px-2.5 py-2 border text-[11px] font-medium flex items-center gap-1.5 ${
                      isDone
                        ? 'bg-emerald-50/80 border-emerald-200 text-emerald-800'
                        : isActive
                        ? 'bg-blue-50/90 border-blue-300 text-blue-800'
                        : 'bg-white/45 border-slate-900/[0.06] text-slate-500'
                    }`}
                  >
                    {isActive ? (
                      <LoadingSpinner size="sm" />
                    ) : isDone ? (
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <span className="h-3.5 w-3.5 rounded-full border border-slate-300 inline-block shrink-0" />
                    )}
                    <span className="truncate">{step.label}</span>
                  </div>
                );
              })}
            </div>

            {assignment.processingStage && (
              <p className="text-xs text-slate-600">
                <span className="font-medium text-slate-800">Status:</span> {assignment.processingStage}
              </p>
            )}

            {hasFailed && (
              <div className="flex items-start gap-2.5 rounded-2xl bg-rose-50/85 border border-rose-200 p-3.5">
                <XCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-semibold text-rose-800">Processing stopped</p>
                  <p className="text-rose-700">
                    {assignment.errorMessage || 'An unexpected error occurred during document processing.'}
                  </p>
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        {/* ── SECTION 5: Generated Solution PDF & Email Delivery ─────────────── */}
        {assignment.aiStatus === 'completed' && docId && (
          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Your assignment solution is ready.
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {assignment.document?.filename || 'Formatted A4 Solution PDF'}{' '}
                    {assignment.document?.fileSizeBytes
                      ? `(${formatBytes(assignment.document.fileSizeBytes)})`
                      : ''}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {previewPdfUrl && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowPdfPreview((p) => !p)}
                    className="gap-1.5 rounded-full"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    {showPdfPreview ? 'Hide PDF Preview' : 'Preview PDF'}
                  </Button>
                )}
                {downloadPdfUrl && (
                  <a href={downloadPdfUrl} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="default" className="gap-1.5 rounded-full">
                      <Download className="h-3.5 w-3.5" />
                      Download Solution PDF
                    </Button>
                  </a>
                )}
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => handleEmail(Boolean(assignment.emailSent))}
                  isLoading={isSendingEmail}
                  className="gap-1.5 rounded-full"
                >
                  <Mail className="h-3.5 w-3.5" />
                  {assignment.emailSent ? 'Resend Solution Email' : 'Email Solution'}
                </Button>
              </div>
            </CardHeader>

            <CardBody className="space-y-4">
              {assignment.solutionMeta && (
                <div className="rounded-2xl bg-white/60 border border-slate-900/[0.06] p-3.5 text-xs space-y-1.5">
                  <div className="flex flex-wrap gap-2 items-center">
                    <Badge variant="info">Generator: {assignment.solutionMeta.providerUsed}</Badge>
                    {assignment.solutionMeta.verificationProvider && (
                      <Badge variant="success">
                        Verified: {assignment.solutionMeta.verificationProvider}
                      </Badge>
                    )}
                    <span className="text-slate-500">
                      {assignment.solutionMeta.questionsCount} question(s) solved
                    </span>
                  </div>
                  {assignment.solutionMeta.verificationNotes && (
                    <p className="text-slate-600 leading-relaxed">
                      {assignment.solutionMeta.verificationNotes}
                    </p>
                  )}
                </div>
              )}

              {emailPreview && (
                <div className="rounded-2xl bg-white/50 border border-slate-900/[0.06] px-3.5 py-2.5 text-[11px] text-slate-600 flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Email target: <strong className="text-slate-800">{emailPreview.to}</strong> · Subject:{' '}
                    <em>{emailPreview.subject}</em>
                  </span>
                  {emailPreview.alreadySent && (
                    <Badge variant="success" className="text-[10px]">
                      Delivered
                    </Badge>
                  )}
                </div>
              )}

              {emailStatus && (
                <p className={`text-xs font-medium ${emailStatus.ok ? 'text-emerald-700' : 'text-rose-600'}`}>
                  {emailStatus.msg}
                </p>
              )}

              {showPdfPreview && previewPdfUrl && (
                <div className="rounded-2xl overflow-hidden border border-slate-900/10 bg-white">
                  <iframe
                    src={previewPdfUrl}
                    title={`${assignment.title} Solution PDF preview`}
                    className="w-full h-[560px]"
                  />
                </div>
              )}
            </CardBody>
          </Card>
        )}
      </main>
    </div>
  );
}

export default AssignmentDetailPage;
