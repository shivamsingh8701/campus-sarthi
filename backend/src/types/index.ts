// ============================================================
// CampusSarthi — Shared TypeScript Type Definitions
// ============================================================

// ─── Enums & Union Types ────────────────────────────────────

export type AITaskStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type EmailStatus = 'pending' | 'sent' | 'failed' | 'bounced';

export type ActivityType =
  | 'lms_sync'
  | 'assignment_found'
  | 'quiz_found'
  | 'document_generated'
  | 'email_sent'
  | 'email_failed'
  | 'deadline_changed'
  | 'login'
  | 'logout'
  | 'lms_connected'
  | 'lms_disconnected';

export type SyncStatus = 'running' | 'completed' | 'failed';

// ─── Core Entities ───────────────────────────────────────────

export interface Student {
  id: string;
  admissionNumber: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
  isEmailVerified: boolean;
  emailVerificationToken: string | null;
}

export interface LMSSession {
  id: string;
  studentId: string;
  /** AES-256-GCM encrypted JSON of session cookies */
  sessionToken: string;
  loginToken: string | null;
  loggedInAt: Date;
  expiresAt: Date;
  isActive: boolean;
}

export interface Course {
  id: string;
  studentId: string;
  lmsCourseId: string;
  name: string;
  shortName: string;
  fullName: string;
  courseUrl: string;
  instructor: string | null;
  enrolledAt: Date | null;
  lastSyncedAt: Date;
}

export interface AssignmentAttachment {
  url: string;
  filename: string;
  fileSize: number | null;
  mimeType: string | null;
}

export interface Assignment {
  id: string;
  studentId: string;
  courseId: string;
  lmsAssignmentId: string;
  title: string;
  description: string | null;
  dueDate: Date | null;
  openDate: Date | null;
  maxGrade: number | null;
  submissionStatus: string | null;
  attachments: AssignmentAttachment[];
  aiStatus: AITaskStatus;
  pdfDocumentId: string | null;
  emailSentAt: Date | null;
  lastSyncedAt: Date;
}

export interface Quiz {
  id: string;
  studentId: string;
  courseId: string;
  lmsQuizId: string;
  title: string;
  description: string | null;
  openTime: Date | null;
  closeTime: Date | null;
  timeLimitSeconds: number | null;
  maxAttempts: number | null;
  attemptsUsed: number;
  totalQuestions: number | null;
  status: string | null;
  lastSyncedAt: Date;
}

export interface Document {
  id: string;
  studentId: string;
  assignmentId: string | null;
  filename: string;
  filePath: string;
  fileSizeBytes: number | null;
  generatedAt: Date;
  downloadUrl: string | null;
}

export interface EmailLog {
  id: string;
  studentId: string;
  assignmentId: string | null;
  recipientEmail: string;
  subject: string;
  status: EmailStatus;
  sentAt: Date | null;
  errorMessage: string | null;
  messageId: string | null;
}

export interface ActivityLog {
  id: string;
  studentId: string;
  type: ActivityType;
  description: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface SyncRecord {
  id: string;
  studentId: string;
  startedAt: Date;
  completedAt: Date | null;
  status: SyncStatus;
  coursesFound: number;
  assignmentsFound: number;
  quizzesFound: number;
  errors: string[];
}

// ─── LMS Connector Internal Types ────────────────────────────

export interface LoginResult {
  success: boolean;
  errorMessage?: string;
  sessionCookies?: SessionCookie[];
}

export interface SessionCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite?: string;
}

export interface CourseData {
  lmsCourseId: string;
  name: string;
  shortName: string;
  fullName: string;
  courseUrl: string;
}

export interface ActivityData {
  type: 'assignment' | 'quiz' | 'resource' | 'unknown';
  name: string;
  url: string;
  section: string;
  dueDate?: Date | null;
  closeDate?: Date | null;
  courseName?: string;
  courseId?: string;
}

export interface AssignmentDetails {
  lmsAssignmentId: string;
  title: string;
  description: string | null;
  dueDate: Date | null;
  openDate: Date | null;
  maxGrade: number | null;
  submissionStatus: string | null;
  attachments: AssignmentAttachment[];
}

export interface QuizDetails {
  lmsQuizId: string;
  title: string;
  description: string | null;
  openTime: Date | null;
  closeTime: Date | null;
  timeLimitSeconds: number | null;
  maxAttempts: number | null;
  totalQuestions: number | null;
  status: string | null;
}

// ─── AI Router Types ─────────────────────────────────────────

export type AIProvider = 'gemini' | 'openai';

export type AITask =
  | 'assignment_analysis'
  | 'solution_generation'
  | 'quiz_analysis'
  | 'answer_verification'
  | 'summary_generation';

export interface AIResponse {
  text: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  provider: AIProvider;
  model: string;
  durationMs: number;
}

export interface AIOptions {
  temperature?: number;
  maxOutputTokens?: number;
  systemInstruction?: string;
}

// ─── PDF Types ───────────────────────────────────────────────

export interface SolutionPdfData {
  assignmentTitle: string;
  courseName: string;
  studentName: string;
  dueDate: Date | null;
  questions: Array<{
    question: string;
    answer: string;
    reasoning?: string;
  }>;
  aiDisclaimer: string;
  generatedAt: Date;
}

// ─── API Request / Response Types ────────────────────────────

// Auth
export interface RegisterRequest {
  admissionNumber: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface StudentPublic {
  id: string;
  admissionNumber: string;
  email: string;
  isEmailVerified: boolean;
  createdAt: Date;
}

export interface AuthResponse {
  student: StudentPublic;
  message: string;
}

// LMS
export interface LMSConnectRequest {
  username: string;
  password: string;
}

export interface LMSStatusResponse {
  isConnected: boolean;
  loggedInAt: Date | null;
  expiresAt: Date | null;
}

export interface SyncSummaryResponse {
  coursesFound: number;
  assignmentsFound: number;
  quizzesFound: number;
  startedAt: Date;
  completedAt: Date | null;
  status: SyncStatus;
  errors: string[];
}

// Assignments
export interface AssignmentListItem {
  id: string;
  courseId: string;
  courseName: string;
  lmsAssignmentId: string;
  title: string;
  dueDate: Date | null;
  aiStatus: AITaskStatus;
  pdfDocumentId: string | null;
  emailSentAt: Date | null;
}

// Generic API
export interface ApiError {
  error: string;
  details?: unknown;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Express Augmentation ────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      student?: {
        id: string;
        email: string;
      };
    }
  }
}
