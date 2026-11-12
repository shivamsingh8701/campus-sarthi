// ============================================================
// CampusSarthi — Persistent Document & Pipeline State Storage
// Dual-layer persistence: persistent local directory + Supabase Storage
// ============================================================

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { getAdminClient } from '../../db/supabase';
import { logger } from '../../utils/logger';

export const STORAGE_BUCKET = 'campus-documents';

// Use a persistent directory inside the backend root (survives temp cleanup)
const BASE_STORAGE_DIR = path.resolve(process.cwd(), 'storage', 'documents');

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function sanitizeStorageSegment(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140) || 'document';
}

export interface StoredArtifact {
  localPath: string;
  storageBucket: string;
  storageKey: string;
  fileSizeBytes: number;
  filename: string;
  mimeType: string;
}

export interface OriginalDocumentRecord {
  index: number;
  filename: string;
  originalUrl: string;
  format: 'pdf' | 'docx' | 'doc' | 'txt' | 'other';
  mimeType: string;
  sizeBytes: number;
  pageCount: number | null;
  downloadStatus: 'downloaded' | 'validated' | 'failed';
  validationError?: string | null;
  localPath?: string;
  storageKey?: string;
  downloadedAt: string;
}

export interface DetectedQuestionItem {
  id: string;
  numberLabel: string;
  questionText: string;
  subquestions: string[];
  sourcePage: number | null;
  sourceFilename?: string;
  marksHint?: string | null;
  requiresVisualContext?: boolean;
}

export interface ExtractionSnapshot {
  status: 'pending' | 'extracting' | 'extracted' | 'failed';
  documentTitle?: string | null;
  totalPages: number;
  charCount: number;
  extractionConfidence: 'high' | 'medium' | 'low';
  warnings: string[];
  visualFlags: string[];
  requiresVisualProcessing: boolean;
  instructions: string | null;
  rawTextPreview: string;
  fullText: string;
  detectedQuestions: DetectedQuestionItem[];
  extractedAt: string;
  error?: string | null;
}

export type GranularPipelineStatus =
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

export interface AssignmentPipelineState {
  assignmentId: string;
  studentId: string;
  status: GranularPipelineStatus;
  stageMessage: string;
  errorMessage?: string | null;
  requiresReauth?: boolean;
  originalDocuments: OriginalDocumentRecord[];
  extraction?: ExtractionSnapshot | null;
  solution?: {
    summary: string;
    questionsCount: number;
    providerUsed: string;
    verificationProvider?: string | null;
    verificationApplied: boolean;
    verificationNotes?: string | null;
    generatedAt: string;
    documentId?: string;
    documentFilename?: string;
  } | null;
  updatedAt: string;
}

async function ensureBucketExists(): Promise<boolean> {
  try {
    const admin = getAdminClient();
    const { data: buckets, error } = await admin.storage.listBuckets();
    if (error) return false;
    if (buckets?.some((b) => b.name === STORAGE_BUCKET)) return true;

    const { error: createErr } = await admin.storage.createBucket(STORAGE_BUCKET, {
      public: false,
      fileSizeLimit: 26214400,
    });
    return !createErr;
  } catch {
    return false;
  }
}

async function uploadToSupabase(
  storageKey: string,
  buffer: Buffer,
  contentType: string
): Promise<boolean> {
  try {
    await ensureBucketExists();
    const admin = getAdminClient();
    const { error } = await admin.storage
      .from(STORAGE_BUCKET)
      .upload(storageKey, buffer, { contentType, upsert: true });
    if (error) {
      logger.warn('Supabase Storage upload warning', { storageKey, error: error.message });
      return false;
    }
    return true;
  } catch (err) {
    logger.warn('Supabase Storage upload exception', { storageKey, error: String(err) });
    return false;
  }
}

