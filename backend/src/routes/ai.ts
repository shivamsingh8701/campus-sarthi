// ============================================================
// CampusPilot AI — Gemini-Powered Academic Intelligence & Collection
// GET  /api/v1/ai/summary      — Gemini smart digest (cached 1hr)
// GET  /api/v1/ai/pending      — Pending assignments & quizzes (DB only)
// GET  /api/v1/ai/submitted    — Submitted/completed quizzes & assignments
// POST /api/v1/ai/summary/invalidate — Invalidate student AI cache
// ============================================================

import { Router, Request, Response } from 'express';
import requireAuth from '../middleware/auth';
import { Assignments, Quizzes, Courses } from '../db/queries';
import { aiRouter } from '../services/ai/router';
import { logger } from '../utils/logger';
import {
  isDemoStudent,
  DEMO_ASSIGNMENTS,
  DEMO_QUIZZES,
  DEMO_COURSES,
} from '../services/demo/demoData';
import type { AssignmentRow, QuizRow, CourseRow } from '../types/db';

const router = Router();

// ─── In-Memory Cache (per student, 1-hour TTL) ──────────────────────────────
// This avoids calling Gemini on every page refresh, keeping API credit usage minimal.

interface CacheEntry {
  data: AISummaryResponse;
  expiresAt: number; // epoch ms
}

const summaryCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function getCached(studentId: string): AISummaryResponse | null {
  const entry = summaryCache.get(studentId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    summaryCache.delete(studentId);
    return null;
  }
  return entry.data;
}

