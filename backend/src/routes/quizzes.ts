// ============================================================
// CampusSarthi — Quiz Routes
// GET /api/v1/quizzes
// GET /api/v1/quizzes/:id
// ============================================================

import { Router, Request, Response } from 'express';
import requireAuth from '../middleware/auth';
import { Quizzes, Courses } from '../db/queries';
import { logger } from '../utils/logger';
import { aiRouter } from '../services/ai/router';
import { isDemoStudent, DEMO_QUIZZES, DEMO_COURSES } from '../services/demo/demoData';

const router = Router();

// In-memory cache for generated quiz solutions
interface QuizSolutionData {
  quizId: string;
  title: string;
  courseName: string;
  solutionGuide: string;
  generatedAt: string;
}

const quizSolutionCache = new Map<string, QuizSolutionData>();

// --- POST /quizzes/solve-all ----------------------------------
// Generates solutions & revision review for all quizzes (submitted & pending)

router.post('/solve-all', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const studentId = req.student!.id;

  try {
    let quizList: Array<{ id: string; title: string; course_id: string; description?: string | null }>;

    if (isDemoStudent(studentId)) {
      quizList = DEMO_QUIZZES;
    } else {
      const qRes = await Quizzes.findByStudentId(studentId, { limit: 100 });
      quizList = qRes.data;
    }

    if (quizList.length === 0) {
      res.json({ success: true, message: 'No quizzes found to solve.', data: { count: 0 } });
      return;
    }

    const courses = isDemoStudent(studentId) ? DEMO_COURSES : await Courses.findByStudentId(studentId);
    const courseMap = new Map(courses.map((c) => [c.id, c.name]));

    res.json({
      success: true,
      message: `Generating AI solutions and post-submission review guides for ${quizList.length} quizzes.`,
      data: { count: quizList.length },
    });

    // Generate solutions in background
    (async () => {
      for (const q of quizList) {
        if (quizSolutionCache.has(q.id)) continue;
        const cName = courseMap.get(q.course_id) ?? 'University Subject';
        const prompt = `You are a university professor creating a post-submission solution guide and revision sheet for this quiz:
Quiz: "${q.title}"
Course: "${cName}"
Description: "${q.description ?? 'University assessment'}"

Provide:
1. KEY CONCEPTS & CORE FORMULAS: Essential theory covered in this assessment.
2. REPRESENTATIVE QUESTIONS & STEP-BY-STEP SOLUTIONS: 3-4 typical numerical or conceptual questions with verified answers and detailed steps.
3. COMMON MISTAKES & POST-SUBMISSION REVIEW: Traps to avoid and memory tricks.
Keep formatting clean and easy to read.`;

        try {
          const aiRes = await aiRouter.analyze('quiz_analysis', prompt, {
            temperature: 0.3,
            maxOutputTokens: 600,
          });

          quizSolutionCache.set(q.id, {
            quizId: q.id,
            title: q.title,
            courseName: cName,
            solutionGuide: aiRes.text.trim(),
            generatedAt: new Date().toISOString(),
          });
          logger.info('Quiz solution generated', { quizId: q.id, title: q.title });
        } catch (err) {
          logger.warn('Quiz solution generation failed', { quizId: q.id, error: String(err) });
        }
      }
    })().catch(() => {});
  } catch (err) {
    logger.error('Solve all quizzes error', { error: String(err) });
    res.status(500).json({ error: 'Failed to generate solutions for quizzes.' });
  }
});

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = req.student!.id;
    const { page = 1, limit = 20 } = req.query;

    const quizzes = await Quizzes.findByStudentId(studentId, {
      page: Number(page),
      limit: Number(limit),
    });

    const courses = await Courses.findByStudentId(studentId);
    const courseMap = new Map(courses.map((c) => [c.id, c]));

    // If real quizzes exist for this student, return them!
    if (quizzes.data.length > 0) {
      res.json({
        success: true,
        data: quizzes.data.map((q) => ({
          _id: q.id,
          id: q.id,
          lmsQuizId: q.lms_quiz_id,
          courseId: q.course_id,
          courseName: courseMap.get(q.course_id)?.name ?? 'Course',
          course: { id: q.course_id, name: courseMap.get(q.course_id)?.name ?? 'Course' },
          title: q.title,
          description: q.description,
          openTime: q.open_time,
          closeTime: q.close_time,
          opensAt: q.open_time,
          closesAt: q.close_time,
          timeLimitSeconds: q.time_limit_seconds,
          timeLimitMinutes: q.time_limit_seconds ? Math.round(q.time_limit_seconds / 60) : undefined,
          maxAttempts: q.max_attempts,
          allowedAttempts: q.max_attempts,
          attemptsUsed: q.attempts_used,
          totalQuestions: q.total_questions,
          status: q.status,
          lastSyncedAt: q.last_synced_at,
          createdAt: q.created_at,
        })),
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: quizzes.total,
          pages: Math.ceil(quizzes.total / Number(limit)),
        },
      });
      return;
    }

    if (isDemoStudent(studentId)) {
      const demoCourseMap = new Map(DEMO_COURSES.map((c) => [c.id, c]));
      res.json({
        success: true,
        data: DEMO_QUIZZES.map((q) => ({
          _id: q.id,
          id: q.id,
          lmsQuizId: q.lms_quiz_id,
          courseId: q.course_id,
          courseName: demoCourseMap.get(q.course_id)?.name ?? 'CS301 - Design & Analysis of Algorithms',
          course: { id: q.course_id, name: demoCourseMap.get(q.course_id)?.name ?? 'CS301 - Design & Analysis of Algorithms' },
          title: q.title,
          description: q.description,
          openTime: q.open_time,
          closeTime: q.close_time,
          opensAt: q.open_time,
          closesAt: q.close_time,
          timeLimitSeconds: q.time_limit_seconds,
          timeLimitMinutes: q.time_limit_seconds ? Math.round(q.time_limit_seconds / 60) : undefined,
          maxAttempts: q.max_attempts,
          allowedAttempts: q.max_attempts,
          attemptsUsed: q.attempts_used,
          totalQuestions: q.total_questions,
          status: q.status,
          lastSyncedAt: q.last_synced_at,
          createdAt: q.created_at,
        })),
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: DEMO_QUIZZES.length,
          pages: 1,
        },
      });
      return;
    }

    res.json({
      success: true,
      data: quizzes.data.map((q) => ({
        _id: q.id,
        id: q.id,
        lmsQuizId: q.lms_quiz_id,
        courseId: q.course_id,
        courseName: courseMap.get(q.course_id)?.name ?? 'Unknown Course',
        course: { id: q.course_id, name: courseMap.get(q.course_id)?.name ?? 'Unknown Course' },
        title: q.title,
        description: q.description,
        openTime: q.open_time,
        closeTime: q.close_time,
        opensAt: q.open_time,
        closesAt: q.close_time,
        timeLimitSeconds: q.time_limit_seconds,
        timeLimitMinutes: q.time_limit_seconds ? Math.round(q.time_limit_seconds / 60) : undefined,
        maxAttempts: q.max_attempts,
        allowedAttempts: q.max_attempts,
        attemptsUsed: q.attempts_used,
        totalQuestions: q.total_questions,
        status: q.status,
        lastSyncedAt: q.last_synced_at,
        createdAt: q.created_at,
      })),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: quizzes.total,
        pages: Math.ceil(quizzes.total / Number(limit)),
      },
    });
  } catch (err) {
    logger.error('Get quizzes error', { error: String(err) });
    res.status(500).json({ error: 'Failed to retrieve quizzes.' });
  }
});

