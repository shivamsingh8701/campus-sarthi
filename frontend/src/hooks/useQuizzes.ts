import { useState, useCallback } from 'react';
import { quizzesApi } from '@/services/api';
import type { Quiz, QuizSolution } from '@/types';

export function useQuizzes() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [solution, setSolution] = useState<QuizSolution | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSolvingQuizzes, setIsSolvingQuizzes] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getQuizzes = useCallback(async (params?: { page?: number; limit?: number }) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await quizzesApi.getAll(params);
      if (response.success) setQuizzes(response.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to load quizzes');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getQuiz = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await quizzesApi.getById(id);
      if (response.success) setQuiz(response.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Failed to load quiz');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getOrGenerateSolution = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);
    try {
      // First try get
      try {
        const cached = await quizzesApi.getSolution(id);
        if (cached.success && cached.data) {
          setSolution(cached.data);
          return { success: true, data: cached.data };
        }
      } catch {
        // Not cached yet
      }

      // Generate
      const generated = await quizzesApi.generateSolution(id);
      if (generated.success && generated.data) {
        setSolution(generated.data);
        return { success: true, data: generated.data };
      }
      return { success: false };
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      const msg = e.response?.data?.error || e.message || 'Failed to generate quiz solution';
      setError(msg);
      return { success: false, message: msg };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const solveAllQuizzes = useCallback(async () => {
    setIsSolvingQuizzes(true);
    setError(null);
    try {
      const response = await quizzesApi.solveAll();
      return { success: true, message: response.message, count: response.data?.count };
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      const msg = e.response?.data?.error || e.message || 'Failed to solve quizzes';
      setError(msg);
      return { success: false, message: msg };
    } finally {
      setIsSolvingQuizzes(false);
    }
  }, []);

  return {
    quizzes,
    quiz,
    solution,
    isLoading,
    isSolvingQuizzes,
    error,
    getQuizzes,
    getQuiz,
    getOrGenerateSolution,
    solveAllQuizzes,
  };
}
