import { useState, useCallback } from 'react';
import { assignmentsApi } from '@/services/api';
import type { Assignment, Document } from '@/types';

export function useAssignments() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [document, setDocument] = useState<Document | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSolvingAll, setIsSolvingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });

  const getAssignments = useCallback(async (params?: { status?: string; page?: number }) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await assignmentsApi.getAll(params);
      if (response.success) {
        setAssignments(response.data);
        setPagination(response.pagination);
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to load assignments');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getAssignment = useCallback(async (id: string, opts?: { silent?: boolean }) => {
    if (!opts?.silent) setIsLoading(true);
    setError(null);
    try {
      const response = await assignmentsApi.getById(id);
      if (response.success) setAssignment(response.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string; error?: string } } };
      setError(e.response?.data?.error || e.response?.data?.message || 'Failed to load assignment');
    } finally {
      if (!opts?.silent) setIsLoading(false);
    }
  }, []);

  const extractDocument = useCallback(async (id: string, force = false) => {
    setError(null);
    try {
      const response = await assignmentsApi.extractDocument(id, force);
      return {
        success: response.success,
        message: response.message,
        requiresReauth: false,
      };
    } catch (err: unknown) {
      const e = err as {
        response?: { data?: { error?: string; message?: string; requiresReauth?: boolean } };
        message?: string;
      };
      const message =
        e.response?.data?.error || e.response?.data?.message || e.message || 'Document extraction failed';
      setError(message);
      return {
        success: false,
        message,
        requiresReauth: Boolean(e.response?.data?.requiresReauth),
      };
    }
  }, []);

  const generateSolution = useCallback(async (id: string, forceExtract = false) => {
    setError(null);
    try {
      const response = await assignmentsApi.generateSolution(id, forceExtract);
      return { success: response.success, message: response.message };
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string; message?: string } }; message?: string };
      const message =
        e.response?.data?.error || e.response?.data?.message || e.message || 'Failed to start solution generation';
      setError(message);
      return { success: false, message };
    }
  }, []);

  const uploadDocument = useCallback(
    async (id: string, filename: string, fileBase64: string, autoGenerate = false) => {
      setError(null);
      try {
        const response = await assignmentsApi.uploadDocument(id, filename, fileBase64, autoGenerate);
        return { success: response.success, message: response.message };
      } catch (err: unknown) {
        const e = err as { response?: { data?: { error?: string; message?: string } }; message?: string };
        const message = e.response?.data?.error || e.response?.data?.message || e.message || 'Upload failed';
        setError(message);
        return { success: false, message };
      }
    },
    []
  );

  const analyzeAssignment = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await assignmentsApi.analyzeAssignment(id);
      if (response.success) {
        setAssignment(response.data);
        return { success: true };
      }
      return { success: false };
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      const message = e.response?.data?.message || 'Analysis failed';
      setError(message);
      return { success: false, message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getAssignmentDocument = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await assignmentsApi.getDocument(id);
      if (response.success) setDocument(response.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to get document');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const solveAllAssignments = useCallback(
    async (forceAll = false) => {
      setIsSolvingAll(true);
      setError(null);
      try {
        const response = await assignmentsApi.solveAll(forceAll);
        if (response.success) {
          await getAssignments();
          return { success: true, message: response.message, count: response.data?.queuedCount };
        }
        return { success: false, message: response.message };
      } catch (err: unknown) {
        const e = err as { response?: { data?: { error?: string } }; message?: string };
        const msg = e.response?.data?.error || e.message || 'Failed to solve assignments';
        setError(msg);
        return { success: false, message: msg };
      } finally {
        setIsSolvingAll(false);
      }
    },
    [getAssignments]
  );

  return {
    assignments,
    assignment,
    document,
    isLoading,
    isSolvingAll,
    error,
    pagination,
    getAssignments,
    getAssignment,
    extractDocument,
    generateSolution,
    uploadDocument,
    analyzeAssignment,
    solveAllAssignments,
    getAssignmentDocument,
  };
}