router.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = req.student!.id;
    const targetId = String(req.params['id']);

    if (isDemoStudent(studentId)) {
      const demoQuiz = DEMO_QUIZZES.find((q) => q.id === targetId || q.lms_quiz_id === targetId) ?? DEMO_QUIZZES[0]!;
      const demoCourse = DEMO_COURSES.find((c) => c.id === demoQuiz.course_id);
      res.json({
        success: true,
        data: {
          _id: demoQuiz.id,
          id: demoQuiz.id,
          lmsQuizId: demoQuiz.lms_quiz_id,
          courseId: demoQuiz.course_id,
          courseName: demoCourse?.name ?? 'CS301 - Design & Analysis of Algorithms',
          title: demoQuiz.title,
          description: demoQuiz.description,
          openTime: demoQuiz.open_time,
          closeTime: demoQuiz.close_time,
          timeLimitSeconds: demoQuiz.time_limit_seconds,
          timeLimitFormatted: `${Math.floor((demoQuiz.time_limit_seconds ?? 0) / 60)} minutes`,
          maxAttempts: demoQuiz.max_attempts,
          attemptsUsed: demoQuiz.attempts_used,
          attemptsRemaining: 1,
          totalQuestions: demoQuiz.total_questions,
          status: demoQuiz.status,
          instructions: demoQuiz.instructions,
          lastSyncedAt: demoQuiz.last_synced_at,
        },
      });
      return;
    }

    const quiz = await Quizzes.findById(String(req.params['id']));

    if (!quiz || quiz.student_id !== studentId) {
      res.status(404).json({ error: 'Quiz not found.' });
      return;
    }

    const course = await Courses.findById(quiz.course_id);

    res.json({
      success: true,
      data: {
        _id: quiz.id,
        id: quiz.id,
        lmsQuizId: quiz.lms_quiz_id,
        courseId: quiz.course_id,
        courseName: course?.name ?? 'Unknown Course',
        title: quiz.title,
        description: quiz.description,
        openTime: quiz.open_time,
        closeTime: quiz.close_time,
        timeLimitSeconds: quiz.time_limit_seconds,
        timeLimitFormatted: quiz.time_limit_seconds
          ? `${Math.floor(quiz.time_limit_seconds / 60)} minutes`
          : null,
        maxAttempts: quiz.max_attempts,
        attemptsUsed: quiz.attempts_used,
        attemptsRemaining:
          quiz.max_attempts != null
            ? Math.max(0, quiz.max_attempts - (quiz.attempts_used ?? 0))
            : null,
        totalQuestions: quiz.total_questions,
        status: quiz.status,
        instructions: quiz.instructions,
        lastSyncedAt: quiz.last_synced_at,
      },
    });
  } catch (err) {
    logger.error('Get quiz error', { error: String(err) });
    res.status(500).json({ error: 'Failed to retrieve quiz.' });
  }
});

