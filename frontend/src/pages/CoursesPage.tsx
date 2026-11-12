import React, { useEffect } from 'react';
import { BookOpen, ExternalLink, RefreshCw, CheckCircle2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useLMS } from '@/hooks/useLMS';

export function CoursesPage() {
  const { courses, getCourses, isLoading, error, sync } = useLMS();

  useEffect(() => {
    getCourses();
  }, [getCourses]);

  const handleSync = async () => {
    await sync();
    await getCourses();
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <TopBar
        title="My Courses"
        subtitle={`${courses.length} synchronized Galgotias LMS course${courses.length === 1 ? '' : 's'}`}
        onSync={handleSync}
        isSyncing={isLoading}
      />
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Enrolled LMS Courses</h2>
            <p className="text-xs text-slate-500">
              Courses pulled directly from your active Galgotias University Moodle session.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={handleSync} isLoading={isLoading} className="gap-2 self-start sm:self-auto">
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh Courses
          </Button>
        </div>

        {isLoading && courses.length === 0 ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner size="lg" />
          </div>
        ) : error && courses.length === 0 ? (
          <ErrorState message={error} onRetry={getCourses} />
        ) : courses.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="h-6 w-6" />}
            title="No courses synchronized"
            description="Connect your Galgotias LMS account or trigger a sync to load enrolled courses."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => {
              const raw = course as unknown as {
                courseUrl?: string;
                shortName?: string;
                lastSyncedAt?: string;
              };
              const courseUrl =
                raw?.courseUrl ||
                `https://gulms.galgotiasuniversity.org/course/view.php?id=${course.lmsCourseId}`;
              const syncedAgo = raw?.lastSyncedAt
                ? (() => {
                    try {
                      return formatDistanceToNow(new Date(raw.lastSyncedAt), { addSuffix: true });
                    } catch {
                      return null;
                    }
                  })()
                : null;

              return (
                <Card key={course._id || course.id || course.lmsCourseId} className="flex flex-col hover:border-slate-900/15">
                  <CardBody className="flex flex-1 flex-col gap-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="rounded-xl bg-indigo-50/90 border border-indigo-200/60 p-2 text-indigo-600">
                        <BookOpen className="h-4 w-4" />
                      </div>
                      <Badge variant="success" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Enrolled
                      </Badge>
                    </div>

                    <div className="space-y-1">
                      <h3 className="font-semibold text-slate-900 text-sm line-clamp-2 leading-snug">
                        {course.name}
                      </h3>
                      {(course.code || raw.shortName) && (
                        <p className="text-[11px] font-mono text-slate-500">
                          {course.code || raw.shortName}
                        </p>
                      )}
                    </div>

                    {course.instructor && (
                      <p className="text-xs text-slate-500">
                        Faculty: <span className="text-slate-700 font-medium">{course.instructor}</span>
                      </p>
                    )}

                    <div className="mt-auto pt-3 border-t border-slate-900/[0.06] flex items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-400">
                        {syncedAgo ? `Synced ${syncedAgo}` : 'Active course'}
                      </span>
                      <a
                        href={courseUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
                      >
                        Open LMS <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

export default CoursesPage;
