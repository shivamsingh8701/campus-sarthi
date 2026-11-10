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
    if (res.success) {
      setStatusMsg(res.message || 'Quiz solution generation started.');
    } else {
      setStatusMsg(res.message || 'Failed to start quiz solutions.');
    }
  };

  const isSubmitted = (q: (typeof quizzes)[0]) => {
    const raw = q as unknown as { attemptsUsed?: number; status?: string };
    const attempts = q.attemptsUsed ?? raw.attemptsUsed ?? 0;
    const status = (raw.status ?? '').toLowerCase();
    return attempts > 0 || status === 'completed' || status === 'submitted' || status === 'attempted';
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
      <TopBar title="Quizzes" />
      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Header & Filter Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">University Quizzes</h1>
            <p className="text-xs text-gray-500">
              Live Moodle assessments, closing windows, attempt tracking, and completed quiz records.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={handleSolveAll}
              isLoading={isSolvingQuizzes}
              className="gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-xs"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Generate Solutions for All Quizzes</span>
            </Button>

            <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1 text-xs">
              <button
                type="button"
                onClick={() => setFilter('all')}
                className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                  filter === 'all'
                    ? 'bg-white text-gray-900 shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                All ({quizzes.length})
              </button>
              <button
                type="button"
                onClick={() => setFilter('open')}
                className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                  filter === 'open'
                    ? 'bg-white text-amber-900 shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Pending / Open ({openCount})
              </button>
              <button
                type="button"
                onClick={() => setFilter('submitted')}
                className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                  filter === 'submitted'
                    ? 'bg-white text-emerald-900 shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Submitted / Done ({submittedCount})
              </button>
            </div>
          </div>
        </div>

        {statusMsg && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{statusMsg}</span>
          </div>
        )}

        {/* Content */}
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
            description="Connect your LMS and sync to fetch quizzes."
          />
        ) : filteredQuizzes.length === 0 ? (
          <EmptyState
            icon={filter === 'submitted' ? <CheckCircle2 className="h-6 w-6 text-emerald-600" /> : <HelpCircle className="h-6 w-6" />}
            title={filter === 'submitted' ? 'No submitted quizzes yet' : 'No matching quizzes'}
            description={
              filter === 'submitted'
                ? 'When you complete a quiz on Galgotias LMS and sync, your verified submission will appear here.'
                : 'No quizzes match the selected filter.'
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredQuizzes.map((quiz) => (
              <QuizCard
                key={quiz._id || quiz.id}
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