function setCache(studentId: string, data: AISummaryResponse): void {
  summaryCache.set(studentId, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PriorityItem {
  id: string;
  title: string;
  course: string;
  courseId: string;
  type: 'assignment' | 'quiz';
  dueDate: string | null;
  urgencyLevel: 'overdue' | 'urgent' | 'soon' | 'later';
  submissionStatus: string;
  lmsUrl: string;
}

export interface AISummaryResponse {
  generatedAt: string;
  fromCache: boolean;
  pendingAssignments: PriorityItem[];
  pendingQuizzes: PriorityItem[];
  submittedQuizzes: PriorityItem[];
  overallAdvice: string;
  urgentCount: number;
  overdueCount: number;
  totalPending: number;
  totalSubmitted: number;
}

// ─── Helper: Urgency Classification ─────────────────────────────────────────

function classifyUrgency(dueDate: string | null): 'overdue' | 'urgent' | 'soon' | 'later' {
  if (!dueDate) return 'later';
  const diff = new Date(dueDate).getTime() - Date.now();
  const hours = diff / 3600_000;
  if (hours < 0) return 'overdue';
  if (hours < 48) return 'urgent';
  if (hours < 168) return 'soon'; // within 7 days
  return 'later';
}

function isQuizCompleted(q: QuizRow): boolean {
  if (q.attempts_used > 0) return true;
  const status = (q.status ?? '').toLowerCase();
  return status === 'completed' || status === 'submitted' || status === 'attempted' || status === 'finished';
}

function isAssignmentSubmitted(a: AssignmentRow): boolean {
  const status = (a.submission_status ?? '').toLowerCase();
  return status === 'submitted' || status === 'graded';
}

// ─── GET /summary ─────────────────────────────────────────────────────────────
// Calls Gemini Flash ONCE per student per hour, returns smart digest.

router.get('/summary', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const studentId = req.student!.id;
  const forceRefresh = req.query['refresh'] === 'true';

  // Serve from cache if fresh (save Gemini credits)
  if (!forceRefresh) {
    const cached = getCached(studentId);
    if (cached) {
      res.json({ success: true, data: { ...cached, fromCache: true } });
      return;
    }
  }

  try {
    // ── Fetch data from DB (no AI call yet) ──────────────────────────────
    let assignments: AssignmentRow[];
    let quizzes: QuizRow[];
    let courses: CourseRow[];

    if (isDemoStudent(studentId)) {
      assignments = DEMO_ASSIGNMENTS as unknown as AssignmentRow[];
      quizzes = DEMO_QUIZZES as unknown as QuizRow[];
      courses = DEMO_COURSES as unknown as CourseRow[];
    } else {
      const [assignRes, quizRes, courseList] = await Promise.all([
        Assignments.findByStudentId(studentId, { limit: 100 }),
        Quizzes.findByStudentId(studentId, { limit: 100 }),
        Courses.findByStudentId(studentId),
      ]);
      assignments = assignRes.data;
      quizzes = quizRes.data;
      courses = courseList;
    }

    const courseMap = new Map<string, string>();
    courses.forEach((c) => {
      courseMap.set(c.id, c.name || c.full_name || c.short_name || 'General Course');
      if (c.lms_course_id) {
        courseMap.set(c.lms_course_id, c.name || c.full_name || c.short_name || 'General Course');
      }
    });

    const now = new Date();

    // Classify assignments
    const pendingAssignments: PriorityItem[] = [];
    assignments.forEach((a) => {
      if (!isAssignmentSubmitted(a)) {
        pendingAssignments.push({
          id: a.id,
          title: a.title,
          course: courseMap.get(a.course_id) ?? 'University Course',
          courseId: a.course_id,
          type: 'assignment',
          dueDate: a.due_date ?? null,
          urgencyLevel: classifyUrgency(a.due_date ?? null),
          submissionStatus: a.submission_status ?? 'pending',
          lmsUrl: `https://gulms.galgotiasuniversity.org/mod/assign/view.php?id=${a.lms_assignment_id}`,
        });
      }
    });

    // Classify quizzes
    const pendingQuizzes: PriorityItem[] = [];
    const submittedQuizzes: PriorityItem[] = [];

    quizzes.forEach((q) => {
      const isDone = isQuizCompleted(q);
      const item: PriorityItem = {
        id: q.id,
        title: q.title,
        course: courseMap.get(q.course_id) ?? 'University Course',
        courseId: q.course_id,
        type: 'quiz',
        dueDate: q.close_time ?? null,
        urgencyLevel: classifyUrgency(q.close_time ?? null),
        submissionStatus: isDone ? 'submitted' : (q.status ?? 'not_attempted'),
        lmsUrl: `https://gulms.galgotiasuniversity.org/mod/quiz/view.php?id=${q.lms_quiz_id}`,
      };

      if (isDone) {
        submittedQuizzes.push(item);
      } else {
        // Pending: check if close_time hasn't expired
        const closeDate = q.close_time ? new Date(q.close_time) : null;
        if (!closeDate || closeDate > now) {
          pendingQuizzes.push(item);
        }
      }
    });

    // Sort by urgency
    const urgencyOrder = { overdue: 0, urgent: 1, soon: 2, later: 3 };
    const sortByUrgency = (a: PriorityItem, b: PriorityItem) =>
      urgencyOrder[a.urgencyLevel] - urgencyOrder[b.urgencyLevel];

    pendingAssignments.sort(sortByUrgency);
    pendingQuizzes.sort(sortByUrgency);

    const overdueCount = [...pendingAssignments, ...pendingQuizzes].filter(
      (i) => i.urgencyLevel === 'overdue'
    ).length;
    const urgentCount = [...pendingAssignments, ...pendingQuizzes].filter(
      (i) => i.urgencyLevel === 'urgent'
    ).length;

    // ── Call Gemini Flash ONCE with compact prompt ────────────────────────
    let overallAdvice =
      'Your schedule looks clear. Keep checking for new assignments after each LMS sync.';

    const totalPending = pendingAssignments.length + pendingQuizzes.length;

    if (totalPending > 0) {
      // Build a compact, token-efficient prompt (less than ~150 tokens)
      const compactItems = [
        ...pendingAssignments.slice(0, 4).map(
          (a) =>
            `ASSIGN: "${a.title}" (${a.course}) due=${a.dueDate ?? 'N/A'} priority=${a.urgencyLevel}`
        ),
        ...pendingQuizzes.slice(0, 4).map(
          (q) =>
            `QUIZ: "${q.title}" (${q.course}) closes=${q.dueDate ?? 'N/A'} priority=${q.urgencyLevel}`
        ),
      ].join('\n');

      const prompt = `You are CampusPilot AI academic advisor. A student has these university deadlines:\n${compactItems}\n\nSubmitted quizzes completed: ${submittedQuizzes.length}.\nWrite 2-3 sentences of direct, actionable advice on what to prioritize first today. Max 60 words. No bullet points.`;

      try {
        const aiResult = await aiRouter.analyze('summary_generation', prompt, {
          temperature: 0.3,
          maxOutputTokens: 120, // Strict token limit to save credits
        });
        overallAdvice = aiResult.text.trim();
        logger.info('Gemini academic summary generated', {
          studentId,
          inputTokens: aiResult.usage.inputTokens,
          outputTokens: aiResult.usage.outputTokens,
        });
      } catch (aiErr) {
        logger.warn('Gemini summary failed, using fallback rule-based advice', {
          error: String(aiErr),
        });
        if (overdueCount > 0) {
          overallAdvice = `You have ${overdueCount} overdue item${overdueCount > 1 ? 's' : ''}. Prioritize submitting these first before working on upcoming quizzes.`;
        } else if (urgentCount > 0) {
          overallAdvice = `Focus on the ${urgentCount} task${urgentCount > 1 ? 's' : ''} closing in the next 48 hours. Generate solution drafts to review your material early.`;
        } else {
          overallAdvice = `You have ${totalPending} pending task${totalPending > 1 ? 's' : ''}. Review course assignments ahead of time to stay on schedule.`;
        }
      }
    } else if (submittedQuizzes.length > 0) {
      overallAdvice = `Great job! You have completed all ${submittedQuizzes.length} upcoming quizzes. Stay tuned for new assignments during the next sync.`;
    }

    const summary: AISummaryResponse = {
      generatedAt: new Date().toISOString(),
      fromCache: false,
      pendingAssignments,
      pendingQuizzes,
      submittedQuizzes,
      overallAdvice,
      urgentCount,
      overdueCount,
      totalPending,
      totalSubmitted: submittedQuizzes.length,
    };

    // Store in cache
    setCache(studentId, summary);

    res.json({ success: true, data: summary });
  } catch (err) {
    logger.error('AI summary error', { error: String(err), studentId });
    res.status(500).json({ success: false, error: 'Failed to generate AI summary.' });
  }
});

// ─── GET /pending ─────────────────────────────────────────────────────────────
// Pure DB query — no AI call. Fast list of pending tasks.

router.get('/pending', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const studentId = req.student!.id;

  try {
    let assignments: AssignmentRow[];
    let quizzes: QuizRow[];
    let courses: CourseRow[];

    if (isDemoStudent(studentId)) {
      assignments = DEMO_ASSIGNMENTS as unknown as AssignmentRow[];
      quizzes = DEMO_QUIZZES as unknown as QuizRow[];
      courses = DEMO_COURSES as unknown as CourseRow[];
    } else {
      const [assignRes, quizRes, courseList] = await Promise.all([
        Assignments.findByStudentId(studentId, { limit: 100 }),
        Quizzes.findByStudentId(studentId, { limit: 100 }),
        Courses.findByStudentId(studentId),
      ]);
      assignments = assignRes.data;
      quizzes = quizRes.data;
      courses = courseList;
    }

    const courseMap = new Map<string, string>();
    courses.forEach((c) => {
      courseMap.set(c.id, c.name || c.full_name || 'Course');
    });

    const now = new Date();

    const pendingAssignments = assignments
      .filter((a) => !isAssignmentSubmitted(a))
      .map((a) => ({
        id: a.id,
        type: 'assignment' as const,
        title: a.title,
        course: courseMap.get(a.course_id) ?? 'Course',
        courseId: a.course_id,
        dueDate: a.due_date,
        submissionStatus: a.submission_status ?? 'pending',
        urgency: classifyUrgency(a.due_date ?? null),
        lmsUrl: `https://gulms.galgotiasuniversity.org/mod/assign/view.php?id=${a.lms_assignment_id}`,
        attachmentsCount: a.attachments?.length ?? 0,
      }))
      .sort((a, b) => {
        const order = { overdue: 0, urgent: 1, soon: 2, later: 3 };
        return order[a.urgency] - order[b.urgency];
      });

    const pendingQuizzes = quizzes
      .filter((q) => {
        if (isQuizCompleted(q)) return false;
        const closeDate = q.close_time ? new Date(q.close_time) : null;
        return !closeDate || closeDate > now;
      })
      .map((q) => ({
        id: q.id,
        type: 'quiz' as const,
        title: q.title,
        course: courseMap.get(q.course_id) ?? 'Course',
        courseId: q.course_id,
        openTime: q.open_time,
        closeTime: q.close_time,
        attemptsUsed: q.attempts_used,
        maxAttempts: q.max_attempts,
        timeLimitSeconds: q.time_limit_seconds,
        status: q.status ?? 'open',
        urgency: classifyUrgency(q.close_time ?? null),
        lmsUrl: `https://gulms.galgotiasuniversity.org/mod/quiz/view.php?id=${q.lms_quiz_id}`,
      }))
      .sort((a, b) => {
        const order = { overdue: 0, urgent: 1, soon: 2, later: 3 };
        return order[a.urgency] - order[b.urgency];
      });

    res.json({
      success: true,
      data: {
        pendingAssignments,
        pendingQuizzes,
        totalPending: pendingAssignments.length + pendingQuizzes.length,
      },
    });
  } catch (err) {
    logger.error('Pending tasks error', { error: String(err) });
    res.status(500).json({ error: 'Failed to fetch pending tasks.' });
  }
});

