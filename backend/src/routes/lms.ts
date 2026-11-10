// ============================================================
// CampusSarthi — LMS Routes
// POST   /api/v1/lms/connect
// DELETE /api/v1/lms/disconnect
// GET    /api/v1/lms/status
// POST   /api/v1/lms/sync
// GET    /api/v1/lms/courses
// ============================================================

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import requireAuth from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import { lmsLimiter } from '../middleware/rateLimiter';
import { LMSConnector } from '../services/lms/connector';
import { LMSSessions, Courses, Assignments, Quizzes, ActivityLogs, SyncRecords } from '../db/queries';
import { encrypt } from '../utils/crypto';
import { logger } from '../utils/logger';
import { SyncJob } from '../services/scheduler/syncJob';
import {
  isDemoStudent,
  DEMO_ADMISSION_NUMBER,
  DEMO_LMS_PASSWORD,
  DEMO_COURSES,
  DEMO_ASSIGNMENTS,
  DEMO_QUIZZES,
  DEMO_LMS_SESSION,
} from '../services/demo/demoData';

const router = Router();

// ─── Schema ──────────────────────────────────────────────────

const connectSchema = z.object({
  username: z.string().min(1, 'Admission number or username is required').max(100),
  password: z.string().min(1, 'LMS password is required').max(200),
});

// ─── POST /connect ────────────────────────────────────────────

router.post(
  '/connect',
  requireAuth,
  lmsLimiter,
  validateBody(connectSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { username, password } = req.body as z.infer<typeof connectSchema>;
    const studentId = req.student!.id;

    logger.info('LMS connect attempt', { studentId, username });

    // ONLY use static sample data if explicitly using demo credentials
    if (username === DEMO_ADMISSION_NUMBER && password === DEMO_LMS_PASSWORD) {
      await LMSSessions.deactivateAll(studentId);
      await LMSSessions.create({
        studentId,
        sessionDataEncrypted: encrypt(JSON.stringify([{ name: 'demo', value: 'demo' }])),
        lmsUsername: DEMO_ADMISSION_NUMBER,
      });

      res.json({
        success: true,
        message: 'Galgotias University LMS connected successfully (Demo Mode).',
        data: {
          connected: true,
          username: DEMO_ADMISSION_NUMBER,
          connectedAt: new Date().toISOString(),
          coursesFound: DEMO_COURSES.length,
          assignmentsFound: DEMO_ASSIGNMENTS.length,
          quizzesFound: DEMO_QUIZZES.length,
        },
      });
      return;
    }

    // Connect to actual Galgotias University LMS
    const connector = new LMSConnector({ headless: true, timeout: 60000 });

    try {
      await connector.launch();
      const result = await connector.login(username, password);

      if (!result.success) {
        res.status(401).json({
          success: false,
          error: result.errorMessage ?? 'LMS login failed. Check your university credentials.',
        });
        return;
      }

      // Encrypt cookies — NEVER store the university password
      const cookiesJson = JSON.stringify(result.sessionCookies ?? []);
      const encryptedSession = encrypt(cookiesJson);

      // Deactivate any existing sessions
      await LMSSessions.deactivateAll(studentId);

      // Store new encrypted session
      await LMSSessions.create({
        studentId,
        sessionDataEncrypted: encryptedSession,
        lmsUsername: username,
      });

      await ActivityLogs.create({
        studentId,
        type: 'lms_connected',
        description: `Official LMS account connected: ${username}`,
        metadata: { username },
      });

      logger.info('LMS connected successfully, fetching live courses and activities', {
        studentId,
        username,
      });

      // Fast fetch of official courses
      let coursesFound = 0;
      try {
        const fetchedCourses = await connector.getCourses();
        coursesFound = fetchedCourses.length;
        logger.info('Official LMS courses discovered', { count: coursesFound });

        for (const c of fetchedCourses) {
          await Courses.upsert({
            studentId,
            lmsCourseId: c.lmsCourseId,
            name: c.name,
            shortName: c.shortName,
            fullName: c.fullName,
            courseUrl: c.courseUrl,
          });
        }
      } catch (courseErr) {
        logger.warn('Initial course listing failed, will retry in background', { error: String(courseErr) });
      }

      // Close login connector before responding
      await connector.close().catch(() => {});

      // Launch full deep synchronization of assignments, quizzes & documents in background
      SyncJob.getInstance()
        .runSyncForStudent(studentId)
        .then(() => logger.info('Initial background sync finished for student', { studentId }))
        .catch((syncErr) => logger.error('Initial background sync error', { studentId, error: String(syncErr) }));

      res.json({
        success: true,
        message: `Official Galgotias LMS connected! Discovered ${coursesFound} enrolled courses. Activities and assignments are synchronizing in the background.`,
        data: {
          connected: true,
          username,
          connectedAt: new Date().toISOString(),
          coursesFound,
          assignmentsFound: 0,
          quizzesFound: 0,
        },
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error('LMS connect error', { error: errMsg, studentId });
      res.status(500).json({
        success: false,
        error: `Failed to connect to Galgotias LMS: ${errMsg.includes('timeout') ? 'Connection timed out. The LMS may be slow — please try again.' : 'Please verify your credentials and try again.'}`,
      });
    } finally {
      await connector.close().catch(() => {});
    }
  }
);

// ─── DELETE /disconnect ───────────────────────────────────────

router.delete('/disconnect', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = req.student!.id;
    await LMSSessions.deactivateAll(studentId);

    await ActivityLogs.create({
      studentId,
      type: 'lms_disconnected',
      description: 'LMS account disconnected',
      metadata: {},
    });

    res.json({ success: true, message: 'LMS account disconnected.' });
  } catch (err) {
    logger.error('LMS disconnect error', { error: String(err) });
    res.status(500).json({ error: 'Failed to disconnect LMS account.' });
  }
});

