// ─── Core Domain Types ───────────────────────────────────────────────────────

export type AuthMode = 'lms' | 'campus' | 'demo';

export interface Student {
  _id?: string;
  id?: string;
  admissionNumber: string;
  email: string;
  name?: string;
  fullName?: string | null;
  emailVerified?: boolean;
  isEmailVerified?: boolean;
  isDemo?: boolean;
  authMode?: AuthMode;
  lmsConnected?: boolean;
  lmsUsername?: string | null;
  lmsExpiresAt?: string | null;
  lastSync?: string | null;
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

export type AssignmentStatus =
  | 'pending'
  | 'discovering_attachments'
  | 'downloading'
  | 'download_failed'
  | 'validating_document'
  | 'extracting'
  | 'extraction_failed'
  | 'extracted'
  | 'generating_solution'
  | 'verifying_solution'
  | 'generating_pdf'
  | 'processing'
  | 'completed'
  | 'failed';

export interface AssignmentAttachment {
  filename: string;
  url: string;
  mimeType?: string;
  size?: number;
  fileSize?: number;
}

export interface OriginalDocumentMeta {
  index: number;
  filename: string;
  originalUrl: string;
  format: 'pdf' | 'docx' | 'doc' | 'txt' | 'other';
  mimeType: string;
  sizeBytes: number;
  pageCount: number | null;
  downloadStatus: 'downloaded' | 'validated' | 'failed';
  validationError?: string | null;
  downloadedAt: string;
}

export interface DetectedQuestionMeta {
  id: string;
  numberLabel: string;
  questionText: string;
  subquestions: string[];
  sourcePage: number | null;
  sourceFilename?: string;
  marksHint?: string | null;
  requiresVisualContext?: boolean;
}

export interface ExtractedContentMeta {
  status: 'pending' | 'extracting' | 'extracted' | 'failed';
  documentTitle?: string | null;
  totalPages: number;
  charCount: number;
  extractionConfidence: 'high' | 'medium' | 'low';
  warnings: string[];
  visualFlags: string[];
  requiresVisualProcessing: boolean;
  instructions?: string | null;
  rawTextPreview: string;
  detectedQuestions: DetectedQuestionMeta[];
  extractedAt: string;
  error?: string | null;
}

export interface SolutionMeta {
  summary: string;
  questionsCount: number;
  providerUsed: string;
  verificationProvider?: string | null;
  verificationApplied: boolean;
  verificationNotes?: string | null;
  generatedAt: string;
  documentId?: string;
  documentFilename?: string;
}

export interface Assignment {
  _id?: string;
  id?: string;
  studentId: string;
  courseId: string;
  courseName?: string;
  course?: Course;
  lmsAssignmentId: string;
  title: string;
  description?: string;
  dueDate?: string;
  submissionStatus?: string;
  submittedAt?: string;
  attachments: AssignmentAttachment[];
  aiStatus: AssignmentStatus;
  processingStage?: string;
  requiresReauth?: boolean;
  originalDocuments?: OriginalDocumentMeta[];
  extractedContent?: ExtractedContentMeta | null;
  solutionMeta?: SolutionMeta | null;
  documentId?: string;
  document?: Document | null;
  emailSent?: boolean;
  emailSentAt?: string;
  emailStatus?: string;
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
  identifier?: string;
  admissionNumber?: string;
  email?: string;
  password: string;
  rememberMe?: boolean;
  mode?: 'lms' | 'campus';
  name?: string;
}

export interface RegisterCredentials {
  admissionNumber: string;
  name?: string;
  email: string;
  password: string;
  confirmPassword: string;
  authType?: 'lms' | 'campus';
}

export interface IntegrationCheck {
  id: 'lms' | 'gemini' | 'openai' | 'email' | 'supabase';
  name: string;
  state: 'connected' | 'reachable' | 'unconfigured' | 'disconnected' | 'error';
  healthy: boolean;
  configured: boolean;
  latencyMs?: number;
  lastCheckedAt: string;
  detail: string;
  error?: string;
  meta?: Record<string, unknown>;
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

