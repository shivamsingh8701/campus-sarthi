import { useState, useCallback, useEffect } from 'react';
import { aiApi } from '@/services/api';
import type { AISummaryResponse } from '@/types';

export function useAISummary() {
  const [summary, setSummary] = useState<AISummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async (refresh = false) => {
    if (refresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const res = await aiApi.getSummary(refresh);
      if (res.success && res.data) {
        setSummary(res.data);
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      setError(e.response?.data?.error || e.message || 'Failed to load AI summary');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary(false);
  }, [fetchSummary]);

  return {
    summary,
    isLoading,
    isRefreshing,
    error,
    refresh: () => fetchSummary(true),
  };
}