// ─── GET /status ──────────────────────────────────────────────

router.get('/status', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = req.student!.id;

    const session = await LMSSessions.findActiveByStudentId(studentId);
    const latestSync = await SyncRecords.findLatestByStudentId(studentId);

    if (session) {
      res.json({
        success: true,
        data: {
          connected: true,
          username: session.lms_username,
          loggedInAt: session.logged_in_at,
          lastUsedAt: session.last_used_at,
          lastSync: latestSync
            ? {
                startedAt: latestSync.started_at,
                completedAt: latestSync.completed_at,
                status: latestSync.status,
                coursesFound: latestSync.courses_found,
                assignmentsFound: latestSync.assignments_found,
                quizzesFound: latestSync.quizzes_found,
              }
            : {
                startedAt: session.logged_in_at,
                completedAt: session.logged_in_at,
                status: 'completed',
                coursesFound: 0,
                assignmentsFound: 0,
                quizzesFound: 0,
              },
        },
      });
      return;
    }

    if (isDemoStudent(studentId)) {
      res.json({
        success: true,
        data: {
          connected: true,
          username: DEMO_ADMISSION_NUMBER,
          loggedInAt: DEMO_LMS_SESSION.logged_in_at,
          lastUsedAt: DEMO_LMS_SESSION.last_used_at,
          lastSync: {
            startedAt: new Date(Date.now() - 3600000).toISOString(),
            completedAt: new Date(Date.now() - 3500000).toISOString(),
            status: 'completed',
            coursesFound: DEMO_COURSES.length,
            assignmentsFound: DEMO_ASSIGNMENTS.length,
            quizzesFound: DEMO_QUIZZES.length,
          },
        },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        connected: false,
        username: null,
        loggedInAt: null,
        lastUsedAt: null,
        lastSync: null,
      },
    });
  } catch (err) {
    logger.error('LMS status error', { error: String(err) });
    res.status(500).json({ error: 'Failed to retrieve LMS status.' });
  }
});

// ─── POST /sync ───────────────────────────────────────────────

router.post('/sync', requireAuth, lmsLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = req.student!.id;

    const session = await LMSSessions.findActiveByStudentId(studentId);

    if (!session && !isDemoStudent(studentId)) {
      res.status(400).json({
        success: false,
        error: 'No active LMS session. Please connect your LMS account first.',
      });
      return;
    }

    if (session && session.lms_username !== DEMO_ADMISSION_NUMBER) {
      // Real sync
      const syncJob = SyncJob.getInstance();
      res.json({
        success: true,
        message: 'Sync started for official LMS account. Activities are updating in the background.',
        data: { startedAt: new Date().toISOString() },
      });

      syncJob.runSyncForStudent(studentId).catch((err) => {
        logger.error('Manual sync failed', { studentId, error: String(err) });
      });
      return;
    }

    // Demo Mode Sync
    res.json({
      success: true,
      message: 'Sync completed (Demo Mode). Course activities and deadlines are up to date.',
      data: {
        startedAt: new Date().toISOString(),
        coursesFound: DEMO_COURSES.length,
        assignmentsFound: DEMO_ASSIGNMENTS.length,
        quizzesFound: DEMO_QUIZZES.length,
      },
    });
  } catch (err) {
    logger.error('Sync trigger error', { error: String(err) });
    res.status(500).json({ error: 'Failed to start sync.' });
  }
});

// ─── GET /courses ─────────────────────────────────────────────

router.get('/courses', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = req.student!.id;
    const courses = await Courses.findByStudentId(studentId);

    if (courses.length > 0) {
      res.json({
        success: true,
        data: courses.map((c) => ({
          _id: c.id,
          id: c.id,
          lmsCourseId: c.lms_course_id,
          name: c.name,
          shortName: c.short_name,
          fullName: c.full_name,
          courseUrl: c.course_url,
          instructor: c.instructor,
          lastSyncedAt: c.last_synced_at,
        })),
      });
      return;
    }

    if (isDemoStudent(studentId)) {
      res.json({
        success: true,
        data: DEMO_COURSES.map((c) => ({
          _id: c.id,
          id: c.id,
          lmsCourseId: c.lms_course_id,
          name: c.name,
          shortName: c.short_name,
          fullName: c.full_name,
          courseUrl: c.course_url,
          instructor: c.instructor,
          lastSyncedAt: c.last_synced_at,
        })),
      });
      return;
    }

    res.json({ success: true, data: [] });
  } catch (err) {
    logger.error('Get courses error', { error: String(err) });
    res.status(500).json({ error: 'Failed to retrieve courses.' });
  }
});

export default router;
