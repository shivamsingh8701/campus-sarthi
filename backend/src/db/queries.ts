// ============================================================
// CampusSarthi — Database Query Functions with Resilient Local Store
// Works with Supabase when configured, or transparent local store
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
  DEMO_STUDENT,
  DEMO_COURSES,
  DEMO_ASSIGNMENTS,
  DEMO_QUIZZES,
  DEMO_DOCUMENTS,
  DEMO_ACTIVITIES,
} from '../services/demo/demoData';

// ─── Local In-Memory Fallback Store ──────────────────────────

class LocalStore {
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
    // Seed with demo student and demo data
    this.students.set(DEMO_STUDENT.id, { ...DEMO_STUDENT });
    for (const c of DEMO_COURSES) this.courses.set(c.id, { ...c });
    for (const a of DEMO_ASSIGNMENTS) this.assignments.set(a.id, { ...a });
    for (const q of DEMO_QUIZZES) this.quizzes.set(q.id, { ...q });
    for (const d of DEMO_DOCUMENTS) this.documents.set(d.id, { ...d });
    for (const act of DEMO_ACTIVITIES) this.activityLogs.push({ ...act });
  }
}

const local = new LocalStore();

function isSupabaseLive(): boolean {
  try {
    const cfg = getConfig();
    if (!cfg.supabase?.url || cfg.supabase.url.includes('placeholder')) return false;
    return true;
  } catch {
    return false;
  }
}

function db() {
  return getAdminClient();
}

function throwIfError<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) {
    throw new Error(`Database error: ${result.error.message}`);
  }
  if (result.data === null) {
    throw new Error('No data returned from database');
  }
  return result.data as T;
}

// ─── Students ───────────────────────────────────────────────

