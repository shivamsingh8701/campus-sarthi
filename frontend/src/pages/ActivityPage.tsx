import React, { useEffect } from 'react';
import { Activity } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardBody } from '@/components/ui/Card';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useActivity } from '@/hooks/useActivity';

export function ActivityPage() {
  const { activities, isLoading, error, getActivity } = useActivity();

  useEffect(() => {
    getActivity({ limit: 50 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <TopBar title="Activity" />
      <main className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner size="lg" />
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={() => getActivity({ limit: 50 })} />
        ) : activities.length === 0 ? (
          <EmptyState
            icon={<Activity className="h-6 w-6" />}
            title="No activity yet"
            description="Activity will appear here as you use CampusSarthi."
          />
        ) : (
          <Card>
            <CardBody>
              <ActivityFeed activities={activities} />
            </CardBody>
          </Card>
        )}
      </main>
    </div>
  );
}

export default ActivityPage