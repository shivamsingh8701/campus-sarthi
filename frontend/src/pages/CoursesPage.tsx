import React, { useEffect } from 'react';
import { BookOpen, ExternalLink, RefreshCw, CheckCircle2 } from 'lucide-react';
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
      <TopBar title="My Courses" onSync={handleSync} isSyncing={isLoading} />
      <main className="flex-1 overflow-y-auto p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Enrolled LMS Courses</h1>
            <p className="text-xs text-gray-500">
              Courses synchronized from your official Galgotias University LMS account.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={handleSync} isLoading={isLoading} className="gap-2">
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
            title="No courses found"
            description="Connect your Galgotias LMS account to fetch your enrolled university courses."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => {
              const courseUrl =
                (course as unknown as { courseUrl?: string })?.courseUrl ||
                `https://gulms.galgotiasuniversity.org/course/view.php?id=${course.lmsCourseId}`;

              return (
                <Card key={course._id || course.id || course.lmsCourseId} className="flex flex-col">
                  <CardBody className="flex flex-1 flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
                        <BookOpen className="h-5 w-5" />
                      </div>
                      <Badge variant="success" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Enrolled
                      </Badge>
                    </div>

                    <div className="space-y-1">
                      <h3 className="font-semibold text-gray-900 text-sm line-clamp-2">
                        {course.name}
                      </h3>
                      {course.code && (
                        <p className="text-xs font-mono text-gray-500">{course.code}</p>
                      )}
                    </div>

                    {course.instructor && (
                      <p className="text-xs text-gray-500">
                        Instructor: <span className="text-gray-700 font-medium">{course.instructor}</span>
                      </p>
                    )}

                    <div className="mt-auto pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
                      <span>LMS ID: {course.lmsCourseId}</span>
                      <a
                        href={courseUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 font-medium text-indigo-600 hover:text-indigo-800"
                      >
                        Open on LMS
                        <ExternalLink className="h-3 w-3" />
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

