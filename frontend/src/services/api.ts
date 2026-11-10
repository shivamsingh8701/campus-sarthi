import axios from 'axios';
import type {
  ApiResponse,
  PaginatedResponse,
  Student,
  Course,
  Assignment,
  Quiz,
  Document,
  EmailLog,
  ActivityLog,
  LMSStatus,
  AuthResponse,
} from '@/types';

const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ─── Request Interceptor ──────────────────────────────────────────────────────
api.interceptors.request.use(
  (config) => {
    config.headers['Content-Type'] = 'application/json';
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response Interceptor ─────────────────────────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
      const requestUrl = error.config?.url || '';
      // Only redirect if not already on an auth page and not attempting auth requests
      if (
        pathname !== '/login' &&
        pathname !== '/register' &&
        !requestUrl.includes('/auth/login') &&
        !requestUrl.includes('/auth/me')
      ) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  register: (data: { admissionNumber: string; name?: string; email: string; password: string; confirmPassword: string }) =>
    api.post<ApiResponse<AuthResponse>>('/auth/register', data).then((r) => r.data),

  login: (email: string, password: string) =>
    api.post<ApiResponse<AuthResponse>>('/auth/login', { email, password }).then((r) => r.data),

  logout: () => api.post<ApiResponse<null>>('/auth/logout').then((r) => r.data),

  getMe: () => api.get<ApiResponse<Student>>('/auth/me').then((r) => r.data),

  verifyEmail: (token: string) =>
    api.get<ApiResponse<null>>(`/auth/verify-email?token=${token}`).then((r) => r.data),

  changePassword: (currentPassword: string, newPassword: string) =>
    api
      .put<ApiResponse<null>>('/auth/change-password', { currentPassword, newPassword })
      .then((r) => r.data),
};

// ─── LMS ──────────────────────────────────────────────────────────────────────
export const lmsApi = {
  connect: (username: string, password: string) =>
    api.post<ApiResponse<LMSStatus>>('/lms/connect', { username, password }).then((r) => r.data),

  disconnect: () => api.post<ApiResponse<null>>('/lms/disconnect').then((r) => r.data),

  getStatus: () => api.get<ApiResponse<LMSStatus>>('/lms/status').then((r) => r.data),

  sync: () => api.post<ApiResponse<{ synced: number }>>('/lms/sync').then((r) => r.data),

  getCourses: () =>
    api.get<ApiResponse<Course[]>>('/lms/courses').then((r) => r.data),
};

// ─── Assignments ──────────────────────────────────────────────────────────────
export const assignmentsApi = {
  getAll: (params?: { status?: string; page?: number; limit?: number }) =>
    api
      .get<PaginatedResponse<Assignment>>('/assignments', { params })
      .then((r) => r.data),

  getById: (id: string) =>
    api.get<ApiResponse<Assignment>>(`/assignments/${id}`).then((r) => r.data),

  analyzeAssignment: (id: string) =>
    api
      .post<ApiResponse<Assignment>>(`/assignments/${id}/analyze`)
      .then((r) => r.data),

  solveAll: (forceAll?: boolean) =>
    api
      .post<ApiResponse<{ queuedCount: number }>>('/assignments/solve-all', { forceAll })
      .then((r) => r.data),

  getDocument: (id: string) =>
    api
      .get<ApiResponse<Document>>(`/assignments/${id}/document`)
      .then((r) => r.data),
};

// ─── Quizzes ──────────────────────────────────────────────────────────────────
export const quizzesApi = {
  getAll: (params?: { page?: number; limit?: number }) =>
    api
      .get<PaginatedResponse<Quiz>>('/quizzes', { params })
      .then((r) => r.data),

  getById: (id: string) =>
    api.get<ApiResponse<Quiz>>(`/quizzes/${id}`).then((r) => r.data),

  solveAll: () =>
    api
      .post<ApiResponse<{ count: number }>>('/quizzes/solve-all')
      .then((r) => r.data),

  getSolution: (id: string) =>
    api
      .get<ApiResponse<import('@/types').QuizSolution>>(`/quizzes/${id}/solution`)
      .then((r) => r.data),

  generateSolution: (id: string) =>
    api
      .post<ApiResponse<import('@/types').QuizSolution>>(`/quizzes/${id}/solution`)
      .then((r) => r.data),
};

// ─── Documents ────────────────────────────────────────────────────────────────
export const documentsApi = {
  getAll: (params?: { page?: number; limit?: number }) =>
    api
      .get<PaginatedResponse<Document>>('/documents', { params })
      .then((r) => r.data),

  downloadUrl: (id: string) => `/api/v1/documents/${id}/download`,
};

// ─── Email ────────────────────────────────────────────────────────────────────
export const emailApi = {
  sendForAssignment: (assignmentId: string) =>
    api
      .post<ApiResponse<EmailLog>>(`/email/send/${assignmentId}`)
      .then((r) => r.data),

  sendTestEmail: (to?: string) =>
    api
      .post<ApiResponse<{ messageId: string; sentTo: string }>>('/email/test', { to })
      .then((r) => r.data),

  getLogs: (params?: { page?: number; limit?: number }) =>
    api
      .get<PaginatedResponse<EmailLog>>('/email/logs', { params })
      .then((r) => r.data),
};

// ─── Activity ─────────────────────────────────────────────────────────────────
export const activityApi = {
  getRecent: (params?: { limit?: number }) =>
    api
      .get<ApiResponse<ActivityLog[]>>('/activity', { params })
      .then((r) => r.data),
};

export const aiApi = {
  getSummary: (refresh?: boolean) =>
    api
      .get<ApiResponse<import('@/types').AISummaryResponse>>('/ai/summary', {
        params: refresh ? { refresh: 'true' } : undefined,
      })
      .then((r) => r.data),

  getPending: () =>
    api
      .get<ApiResponse<{
        pendingAssignments: Array<import('@/types').AIPriorityItem>;
        pendingQuizzes: Array<import('@/types').AIPriorityItem>;
        totalPending: number;
      }>>('/ai/pending')
      .then((r) => r.data),

  getSubmitted: () =>
    api
      .get<ApiResponse<{
        submittedQuizzes: Array<import('@/types').AIPriorityItem>;
        submittedAssignments: Array<import('@/types').AIPriorityItem>;
        totalSubmitted: number;
      }>>('/ai/submitted')
      .then((r) => r.data),

  invalidateSummary: () =>
    api.post<ApiResponse<{ message: string }>>('/ai/summary/invalidate').then((r) => r.data),
};

export default api;