export const Students = {
  async findByEmail(email: string): Promise<StudentRow | null> {
    const lower = email.toLowerCase();
    if (isSupabaseLive()) {
      try {
        const { data, error } = await db()
          .from('students')
          .select('*')
          .eq('email', lower)
          .maybeSingle();
        if (!error && data) return data as StudentRow;
      } catch {
        // Fall back to memory
      }
    }
    for (const s of local.students.values()) {
      if (s.email.toLowerCase() === lower) return s;
    }
    return null;
  },

  async findById(id: string): Promise<StudentRow | null> {
    if (isSupabaseLive()) {
      try {
        const { data, error } = await db()
          .from('students')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (!error && data) return data as StudentRow;
      } catch {
        // Fall back to memory
      }
    }
    return local.students.get(id) ?? null;
  },

  async findByAdmissionNumber(admissionNumber: string): Promise<StudentRow | null> {
    // Try both original and uppercase (admission numbers are often uppercase)
    if (isSupabaseLive()) {
      try {
        const { data, error } = await db()
          .from('students')
          .select('*')
          .ilike('admission_number', admissionNumber)
          .maybeSingle();
        if (!error && data) return data as StudentRow;
      } catch {
        // Fall back to memory
      }
    }
    const upper = admissionNumber.toUpperCase();
    const lower = admissionNumber.toLowerCase();
    for (const s of local.students.values()) {
      const sn = s.admission_number;
      if (sn === admissionNumber || sn.toUpperCase() === upper || sn.toLowerCase() === lower) return s;
    }
    return null;
  },

  async findByVerificationToken(token: string): Promise<StudentRow | null> {
    if (isSupabaseLive()) {
      try {
        const { data, error } = await db()
          .from('students')
          .select('*')
          .eq('email_verification_token', token)
          .maybeSingle();
        if (!error && data) return data as StudentRow;
      } catch {
        // Fall back to memory
      }
    }
    for (const s of local.students.values()) {
      if (s.email_verification_token === token) return s;
    }
    return null;
  },

  async create(input: {
    admissionNumber: string;
    name?: string;
    email: string;
    passwordHash: string;
    verificationToken: string;
  }): Promise<StudentRow> {
    const student: StudentRow = {
      id: randomUUID(),
      admission_number: input.admissionNumber,
      email: input.email.toLowerCase(),
      password_hash: input.passwordHash,
      full_name: input.name ?? null,
      is_email_verified: true,  // Auto-verify so users can login immediately
      email_verification_token: input.verificationToken,
      email_verification_expires_at: new Date(Date.now() + 86400000).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (isSupabaseLive()) {
      try {
        const result = await db().from('students').insert(student).select().single();
        return throwIfError(result) as StudentRow;
      } catch {
        // Fall through to memory
      }
    }

    local.students.set(student.id, student);
    return student;
  },

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    if (isSupabaseLive()) {
      try {
        await db()
          .from('students')
          .update({ password_hash: passwordHash, updated_at: new Date().toISOString() })
          .eq('id', id);
      } catch {
        // Fall through
      }
    }
    const s = local.students.get(id);
    if (s) {
      s.password_hash = passwordHash;
      s.updated_at = new Date().toISOString();
    }
  },

  async markEmailVerified(id: string): Promise<void> {
    if (isSupabaseLive()) {
      try {
        await db()
          .from('students')
          .update({
            is_email_verified: true,
            email_verification_token: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);
      } catch {
        // Fall through
      }
    }
    const s = local.students.get(id);
    if (s) {
      s.is_email_verified = true;
      s.email_verification_token = null;
      s.updated_at = new Date().toISOString();
    }
  },
};

// ─── LMS Sessions ────────────────────────────────────────────

export const LMSSessions = {
  async create(input: {
    studentId: string;
    sessionDataEncrypted: string;
    lmsUsername: string;
  }): Promise<LMSSessionRow> {
    const session: LMSSessionRow = {
      id: randomUUID(),
      student_id: input.studentId,
      session_data_encrypted: input.sessionDataEncrypted,
      lms_username: input.lmsUsername,
      logged_in_at: new Date().toISOString(),
      last_used_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      is_active: true,
      created_at: new Date().toISOString(),
    };

    if (isSupabaseLive()) {
      try {
        const result = await db().from('lms_sessions').insert(session).select().single();
        return throwIfError(result) as LMSSessionRow;
      } catch {
        // Fall through to memory
      }
    }

    local.sessions.set(session.id, session);
    return session;
  },

  async findActiveByStudentId(studentId: string): Promise<LMSSessionRow | null> {
    if (isSupabaseLive()) {
      try {
        const { data, error } = await db()
          .from('lms_sessions')
          .select('*')
          .eq('student_id', studentId)
          .eq('is_active', true)
          .order('logged_in_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!error && data) return data as LMSSessionRow;
      } catch {
        // Fall through
      }
    }

    const matches = Array.from(local.sessions.values()).filter(
      (s) => s.student_id === studentId && s.is_active
    );
    matches.sort((a, b) => new Date(b.logged_in_at).getTime() - new Date(a.logged_in_at).getTime());
    return matches[0] ?? null;
  },

  async deactivateAll(studentId: string): Promise<void> {
    if (isSupabaseLive()) {
      try {
        await db().from('lms_sessions').update({ is_active: false }).eq('student_id', studentId);
      } catch {
        // Fall through
      }
    }
    for (const s of local.sessions.values()) {
      if (s.student_id === studentId) {
        s.is_active = false;
      }
    }
  },

  async findById(id: string): Promise<LMSSessionRow | null> {
    if (isSupabaseLive()) {
      try {
        const { data, error } = await db()
          .from('lms_sessions')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (!error && data) return data as LMSSessionRow;
      } catch {
        // Fall through
      }
    }
    return local.sessions.get(id) ?? null;
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
    const coursePayload: CourseRow = {
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

    if (isSupabaseLive()) {
      try {
        const result = await db()
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
        return throwIfError(result) as CourseRow;
      } catch {
        // Fall through
      }
    }

    // Upsert in local store
    for (const [id, c] of local.courses.entries()) {
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

    local.courses.set(coursePayload.id, coursePayload);
    return coursePayload;
  },

  async findByStudentId(studentId: string): Promise<CourseRow[]> {
    if (isSupabaseLive()) {
      try {
        const { data, error } = await db()
          .from('courses')
          .select('*')
          .eq('student_id', studentId)
          .order('name');
        if (!error && data && data.length > 0) return data as CourseRow[];
      } catch {
        // Fall through
      }
    }

    const matches = Array.from(local.courses.values()).filter((c) => c.student_id === studentId);
    matches.sort((a, b) => a.name.localeCompare(b.name));
    return matches;
  },

  async findById(id: string): Promise<CourseRow | null> {
    if (isSupabaseLive()) {
      try {
        const { data, error } = await db().from('courses').select('*').eq('id', id).maybeSingle();
        if (!error && data) return data as CourseRow;
      } catch {
        // Fall through
      }
    }
    return local.courses.get(id) ?? null;
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
      attachments: (input.attachments as unknown as AssignmentRow['attachments']) ?? [],
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

    if (isSupabaseLive()) {
      try {
        const result = await db()
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
              attachments: JSON.stringify(input.attachments ?? []),
              last_synced_at: new Date().toISOString(),
            },
            {
              onConflict: 'student_id,lms_assignment_id',
              ignoreDuplicates: false,
            }
          )
          .select()
          .single();
        return throwIfError(result) as AssignmentRow;
      } catch {
        // Fall through
      }
    }

    for (const [id, a] of local.assignments.entries()) {
      if (a.student_id === input.studentId && a.lms_assignment_id === input.lmsAssignmentId) {
        a.title = input.title;
        a.description = input.description ?? a.description;
        a.due_date = input.dueDate?.toISOString() ?? a.due_date;
        a.open_date = input.openDate?.toISOString() ?? a.open_date;
        a.max_grade = input.maxGrade ?? a.max_grade;
        a.submission_status = input.submissionStatus ?? a.submission_status;
        if (input.attachments) a.attachments = input.attachments as unknown as AssignmentRow['attachments'];
        a.last_synced_at = new Date().toISOString();
        a.updated_at = new Date().toISOString();
        return a;
      }
    }

    local.assignments.set(row.id, row);
    return row;
  },

  async findByStudentId(
    studentId: string,
    opts?: { aiStatus?: string; page?: number; limit?: number }
  ): Promise<{ data: AssignmentRow[]; total: number }> {
    const page = opts?.page ?? 1;
    const limit = opts?.limit ?? 20;

    if (isSupabaseLive()) {
      try {
        const offset = (page - 1) * limit;
        let query = db()
          .from('assignments')
          .select('*', { count: 'exact' })
          .eq('student_id', studentId)
          .order('due_date', { ascending: true })
          .range(offset, offset + limit - 1);

        if (opts?.aiStatus) {
          query = query.eq('ai_status', opts.aiStatus);
        }

        const { data, error, count } = await query;
        if (!error && data && data.length > 0) {
          return { data: data as AssignmentRow[], total: count ?? data.length };
        }
      } catch {
        // Fall through
      }
    }

    let items = Array.from(local.assignments.values()).filter((a) => a.student_id === studentId);
    if (opts?.aiStatus) {
      items = items.filter((a) => a.ai_status === opts.aiStatus);
    }
    const total = items.length;
    const start = (page - 1) * limit;
    const paged = items.slice(start, start + limit);
    return { data: paged, total };
  },

  async findById(id: string): Promise<AssignmentRow | null> {
    if (isSupabaseLive()) {
      try {
        const { data, error } = await db()
          .from('assignments')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (!error && data) return data as AssignmentRow;
      } catch {
        // Fall through
      }
    }
    return local.assignments.get(id) ?? null;
  },

  async updateAIStatus(id: string, status: AITaskStatus, errorMessage?: string): Promise<void> {
    if (isSupabaseLive()) {
      try {
        const update: Record<string, unknown> = {
          ai_status: status,
          updated_at: new Date().toISOString(),
        };
        if (status === 'completed') update['ai_processed_at'] = new Date().toISOString();
        if (errorMessage !== undefined) update['ai_error_message'] = errorMessage;
        await db().from('assignments').update(update).eq('id', id);
      } catch {
        // Fall through
      }
    }
    const a = local.assignments.get(id);
    if (a) {
      a.ai_status = status;
      if (status === 'completed') a.ai_processed_at = new Date().toISOString();
      if (errorMessage !== undefined) a.ai_error_message = errorMessage;
      a.updated_at = new Date().toISOString();
    }
  },

  async updatePdfDocument(id: string, documentId: string): Promise<void> {
    if (isSupabaseLive()) {
      try {
        await db()
          .from('assignments')
          .update({ document_id: documentId, updated_at: new Date().toISOString() })
          .eq('id', id);
      } catch {
        // Fall through
      }
    }
    const a = local.assignments.get(id);
    if (a) {
      a.document_id = documentId;
      a.updated_at = new Date().toISOString();
    }
  },

  async updateEmailSent(id: string, emailStatus: string): Promise<void> {
    if (isSupabaseLive()) {
      try {
        await db()
          .from('assignments')
          .update({
            email_sent_at: new Date().toISOString(),
            email_status: emailStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);
      } catch {
        // Fall through
      }
    }
    const a = local.assignments.get(id);
    if (a) {
      a.email_sent_at = new Date().toISOString();
      a.email_status = emailStatus;
      a.updated_at = new Date().toISOString();
    }
  },

  async findPendingAI(): Promise<AssignmentRow[]> {
    if (isSupabaseLive()) {
      try {
        const { data, error } = await db()
          .from('assignments')
          .select('*')
          .eq('ai_status', 'pending')
          .order('due_date', { ascending: true });
        if (!error && data) return data as AssignmentRow[];
      } catch {
        // Fall through
      }
    }
    return Array.from(local.assignments.values()).filter((a) => a.ai_status === 'pending');
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

    if (isSupabaseLive()) {
      try {
        const result = await db()
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
        return throwIfError(result) as QuizRow;
      } catch {
        // Fall through
      }
    }

    for (const [id, q] of local.quizzes.entries()) {
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

    local.quizzes.set(row.id, row);
    return row;
  },

  async findByStudentId(
    studentId: string,
    opts?: { page?: number; limit?: number }
  ): Promise<{ data: QuizRow[]; total: number }> {
    const page = opts?.page ?? 1;
    const limit = opts?.limit ?? 20;

    if (isSupabaseLive()) {
      try {
        const offset = (page - 1) * limit;
        const { data, error, count } = await db()
          .from('quizzes')
          .select('*', { count: 'exact' })
          .eq('student_id', studentId)
          .order('close_time', { ascending: true })
          .range(offset, offset + limit - 1);
        if (!error && data && data.length > 0) {
          return { data: data as QuizRow[], total: count ?? data.length };
        }
      } catch {
        // Fall through
      }
    }

    const items = Array.from(local.quizzes.values()).filter((q) => q.student_id === studentId);
    const total = items.length;
    const start = (page - 1) * limit;
    const paged = items.slice(start, start + limit);
    return { data: paged, total };
  },

  async findById(id: string): Promise<QuizRow | null> {
    if (isSupabaseLive()) {
      try {
        const { data, error } = await db().from('quizzes').select('*').eq('id', id).maybeSingle();
        if (!error && data) return data as QuizRow;
      } catch {
        // Fall through
      }
    }
    return local.quizzes.get(id) ?? null;
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
    downloadUrl?: string;
  }): Promise<DocumentRow> {
    const row: DocumentRow = {
      id: randomUUID(),
      student_id: input.studentId,
      assignment_id: input.assignmentId ?? null,
      filename: input.filename,
      file_path: input.filePath,
      file_size_bytes: input.fileSizeBytes ?? null,
      generated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    if (isSupabaseLive()) {
      try {
        const result = await db().from('documents').insert(row).select().single();
        return throwIfError(result) as DocumentRow;
      } catch {
        // Fall through
      }
    }

    local.documents.set(row.id, row);
    return row;
  },

  async findByStudentId(
    studentId: string,
    opts?: { page?: number; limit?: number }
  ): Promise<{ data: DocumentRow[]; total: number }> {
    const page = opts?.page ?? 1;
    const limit = opts?.limit ?? 20;

    if (isSupabaseLive()) {
      try {
        const offset = (page - 1) * limit;
        const { data, error, count } = await db()
          .from('documents')
          .select('*', { count: 'exact' })
          .eq('student_id', studentId)
          .order('generated_at', { ascending: false })
          .range(offset, offset + limit - 1);
        if (!error && data && data.length > 0) {
          return { data: data as DocumentRow[], total: count ?? data.length };
        }
      } catch {
        // Fall through
      }
    }

    const items = Array.from(local.documents.values()).filter((d) => d.student_id === studentId);
    const total = items.length;
    const start = (page - 1) * limit;
    const paged = items.slice(start, start + limit);
    return { data: paged, total };
  },

  async findById(id: string): Promise<DocumentRow | null> {
    if (isSupabaseLive()) {
      try {
        const { data, error } = await db().from('documents').select('*').eq('id', id).maybeSingle();
        if (!error && data) return data as DocumentRow;
      } catch {
        // Fall through
      }
    }
    return local.documents.get(id) ?? null;
  },

  async findByAssignmentId(assignmentId: string): Promise<DocumentRow[]> {
    if (isSupabaseLive()) {
      try {
        const { data, error } = await db()
          .from('documents')
          .select('*')
          .eq('assignment_id', assignmentId)
          .order('generated_at', { ascending: false });
        if (!error && data) return data as DocumentRow[];
      } catch {
        // Fall through
      }
    }
    return Array.from(local.documents.values()).filter((d) => d.assignment_id === assignmentId);
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

    if (isSupabaseLive()) {
      try {
        const result = await db().from('email_logs').insert(row).select().single();
        return throwIfError(result) as EmailLogRow;
      } catch {
        // Fall through
      }
    }

    local.emailLogs.set(row.id, row);
    return row;
  },

  async updateStatus(
    id: string,
    status: EmailStatus,
    messageId?: string,
    errorMessage?: string
  ): Promise<void> {
    if (isSupabaseLive()) {
      try {
        await db()
          .from('email_logs')
          .update({
            status,
            message_id: messageId ?? null,
            error_message: errorMessage ?? null,
            sent_at: status === 'sent' ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);
      } catch {
        // Fall through
      }
    }
    const l = local.emailLogs.get(id);
    if (l) {
      l.status = status;
      l.message_id = messageId ?? null;
      l.error_message = errorMessage ?? null;
      l.sent_at = status === 'sent' ? new Date().toISOString() : null;
    }
  },

  async findByStudentId(
    studentId: string,
    opts?: { page?: number; limit?: number }
  ): Promise<{ data: EmailLogRow[]; total: number }> {
    const page = opts?.page ?? 1;
    const limit = opts?.limit ?? 20;

    if (isSupabaseLive()) {
      try {
        const offset = (page - 1) * limit;
        const { data, error, count } = await db()
          .from('email_logs')
          .select('*', { count: 'exact' })
          .eq('student_id', studentId)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);
        if (!error && data && data.length > 0) {
          return { data: data as EmailLogRow[], total: count ?? data.length };
        }
      } catch {
        // Fall through
      }
    }

    const items = Array.from(local.emailLogs.values()).filter((l) => l.student_id === studentId);
    const total = items.length;
    const start = (page - 1) * limit;
    const paged = items.slice(start, start + limit);
    return { data: paged, total };
  },

  async findByAssignmentId(assignmentId: string): Promise<EmailLogRow[]> {
    if (isSupabaseLive()) {
      try {
        const { data, error } = await db()
          .from('email_logs')
          .select('*')
          .eq('assignment_id', assignmentId)
          .order('sent_at', { ascending: false });
        if (!error && data) return data as EmailLogRow[];
      } catch {
        // Fall through
      }
    }
    return Array.from(local.emailLogs.values()).filter((l) => l.assignment_id === assignmentId);
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

    if (isSupabaseLive()) {
      try {
        const result = await db().from('activity_logs').insert(row).select().single();
        return throwIfError(result) as ActivityLogRow;
      } catch {
        // Fall through
      }
    }

    local.activityLogs.unshift(row);
    return row;
  },

  async findByStudentId(studentId: string, limit = 50): Promise<ActivityLogRow[]> {
    if (isSupabaseLive()) {
      try {
        const { data, error } = await db()
          .from('activity_logs')
          .select('*')
          .eq('student_id', studentId)
          .order('created_at', { ascending: false })
          .limit(limit);
        if (!error && data && data.length > 0) return data as ActivityLogRow[];
      } catch {
        // Fall through
      }
    }

    const items = local.activityLogs.filter((l) => l.student_id === studentId);
    return items.slice(0, limit);
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

    if (isSupabaseLive()) {
      try {
        const result = await db().from('sync_records').insert(row).select().single();
        return throwIfError(result) as SyncRecordRow;
      } catch {
        // Fall through
      }
    }

    local.syncRecords.set(row.id, row);
    return row;
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
    if (isSupabaseLive()) {
      try {
        await db()
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
      } catch {
        // Fall through
      }
    }
    const r = local.syncRecords.get(id);
    if (r) {
      r.completed_at = new Date().toISOString();
      r.status = input.status;
      r.courses_found = input.coursesFound;
      r.assignments_found = input.assignmentsFound;
      r.quizzes_found = input.quizzesFound;
      r.errors = input.errors;
    }
  },

  async findLatestByStudentId(studentId: string): Promise<SyncRecordRow | null> {
    if (isSupabaseLive()) {
      try {
        const { data, error } = await db()
          .from('sync_records')
          .select('*')
          .eq('student_id', studentId)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!error && data) return data as SyncRecordRow;
      } catch {
        // Fall through
      }
    }

    const items = Array.from(local.syncRecords.values()).filter((r) => r.student_id === studentId);
    items.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
    return items[0] ?? null;
  },

  async findStudentsWithActiveSessions(): Promise<string[]> {
    if (isSupabaseLive()) {
      try {
        const { data, error } = await db()
          .from('lms_sessions')
          .select('student_id')
          .eq('is_active', true)
          .gt('expires_at', new Date().toISOString());
        if (!error && data) {
          return [...new Set((data ?? []).map((r: { student_id: string }) => r.student_id))];
        }
      } catch {
        // Fall through
      }
    }

    const unique = new Set<string>();
    for (const s of local.sessions.values()) {
      if (s.is_active && (!s.expires_at || new Date(s.expires_at) > new Date())) {
        unique.add(s.student_id);
      }
    }
    return Array.from(unique);
  },
};
