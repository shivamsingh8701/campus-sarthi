import React, { useEffect, useState } from 'react';
import { Clock, CheckCircle2, HelpCircle, Sparkles } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { QuizCard } from '@/components/dashboard/QuizCard';
import { QuizSolutionModal } from '@/components/dashboard/QuizSolutionModal';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useQuizzes } from '@/hooks/useQuizzes';

type QuizFilter = 'all' | 'open' | 'submitted';

export function QuizzesPage() {
  const {
    quizzes,
    solution,
    isLoading,
    isSolvingQuizzes,
    error,
    getQuizzes,
    getOrGenerateSolution,
    solveAllQuizzes,
  } = useQuizzes();
  const [filter, setFilter] = useState<QuizFilter>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    getQuizzes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenSolution = async (quizId: string) => {
    setModalOpen(true);
    setModalLoading(true);
    await getOrGenerateSolution(quizId);
    setModalLoading(false);
  };

  const handleSolveAll = async () => {
    setStatusMsg(null);
    const res = await solveAllQuizzes();
    setStatusMsg(
      res.message ||
        (res.success ? 'Study guide generation started.' : 'Failed to start generation.')
    );
  };

  const isSubmitted = (q: (typeof quizzes)[0]) => {
    const raw = q as unknown as { attemptsUsed?: number; status?: string };
    const attempts = q.attemptsUsed ?? raw.attemptsUsed ?? 0;
    const status = (raw.status ?? '').toLowerCase();
    return attempts > 0 || ['completed', 'submitted', 'attempted', 'finished'].includes(status);
  };

  const filteredQuizzes = quizzes.filter((q) => {
    if (filter === 'all') return true;
    if (filter === 'submitted') return isSubmitted(q);
    if (filter === 'open') {
      if (isSubmitted(q)) return false;
      const raw = q as unknown as { closeTime?: string };
      const closeStr = q.closesAt || raw.closeTime;
      if (!closeStr) return true;
      const d = new Date(closeStr);
      return isNaN(d.getTime()) || d > new Date();
    }
    return true;
  });

  const submittedCount = quizzes.filter(isSubmitted).length;
  const openCount = quizzes.filter((q) => {
    if (isSubmitted(q)) return false;
    const raw = q as unknown as { closeTime?: string };
    const closeStr = q.closesAt || raw.closeTime;
    if (!closeStr) return true;
    const d = new Date(closeStr);
    return isNaN(d.getTime()) || d > new Date();
  }).length;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <TopBar
        title="Quizzes"
        subtitle={`${openCount} open · ${submittedCount} attempted`}
      />
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="inline-flex items-center gap-1 rounded-full bg-white/75 border border-slate-900/10 p-1 text-xs self-start">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`rounded-full px-3 py-1 font-medium transition-all ${
                filter === 'all'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({quizzes.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('open')}
              className={`rounded-full px-3 py-1 font-medium transition-all ${
                filter === 'open'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Open ({openCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter('submitted')}
              className={`rounded-full px-3 py-1 font-medium transition-all ${
                filter === 'submitted'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Submitted ({submittedCount})
            </button>
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={handleSolveAll}
            isLoading={isSolvingQuizzes}
            className="gap-1.5 rounded-full self-start sm:self-auto"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Prepare Study Guides</span>
          </Button>
        </div>

        {statusMsg && (
          <div className="glass-surface rounded-2xl border-emerald-200/80 bg-emerald-50/80 px-4 py-2.5 text-xs text-emerald-800 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{statusMsg}</span>
          </div>
        )}

        {isLoading && !modalOpen ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner size="lg" />
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={getQuizzes} />
        ) : quizzes.length === 0 ? (
          <EmptyState
            icon={<Clock className="h-6 w-6" />}
            title="No quizzes found"
            description="Connect Galgotias LMS and sync to load upcoming assessments."
          />
        ) : filteredQuizzes.length === 0 ? (
          <EmptyState
            icon={
              filter === 'submitted' ? (
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              ) : (
                <HelpCircle className="h-6 w-6" />
              )
            }
            title={filter === 'submitted' ? 'No submitted quizzes yet' : 'No matching quizzes'}
            description={
              filter === 'submitted'
                ? 'Completed quizzes from Galgotias LMS will appear here after sync.'
                : 'No quizzes match the current filter.'
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredQuizzes.map((quiz) => (
              <QuizCard
                key={quiz._id || quiz.id || quiz.lmsQuizId}
                quiz={quiz}
                onViewSolution={handleOpenSolution}
              />
            ))}
          </div>
        )}
      </main>

      <QuizSolutionModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        solution={solution}
        isLoading={modalLoading}
      />
    </div>
  );
}

export default QuizzesPage;
