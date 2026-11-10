import { useState, useCallback } from 'react';
import { activityApi } from '@/services/api';
import type { ActivityLog } from '@/types';

export function useActivity() {
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getActivity = useCallback(async (params?: { limit?: number }) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await activityApi.getRecent(params);
      if (response.success) setActivities(response.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to load activity');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { activities, isLoading, error, getActivity };
}
