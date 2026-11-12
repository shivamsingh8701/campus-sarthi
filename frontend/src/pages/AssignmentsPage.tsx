import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  FileText,
  Sparkles,
  ExternalLink,
  Paperclip,
  Download,
  Mail,
  Zap,
  Eye,
  Search,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { TopBar } from '@/components/layout/TopBar';
import { AssignmentCard } from '@/components/dashboard/AssignmentCard';
import { Card } from '@/components/ui/Card';
import { Badge, statusToBadgeVariant, statusToLabel } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useAssignments } from '@/hooks/useAssignments';
import { documentsApi, emailApi } from '@/services/api';

type Filter = 'all' | 'pending' | 'completed' | 'failed';

function safeFormatDue(dueDate?: string): string {
  if (!dueDate) return 'No due date';
  try {
    const d = new Date(dueDate);
    return isNaN(d.getTime()) ? 'No due date' : format(d, 'MMM d, yyyy · h:mm a');
  } catch {
    return 'No due date';
  }
}

export function AssignmentsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    assignments,
    isLoading,
    isSolvingAll,
    error,
    getAssignments,
    analyzeAssignment,
    solveAllAssignments,
  } = useAssignments();

  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    getAssignments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const qParam = searchParams.get('q');
    if (qParam !== null) setSearch(qParam);
  }, [searchParams]);

  const filtered = assignments.filter((a) => {
    const matchesStatus =
      filter === 'all' ||
      (filter === 'completed' && a.aiStatus === 'completed') ||
      (filter === 'failed' &&
        (a.aiStatus === 'failed' ||
          a.aiStatus === 'download_failed' ||
          a.aiStatus === 'extraction_failed')) ||
      (filter === 'pending' &&
        a.aiStatus !== 'completed' &&
        a.aiStatus !== 'failed' &&
        a.aiStatus !== 'download_failed' &&
        a.aiStatus !== 'extraction_failed');
    if (!matchesStatus) return false;
    if (!search.trim()) return true;
    const term = search.trim().toLowerCase();
    const courseName = (a.course?.name || (a as unknown as { courseName?: string }).courseName || '').toLowerCase();
    return a.title.toLowerCase().includes(term) || courseName.includes(term);
  });

  const handleAnalyze = async (id: string) => {
    setFeedback(null);
    setAnalyzingId(id);
    const res = await analyzeAssignment(id);
    setAnalyzingId(null);
    if (res.success) {
      setFeedback({ ok: true, text: 'AI solution draft generated.' });
    } else {
      setFeedback({ ok: false, text: res.message || 'AI generation failed.' });
    }
    getAssignments();
  };

  const handleSendEmail = async (id: string) => {
    setFeedback(null);
    setSendingEmailId(id);
    try {
      const res = await emailApi.sendForAssignment(id);
      setFeedback({ ok: true, text: res.message || 'Solution PDF dispatched to your email.' });
      getAssignments();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      setFeedback({ ok: false, text: e.response?.data?.error || e.message || 'Failed to send email.' });
    } finally {
      setSendingEmailId(null);
    }
  };

  const handleSolveAll = async () => {
    setFeedback(null);
    const res = await solveAllAssignments(false);
    setFeedback({
      ok: res.success,
      text: res.message || (res.success ? 'AI solution generation queued.' : 'Batch generation failed.'),
    });
  };

  const filters: { label: string; value: Filter }[] = [
    { label: `All (${assignments.length})`, value: 'all' },
    { label: 'Pending', value: 'pending' },
    { label: 'Completed', value: 'completed' },
    { label: 'Failed', value: 'failed' },
  ];

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <TopBar
        title="Assignments"
        subtitle={`${assignments.length} synchronized assignment${assignments.length === 1 ? '' : 's'}`}
      />
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
        {/* Filter + Search + Batch Solve */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            {filters.map((f) => (
              <Button
                key={f.value}
                size="sm"
                variant={filter === f.value ? 'default' : 'outline'}
                onClick={() => setFilter(f.value)}
                className="rounded-full"
              >
                {f.label}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by title or course..."
                className="h-8 w-52 rounded-full border border-slate-900/12 bg-white/80 pl-8 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <Button
              size="sm"
              variant="primary"
              onClick={handleSolveAll}
              isLoading={isSolvingAll}
              className="gap-1.5 rounded-full"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Generate All Drafts</span>
            </Button>
          </div>
        </div>

        {feedback && (
          <div
            className={`glass-surface rounded-2xl px-4 py-2.5 text-xs flex items-center gap-2 ${
              feedback.ok
                ? 'border-emerald-200 bg-emerald-50/80 text-emerald-800'
                : 'border-rose-200 bg-rose-50/80 text-rose-700'
            }`}
          >
            {feedback.ok ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner size="lg" />
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={getAssignments} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-6 w-6" />}
            title="No matching assignments"
            description={
              filter === 'all' && !search
                ? 'Connect Galgotias LMS and sync to load course assignments.'
                : 'Try adjusting your filter or search query.'
            }
          />
        ) : (
          <>
            {/* Desktop Clean Glass Data Table */}
            <Card className="hidden xl:block overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-900/[0.06] bg-white/40 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      <th className="px-4 py-3">Assignment & Course</th>
                      <th className="px-4 py-3">Deadline</th>
                      <th className="px-4 py-3">Source Attachment</th>
                      <th className="px-4 py-3">AI & PDF Status</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/[0.05] text-xs">
                    {filtered.map((a) => {
                      const id = a._id || a.id || '';
                      const courseName =
                        a.course?.name || (a as unknown as { courseName?: string }).courseName || 'Course';
                      const attachments = Array.isArray(a.attachments) ? a.attachments : [];
                      const firstAtt = attachments[0];
                      const currentStatus = a.aiStatus || 'pending';
                      const lmsUrl = `https://gulms.galgotiasuniversity.org/mod/assign/view.php?id=${a.lmsAssignmentId}`;

                      return (
                        <tr key={id} className="hover:bg-white/60 transition-colors">
                          <td className="px-4 py-3.5 max-w-[260px]">
                            <button
                              type="button"
                              onClick={() => navigate(`/dashboard/assignments/${id}`)}
                              className="font-semibold text-slate-900 hover:text-indigo-600 text-left line-clamp-1"
                            >
                              {a.title}
                            </button>
                            <p className="text-[11px] text-slate-500 truncate mt-0.5">{courseName}</p>
                          </td>

                          <td className="px-4 py-3.5 whitespace-nowrap text-slate-600">
                            {safeFormatDue(a.dueDate)}
                          </td>

                          <td className="px-4 py-3.5 max-w-[200px]">
                            {firstAtt ? (
                              <div className="flex items-center gap-1.5">
                                <Badge variant="success" className="px-1.5 py-0 text-[10px]">
                                  Ready
                                </Badge>
                                <a
                                  href={firstAtt.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-indigo-600 hover:underline truncate"
                                  title={firstAtt.filename}
                                >
                                  <Paperclip className="h-3 w-3 shrink-0" />
                                  <span className="truncate">{firstAtt.filename}</span>
                                </a>
                              </div>
                            ) : (
                              <span className="text-slate-400">No file attached</span>
                            )}
                          </td>

                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <Badge variant={statusToBadgeVariant(currentStatus)}>
                                {statusToLabel(currentStatus)}
                              </Badge>
                              {a.documentId && (
                                <Badge variant="info" className="text-[10px]">
                                  PDF
                                </Badge>
                              )}
                            </div>
                          </td>

                          <td className="px-4 py-3.5 whitespace-nowrap">
                            {a.emailSent ? (
                              <Badge variant="success">Sent</Badge>
                            ) : (
                              <span className="text-slate-400">Not sent</span>
                            )}
                          </td>

                          <td className="px-4 py-3.5 whitespace-nowrap text-right">
                            <div className="inline-flex items-center justify-end gap-1">
                              <a href={lmsUrl} target="_blank" rel="noreferrer">
                                <Button size="sm" variant="ghost" title="Open LMS Page">
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </Button>
                              </a>

                              {firstAtt && (
                                <a href={firstAtt.url} target="_blank" rel="noreferrer">
                                  <Button size="sm" variant="ghost" title="View Original Attachment">
                                    <Paperclip className="h-3.5 w-3.5" />
                                  </Button>
                                </a>
                              )}

                              {(currentStatus === 'pending' || currentStatus === 'failed') && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleAnalyze(id)}
                                  isLoading={analyzingId === id}
                                  title="Generate Solution Draft"
                                  className="gap-1"
                                >
                                  <Zap className="h-3 w-3" />
                                  <span>{currentStatus === 'failed' ? 'Retry' : 'Draft'}</span>
                                </Button>
                              )}

                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => navigate(`/dashboard/assignments/${id}`)}
                                title="Preview PDF & Details"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>

                              {a.documentId && (
                                <>
                                  <a
                                    href={documentsApi.downloadUrl(a.documentId)}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    <Button size="sm" variant="ghost" title="Download PDF">
                                      <Download className="h-3.5 w-3.5" />
                                    </Button>
                                  </a>

                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleSendEmail(id)}
                                    isLoading={sendingEmailId === id}
                                    title="Send Email"
                                  >
                                    <Mail className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Mobile & Tablet Card Grid */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:hidden">
              {filtered.map((a) => {
                const id = a._id || a.id || '';
                return (
                  <AssignmentCard
                    key={id}
                    assignment={a}
                    onAnalyze={handleAnalyze}
                    onViewPDF={(targetId) => navigate(`/dashboard/assignments/${targetId}`)}
                    onSendEmail={handleSendEmail}
                    isAnalyzing={analyzingId === id}
                    isSendingEmail={sendingEmailId === id}
                  />
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default AssignmentsPage;
