import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { LMSStatusBanner } from '@/components/dashboard/LMSStatusBanner';
import { OverviewCards } from '@/components/dashboard/OverviewCards';
import { AssignmentCard } from '@/components/dashboard/AssignmentCard';
import { QuizCard } from '@/components/dashboard/QuizCard';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useLMS } from '@/hooks/useLMS';
import { useAssignments } from '@/hooks/useAssignments';
import { useQuizzes } from '@/hooks/useQuizzes';
import { useDocuments } from '@/hooks/useDocuments';
import { useActivity } from '@/hooks/useActivity';
import { useAISummary } from '@/hooks/useAISummary';
import { AISummaryWidget } from '@/components/dashboard/AISummaryWidget';

export function OverviewPage() {
  const navigate = useNavigate();
  const [isSyncing, setIsSyncing] = useState(false);

  const { status, getLMSStatus, sync } = useLMS();
  const { assignments, getAssignments, isLoading: loadingAssignments } = useAssignments();
  const { quizzes, getQuizzes } = useQuizzes();
  const { documents, getDocuments } = useDocuments();
  const { activities, getActivity } = useActivity();
  const {
    summary: aiSummary,
    isLoading: loadingAISummary,
    isRefreshing: refreshingAISummary,
    refresh: refreshAISummary,
  } = useAISummary();

  useEffect(() => {
    getLMSStatus();
    getAssignments();
    getQuizzes();
    getDocuments();
    getActivity({ limit: 10 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSync = async () => {
    setIsSyncing(true);
    await sync();
    await Promise.all([getAssignments(), getQuizzes(), getLMSStatus(), refreshAISummary()]);
    setIsSyncing(false);
  };

  const recentAssignments = assignments.slice(0, 3);
  const recentQuizzes = quizzes.slice(0, 3);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <TopBar title="Overview" onSync={handleSync} isSyncing={isSyncing} />
      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* LMS Banner */}
        <LMSStatusBanner
          status={status}
          onSync={handleSync}
          isSyncing={isSyncing}
          onStatusChange={() => { getLMSStatus(); getAssignments(); getQuizzes(); refreshAISummary(); }}
        />

        {/* Gemini Academic Intelligence Widget (Eco Credits & Smart Digest) */}
        <AISummaryWidget
          summary={aiSummary}
          isLoading={loadingAISummary}
          isRefreshing={refreshingAISummary}
          onRefresh={refreshAISummary}
        />

        {/* Stats */}
        {loadingAssignments ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : (
          <OverviewCards
            assignments={assignments}
            quizzes={quizzes}
            documents={documents}
          />
        )}

        {/* Two-column grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Recent Assignments */}
          <Card>
            <CardHeader className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Recent Assignments</h2>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => navigate('/dashboard/assignments')}
              >
                View all
              </Button>
            </CardHeader>
            <CardBody className="space-y-3">
              {recentAssignments.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No assignments yet</p>
              ) : (
                recentAssignments.map((a) => (
                  <AssignmentCard
                    key={a._id}
                    assignment={a}
                    onViewPDF={(id) => navigate(`/dashboard/assignments/${id}`)}
                  />
                ))
              )}
            </CardBody>
          </Card>

          {/* Recent Quizzes */}
          <Card>
            <CardHeader className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Upcoming Quizzes</h2>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => navigate('/dashboard/quizzes')}
              >
                View all
              </Button>
            </CardHeader>
            <CardBody className="space-y-3">
              {recentQuizzes.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No quizzes yet</p>
              ) : (
                recentQuizzes.map((q) => <QuizCard key={q._id} quiz={q} />)
              )}
            </CardBody>
          </Card>
        </div>

        {/* Activity Feed */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-gray-900">Recent Activity</h2>
          </CardHeader>
          <CardBody>
            <ActivityFeed activities={activities} />
          </CardBody>
        </Card>
      </main>
    </div>
  );
}

export default OverviewPage