// --- POST /quizzes/:id/solution -------------------------------
// Generates a comprehensive AI solution guide for a specific quiz

router.post('/:id/solution', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = req.student!.id;
    const targetId = String(req.params['id']);

    let quizTitle = 'University Quiz';
    let courseName = 'University Subject';
    let description = '';

    if (isDemoStudent(studentId)) {
      const demoQuiz = DEMO_QUIZZES.find((q) => q.id === targetId || q.lms_quiz_id === targetId) ?? DEMO_QUIZZES[0]!;
      const demoCourse = DEMO_COURSES.find((c) => c.id === demoQuiz.course_id);
      quizTitle = demoQuiz.title;
      courseName = demoCourse?.name ?? 'Design & Analysis of Algorithms';
      description = demoQuiz.description ?? '';
    } else {
      const quiz = await Quizzes.findById(targetId);
      if (!quiz || quiz.student_id !== studentId) {
        res.status(404).json({ error: 'Quiz not found.' });
        return;
      }
      quizTitle = quiz.title;
      description = quiz.description ?? '';
      const course = await Courses.findById(quiz.course_id);
      if (course) courseName = course.name;
    }

    // Check cache first
    const cacheKey = `${studentId}:${targetId}`;
    const cached = quizSolutionCache.get(cacheKey);
    if (cached) {
      res.json({ success: true, data: cached });
      return;
    }

    const prompt = `You are a university academic specialist creating a post-submission solution guide and revision sheet for this quiz:
Quiz Title: "${quizTitle}"
Course: "${courseName}"
Description: "${description}"

Provide:
1. KEY CONCEPTS & CORE FORMULAS: Essential theory covered in this assessment.
2. REPRESENTATIVE QUESTIONS & STEP-BY-STEP SOLUTIONS: 3-4 typical numerical or conceptual questions with verified answers and detailed steps.
3. COMMON MISTAKES & POST-SUBMISSION REVIEW: Traps to avoid and memory tricks.
Keep formatting clean and easy to read.`;

    const aiRes = await aiRouter.analyze('quiz_analysis', prompt, {
      temperature: 0.3,
      maxOutputTokens: 750,
    });

    const solutionData: QuizSolutionData = {
      quizId: targetId,
      title: quizTitle,
      courseName,
      solutionGuide: aiRes.text.trim(),
      generatedAt: new Date().toISOString(),
    };

    quizSolutionCache.set(cacheKey, solutionData);

    res.json({ success: true, data: solutionData });
  } catch (err) {
    logger.error('Quiz solution generation error', { error: String(err) });
    res.status(500).json({ error: 'Failed to generate quiz solution.' });
  }
});

// --- GET /quizzes/:id/solution --------------------------------
router.get('/:id/solution', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const studentId = req.student!.id;
  const targetId = String(req.params['id']);

  if (!isDemoStudent(studentId)) {
    const quiz = await Quizzes.findById(targetId);
    if (!quiz || quiz.student_id !== studentId) {
      res.status(404).json({ success: false, error: 'Quiz not found.' });
      return;
    }
  }

  const cached = quizSolutionCache.get(`${studentId}:${targetId}`) ?? quizSolutionCache.get(targetId);

  if (cached) {
    res.json({ success: true, data: cached });
    return;
  }

  // Not yet generated — prompt the client to call POST
  res.status(404).json({ success: false, error: 'No solution generated yet for this quiz.' });
});

export default router;
