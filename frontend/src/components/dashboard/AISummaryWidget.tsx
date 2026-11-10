import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  HelpCircle,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { AISummaryResponse, AIPriorityItem } from '@/types';
import { formatDistanceToNow, format } from 'date-fns';

interface AISummaryWidgetProps {
  summary: AISummaryResponse | null;
  isLoading: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
}

function safeFormatDate(dateStr?: string | null): string {
  if (!dateStr) return 'No due date set';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'No due date set';
    return `${format(d, 'dd MMM yyyy, hh:mm a')} (${formatDistanceToNow(d, { addSuffix: true })})`;
  } catch {
    return 'No due date set';
  }
}

export function AISummaryWidget({
  summary,
  isLoading,
  isRefreshing,
  onRefresh,
}: AISummaryWidgetProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'pending_assign' | 'pending_quiz' | 'submitted_quiz'>(
    'pending_assign'
  );

  if (isLoading && !summary) {
    return (
      <Card className="border border-indigo-100 bg-gradient-to-r from-indigo-50/40 via-white to-purple-50/40">
        <CardBody className="p-6 text-center">
          <div className="flex items-center justify-center gap-2 text-indigo-600 font-medium text-sm">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Analyzing student deadlines with Gemini Flash...</span>
          </div>
        </CardBody>
      </Card>
    );
  }

  if (!summary) return null;

  const {
    pendingAssignments = [],
    pendingQuizzes = [],
    submittedQuizzes = [],
    overallAdvice,
    urgentCount,
    overdueCount,
    fromCache,
  } = summary;

  const urgencyBadge = (urgency: AIPriorityItem['urgencyLevel']) => {
    switch (urgency) {
      case 'overdue':
        return <Badge variant="expired">Overdue</Badge>;
      case 'urgent':
        return <Badge variant="failed">Due &lt; 48h</Badge>;
      case 'soon':
        return <Badge variant="warning">This Week</Badge>;
      default:
        return <Badge variant="default">Upcoming</Badge>;
    }
  };

  return (
    <Card className="border border-indigo-200/80 bg-white shadow-sm overflow-hidden">
      {/* Header Bar */}
      <CardHeader className="bg-gradient-to-r from-indigo-50/80 via-white to-purple-50/80 border-b border-indigo-100/80 px-6 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-600 text-white shadow-sm">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-900">
                  Gemini Academic Intelligence
                </h3>
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
                  <Zap className="h-2.5 w-2.5 text-indigo-600" />
                  Flash (Eco Credits)
                </span>
                {fromCache ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 border border-emerald-200">
                    Cached (0 Credits)
                  </span>
                ) : (
                  <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-700 border border-purple-200">
                    Live Analysis
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                AI student briefing • Auto-monitors pending tasks &amp; verified quiz attempts
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={() => navigate('/dashboard/assignments')}
              className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5 h-8 shadow-2xs"
            >
              <Sparkles className="h-3 w-3" />
              <span>Solve All Assignments</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/dashboard/quizzes')}
              className="text-xs border-emerald-300 text-emerald-800 hover:bg-emerald-50 gap-1.5 h-8"
            >
              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
              <span>Quiz Solutions &amp; Review</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              isLoading={isRefreshing}
              className="text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50 gap-1.5 h-8"
              title="Force-refresh AI advice with latest LMS data"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Refresh</span>
            </Button>
          </div>
        </div>

        {/* Gemini Advice Box */}
        {overallAdvice && (
          <div className="mt-3.5 rounded-lg border border-indigo-100 bg-white/90 p-3.5 shadow-xs">
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 rounded-full bg-indigo-100 p-1 text-indigo-600 shrink-0">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 text-xs leading-relaxed text-gray-700">
                <span className="font-semibold text-indigo-900">Study Strategy: </span>
                {overallAdvice}
              </div>
            </div>
          </div>
        )}
      </CardHeader>

      <CardBody className="p-0">
        {/* Navigation Tabs */}
        <div className="flex border-b border-gray-200 bg-gray-50/60 px-6">
          <button
            type="button"
            onClick={() => setActiveTab('pending_assign')}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'pending_assign'
                ? 'border-indigo-600 text-indigo-600 bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            <span>Pending Assignments</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] font-semibold ${
                pendingAssignments.length > 0
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-gray-200 text-gray-600'
              }`}
            >
              {pendingAssignments.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pending_quiz')}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'pending_quiz'
                ? 'border-indigo-600 text-indigo-600 bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            <HelpCircle className="h-3.5 w-3.5" />
            <span>Pending Quizzes</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] font-semibold ${
                pendingQuizzes.length > 0
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-gray-200 text-gray-600'
              }`}
            >
              {pendingQuizzes.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('submitted_quiz')}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'submitted_quiz'
                ? 'border-indigo-600 text-indigo-600 bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            <span>Submitted Quizzes</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] font-semibold ${
                submittedQuizzes.length > 0
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-gray-200 text-gray-600'
              }`}
            >
              {submittedQuizzes.length}
            </span>
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6">
          {/* TAB 1: PENDING ASSIGNMENTS */}
          {activeTab === 'pending_assign' && (
            <div className="space-y-3">
              {pendingAssignments.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 py-8 text-center text-xs text-gray-500">
                  <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500 mb-1" />
                  <p className="font-medium text-gray-700">No pending assignments!</p>
                  <p className="text-gray-400 mt-0.5">All coursework submissions are up to date.</p>
                </div>
              ) : (
                pendingAssignments.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-gray-150 p-3.5 hover:border-indigo-200 hover:bg-indigo-50/20 transition-all"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-gray-900">{item.title}</span>
                        {urgencyBadge(item.urgencyLevel)}
                        <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                          {item.course}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                        <Clock className="h-3 w-3 text-gray-400" />
                        <span>Deadline: {safeFormatDate(item.dueDate)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={item.lmsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <span>LMS Page</span>
                        <ExternalLink className="h-3 w-3 text-gray-400" />
                      </a>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 2: PENDING QUIZZES */}
          {activeTab === 'pending_quiz' && (
            <div className="space-y-3">
              {pendingQuizzes.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 py-8 text-center text-xs text-gray-500">
                  <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500 mb-1" />
                  <p className="font-medium text-gray-700">No upcoming quizzes due!</p>
                  <p className="text-gray-400 mt-0.5">You have completed all active quiz schedules.</p>
                </div>
              ) : (
                pendingQuizzes.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-gray-150 p-3.5 hover:border-indigo-200 hover:bg-indigo-50/20 transition-all"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-gray-900">{item.title}</span>
                        {urgencyBadge(item.urgencyLevel)}
                        <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                          {item.course}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                        <Clock className="h-3 w-3 text-gray-400" />
                        <span>Closes: {safeFormatDate(item.dueDate)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={item.lmsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <span>Start on LMS</span>
                        <ExternalLink className="h-3 w-3 text-gray-400" />
                      </a>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 3: SUBMITTED QUIZZES */}
          {activeTab === 'submitted_quiz' && (
            <div className="space-y-3">
              {submittedQuizzes.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 py-8 text-center text-xs text-gray-500">
                  <HelpCircle className="mx-auto h-8 w-8 text-gray-400 mb-1" />
                  <p className="font-medium text-gray-700">No submitted quizzes recorded yet.</p>
                  <p className="text-gray-400 mt-0.5">
                    Completed quiz attempts discovered during LMS sync will appear here.
                  </p>
                </div>
              ) : (
                submittedQuizzes.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-emerald-100 bg-emerald-50/30 p-3.5 hover:bg-emerald-50/50 transition-all"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-gray-900">{item.title}</span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          Submitted / Attempt Recorded
                        </span>
                        <span className="rounded-md bg-white border border-emerald-200 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                          {item.course}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                        <ShieldCheck className="h-3 w-3 text-emerald-600" />
                        <span>Verified against Galgotias Moodle session</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={item.lmsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <span>View Review</span>
                        <ExternalLink className="h-3 w-3 text-gray-400" />
                      </a>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
export default AISummaryWidget;
