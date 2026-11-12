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

const API_BASE = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/+$/, '');

const api = axios.create({
  baseURL: API_BASE,
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
  register: (data: {
    admissionNumber: string;
    name?: string;
    email: string;
    password: string;
    confirmPassword: string;
    authType?: 'lms' | 'campus';
  }) => api.post<ApiResponse<AuthResponse>>('/auth/register', data).then((r) => r.data),

  login: (payload: {
    identifier?: string;
    admissionNumber?: string;
    email?: string;
    password: string;
    mode?: 'lms' | 'campus';
    rememberMe?: boolean;
    name?: string;
  }) => api.post<ApiResponse<AuthResponse>>('/auth/login', payload).then((r) => r.data),

  enterDemo: () =>
    api.post<ApiResponse<AuthResponse>>('/auth/demo').then((r) => r.data),

  logout: (disconnectLms = false) =>
    api.post<ApiResponse<null>>('/auth/logout', { disconnectLms }).then((r) => r.data),

  getMe: () => api.get<ApiResponse<Student>>('/auth/me').then((r) => r.data),

  updateProfile: (data: { name?: string; email?: string }) =>
    api.put<ApiResponse<AuthResponse>>('/auth/profile', data).then((r) => r.data),

  verifyEmail: (token: string) =>
    api.get<ApiResponse<null>>(`/auth/verify-email?token=${token}`).then((r) => r.data),

  changePassword: (currentPassword: string, newPassword: string) =>
    api
      .post<ApiResponse<null>>('/auth/change-password', { currentPassword, newPassword })
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

  extractDocument: (id: string, force = false) =>
    api
      .post<ApiResponse<Assignment>>(`/assignments/${id}/extract`, { force })
      .then((r) => r.data),

  generateSolution: (id: string, forceExtract = false) =>
    api
      .post<ApiResponse<Assignment>>(`/assignments/${id}/generate-solution`, { forceExtract })
      .then((r) => r.data),

  analyzeAssignment: (id: string) =>
    api
      .post<ApiResponse<Assignment>>(`/assignments/${id}/analyze`)
      .then((r) => r.data),

  uploadDocument: (id: string, filename: string, fileBase64: string, autoGenerate = false) =>
    api
      .post<ApiResponse<Assignment>>(`/assignments/${id}/upload-document`, {
        filename,
        fileBase64,
        autoGenerate,
      })
      .then((r) => r.data),

  originalDocumentUrl: (id: string, index = 0, download = false) =>
    `${API_BASE}/assignments/${id}/original-document?index=${index}${download ? '&download=1' : ''}`,

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

  downloadUrl: (id: string) => `${API_BASE}/documents/${id}/download`,
  previewUrl: (id: string) => `${API_BASE}/documents/${id}/preview`,
};

// ─── Email ────────────────────────────────────────────────────────────────────
export const emailApi = {
  previewForAssignment: (assignmentId: string) =>
    api
      .get<
        ApiResponse<{
          to: string;
          subject: string;
          courseName: string;
          assignmentTitle?: string;
          dueDate?: string | null;
          summary?: string;
          attachmentFilename?: string | null;
          attachmentSizeBytes?: number | null;
          dashboardUrl: string;
          alreadySent: boolean;
          lastSentAt?: string | null;
        }>
      >(`/email/preview/${assignmentId}`)
      .then((r) => r.data),

  sendForAssignment: (assignmentId: string, force = false) =>
    api
      .post<ApiResponse<EmailLog>>(`/email/send/${assignmentId}`, { force })
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

export const integrationsApi = {
  getHealth: async () => {
    const res = await api.get('/integrations/health');
    return res.data;
  },
  testService: async (service: 'lms' | 'gemini' | 'openai' | 'email' | 'supabase') => {
    const res = await api.post(`/integrations/test/${service}`);
    return res.data;
  },
};

export default api;