async function downloadFromSupabase(storageKey: string): Promise<Buffer | null> {
  try {
    const admin = getAdminClient();
    const { data, error } = await admin.storage.from(STORAGE_BUCKET).download(storageKey);
    if (error || !data) return null;
    const ab = await data.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

export async function saveOriginalDocument(params: {
  studentId: string;
  assignmentId: string;
  filename: string;
  buffer: Buffer;
  mimeType: string;
}): Promise<StoredArtifact> {
  const cleanName = sanitizeStorageSegment(params.filename);
  const uniqueName = `${Date.now()}_${randomUUID().slice(0, 8)}_${cleanName}`;
  const relDir = path.join(params.studentId, params.assignmentId, 'originals');
  const absDir = path.join(BASE_STORAGE_DIR, relDir);
  ensureDir(absDir);

  const localPath = path.join(absDir, uniqueName);
  fs.writeFileSync(localPath, params.buffer);

  const storageKey = `originals/${params.studentId}/${params.assignmentId}/${uniqueName}`;
  await uploadToSupabase(storageKey, params.buffer, params.mimeType);

  return {
    localPath,
    storageBucket: STORAGE_BUCKET,
    storageKey,
    fileSizeBytes: params.buffer.length,
    filename: cleanName,
    mimeType: params.mimeType,
  };
}

export async function saveGeneratedSolutionPdf(params: {
  studentId: string;
  assignmentId: string;
  filename: string;
  buffer: Buffer;
}): Promise<StoredArtifact> {
  const cleanName = sanitizeStorageSegment(params.filename);
  const relDir = path.join(params.studentId, params.assignmentId, 'solutions');
  const absDir = path.join(BASE_STORAGE_DIR, relDir);
  ensureDir(absDir);

  const uniqueDiskName = `${Date.now()}_${cleanName}`;
  const localPath = path.join(absDir, uniqueDiskName);
  fs.writeFileSync(localPath, params.buffer);

  const storageKey = `solutions/${params.studentId}/${params.assignmentId}/${uniqueDiskName}`;
  await uploadToSupabase(storageKey, params.buffer, 'application/pdf');

  return {
    localPath,
    storageBucket: STORAGE_BUCKET,
    storageKey,
    fileSizeBytes: params.buffer.length,
    filename: cleanName,
    mimeType: 'application/pdf',
  };
}

/**
 * Resolve a stored file buffer cleanly:
 * Reads local persistent file first; falls back to Supabase Storage hydration.
 */
export async function readStoredFileBuffer(
  localPath?: string | null,
  storageKey?: string | null
): Promise<Buffer | null> {
  if (localPath && fs.existsSync(localPath)) {
    return fs.readFileSync(localPath);
  }

  if (storageKey) {
    const remoteBuf = await downloadFromSupabase(storageKey);
    if (remoteBuf) {
      if (localPath) {
        try {
          ensureDir(path.dirname(localPath));
          fs.writeFileSync(localPath, remoteBuf);
        } catch {
          // Non-fatal cache write failure
        }
      }
      return remoteBuf;
    }
  }

  return null;
}

function getPipelineStateLocalPath(studentId: string, assignmentId: string): string {
  return path.join(BASE_STORAGE_DIR, studentId, assignmentId, 'pipeline_state.json');
}

export async function savePipelineState(state: AssignmentPipelineState): Promise<void> {
  const localPath = getPipelineStateLocalPath(state.studentId, state.assignmentId);
  ensureDir(path.dirname(localPath));
  const payload = JSON.stringify(state, null, 2);
  fs.writeFileSync(localPath, payload, 'utf-8');

  const storageKey = `state/${state.studentId}/${state.assignmentId}/pipeline_state.json`;
  await uploadToSupabase(storageKey, Buffer.from(payload, 'utf-8'), 'application/json');
}

export async function loadPipelineState(
  studentId: string,
  assignmentId: string
): Promise<AssignmentPipelineState | null> {
  const localPath = getPipelineStateLocalPath(studentId, assignmentId);
  if (fs.existsSync(localPath)) {
    try {
      return JSON.parse(fs.readFileSync(localPath, 'utf-8')) as AssignmentPipelineState;
    } catch {
      // Fall through to remote
    }
  }

  const storageKey = `state/${studentId}/${assignmentId}/pipeline_state.json`;
  const remoteBuf = await downloadFromSupabase(storageKey);
  if (remoteBuf) {
    try {
      const parsed = JSON.parse(remoteBuf.toString('utf-8')) as AssignmentPipelineState;
      ensureDir(path.dirname(localPath));
      fs.writeFileSync(localPath, remoteBuf);
      return parsed;
    } catch {
      return null;
    }
  }

  return null;
}

