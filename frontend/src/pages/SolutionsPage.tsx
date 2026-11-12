import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, FileCheck2, Clock, AlertCircle, Download, Mail, Eye, Zap } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useAssignments } from '@/hooks/useAssignments';
import { documentsApi, emailApi } from '@/services/api';

export function SolutionsPage() {
  const navigate = useNavigate();
  const {
    assignments,
    isLoading,
    isSolvingAll,
    getAssignments,
    analyzeAssignment,
    solveAllAssignments,
  } = useAssignments();

  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    getAssignments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const solved = assignments.filter((a) => a.aiStatus === 'completed');
  const queue = assignments.filter((a) => a.aiStatus !== 'completed');

  const handleAnalyze = async (id: string) => {
    setNotice(null);
    setBusyId(id);
    const res = await analyzeAssignment(id);
    setBusyId(null);
    setNotice(res.success ? 'AI solution draft generated.' : res.message || 'Draft generation failed.');
    getAssignments();
  };

  const handleEmail = async (id: string) => {
    setNotice(null);
    setBusyId(id);
    try {
      const res = await emailApi.sendForAssignment(id);
      setNotice(res.message || 'Solution PDF emailed to you.');
      getAssignments();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setNotice(e.response?.data?.error || 'Email delivery failed.');
    } finally {
      setBusyId(null);
    }
  };

  const handleBatch = async () => {
    setNotice(null);
    const res = await solveAllAssignments(false);
    setNotice(res.message || 'Batch AI solution generation triggered.');
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <TopBar
        title="AI Solutions"
        subtitle={`${solved.length} completed draft${solved.length === 1 ? '' : 's'} · ${queue.length} queued`}
        actions={
          <Button
            size="sm"
            variant="primary"
            onClick={handleBatch}
            isLoading={isSolvingAll}
            className="gap-1.5 rounded-full"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Solve Pending</span>
          </Button>
        }
      />
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {notice && (
          <div className="glass-surface rounded-2xl border-indigo-200/80 bg-indigo-50/75 px-4 py-2.5 text-xs text-indigo-800">
            {notice}
          </div>
        )}

        {/* Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardBody className="flex items-center justify-between p-4">
              <div>
                <p className="text-[11px] font-medium text-slate-500">Ready Solutions</p>
                <p className="text-2xl font-semibold text-slate-900 mt-0.5">{solved.length}</p>
              </div>
              <div className="h-9 w-9 rounded-xl bg-emerald-50 border border-emerald-200/70 flex items-center justify-center text-emerald-600">
                <FileCheck2 className="h-4 w-4" />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="flex items-center justify-between p-4">
              <div>
                <p className="text-[11px] font-medium text-slate-500">Pending Drafts</p>
                <p className="text-2xl font-semibold text-slate-900 mt-0.5">
                  {queue.filter((q) => q.aiStatus !== 'failed').length}
                </p>
              </div>
              <div className="h-9 w-9 rounded-xl bg-amber-50 border border-amber-200/70 flex items-center justify-center text-amber-600">
                <Clock className="h-4 w-4" />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="flex items-center justify-between p-4">
              <div>
                <p className="text-[11px] font-medium text-slate-500">Needs Retry</p>
                <p className="text-2xl font-semibold text-slate-900 mt-0.5">
                  {queue.filter((q) => q.aiStatus === 'failed').length}
                </p>
              </div>
              <div className="h-9 w-9 rounded-xl bg-rose-50 border border-rose-200/70 flex items-center justify-center text-rose-600">
                <AlertCircle className="h-4 w-4" />
              </div>
            </CardBody>
          </Card>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-14">
            <LoadingSpinner size="lg" />
          </div>
        ) : assignments.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="h-6 w-6" />}
            title="No assignments synced yet"
            description="Sync with Galgotias LMS first so CampusSarthi can extract questions and prepare AI study drafts."
          />
        ) : (
          <div className="space-y-6">
            {/* Completed Drafts */}
            {solved.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-slate-900">Generated Study Drafts</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {solved.map((a) => {
                    const id = a._id || a.id || '';
                    const courseName =
                      a.course?.name || (a as unknown as { courseName?: string }).courseName;
                    return (
                      <Card key={id}>
                        <CardBody className="space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900 truncate">{a.title}</p>
                              {courseName && (
                                <Badge variant="info" className="mt-1">
                                  {courseName}
                                </Badge>
                              )}
                            </div>
                            <Badge variant="completed">Ready</Badge>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-900/[0.06]">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => navigate(`/dashboard/assignments/${id}`)}
                              className="gap-1.5"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Preview PDF
                            </Button>
                            {a.documentId && (
                              <a href={documentsApi.downloadUrl(a.documentId)} target="_blank" rel="noreferrer">
                                <Button size="sm" variant="secondary" className="gap-1.5">
                                  <Download className="h-3.5 w-3.5" />
                                  Download
                                </Button>
                              </a>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEmail(id)}
                              isLoading={busyId === id}
                              className="gap-1.5 ml-auto"
                            >
                              <Mail className="h-3.5 w-3.5" />
                              {a.emailSent ? 'Resend' : 'Email'}
                            </Button>
                          </div>
                        </CardBody>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Queue / Needs Draft */}
            {queue.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-slate-900">Awaiting Solution Draft</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {queue.map((a) => {
                    const id = a._id || a.id || '';
                    const courseName =
                      a.course?.name || (a as unknown as { courseName?: string }).courseName;
                    return (
                      <Card key={id}>
                        <CardBody className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">{a.title}</p>
                            <div className="flex items-center gap-2 mt-1">
                              {courseName && <span className="text-xs text-slate-500 truncate">{courseName}</span>}
                              <Badge variant={a.aiStatus === 'failed' ? 'failed' : 'pending'}>
                                {a.aiStatus}
                              </Badge>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant={a.aiStatus === 'failed' ? 'default' : 'primary'}
                            onClick={() => handleAnalyze(id)}
                            isLoading={busyId === id}
                            className="shrink-0 gap-1.5"
                          >
                            <Zap className="h-3.5 w-3.5" />
                            {a.aiStatus === 'failed' ? 'Retry' : 'Draft'}
                          </Button>
                        </CardBody>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default SolutionsPage;

