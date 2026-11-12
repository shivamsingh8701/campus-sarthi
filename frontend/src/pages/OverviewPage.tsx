import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/layout/TopBar';
import { LMSStatusBanner, formatLastSync } from '@/components/dashboard/LMSStatusBanner';
import { OverviewCards } from '@/components/dashboard/OverviewCards';
import { AssignmentCard } from '@/components/dashboard/AssignmentCard';
import { QuizCard } from '@/components/dashboard/QuizCard';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useAuth } from '@/store/authStore';
import { useLMS } from '@/hooks/useLMS';
import { useAssignments } from '@/hooks/useAssignments';
import { useQuizzes } from '@/hooks/useQuizzes';
import { useDocuments } from '@/hooks/useDocuments';
import { useActivity } from '@/hooks/useActivity';
import { useAISummary } from '@/hooks/useAISummary';
import { AISummaryWidget } from '@/components/dashboard/AISummaryWidget';

export function OverviewPage() {
  const navigate = useNavigate();
  const { student } = useAuth();
  const [isSyncing, setIsSyncing] = useState(false);

  const { status, courses, getLMSStatus, getCourses, sync } = useLMS();
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
    getCourses();
    getAssignments();
    getQuizzes();
    getDocuments();
    getActivity({ limit: 10 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSync = async () => {
    setIsSyncing(true);
    await sync();
    await Promise.all([
      getLMSStatus(),
      getCourses(),
      getAssignments(),
      getQuizzes(),
      getDocuments(),
      refreshAISummary(),
    ]);
    setIsSyncing(false);
  };

  const recentAssignments = assignments.slice(0, 3);
  const recentQuizzes = quizzes.slice(0, 3);
  const displayName = student?.name || student?.fullName || student?.admissionNumber || 'Student';
  const syncAgo = formatLastSync(status?.lastSync || student?.lastSync);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <TopBar
        title="Overview"
        subtitle={syncAgo ? `Last LMS sync ${syncAgo}` : 'Academic workspace summary'}
        onSync={handleSync}
        isSyncing={isSyncing}
      />
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {/* Welcome Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <p className="text-xs font-medium text-indigo-600 uppercase tracking-wider">
              {student?.isDemo ? 'Demo Workspace' : 'Student Dashboard'}
            </p>
            <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 mt-0.5">
              Welcome back, {displayName}
            </h2>
          </div>
          {syncAgo && (
            <p className="text-xs text-slate-500">
              Last synchronized <span className="font-medium text-slate-700">{syncAgo}</span>
            </p>
          )}
        </div>

        {/* LMS Status Banner */}
        <LMSStatusBanner
          status={status}
          onSync={handleSync}
          isSyncing={isSyncing}
          onStatusChange={() => {
            getLMSStatus();
            getCourses();
            getAssignments();
            getQuizzes();
            refreshAISummary();
          }}
        />

        {/* Synchronized KPI Cards */}
        {loadingAssignments ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : (
          <OverviewCards
            assignments={assignments}
            quizzes={quizzes}
            documents={documents}
            courses={courses}
          />
        )}

        {/* AI Academic Intelligence Widget */}
        <AISummaryWidget
          summary={aiSummary}
          isLoading={loadingAISummary}
          isRefreshing={refreshingAISummary}
          onRefresh={refreshAISummary}
        />

        {/* Assignments & Quizzes Two-Column Split */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Recent Assignments</h3>
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
                <p className="text-xs text-slate-400 text-center py-6">
                  No assignments synchronized yet.
                </p>
              ) : (
                recentAssignments.map((a) => (
                  <AssignmentCard
                    key={a._id || a.id}
                    assignment={a}
                    onViewPDF={(id) => navigate(`/dashboard/assignments/${id}`)}
                  />
                ))
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Upcoming Quizzes</h3>
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
                <p className="text-xs text-slate-400 text-center py-6">
                  No quizzes synchronized yet.
                </p>
              ) : (
                recentQuizzes.map((q) => (
                  <QuizCard
                    key={q._id || q.id || q.lmsQuizId}
                    quiz={q}
                    onViewSolution={() => navigate('/dashboard/quizzes')}
                  />
                ))
              )}
            </CardBody>
          </Card>
        </div>

        {/* Activity Feed */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Recent Activity</h3>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => navigate('/dashboard/activity')}
            >
              History
            </Button>
          </CardHeader>
          <CardBody>
            <ActivityFeed activities={activities} />
          </CardBody>
        </Card>
      </main>
    </div>
  );
}

export default OverviewPage;
