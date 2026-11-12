// ============================================================
// CampusSarthi — Durable Supabase Database Queries
// Real student data MUST persist in Supabase (no silent RAM fallback).
// Ephemeral DemoStore is strictly isolated to explicit Demo Mode.
// ============================================================

import { getAdminClient } from './supabase';
import { getConfig } from '../config';
import { randomUUID } from 'crypto';
import type {
  AITaskStatus,
  EmailStatus,
  ActivityType,
  SyncStatus,
  AssignmentAttachment,
} from '../types';
import type {
  StudentRow,
  LMSSessionRow,
  CourseRow,
  AssignmentRow,
  QuizRow,
  DocumentRow,
  EmailLogRow,
  ActivityLogRow,
  SyncRecordRow,
} from '../types/db';
import {
  DEMO_STUDENT_ID,
  DEMO_STUDENT,
  DEMO_COURSES,
  DEMO_ASSIGNMENTS,
  DEMO_QUIZZES,
  DEMO_DOCUMENTS,
  DEMO_ACTIVITIES,
  isDemoStudent,
} from '../services/demo/demoData';

// ─── Error Classes ───────────────────────────────────────────

export class DatabaseUnavailableError extends Error {
  readonly statusCode = 503;
  constructor(message = 'Database service is unavailable. Please verify Supabase configuration.') {
    super(message);
    this.name = 'DatabaseUnavailableError';
  }
}

export class DatabaseQueryError extends Error {
  readonly statusCode = 500;
  readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'DatabaseQueryError';
    this.code = code;
  }
}

// ─── Ephemeral Store Strictly Scoped to Demo Mode ────────────

class DemoStore {
  students = new Map<string, StudentRow>();
  sessions = new Map<string, LMSSessionRow>();
  courses = new Map<string, CourseRow>();
  assignments = new Map<string, AssignmentRow>();
  quizzes = new Map<string, QuizRow>();
  documents = new Map<string, DocumentRow>();
  emailLogs = new Map<string, EmailLogRow>();
  activityLogs: ActivityLogRow[] = [];
  syncRecords = new Map<string, SyncRecordRow>();

  constructor() {
    this.students.set(DEMO_STUDENT.id, { ...DEMO_STUDENT });
    for (const c of DEMO_COURSES) this.courses.set(c.id, { ...c });
    for (const a of DEMO_ASSIGNMENTS) this.assignments.set(a.id, { ...a });
    for (const q of DEMO_QUIZZES) this.quizzes.set(q.id, { ...q });
    for (const d of DEMO_DOCUMENTS) this.documents.set(d.id, { ...d });
    for (const act of DEMO_ACTIVITIES) this.activityLogs.push({ ...act });
  }
}

const demoStore = new DemoStore();

function isSupabaseConfigured(): boolean {
  try {
    const cfg = getConfig();
    return Boolean(cfg.supabase?.url && !cfg.supabase.url.includes('placeholder'));
  } catch {
    return false;
  }
}

