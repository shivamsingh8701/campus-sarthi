// ─── Core Domain Types ───────────────────────────────────────────────────────

export interface Student {
  _id?: string;
  id?: string;
  admissionNumber: string;
  email: string;
  name?: string;
  emailVerified?: boolean;
  isEmailVerified?: boolean;
  lmsConnected?: boolean;
  lmsUsername?: string;
  lastSync?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Course {
  _id?: string;
  id?: string;
  studentId: string;
  lmsCourseId: string;
  name: string;
  code?: string;
  instructor?: string;
  semester?: string;
  year?: number;
  isActive?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export type AssignmentStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface AssignmentAttachment {
  filename: string;
  url: string;
  mimeType?: string;
  size?: number;
}

export interface Assignment {
  _id?: string;
  id?: string;
  studentId: string;
  courseId: string;
  course?: Course;
  lmsAssignmentId: string;
  title: string;
  description?: string;
  dueDate?: string;
  submittedAt?: string;
  attachments: AssignmentAttachment[];
  aiStatus: AssignmentStatus;
  documentId?: string;
  emailSent?: boolean;
  emailSentAt?: string;
  questionsExtracted?: string[];
  errorMessage?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Quiz {
  _id?: string;
  id?: string;
  studentId: string;
  courseId: string;
  course?: Course;
  lmsQuizId: string;
  title: string;
  description?: string;
  opensAt?: string;
  closesAt?: string;
  timeLimitMinutes?: number;
  allowedAttempts?: number;
  attemptsUsed?: number;
  isActive?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface Document {
  _id?: string;
  id?: string;
  studentId: string;
  assignmentId: string;
  assignment?: Assignment;
  filename: string;
  fileSize?: number;
  fileSizeBytes?: number;
  mimeType?: string;
  storageUrl?: string;
  downloadUrl?: string;
  generatedAt: string;
  createdAt: string;
  updatedAt?: string;
}

export interface EmailLog {
  _id?: string;
  id?: string;
  studentId: string;
  assignmentId?: string;
  assignment?: Assignment;
  to?: string;
  recipientEmail?: string;
  subject: string;
  status: 'sent' | 'failed' | 'pending' | 'bounced';
  sentAt?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ActivityLog {
  _id?: string;
  id?: string;
  studentId: string;
  type:
    | 'lms_sync'
    | 'assignment_fetched'
    | 'quiz_fetched'
    | 'ai_analysis_started'
    | 'ai_analysis_completed'
    | 'ai_analysis_failed'
    | 'document_generated'
    | 'email_sent'
    | 'email_failed'
    | 'lms_connected'
    | 'lms_disconnected';
  description: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// ─── LMS Status ───────────────────────────────────────────────────────────────

export interface LMSSyncInfo {
  startedAt?: string;
  completedAt?: string;
  status?: string;
  coursesFound?: number;
  assignmentsFound?: number;
  quizzesFound?: number;
}

export interface LMSStatus {
  connected: boolean;
  username?: string | null;
  loggedInAt?: string | null;
  lastUsedAt?: string | null;
  lastSync?: string | LMSSyncInfo | null;
  coursesCount?: number;
}

// ─── API Response Wrappers ────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// ─── Auth Types ───────────────────────────────────────────────────────────────

export interface AuthState {
  student: Student | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  admissionNumber: string;
  name?: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface AuthResponse {
  student: Student;
  token?: string;
}

// ─── AI Academic Digest Types ──────────────────────────────────────────────

export interface AIPriorityItem {
  id: string;
  title: string;
  course: string;
  courseId: string;
  type: 'assignment' | 'quiz';
  dueDate: string | null;
  urgencyLevel: 'overdue' | 'urgent' | 'soon' | 'later';
  submissionStatus: string;
  lmsUrl: string;
  attachmentsCount?: number;
}

export interface AISummaryResponse {
  generatedAt: string;
  fromCache: boolean;
  pendingAssignments: AIPriorityItem[];
  pendingQuizzes: AIPriorityItem[];
  submittedQuizzes: AIPriorityItem[];
  overallAdvice: string;
  urgentCount: number;
  overdueCount: number;
  totalPending: number;
  totalSubmitted: number;
}

export interface QuizSolution {
  quizId: string;
  title: string;
  courseName: string;
  solutionGuide: string;
  generatedAt: string;
}