// ─── GET /submitted ───────────────────────────────────────────────────────────
// Returns submitted quizzes and submitted assignments (pure DB, 0 AI tokens)

router.get('/submitted', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const studentId = req.student!.id;

  try {
    let assignments: AssignmentRow[];
    let quizzes: QuizRow[];
    let courses: CourseRow[];

    if (isDemoStudent(studentId)) {
      assignments = DEMO_ASSIGNMENTS as unknown as AssignmentRow[];
      quizzes = DEMO_QUIZZES as unknown as QuizRow[];
      courses = DEMO_COURSES as unknown as CourseRow[];
    } else {
      const [assignRes, quizRes, courseList] = await Promise.all([
        Assignments.findByStudentId(studentId, { limit: 100 }),
        Quizzes.findByStudentId(studentId, { limit: 100 }),
        Courses.findByStudentId(studentId),
      ]);
      assignments = assignRes.data;
      quizzes = quizRes.data;
      courses = courseList;
    }

    const courseMap = new Map<string, string>();
    courses.forEach((c) => {
      courseMap.set(c.id, c.name || c.full_name || 'Course');
    });

    const submittedQuizzes = quizzes
      .filter((q) => isQuizCompleted(q))
      .map((q) => ({
        id: q.id,
        type: 'quiz' as const,
        title: q.title,
        course: courseMap.get(q.course_id) ?? 'Course',
        courseId: q.course_id,
        attemptsUsed: q.attempts_used,
        maxAttempts: q.max_attempts,
        status: q.status ?? 'completed',
        closeTime: q.close_time,
        lmsUrl: `https://gulms.galgotiasuniversity.org/mod/quiz/view.php?id=${q.lms_quiz_id}`,
        lastSyncedAt: q.last_synced_at,
      }));

    const submittedAssignments = assignments
      .filter((a) => isAssignmentSubmitted(a))
      .map((a) => ({
        id: a.id,
        type: 'assignment' as const,
        title: a.title,
        course: courseMap.get(a.course_id) ?? 'Course',
        courseId: a.course_id,
        dueDate: a.due_date,
        submissionStatus: a.submission_status,
        maxGrade: a.max_grade,
        lmsUrl: `https://gulms.galgotiasuniversity.org/mod/assign/view.php?id=${a.lms_assignment_id}`,
        updatedAt: a.updated_at,
      }));

    res.json({
      success: true,
      data: {
        submittedQuizzes,
        submittedAssignments,
        totalSubmitted: submittedQuizzes.length + submittedAssignments.length,
      },
    });
  } catch (err) {
    logger.error('Submitted tasks error', { error: String(err) });
    res.status(500).json({ error: 'Failed to fetch submitted tasks.' });
  }
});

// ─── POST /summary/invalidate ─────────────────────────────────────────────────
router.post('/summary/invalidate', requireAuth, (req: Request, res: Response): void => {
  const studentId = req.student!.id;
  summaryCache.delete(studentId);
  res.json({ success: true, message: 'AI summary cache cleared. Next request will refresh.' });
});

export default router;
