import React, { useEffect, useState } from 'react';
import { FileText, Sparkles, CheckCircle2 } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { AssignmentCard } from '@/components/dashboard/AssignmentCard';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useAssignments } from '@/hooks/useAssignments';

type Filter = 'all' | 'pending' | 'completed' | 'failed';

export function AssignmentsPage() {
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
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [batchMsg, setBatchMsg] = useState<string | null>(null);

  useEffect(() => {
    getAssignments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = filter === 'all'
    ? assignments
    : assignments.filter((a) => a.aiStatus === filter);

  const handleAnalyze = async (id: string) => {
    setAnalyzingId(id);
    await analyzeAssignment(id);
    setAnalyzingId(null);
    getAssignments();
  };

  const handleSolveAll = async () => {
    setBatchMsg(null);
    const res = await solveAllAssignments(false);
    if (res.success) {
      setBatchMsg(res.message || 'AI solution generation queued for assignments.');
    } else {
      setBatchMsg(res.message || 'Failed to start batch solution generation.');
    }
  };

  const filters: { label: string; value: Filter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Pending Solution', value: 'pending' },
    { label: 'Solved (Ready)', value: 'completed' },
    { label: 'Failed', value: 'failed' },
  ];

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <TopBar title="Assignments" />
      <main className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Top Controls: Filter + Solve All Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex gap-1.5 flex-wrap">
            {filters.map((f) => (
              <Button
                key={f.value}
                size="sm"
                variant={filter === f.value ? 'default' : 'outline'}
                onClick={() => setFilter(f.value)}
              >
                {f.label}
              </Button>
            ))}
          </div>

          <Button
            size="sm"
            variant="default"
            onClick={handleSolveAll}
            isLoading={isSolvingAll}
            className="gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-xs"
          >
            <Sparkles className="h-4 w-4" />
            <span>Solve All Assignments (AI)</span>
          </Button>
        </div>

        {batchMsg && (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-800 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-600 shrink-0" />
            <span>{batchMsg}</span>
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
            title="No assignments found"
            description={
              filter === 'all'
                ? 'Connect your LMS and sync to fetch assignments.'
                : `No ${filter} assignments.`
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((assignment) => (
              <AssignmentCard
                key={assignment._id}
                assignment={assignment}
                onAnalyze={handleAnalyze}
                isAnalyzing={analyzingId === assignment._id}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default AssignmentsPage