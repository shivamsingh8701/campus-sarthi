import { useState, useCallback } from 'react';
import { lmsApi } from '@/services/api';
import type { LMSStatus, Course } from '@/types';

export function useLMS() {
  const [status, setStatus] = useState<LMSStatus | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getLMSStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await lmsApi.getStatus();
      if (response.success) setStatus(response.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to get LMS status');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const connect = useCallback(async (username: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await lmsApi.connect(username, password);
      if (response.success) {
        setStatus(response.data);
        return { success: true };
      }
      return { success: false, message: response.message || 'Connection failed' };
    } catch (err: unknown) {
      const e = err as {
        response?: { data?: { message?: string; error?: string } };
        message?: string;
      };
      const message =
        e.response?.data?.error ||
        e.response?.data?.message ||
        e.message ||
        'Connection failed. Please check your LMS credentials and try again.';
      setError(message);
      return { success: false, message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await lmsApi.disconnect();
      setStatus(null);
      return { success: true };
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      const message = e.response?.data?.message || 'Disconnect failed';
      setError(message);
      return { success: false, message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const sync = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await lmsApi.sync();
      return { success: response.success, synced: response.data?.synced };
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      const message = e.response?.data?.message || 'Sync failed';
      setError(message);
      return { success: false, message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getCourses = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await lmsApi.getCourses();
      if (response.success) setCourses(response.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to load courses');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    status,
    courses,
    isLoading,
    error,
    getLMSStatus,
    connect,
    disconnect,
    sync,
    getCourses,
  };
}
