// ============================================================
// CampusSarthi — Database Row Types (snake_case from Supabase)
// These match the actual PostgreSQL column names.
// ============================================================

export interface StudentRow {
  id: string;
  admission_number: string;
  email: string;
  password_hash: string;
  full_name: string | null;
  is_email_verified: boolean;
  email_verification_token: string | null;
  email_verification_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LMSSessionRow {
  id: string;
  student_id: string;
  session_data_encrypted: string;
  lms_username: string;
  is_active: boolean;
  logged_in_at: string;
  last_used_at: string;
  expires_at: string | null;
  created_at: string;
}

export interface CourseRow {
  id: string;
  student_id: string;
  lms_course_id: string;
  name: string;
  short_name: string | null;
  full_name: string | null;
  course_url: string | null;
  instructor: string | null;
  enrolled_at: string | null;
  last_synced_at: string;
  created_at: string;
}

export type AssignmentPipelineDbStatus =
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

export interface AssignmentRow {
  id: string;
  student_id: string;
  course_id: string;
  lms_assignment_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  open_date: string | null;
  max_grade: number | null;
  submission_status: string | null;
  attachments: Array<{ url: string; filename: string; fileSize?: number; mimeType?: string }>;
  ai_status: AssignmentPipelineDbStatus;
  ai_error_message: string | null;
  ai_processed_at: string | null;
  document_id: string | null;
  email_sent_at: string | null;
  email_status: string | null;
  processing_stage?: string | null;
  original_documents?: unknown[] | null;
  extracted_content?: Record<string, unknown> | null;
  detected_questions?: unknown[] | null;
  ai_provider_used?: string | null;
  ai_verification_notes?: string | null;
  last_synced_at: string;
  created_at: string;
  updated_at: string;
}

export interface QuizRow {
  id: string;
  student_id: string;
  course_id: string;
  lms_quiz_id: string;
  title: string;
  description: string | null;
  open_time: string | null;
  close_time: string | null;
  time_limit_seconds: number | null;
  max_attempts: number | null;
  attempts_used: number;
  total_questions: number | null;
  status: string | null;
  instructions: string | null;
  last_synced_at: string;
  created_at: string;
}

export interface DocumentRow {
  id: string;
  student_id: string;
  assignment_id: string | null;
  filename: string;
  file_path: string;
  file_size_bytes: number | null;
  document_kind?: 'original_assignment' | 'generated_solution';
  mime_type?: string | null;
  storage_bucket?: string | null;
  storage_key?: string | null;
  generated_at: string;
  created_at: string;
}

export interface EmailLogRow {
  id: string;
  student_id: string;
  assignment_id: string | null;
  recipient_email: string;
  subject: string;
  status: 'pending' | 'sent' | 'failed' | 'bounced';
  sent_at: string | null;
  error_message: string | null;
  message_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivityLogRow {
  id: string;
  student_id: string;
  type: string;
  description: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface SyncRecordRow {
  id: string;
  student_id: string;
  started_at: string;
  completed_at: string | null;
  status: 'running' | 'completed' | 'failed' | 'partial';
  courses_found: number;
  assignments_found: number;
  quizzes_found: number;
  new_assignments: number;
  new_quizzes: number;
  errors: string[];
  created_at: string;
}

