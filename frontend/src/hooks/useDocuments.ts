import { useState, useCallback } from 'react';
import { documentsApi } from '@/services/api';
import type { Document } from '@/types';

export function useDocuments() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getDocuments = useCallback(async (params?: { page?: number; limit?: number }) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await documentsApi.getAll(params);
      if (response.success) setDocuments(response.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to load documents');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getDownloadUrl = (id: string) => documentsApi.downloadUrl(id);

  return { documents, isLoading, error, getDocuments, getDownloadUrl };
}
