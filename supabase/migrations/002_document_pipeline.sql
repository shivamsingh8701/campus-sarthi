-- ============================================================
-- CampusSarthi — Migration 002: Real Document & Solution Pipeline
-- Extends assignments & documents for original attachments,
-- granular extraction/generation statuses, and storage keys.
-- ============================================================

-- Expand ai_status check constraint to support granular pipeline stages
ALTER TABLE assignments DROP CONSTRAINT IF EXISTS assignments_ai_status_check;
ALTER TABLE assignments ADD CONSTRAINT assignments_ai_status_check CHECK (
  ai_status IN (
    'pending',
    'discovering_attachments',
    'downloading',
    'download_failed',
    'validating_document',
    'extracting',
    'extraction_failed',
    'extracted',
    'generating_solution',
    'verifying_solution',
    'generating_pdf',
    'processing',
    'completed',
    'failed'
  )
);

-- Add structured pipeline metadata columns to assignments
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS processing_stage TEXT,
  ADD COLUMN IF NOT EXISTS original_documents JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS extracted_content JSONB,
  ADD COLUMN IF NOT EXISTS detected_questions JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS ai_provider_used TEXT,
  ADD COLUMN IF NOT EXISTS ai_verification_notes TEXT;

-- Extend documents table to distinguish original LMS files vs generated PDFs
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS document_kind TEXT NOT NULL DEFAULT 'generated_solution'
    CHECK (document_kind IN ('original_assignment', 'generated_solution')),
  ADD COLUMN IF NOT EXISTS mime_type TEXT DEFAULT 'application/pdf',
  ADD COLUMN IF NOT EXISTS storage_bucket TEXT,
  ADD COLUMN IF NOT EXISTS storage_key TEXT;

CREATE INDEX IF NOT EXISTS idx_documents_assignment_kind
  ON documents(assignment_id, document_kind);