function requireDb() {
  if (!isSupabaseConfigured()) {
    throw new DatabaseUnavailableError(
      'Supabase database is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    );
  }
  return getAdminClient();
}

function handleQueryError(error: { message: string; code?: string } | null, context: string): void {
  if (error) {
    throw new DatabaseQueryError(`Database error (${context}): ${error.message}`, error.code);
  }
}

function throwIfError<T>(
  result: { data: T | null; error: { message: string; code?: string } | null },
  context: string
): T {
  handleQueryError(result.error, context);
  if (result.data === null) {
    throw new DatabaseQueryError(`No data returned from database (${context})`);
  }
  return result.data as T;
}

function normalizeAssignmentRow(row: AssignmentRow): AssignmentRow {
  const rawAtt = row.attachments as unknown;
  if (typeof rawAtt === 'string') {
    try {
      row.attachments = JSON.parse(rawAtt) as AssignmentRow['attachments'];
    } catch {
      row.attachments = [];
    }
  } else if (!Array.isArray(rawAtt)) {
    row.attachments = [];
  }
  return row;
}

// ─── Health Check ────────────────────────────────────────────

export async function checkDatabaseHealth(): Promise<{
  ok: boolean;
  configured: boolean;
  latencyMs: number;
  error?: string;
}> {
  const start = Date.now();
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      configured: false,
      latencyMs: Date.now() - start,
      error: 'SUPABASE_URL or service key is missing.',
    };
  }
  try {
    const { error } = await requireDb()
      .from('students')
      .select('id', { count: 'exact', head: true });
    if (error) {
      return {
        ok: false,
        configured: true,
        latencyMs: Date.now() - start,
        error: error.message,
      };
    }
    return {
      ok: true,
      configured: true,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Students ───────────────────────────────────────────────

export const Students = {
  async findByEmail(email: string): Promise<StudentRow | null> {
    const lower = email.trim().toLowerCase();
    const { data, error } = await requireDb()
      .from('students')
      .select('*')
      .eq('email', lower)
      .maybeSingle();
    handleQueryError(error, 'students.findByEmail');
    return (data as StudentRow | null) ?? null;
  },

  async findById(id: string): Promise<StudentRow | null> {
    if (isDemoStudent(id)) {
      return demoStore.students.get(id) ?? null;
    }
    const { data, error } = await requireDb()
      .from('students')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    handleQueryError(error, 'students.findById');
    return (data as StudentRow | null) ?? null;
  },

  async findByAdmissionNumber(admissionNumber: string): Promise<StudentRow | null> {
    const cleaned = admissionNumber.trim();
    const { data, error } = await requireDb()
      .from('students')
      .select('*')
      .ilike('admission_number', cleaned)
      .maybeSingle();
    handleQueryError(error, 'students.findByAdmissionNumber');
    return (data as StudentRow | null) ?? null;
  },

  async findByVerificationToken(token: string): Promise<StudentRow | null> {
    const { data, error } = await requireDb()
      .from('students')
      .select('*')
      .eq('email_verification_token', token)
      .maybeSingle();
    handleQueryError(error, 'students.findByVerificationToken');
    return (data as StudentRow | null) ?? null;
  },

  async create(input: {
    admissionNumber: string;
    name?: string;
    email: string;
    passwordHash: string;
    verificationToken: string;
    isEmailVerified?: boolean;
  }): Promise<StudentRow> {
    const now = new Date().toISOString();
    const student: StudentRow = {
      id: randomUUID(),
      admission_number: input.admissionNumber.trim().toUpperCase(),
      email: input.email.trim().toLowerCase(),
      password_hash: input.passwordHash,
      full_name: input.name?.trim() || null,
      is_email_verified: input.isEmailVerified ?? true,
      email_verification_token: input.verificationToken,
      email_verification_expires_at: new Date(Date.now() + 86400000).toISOString(),
      created_at: now,
      updated_at: now,
    };

    const result = await requireDb().from('students').insert(student).select().single();
    return throwIfError(result, 'students.create') as StudentRow;
  },

  async updateProfile(
    id: string,
    updates: { fullName?: string; email?: string; isEmailVerified?: boolean }
  ): Promise<StudentRow | null> {
    if (isDemoStudent(id)) {
      const s = demoStore.students.get(id);
      if (s) {
        if (updates.fullName !== undefined) s.full_name = updates.fullName;
        if (updates.email !== undefined) s.email = updates.email.toLowerCase();
        if (updates.isEmailVerified !== undefined) s.is_email_verified = updates.isEmailVerified;
        s.updated_at = new Date().toISOString();
      }
      return s ?? null;
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.fullName !== undefined) patch['full_name'] = updates.fullName.trim();
    if (updates.email !== undefined) patch['email'] = updates.email.trim().toLowerCase();
    if (updates.isEmailVerified !== undefined) patch['is_email_verified'] = updates.isEmailVerified;

    const result = await requireDb()
      .from('students')
      .update(patch)
      .eq('id', id)
      .select()
      .maybeSingle();
    handleQueryError(result.error, 'students.updateProfile');
    return (result.data as StudentRow | null) ?? null;
  },

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    if (isDemoStudent(id)) return;
    const { error } = await requireDb()
      .from('students')
      .update({ password_hash: passwordHash, updated_at: new Date().toISOString() })
      .eq('id', id);
    handleQueryError(error, 'students.updatePassword');
  },

  async markEmailVerified(id: string): Promise<void> {
    if (isDemoStudent(id)) return;
    const { error } = await requireDb()
      .from('students')
      .update({
        is_email_verified: true,
        email_verification_token: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    handleQueryError(error, 'students.markEmailVerified');
  },
};

// ─── LMS Sessions ────────────────────────────────────────────

export const LMSSessions = {
  async create(input: {
    studentId: string;
    sessionDataEncrypted: string;
    lmsUsername: string;
    expiresAt?: Date;
  }): Promise<LMSSessionRow> {
    const now = new Date();
    const expiresAt = input.expiresAt ?? new Date(now.getTime() + 7 * 86400000);
    const session: LMSSessionRow = {
      id: randomUUID(),
      student_id: input.studentId,
      session_data_encrypted: input.sessionDataEncrypted,
      lms_username: input.lmsUsername,
      logged_in_at: now.toISOString(),
      last_used_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      is_active: true,
      created_at: now.toISOString(),
    };

    if (isDemoStudent(input.studentId)) {
      demoStore.sessions.set(session.id, session);
      return session;
    }

    const result = await requireDb().from('lms_sessions').insert(session).select().single();
    return throwIfError(result, 'lms_sessions.create') as LMSSessionRow;
  },

  async findActiveByStudentId(studentId: string): Promise<LMSSessionRow | null> {
    if (isDemoStudent(studentId)) {
      const matches = Array.from(demoStore.sessions.values()).filter(
        (s) => s.student_id === studentId && s.is_active
      );
      matches.sort((a, b) => new Date(b.logged_in_at).getTime() - new Date(a.logged_in_at).getTime());
      return matches[0] ?? null;
    }

    const { data, error } = await requireDb()
      .from('lms_sessions')
      .select('*')
      .eq('student_id', studentId)
      .eq('is_active', true)
      .order('logged_in_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    handleQueryError(error, 'lms_sessions.findActiveByStudentId');

    const row = data as LMSSessionRow | null;
    if (!row) return null;

    if (row.expires_at && new Date(row.expires_at) <= new Date()) {
      await requireDb().from('lms_sessions').update({ is_active: false }).eq('id', row.id);
      return null;
    }

    return row;
  },

  async touchLastUsed(id: string): Promise<void> {
    if (id.startsWith('demo-')) return;
    const { error } = await requireDb()
      .from('lms_sessions')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', id);
    handleQueryError(error, 'lms_sessions.touchLastUsed');
  },

  async deactivateAll(studentId: string): Promise<void> {
    if (isDemoStudent(studentId)) {
      for (const s of demoStore.sessions.values()) {
        if (s.student_id === studentId) s.is_active = false;
      }
      return;
    }

    const { error } = await requireDb()
      .from('lms_sessions')
      .update({ is_active: false })
      .eq('student_id', studentId);
    handleQueryError(error, 'lms_sessions.deactivateAll');
  },

  async findById(id: string): Promise<LMSSessionRow | null> {
    if (demoStore.sessions.has(id)) {
      return demoStore.sessions.get(id) ?? null;
    }
    const { data, error } = await requireDb()
      .from('lms_sessions')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    handleQueryError(error, 'lms_sessions.findById');
    return (data as LMSSessionRow | null) ?? null;
  },
};

// ─── Courses ─────────────────────────────────────────────────

export const Courses = {
  async upsert(input: {
    studentId: string;
    lmsCourseId: string;
    name: string;
    shortName: string;
    fullName: string;
    courseUrl: string;
    instructor?: string;
    enrolledAt?: Date;
  }): Promise<CourseRow> {
    if (isDemoStudent(input.studentId)) {
      for (const c of demoStore.courses.values()) {
        if (c.student_id === input.studentId && c.lms_course_id === input.lmsCourseId) {
          c.name = input.name;
          c.short_name = input.shortName;
          c.full_name = input.fullName;
          c.course_url = input.courseUrl;
          c.instructor = input.instructor ?? c.instructor;
          c.last_synced_at = new Date().toISOString();
          return c;
        }
      }
      const row: CourseRow = {
        id: randomUUID(),
        student_id: input.studentId,
        lms_course_id: input.lmsCourseId,
        name: input.name,
        short_name: input.shortName,
        full_name: input.fullName,
        course_url: input.courseUrl,
        instructor: input.instructor ?? null,
        enrolled_at: input.enrolledAt?.toISOString() ?? null,
        last_synced_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      demoStore.courses.set(row.id, row);
      return row;
    }

    const result = await requireDb()
      .from('courses')
      .upsert(
        {
          student_id: input.studentId,
          lms_course_id: input.lmsCourseId,
          name: input.name,
          short_name: input.shortName,
          full_name: input.fullName,
          course_url: input.courseUrl,
          instructor: input.instructor ?? null,
          enrolled_at: input.enrolledAt?.toISOString() ?? null,
          last_synced_at: new Date().toISOString(),
        },
        {
          onConflict: 'student_id,lms_course_id',
          ignoreDuplicates: false,
        }
      )
      .select()
      .single();
    return throwIfError(result, 'courses.upsert') as CourseRow;
  },

  async findByStudentId(studentId: string): Promise<CourseRow[]> {
    if (isDemoStudent(studentId)) {
      return Array.from(demoStore.courses.values())
        .filter((c) => c.student_id === studentId)
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    const { data, error } = await requireDb()
      .from('courses')
      .select('*')
      .eq('student_id', studentId)
      .order('name');
    handleQueryError(error, 'courses.findByStudentId');
    return (data as CourseRow[] | null) ?? [];
  },

  async findById(id: string): Promise<CourseRow | null> {
    if (demoStore.courses.has(id)) {
      return demoStore.courses.get(id) ?? null;
    }
    const { data, error } = await requireDb()
      .from('courses')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    handleQueryError(error, 'courses.findById');
    return (data as CourseRow | null) ?? null;
  },
};

// ─── Assignments ─────────────────────────────────────────────

export const Assignments = {
  async upsert(input: {
    studentId: string;
    courseId: string;
    lmsAssignmentId: string;
    title: string;
    description?: string;
    dueDate?: Date;
    openDate?: Date;
    maxGrade?: number;
    submissionStatus?: string;
    attachments?: AssignmentAttachment[];
  }): Promise<AssignmentRow> {
    if (isDemoStudent(input.studentId)) {
      for (const a of demoStore.assignments.values()) {
        if (a.student_id === input.studentId && a.lms_assignment_id === input.lmsAssignmentId) {
          a.title = input.title;
          a.description = input.description ?? a.description;
          a.due_date = input.dueDate?.toISOString() ?? a.due_date;
          a.open_date = input.openDate?.toISOString() ?? a.open_date;
          a.max_grade = input.maxGrade ?? a.max_grade;
          a.submission_status = input.submissionStatus ?? a.submission_status;
          if (input.attachments) a.attachments = input.attachments as AssignmentRow['attachments'];
          a.last_synced_at = new Date().toISOString();
          a.updated_at = new Date().toISOString();
          return a;
        }
      }
      const row: AssignmentRow = {
        id: randomUUID(),
        student_id: input.studentId,
        course_id: input.courseId,
        lms_assignment_id: input.lmsAssignmentId,
        title: input.title,
        description: input.description ?? null,
        due_date: input.dueDate?.toISOString() ?? null,
        open_date: input.openDate?.toISOString() ?? null,
        max_grade: input.maxGrade ?? null,
        submission_status: input.submissionStatus ?? null,
        attachments: (input.attachments ?? []) as AssignmentRow['attachments'],
        ai_status: 'pending',
        ai_error_message: null,
        ai_processed_at: null,
        document_id: null,
        email_sent_at: null,
        email_status: null,
        last_synced_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      demoStore.assignments.set(row.id, row);
      return row;
    }

    const result = await requireDb()
      .from('assignments')
      .upsert(
        {
          student_id: input.studentId,
          course_id: input.courseId,
          lms_assignment_id: input.lmsAssignmentId,
          title: input.title,
          description: input.description ?? null,
          due_date: input.dueDate?.toISOString() ?? null,
          open_date: input.openDate?.toISOString() ?? null,
          max_grade: input.maxGrade ?? null,
          submission_status: input.submissionStatus ?? null,
          attachments: input.attachments ?? [],
          last_synced_at: new Date().toISOString(),
        },
        {
          onConflict: 'student_id,lms_assignment_id',
          ignoreDuplicates: false,
        }
      )
      .select()
      .single();
    return normalizeAssignmentRow(throwIfError(result, 'assignments.upsert') as AssignmentRow);
  },

  async findByStudentId(
    studentId: string,
    opts?: { aiStatus?: string; page?: number; limit?: number }
  ): Promise<{ data: AssignmentRow[]; total: number }> {
    const page = opts?.page ?? 1;
    const limit = opts?.limit ?? 20;

    if (isDemoStudent(studentId)) {
      let items = Array.from(demoStore.assignments.values()).filter((a) => a.student_id === studentId);
      if (opts?.aiStatus) items = items.filter((a) => a.ai_status === opts.aiStatus);
      const total = items.length;
      const start = (page - 1) * limit;
      return { data: items.slice(start, start + limit), total };
    }

    const offset = (page - 1) * limit;
    let query = requireDb()
      .from('assignments')
      .select('*', { count: 'exact' })
      .eq('student_id', studentId)
      .order('due_date', { ascending: true });
    if (opts?.aiStatus) {
      query = query.eq('ai_status', opts.aiStatus);
    }
    const { data, error, count } = await query.range(offset, offset + limit - 1);
    handleQueryError(error, 'assignments.findByStudentId');

    const rows = ((data as AssignmentRow[] | null) ?? []).map(normalizeAssignmentRow);
    return { data: rows, total: count ?? rows.length };
  },

  async findById(id: string): Promise<AssignmentRow | null> {
    if (demoStore.assignments.has(id)) {
      return demoStore.assignments.get(id) ?? null;
    }
    const { data, error } = await requireDb()
      .from('assignments')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    handleQueryError(error, 'assignments.findById');
    return data ? normalizeAssignmentRow(data as AssignmentRow) : null;
  },

  async updateAIStatus(
    id: string,
    status: AITaskStatus,
    errorMessage?: string | null,
    stageMessage?: string
  ): Promise<void> {
    if (demoStore.assignments.has(id)) {
      const a = demoStore.assignments.get(id)!;
      a.ai_status = status;
      if (status === 'completed') a.ai_processed_at = new Date().toISOString();
      if (errorMessage !== undefined) a.ai_error_message = errorMessage;
      if (stageMessage !== undefined) a.processing_stage = stageMessage;
      a.updated_at = new Date().toISOString();
      return;
    }

    const toCoarseStatus = (s: AITaskStatus): 'pending' | 'processing' | 'completed' | 'failed' => {
      if (s === 'completed') return 'completed';
      if (s === 'failed' || s === 'download_failed' || s === 'extraction_failed') return 'failed';
      if (s === 'pending' || s === 'extracted') return 'pending';
      return 'processing';
    };

    const fullUpdate: Record<string, unknown> = {
      ai_status: status,
      updated_at: new Date().toISOString(),
    };
    if (status === 'completed') fullUpdate['ai_processed_at'] = new Date().toISOString();
    if (errorMessage !== undefined) fullUpdate['ai_error_message'] = errorMessage;
    if (stageMessage !== undefined) fullUpdate['processing_stage'] = stageMessage;

    const { error } = await requireDb().from('assignments').update(fullUpdate).eq('id', id);
    if (error) {
      // Fallback for databases where migration 002 has not been applied yet (CHECK constraint / missing columns)
      const isSchemaMismatch =
        error.code === '23514' ||
        error.code === 'PGRST204' ||
        error.code === '42703' ||
        /check constraint|column .* does not exist|schema cache/i.test(error.message);

      if (isSchemaMismatch) {
        const coarseUpdate: Record<string, unknown> = {
          ai_status: toCoarseStatus(status),
          updated_at: new Date().toISOString(),
        };
        if (status === 'completed') coarseUpdate['ai_processed_at'] = new Date().toISOString();
        if (errorMessage !== undefined) coarseUpdate['ai_error_message'] = errorMessage;
        const { error: fallbackErr } = await requireDb()
          .from('assignments')
          .update(coarseUpdate)
          .eq('id', id);
        handleQueryError(fallbackErr, 'assignments.updateAIStatus.fallback');
        return;
      }
      handleQueryError(error, 'assignments.updateAIStatus');
    }
  },

  async updatePipelineColumns(
    id: string,
    payload: {
      processingStage?: string;
      originalDocuments?: unknown[];
      extractedContent?: Record<string, unknown> | null;
      detectedQuestions?: unknown[];
      aiProviderUsed?: string | null;
      aiVerificationNotes?: string | null;
    }
  ): Promise<void> {
    if (demoStore.assignments.has(id)) {
      const a = demoStore.assignments.get(id)!;
      if (payload.processingStage !== undefined) a.processing_stage = payload.processingStage;
      if (payload.originalDocuments !== undefined) a.original_documents = payload.originalDocuments;
      if (payload.extractedContent !== undefined) a.extracted_content = payload.extractedContent;
      if (payload.detectedQuestions !== undefined) a.detected_questions = payload.detectedQuestions;
      if (payload.aiProviderUsed !== undefined) a.ai_provider_used = payload.aiProviderUsed;
      if (payload.aiVerificationNotes !== undefined) a.ai_verification_notes = payload.aiVerificationNotes;
      a.updated_at = new Date().toISOString();
      return;
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (payload.processingStage !== undefined) update['processing_stage'] = payload.processingStage;
    if (payload.originalDocuments !== undefined) update['original_documents'] = payload.originalDocuments;
    if (payload.extractedContent !== undefined) update['extracted_content'] = payload.extractedContent;
    if (payload.detectedQuestions !== undefined) update['detected_questions'] = payload.detectedQuestions;
    if (payload.aiProviderUsed !== undefined) update['ai_provider_used'] = payload.aiProviderUsed;
    if (payload.aiVerificationNotes !== undefined) update['ai_verification_notes'] = payload.aiVerificationNotes;

    const { error } = await requireDb().from('assignments').update(update).eq('id', id);
    if (error) {
      // Ignore gracefully if migration 002 columns haven't been added to Supabase yet (pipeline_state.json persists full details)
      if (error.code === 'PGRST204' || error.code === '42703' || /column|schema cache/i.test(error.message)) {
        return;
      }
      handleQueryError(error, 'assignments.updatePipelineColumns');
    }
  },

  async updatePdfDocument(id: string, documentId: string): Promise<void> {
    if (demoStore.assignments.has(id)) {
      const a = demoStore.assignments.get(id)!;
      a.document_id = documentId;
      a.updated_at = new Date().toISOString();
      return;
    }

    const { error } = await requireDb()
      .from('assignments')
      .update({ document_id: documentId, updated_at: new Date().toISOString() })
      .eq('id', id);
    handleQueryError(error, 'assignments.updatePdfDocument');
  },

  async updateEmailSent(id: string, emailStatus: string): Promise<void> {
    if (demoStore.assignments.has(id)) {
      const a = demoStore.assignments.get(id)!;
      a.email_sent_at = new Date().toISOString();
      a.email_status = emailStatus;
      a.updated_at = new Date().toISOString();
      return;
    }

    const { error } = await requireDb()
      .from('assignments')
      .update({
        email_sent_at: new Date().toISOString(),
        email_status: emailStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    handleQueryError(error, 'assignments.updateEmailSent');
  },

  async findPendingAI(): Promise<AssignmentRow[]> {
    const { data, error } = await requireDb()
      .from('assignments')
      .select('*')
      .eq('ai_status', 'pending')
      .neq('student_id', DEMO_STUDENT_ID)
      .order('due_date', { ascending: true })
      .limit(20);
    handleQueryError(error, 'assignments.findPendingAI');
    return ((data as AssignmentRow[] | null) ?? []).map(normalizeAssignmentRow);
  },
};

// ─── Quizzes ─────────────────────────────────────────────────

export const Quizzes = {
  async upsert(input: {
    studentId: string;
    courseId: string;
    lmsQuizId: string;
    title: string;
    description?: string;
    openTime?: Date;
    closeTime?: Date;
    timeLimitSeconds?: number;
    maxAttempts?: number;
    attemptsUsed?: number;
    totalQuestions?: number;
    status?: string;
  }): Promise<QuizRow> {
    if (isDemoStudent(input.studentId)) {
      for (const q of demoStore.quizzes.values()) {
        if (q.student_id === input.studentId && q.lms_quiz_id === input.lmsQuizId) {
          q.title = input.title;
          q.description = input.description ?? q.description;
          q.open_time = input.openTime?.toISOString() ?? q.open_time;
          q.close_time = input.closeTime?.toISOString() ?? q.close_time;
          q.time_limit_seconds = input.timeLimitSeconds ?? q.time_limit_seconds;
          q.max_attempts = input.maxAttempts ?? q.max_attempts;
          q.attempts_used = input.attemptsUsed ?? q.attempts_used;
          q.total_questions = input.totalQuestions ?? q.total_questions;
          q.status = input.status ?? q.status;
          q.last_synced_at = new Date().toISOString();
          return q;
        }
      }
      const row: QuizRow = {
        id: randomUUID(),
        student_id: input.studentId,
        course_id: input.courseId,
        lms_quiz_id: input.lmsQuizId,
        title: input.title,
        description: input.description ?? null,
        open_time: input.openTime?.toISOString() ?? null,
        close_time: input.closeTime?.toISOString() ?? null,
        time_limit_seconds: input.timeLimitSeconds ?? null,
        max_attempts: input.maxAttempts ?? null,
        attempts_used: input.attemptsUsed ?? 0,
        total_questions: input.totalQuestions ?? null,
        status: input.status ?? null,
        instructions: input.description ?? null,
        last_synced_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      demoStore.quizzes.set(row.id, row);
      return row;
    }

    const result = await requireDb()
      .from('quizzes')
      .upsert(
        {
          student_id: input.studentId,
          course_id: input.courseId,
          lms_quiz_id: input.lmsQuizId,
          title: input.title,
          description: input.description ?? null,
          open_time: input.openTime?.toISOString() ?? null,
          close_time: input.closeTime?.toISOString() ?? null,
          time_limit_seconds: input.timeLimitSeconds ?? null,
          max_attempts: input.maxAttempts ?? null,
          attempts_used: input.attemptsUsed ?? 0,
          total_questions: input.totalQuestions ?? null,
          status: input.status ?? null,
          last_synced_at: new Date().toISOString(),
        },
        {
          onConflict: 'student_id,lms_quiz_id',
          ignoreDuplicates: false,
        }
      )
      .select()
      .single();
    return throwIfError(result, 'quizzes.upsert') as QuizRow;
  },

  async findByStudentId(
    studentId: string,
    opts?: { page?: number; limit?: number }
  ): Promise<{ data: QuizRow[]; total: number }> {
    const page = opts?.page ?? 1;
    const limit = opts?.limit ?? 20;

    if (isDemoStudent(studentId)) {
      const items = Array.from(demoStore.quizzes.values()).filter((q) => q.student_id === studentId);
      const start = (page - 1) * limit;
      return { data: items.slice(start, start + limit), total: items.length };
    }

    const offset = (page - 1) * limit;
    const { data, error, count } = await requireDb()
      .from('quizzes')
      .select('*', { count: 'exact' })
      .eq('student_id', studentId)
      .order('close_time', { ascending: true })
      .range(offset, offset + limit - 1);
    handleQueryError(error, 'quizzes.findByStudentId');

    const rows = (data as QuizRow[] | null) ?? [];
    return { data: rows, total: count ?? rows.length };
  },

  async findById(id: string): Promise<QuizRow | null> {
    if (demoStore.quizzes.has(id)) {
      return demoStore.quizzes.get(id) ?? null;
    }
    const { data, error } = await requireDb().from('quizzes').select('*').eq('id', id).maybeSingle();
    handleQueryError(error, 'quizzes.findById');
    return (data as QuizRow | null) ?? null;
  },
};

// ─── Documents ───────────────────────────────────────────────

export const Documents = {
  async create(input: {
    studentId: string;
    assignmentId?: string;
    filename: string;
    filePath: string;
    fileSizeBytes?: number;
    documentKind?: 'original_assignment' | 'generated_solution';
    mimeType?: string;
    storageBucket?: string;
    storageKey?: string;
  }): Promise<DocumentRow> {
    const baseRow = {
      id: randomUUID(),
      student_id: input.studentId,
      assignment_id: input.assignmentId ?? null,
      filename: input.filename,
      file_path: input.filePath,
      file_size_bytes: input.fileSizeBytes ?? null,
      generated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    const extendedRow: DocumentRow = {
      ...baseRow,
      document_kind: input.documentKind ?? 'generated_solution',
      mime_type: input.mimeType ?? 'application/pdf',
      storage_bucket: input.storageBucket ?? null,
      storage_key: input.storageKey ?? null,
    };

    if (isDemoStudent(input.studentId)) {
      demoStore.documents.set(extendedRow.id, extendedRow);
      return extendedRow;
    }

    const result = await requireDb().from('documents').insert(extendedRow).select().single();
    if (result.error && (result.error.code === 'PGRST204' || result.error.code === '42703' || /column|schema cache/i.test(result.error.message))) {
      const fallback = await requireDb().from('documents').insert(baseRow).select().single();
      return throwIfError(fallback, 'documents.create.fallback') as DocumentRow;
    }
    return throwIfError(result, 'documents.create') as DocumentRow;
  },

  async findByStudentId(
    studentId: string,
    opts?: { page?: number; limit?: number }
  ): Promise<{ data: DocumentRow[]; total: number }> {
    const page = opts?.page ?? 1;
    const limit = opts?.limit ?? 20;

    if (isDemoStudent(studentId)) {
      const items = Array.from(demoStore.documents.values()).filter((d) => d.student_id === studentId);
      const start = (page - 1) * limit;
      return { data: items.slice(start, start + limit), total: items.length };
    }

    const offset = (page - 1) * limit;
    const { data, error, count } = await requireDb()
      .from('documents')
      .select('*', { count: 'exact' })
      .eq('student_id', studentId)
      .order('generated_at', { ascending: false })
      .range(offset, offset + limit - 1);
    handleQueryError(error, 'documents.findByStudentId');

    const rows = (data as DocumentRow[] | null) ?? [];
    return { data: rows, total: count ?? rows.length };
  },

  async findById(id: string): Promise<DocumentRow | null> {
    if (demoStore.documents.has(id)) {
      return demoStore.documents.get(id) ?? null;
    }
    const { data, error } = await requireDb().from('documents').select('*').eq('id', id).maybeSingle();
    handleQueryError(error, 'documents.findById');
    return (data as DocumentRow | null) ?? null;
  },

  async findByAssignmentId(assignmentId: string): Promise<DocumentRow[]> {
    const demoMatches = Array.from(demoStore.documents.values()).filter(
      (d) => d.assignment_id === assignmentId
    );
    if (demoMatches.length > 0) return demoMatches;

    const { data, error } = await requireDb()
      .from('documents')
      .select('*')
      .eq('assignment_id', assignmentId)
      .order('generated_at', { ascending: false });
    handleQueryError(error, 'documents.findByAssignmentId');
    return (data as DocumentRow[] | null) ?? [];
  },
};

// ─── Email Logs ──────────────────────────────────────────────

export const EmailLogs = {
  async create(input: {
    studentId: string;
    assignmentId?: string;
    recipientEmail: string;
    subject: string;
    status: EmailStatus;
  }): Promise<EmailLogRow> {
    const row: EmailLogRow = {
      id: randomUUID(),
      student_id: input.studentId,
      assignment_id: input.assignmentId ?? null,
      recipient_email: input.recipientEmail,
      subject: input.subject,
      status: input.status,
      sent_at: null,
      error_message: null,
      message_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (isDemoStudent(input.studentId)) {
      demoStore.emailLogs.set(row.id, row);
      return row;
    }

    const result = await requireDb().from('email_logs').insert(row).select().single();
    return throwIfError(result, 'email_logs.create') as EmailLogRow;
  },

  async updateStatus(
    id: string,
    status: EmailStatus,
    messageId?: string,
    errorMessage?: string
  ): Promise<void> {
    if (demoStore.emailLogs.has(id)) {
      const l = demoStore.emailLogs.get(id)!;
      l.status = status;
      l.message_id = messageId ?? null;
      l.error_message = errorMessage ?? null;
      l.sent_at = status === 'sent' ? new Date().toISOString() : null;
      return;
    }

    const { error } = await requireDb()
      .from('email_logs')
      .update({
        status,
        message_id: messageId ?? null,
        error_message: errorMessage ?? null,
        sent_at: status === 'sent' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    handleQueryError(error, 'email_logs.updateStatus');
  },

  async findByStudentId(
    studentId: string,
    opts?: { page?: number; limit?: number }
  ): Promise<{ data: EmailLogRow[]; total: number }> {
    const page = opts?.page ?? 1;
    const limit = opts?.limit ?? 20;

    if (isDemoStudent(studentId)) {
      const items = Array.from(demoStore.emailLogs.values()).filter((l) => l.student_id === studentId);
      const start = (page - 1) * limit;
      return { data: items.slice(start, start + limit), total: items.length };
    }

    const offset = (page - 1) * limit;
    const { data, error, count } = await requireDb()
      .from('email_logs')
      .select('*', { count: 'exact' })
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    handleQueryError(error, 'email_logs.findByStudentId');

    const rows = (data as EmailLogRow[] | null) ?? [];
    return { data: rows, total: count ?? rows.length };
  },

  async findByAssignmentId(assignmentId: string): Promise<EmailLogRow[]> {
    const { data, error } = await requireDb()
      .from('email_logs')
      .select('*')
      .eq('assignment_id', assignmentId)
      .order('sent_at', { ascending: false });
    handleQueryError(error, 'email_logs.findByAssignmentId');
    return (data as EmailLogRow[] | null) ?? [];
  },
};

// ─── Activity Logs ───────────────────────────────────────────

export const ActivityLogs = {
  async create(input: {
    studentId: string;
    type: ActivityType;
    description: string;
    metadata?: Record<string, unknown>;
  }): Promise<ActivityLogRow> {
    const row: ActivityLogRow = {
      id: randomUUID(),
      student_id: input.studentId,
      type: input.type,
      description: input.description,
      metadata: input.metadata ?? {},
      created_at: new Date().toISOString(),
    };

    if (isDemoStudent(input.studentId)) {
      demoStore.activityLogs.unshift(row);
      return row;
    }

    const result = await requireDb().from('activity_logs').insert(row).select().single();
    return throwIfError(result, 'activity_logs.create') as ActivityLogRow;
  },

  async findByStudentId(studentId: string, limit = 50): Promise<ActivityLogRow[]> {
    if (isDemoStudent(studentId)) {
      return demoStore.activityLogs.filter((l) => l.student_id === studentId).slice(0, limit);
    }

    const { data, error } = await requireDb()
      .from('activity_logs')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(limit);
    handleQueryError(error, 'activity_logs.findByStudentId');
    return (data as ActivityLogRow[] | null) ?? [];
  },
};

// ─── Sync Records ────────────────────────────────────────────

export const SyncRecords = {
  async create(studentId: string): Promise<SyncRecordRow> {
    const row: SyncRecordRow = {
      id: randomUUID(),
      student_id: studentId,
      started_at: new Date().toISOString(),
      completed_at: null,
      status: 'running' as SyncStatus,
      courses_found: 0,
      assignments_found: 0,
      quizzes_found: 0,
      new_assignments: 0,
      new_quizzes: 0,
      errors: [],
      created_at: new Date().toISOString(),
    };

    if (isDemoStudent(studentId)) {
      demoStore.syncRecords.set(row.id, row);
      return row;
    }

    const result = await requireDb().from('sync_records').insert(row).select().single();
    return throwIfError(result, 'sync_records.create') as SyncRecordRow;
  },

  async updateCompleted(
    id: string,
    input: {
      status: SyncStatus;
      coursesFound: number;
      assignmentsFound: number;
      quizzesFound: number;
      errors: string[];
    }
  ): Promise<void> {
    if (demoStore.syncRecords.has(id)) {
      const r = demoStore.syncRecords.get(id)!;
      r.completed_at = new Date().toISOString();
      r.status = input.status;
      r.courses_found = input.coursesFound;
      r.assignments_found = input.assignmentsFound;
      r.quizzes_found = input.quizzesFound;
      r.errors = input.errors;
      return;
    }

    const { error } = await requireDb()
      .from('sync_records')
      .update({
        completed_at: new Date().toISOString(),
        status: input.status,
        courses_found: input.coursesFound,
        assignments_found: input.assignmentsFound,
        quizzes_found: input.quizzesFound,
        errors: input.errors,
      })
      .eq('id', id);
    handleQueryError(error, 'sync_records.updateCompleted');
  },

  async findLatestByStudentId(studentId: string): Promise<SyncRecordRow | null> {
    if (isDemoStudent(studentId)) {
      const items = Array.from(demoStore.syncRecords.values()).filter((r) => r.student_id === studentId);
      items.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
      return items[0] ?? null;
    }

    const { data, error } = await requireDb()
      .from('sync_records')
      .select('*')
      .eq('student_id', studentId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    handleQueryError(error, 'sync_records.findLatestByStudentId');
    return (data as SyncRecordRow | null) ?? null;
  },

  async findStudentsWithActiveSessions(): Promise<string[]> {
    const { data, error } = await requireDb()
      .from('lms_sessions')
      .select('student_id')
      .eq('is_active', true)
      .gt('expires_at', new Date().toISOString())
      .neq('student_id', DEMO_STUDENT_ID);
    handleQueryError(error, 'sync_records.findStudentsWithActiveSessions');
    return [...new Set(((data ?? []) as Array<{ student_id: string }>).map((r) => r.student_id))];
  },
};
