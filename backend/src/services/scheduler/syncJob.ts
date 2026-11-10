// ============================================================
// CampusPilot AI — Background Sync Job (node-cron)
// ============================================================

import cron, { ScheduledTask } from 'node-cron';
import { getConfig } from '../../config';
import { logger } from '../../utils/logger';
import { LMSSessions, Courses, Assignments, Quizzes, SyncRecords, ActivityLogs } from '../../db/queries';
import { LMSConnector, extractIdFromUrl } from '../lms/connector';
import { decrypt } from '../../utils/crypto';
import type { SessionCookie } from '../../types';

export class SyncJob {
  private static _instance: SyncJob | null = null;
  private task: ScheduledTask | null = null;
  private isRunning = false;

  static getInstance(): SyncJob {
    if (!SyncJob._instance) {
      SyncJob._instance = new SyncJob();
    }
    return SyncJob._instance;
  }

  start(): void {
    const cfg = getConfig();
    const intervalMinutes = cfg.scheduler.syncIntervalMinutes;

    const cronExpr =
      intervalMinutes <= 59
        ? `*/${intervalMinutes} * * * *`
        : `0 */${Math.floor(intervalMinutes / 60)} * * *`;

    logger.info('Starting sync job', { cronExpr, intervalMinutes });

    this.task = cron.schedule(cronExpr, () => {
      void this.runSyncForAllStudents();
    });

    this.task.start();
    logger.info('Sync job started');
  }

  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      logger.info('Sync job stopped');
    }
  }

  // ── Sync All Students ─────────────────────────────────────────────────────

  async runSyncForAllStudents(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Sync already in progress, skipping this tick');
      return;
    }
    this.isRunning = true;
    logger.info('Running sync for all active students');

    let studentIds: string[];
    try {
      studentIds = await SyncRecords.findStudentsWithActiveSessions();
    } catch (err) {
      logger.error('Failed to fetch students for sync', {
        error: err instanceof Error ? err.message : String(err),
      });
      this.isRunning = false;
      return;
    }

    logger.info('Active students to sync', { count: studentIds.length });

    for (const studentId of studentIds) {
      try {
        await this.runSyncForStudent(studentId);
      } catch (err) {
        logger.error('Sync failed for student', {
          studentId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    this.isRunning = false;
    logger.info('Sync run completed for all students');
  }

  // ── Sync Single Student ───────────────────────────────────────────────────

  async runSyncForStudent(studentId: string): Promise<void> {
    logger.info('Starting LMS sync', { studentId });

    // Find active session
    const session = await LMSSessions.findActiveByStudentId(studentId);
    if (!session) {
      logger.info('No active LMS session, skipping sync', { studentId });
      return;
    }

    // Check expiry
    if (new Date() > new Date(session['expires_at'] as string)) {
      logger.info('LMS session expired, deactivating', { studentId });
      await LMSSessions.deactivateAll(studentId);
      await ActivityLogs.create({
        studentId,
        type: 'lms_disconnected',
        description: 'LMS session expired and was deactivated',
        metadata: {},
      });
      return;
    }

    // Create sync record
    const syncRecord = await SyncRecords.create(studentId);

    const connector = new LMSConnector({ headless: true, timeout: 45_000 });
    const errors: string[] = [];
    let coursesFound = 0;
    let assignmentsFound = 0;
    let quizzesFound = 0;

    try {
      await connector.launch();

      // Restore session cookies
      let cookies: SessionCookie[];
      try {
        const decrypted = decrypt(session['session_data_encrypted'] as string);
        cookies = JSON.parse(decrypted) as SessionCookie[];
      } catch (err) {
        throw new Error(`Failed to decrypt session cookies: ${(err as Error).message}`);
      }

      await connector.restoreSession(cookies);

      // Validate session is still active on LMS
      const isValid = await connector.validateSession();
      if (!isValid) {
        logger.warn('LMS session no longer valid, deactivating', { studentId });
        await LMSSessions.deactivateAll(studentId);
        await ActivityLogs.create({
          studentId,
          type: 'lms_disconnected',
          description: 'LMS session was invalidated or expired on university server. Please reconnect your account.',
          metadata: {},
        });
        return;
      }

      // Step 1: Discover calendar deadlines from Dashboard (Screenshot 4)
      const calendarEvents = await connector.getDashboardCalendarEvents().catch((err) => {
        logger.warn('Dashboard calendar discovery warning', { error: String(err) });
        return [];
      });
      logger.info('Calendar events discovered', { count: calendarEvents.length });

      // Step 2: Discover enrolled courses from ActiLearn (Screenshot 1 & 2)
      const courseDataList = await connector.getCourses();
      coursesFound = courseDataList.length;

      for (const courseData of courseDataList) {
        // Upsert course
        const course = await Courses.upsert({
          studentId,
          lmsCourseId: courseData.lmsCourseId,
          name: courseData.name,
          shortName: courseData.shortName,
          fullName: courseData.fullName,
          courseUrl: courseData.courseUrl,
        });

        // Step 3: Fetch course activities (Screenshot 3)
        let activities;
        try {
          activities = await connector.getCourseActivities(
            courseData.lmsCourseId,
            courseData.courseUrl
          );
        } catch (err) {
          const msg = `Failed to get activities for course ${course['name']}: ${(err as Error).message}`;
          logger.warn(msg, { courseId: course['id'] as string });
          errors.push(msg);
          continue;
        }

        for (const activity of activities) {
          if (activity.type === 'assignment') {
            try {
              const details = await connector.getAssignmentDetails(activity.url);

              // Use calendar deadline fallback if page didn't have one
              const calendarMatch = calendarEvents.find(
                (ce) => ce.type === 'assignment' && ce.url.includes(details.lmsAssignmentId)
              );
              const finalDueDate = details.dueDate ?? activity.dueDate ?? calendarMatch?.dueDate ?? null;

              const existing = await Assignments.upsert({
                studentId,
                courseId: course['id'] as string,
                lmsAssignmentId: details.lmsAssignmentId,
                title: details.title,
                description: details.description ?? undefined,
                dueDate: finalDueDate ?? undefined,
                openDate: details.openDate ?? undefined,
                maxGrade: details.maxGrade ?? undefined,
                submissionStatus: details.submissionStatus ?? undefined,
                attachments: details.attachments,
              });

              assignmentsFound++;

              if (existing['ai_status'] === 'pending') {
                await ActivityLogs.create({
                  studentId,
                  type: 'assignment_found',
                  description: `New assignment found: ${details.title}`,
                  metadata: {
                    assignmentId: existing.id,
                    courseId: course['id'] as string,
                    dueDate: finalDueDate?.toISOString(),
                  },
                });
              }
            } catch (err) {
              const msg = `Failed to process assignment "${activity.name}": ${(err as Error).message}`;
              logger.warn(msg);
              errors.push(msg);
            }
          } else if (activity.type === 'quiz') {
            try {
              const details = await connector.getQuizDetails(activity.url);

              const calendarMatch = calendarEvents.find(
                (ce) => ce.type === 'quiz' && ce.url.includes(details.lmsQuizId)
              );
              const finalCloseTime = details.closeTime ?? activity.closeDate ?? calendarMatch?.dueDate ?? null;

              await Quizzes.upsert({
                studentId,
                courseId: course['id'] as string,
                lmsQuizId: details.lmsQuizId,
                title: details.title,
                description: details.description ?? undefined,
                openTime: details.openTime ?? undefined,
                closeTime: finalCloseTime ?? undefined,
                timeLimitSeconds: details.timeLimitSeconds ?? undefined,
                maxAttempts: details.maxAttempts ?? undefined,
                totalQuestions: details.totalQuestions ?? undefined,
                status: details.status ?? undefined,
              });

              quizzesFound++;
            } catch (err) {
              const msg = `Failed to process quiz "${activity.name}": ${(err as Error).message}`;
              logger.warn(msg);
              errors.push(msg);
            }
          }
        }
      }

      // Step 4: Process any calendar deadlines that weren't inside the scraped course activity trees
      const enrolledCourses = await Courses.findByStudentId(studentId);
      const defaultCourse = enrolledCourses[0];

      if (defaultCourse) {
        for (const calEvent of calendarEvents) {
          const actId = extractIdFromUrl(calEvent.url, 'id');
          if (!actId) continue;

          // Try to match course by courseName from calendar event
          let matchedCourse = defaultCourse;
          if (calEvent.courseName) {
            const found = enrolledCourses.find(
              (c) =>
                c.name.toLowerCase().includes(calEvent.courseName!.toLowerCase()) ||
                c.short_name?.toLowerCase().includes(calEvent.courseName!.toLowerCase())
            );
            if (found) matchedCourse = found;
          }

          if (calEvent.type === 'assignment') {
            try {
              const details = await connector.getAssignmentDetails(calEvent.url);
              await Assignments.upsert({
                studentId,
                courseId: matchedCourse.id,
                lmsAssignmentId: actId,
                title: details.title || calEvent.title,
                dueDate: details.dueDate ?? calEvent.dueDate ?? undefined,
                openDate: details.openDate ?? undefined,
                submissionStatus: details.submissionStatus ?? undefined,
                attachments: details.attachments,
              });
              assignmentsFound++;
            } catch {
              // Non-fatal calendar item
            }
          } else if (calEvent.type === 'quiz') {
            try {
              const details = await connector.getQuizDetails(calEvent.url);
              await Quizzes.upsert({
                studentId,
                courseId: matchedCourse.id,
                lmsQuizId: actId,
                title: details.title || calEvent.title,
                openTime: details.openTime ?? undefined,
                closeTime: details.closeTime ?? calEvent.dueDate ?? undefined,
                status: details.status ?? undefined,
              });
              quizzesFound++;
            } catch {
              // Non-fatal calendar item
            }
          }
        }
      }

      // Log successful sync
      await ActivityLogs.create({
        studentId,
        type: 'lms_sync',
        description: `LMS sync completed: ${coursesFound} courses, ${assignmentsFound} assignments, ${quizzesFound} quizzes`,
        metadata: { coursesFound, assignmentsFound, quizzesFound, errors },
      });

      await SyncRecords.updateCompleted(syncRecord.id, {
        status: 'completed',
        coursesFound,
        assignmentsFound,
        quizzesFound,
        errors,
      });

      logger.info('Sync completed', { studentId, coursesFound, assignmentsFound, quizzesFound });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('Sync failed for student', { studentId, error: message });
      errors.push(message);

      await SyncRecords.updateCompleted(syncRecord.id, {
        status: 'failed',
        coursesFound,
        assignmentsFound,
        quizzesFound,
        errors,
      });
    } finally {
      await connector.close().catch(() => null);
    }
  }
}

export const syncJob = SyncJob.getInstance();
export default syncJob;
