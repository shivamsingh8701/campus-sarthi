-- ============================================================
-- CampusSarthi Initial Schema
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- STUDENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admission_number TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  is_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  email_verification_token TEXT,
  email_verification_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_students_email ON students(email);
CREATE INDEX idx_students_admission_number ON students(admission_number);

-- ============================================================
-- LMS SESSIONS TABLE (encrypted session storage)
-- ============================================================
CREATE TABLE IF NOT EXISTS lms_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  -- session_data stores encrypted JSON of Playwright cookies
  session_data_encrypted TEXT NOT NULL,
  lms_username TEXT NOT NULL,  -- store username (not password) for display
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  logged_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lms_sessions_student_id ON lms_sessions(student_id);
CREATE INDEX idx_lms_sessions_active ON lms_sessions(student_id, is_active);

-- ============================================================
-- COURSES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  lms_course_id TEXT NOT NULL,
  name TEXT NOT NULL,
  short_name TEXT,
  full_name TEXT,
  course_url TEXT,
  instructor TEXT,
  enrolled_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, lms_course_id)
);

CREATE INDEX idx_courses_student_id ON courses(student_id);

-- ============================================================
-- ASSIGNMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lms_assignment_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_date TIMESTAMPTZ,
  open_date TIMESTAMPTZ,
  max_grade NUMERIC,
  submission_status TEXT DEFAULT 'unknown',
  -- JSON array of { url, filename, fileSize, mimeType }
  attachments JSONB NOT NULL DEFAULT '[]',
  -- AI processing status
  ai_status TEXT NOT NULL DEFAULT 'pending' CHECK (ai_status IN ('pending', 'processing', 'completed', 'failed')),
  ai_error_message TEXT,
  ai_processed_at TIMESTAMPTZ,
  -- Generated document
  document_id UUID,
  -- Email delivery
  email_sent_at TIMESTAMPTZ,
  email_status TEXT,
  -- Sync tracking
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, lms_assignment_id)
);

CREATE INDEX idx_assignments_student_id ON assignments(student_id);
CREATE INDEX idx_assignments_course_id ON assignments(course_id);
CREATE INDEX idx_assignments_due_date ON assignments(due_date);
CREATE INDEX idx_assignments_ai_status ON assignments(ai_status);

-- ============================================================
-- QUIZZES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS quizzes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lms_quiz_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  open_time TIMESTAMPTZ,
  close_time TIMESTAMPTZ,
  time_limit_seconds INTEGER,
  max_attempts INTEGER,
  attempts_used INTEGER DEFAULT 0,
  total_questions INTEGER,
  status TEXT DEFAULT 'unknown',
  instructions TEXT,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, lms_quiz_id)
);

CREATE INDEX idx_quizzes_student_id ON quizzes(student_id);
CREATE INDEX idx_quizzes_course_id ON quizzes(course_id);

-- ============================================================
-- DOCUMENTS TABLE (generated PDFs)
-- ============================================================
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  assignment_id UUID REFERENCES assignments(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size_bytes BIGINT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_student_id ON documents(student_id);
CREATE INDEX idx_documents_assignment_id ON documents(assignment_id);

-- ============================================================
-- EMAIL LOGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  assignment_id UUID REFERENCES assignments(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'bounced')),
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  message_id TEXT,  -- provider's message ID for tracking
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_logs_student_id ON email_logs(student_id);
CREATE INDEX idx_email_logs_assignment_id ON email_logs(assignment_id);

-- ============================================================
-- ACTIVITY LOGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activity_logs_student_id ON activity_logs(student_id);
CREATE INDEX idx_activity_logs_created_at ON activity_logs(created_at DESC);

-- ============================================================
-- SYNC RECORDS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS sync_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'partial')),
  courses_found INTEGER DEFAULT 0,
  assignments_found INTEGER DEFAULT 0,
  quizzes_found INTEGER DEFAULT 0,
  new_assignments INTEGER DEFAULT 0,
  new_quizzes INTEGER DEFAULT 0,
  errors JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sync_records_student_id ON sync_records(student_id);

-- ============================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_students_updated_at
  BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_assignments_updated_at
  BEFORE UPDATE ON assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_logs_updated_at
  BEFORE UPDATE ON email_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS on all student-data tables
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE lms_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_records ENABLE ROW LEVEL SECURITY;

-- NOTE: Backend uses service role key which bypasses RLS.
-- These policies are for direct Supabase client access.
-- The backend enforces student_id filtering at the query level.

-- Students can only see their own record
CREATE POLICY students_self_select ON students
  FOR SELECT USING (id = auth.uid()::UUID);

CREATE POLICY students_self_update ON students
  FOR UPDATE USING (id = auth.uid()::UUID);

-- Students can only see their own LMS sessions
CREATE POLICY lms_sessions_own ON lms_sessions
  FOR ALL USING (student_id = auth.uid()::UUID);

-- Students can only see their own courses
CREATE POLICY courses_own ON courses
  FOR ALL USING (student_id = auth.uid()::UUID);

-- Students can only see their own assignments
CREATE POLICY assignments_own ON assignments
  FOR ALL USING (student_id = auth.uid()::UUID);

-- Students can only see their own quizzes
CREATE POLICY quizzes_own ON quizzes
  FOR ALL USING (student_id = auth.uid()::UUID);

-- Students can only see their own documents
CREATE POLICY documents_own ON documents
  FOR ALL USING (student_id = auth.uid()::UUID);

-- Students can only see their own email logs
CREATE POLICY email_logs_own ON email_logs
  FOR ALL USING (student_id = auth.uid()::UUID);

-- Students can only see their own activity logs
CREATE POLICY activity_logs_own ON activity_logs
  FOR ALL USING (student_id = auth.uid()::UUID);

-- Students can only see their own sync records
CREATE POLICY sync_records_own ON sync_records
  FOR ALL USING (student_id = auth.uid()::UUID);

