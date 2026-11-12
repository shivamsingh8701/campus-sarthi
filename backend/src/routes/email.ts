// ============================================================
// CampusSarthi — Email Routes
// POST /api/v1/email/send/:assignmentId
// GET  /api/v1/email/preview/:assignmentId
// POST /api/v1/email/test
// GET  /api/v1/email/logs
// ============================================================

import { Router, Request, Response } from 'express';
import path from 'path';
import requireAuth from '../middleware/auth';
import {
  Assignments,
  Documents as DocStore,
  Courses,
  EmailLogs,
  Students,
  ActivityLogs,
} from '../db/queries';
import { EmailSender } from '../services/email/sender';
import { logger } from '../utils/logger';
import config from '../config';
import { isDemoStudent, DEMO_EMAIL } from '../services/demo/demoData';
import { loadPipelineState, readStoredFileBuffer } from '../services/storage/documentStorage';

const router = Router();

// Test email endpoint — requires authenticated session
router.post('/test', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const to = (req.body?.to as string)?.trim() || req.student?.email;
    if (!to) {
      res.status(400).json({ success: false, error: 'Target email address is required.' });
      return;
    }
    const sender = new EmailSender();
    const result = await sender.sendNotificationEmail(
      to,
      'CampusSarthi — Email Integration Verification',
      'This email confirms that your CampusSarthi email delivery system is operational.',
      `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #ffffff;">
        <h2 style="color: #1e3a8a; margin-top: 0;">CampusSarthi Email Verified</h2>
        <p style="color: #374151; font-size: 14px;">This verifies email delivery for <strong>${to}</strong>.</p>
      </div>`
    );
    res.json({
      success: true,
      message: `Test email accepted by mail provider for ${to}`,
      data: { messageId: result.messageId, sentTo: to },
    });
  } catch (err) {
    logger.error('Test email failed', { error: String(err) });
    res.status(502).json({
      success: false,
      error: `Email delivery test failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

// Email preview endpoint before dispatch
router.get('/preview/:assignmentId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const studentId = req.student!.id;
  const assignmentId = String(req.params['assignmentId']);

  if (isDemoStudent(studentId)) {
    res.json({
      success: true,
      data: {
        to: DEMO_EMAIL,
        subject: 'Your Assignment Solution Is Ready — Demo Assignment',
        courseName: 'CS301 - Design & Analysis of Algorithms',
        attachmentFilename: 'CampusSarthi_Demo_Solution.pdf',
        dashboardUrl: `${config.frontendUrl}/dashboard/assignments/${assignmentId}`,
        alreadySent: false,
      },
    });
    return;
  }

  try {
    const assignment = await Assignments.findById(assignmentId);
    if (!assignment) {
      res.status(404).json({ error: 'Assignment not found.' });
      return;
    }
    if (assignment.student_id !== studentId) {
      res.status(403).json({ error: 'Forbidden.' });
      return;
    }

    const [student, course, docs, logs, state] = await Promise.all([
      Students.findById(studentId),
      Courses.findById(assignment.course_id),
      DocStore.findByAssignmentId(assignment.id),
      EmailLogs.findByAssignmentId(assignment.id),
      loadPipelineState(studentId, assignment.id),
    ]);

    const doc = docs[0] ?? null;
    const lastSentForCurrentDoc = doc
      ? logs.find(
          (l) =>
            l.status === 'sent' &&
            l.sent_at &&
            new Date(l.sent_at).getTime() >= new Date(doc.generated_at).getTime()
        )
      : null;

    res.json({
      success: true,
      data: {
        to: student?.email ?? req.student!.email,
        subject: `Your Assignment Solution Is Ready — ${assignment.title}`,
        courseName: course?.name ?? 'Unknown Course',
        assignmentTitle: assignment.title,
        dueDate: assignment.due_date,
        summary:
          state?.solution?.summary ||
          (assignment.description ? assignment.description.slice(0, 300) : 'AI-prepared academic study draft.'),
        attachmentFilename: doc?.filename ?? null,
        attachmentSizeBytes: doc?.file_size_bytes ?? null,
        dashboardUrl: `${config.frontendUrl}/dashboard/assignments/${assignment.id}`,
        alreadySent: Boolean(lastSentForCurrentDoc),
        lastSentAt: lastSentForCurrentDoc?.sent_at ?? assignment.email_sent_at,
      },
    });
  } catch (err) {
    logger.error('Email preview error', { error: String(err) });
    res.status(500).json({ error: 'Failed to prepare email preview.' });
  }
});

router.post('/send/:assignmentId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const studentId = req.student!.id;
  const assignmentId = String(req.params['assignmentId']);
  const forceResend = Boolean(req.body?.force);

  if (isDemoStudent(studentId)) {
    res.json({
      success: true,
      message: `Demo preview complete (no external SMTP mail sent in Demo Mode to ${DEMO_EMAIL}).`,
      data: { messageId: 'demo_preview_only', sentTo: DEMO_EMAIL },
    });
    return;
  }

  try {
    const assignment = await Assignments.findById(assignmentId);
    if (!assignment) {
      res.status(404).json({ error: 'Assignment not found.' });
      return;
    }
    if (assignment.student_id !== studentId) {
      res.status(403).json({ error: 'Forbidden.' });
      return;
    }

    const docs = await DocStore.findByAssignmentId(assignment.id);
    if (docs.length === 0) {
      res.status(400).json({
        error: 'No generated solution PDF exists for this assignment yet. Generate the solution first.',
      });
      return;
    }

    const doc = docs[0]!;
    const storageKey =
      doc.storage_key || `solutions/${doc.student_id}/${doc.assignment_id}/${path.basename(doc.file_path)}`;
    const pdfBuffer = await readStoredFileBuffer(doc.file_path, storageKey);
    if (!pdfBuffer || pdfBuffer.length === 0) {
      res.status(410).json({
        error: 'Generated PDF could not be located in storage. Regenerate the solution PDF before emailing.',
      });
      return;
    }

    // Prevent duplicate delivery for the exact same generated PDF unless explicitly requested
    const existingLogs = await EmailLogs.findByAssignmentId(assignment.id);
    const alreadySentForCurrent = existingLogs.find(
      (l) =>
        l.status === 'sent' &&
        l.sent_at &&
        new Date(l.sent_at).getTime() >= new Date(doc.generated_at).getTime()
    );
    if (alreadySentForCurrent && !forceResend) {
      res.status(409).json({
        error: `Solution was already delivered to ${alreadySentForCurrent.recipient_email} on ${new Date(
          alreadySentForCurrent.sent_at!
        ).toLocaleString()}. Pass force: true to resend.`,
        alreadySent: true,
        messageId: alreadySentForCurrent.message_id,
      });
      return;
    }

    const [student, course, state] = await Promise.all([
      Students.findById(studentId),
      Courses.findById(assignment.course_id),
      loadPipelineState(studentId, assignment.id),
    ]);
    if (!student) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }

    const subject = `Your Assignment Solution Is Ready — ${assignment.title}`;
    const emailLog = await EmailLogs.create({
      studentId,
      assignmentId: assignment.id,
      recipientEmail: student.email,
      subject,
      status: 'pending',
    });

    const summary =
      state?.solution?.summary ||
      (assignment.description
        ? assignment.description.slice(0, 300) + (assignment.description.length > 300 ? '...' : '')
        : 'AI-prepared academic study draft for your review.');

    try {
      const sender = new EmailSender();
      const result = await sender.sendAssignmentSolution({
        to: student.email,
        studentName: student.full_name ?? student.admission_number ?? student.email,
        assignmentTitle: assignment.title,
        courseName: course?.name ?? 'Unknown Course',
        dueDate: assignment.due_date ? new Date(assignment.due_date) : null,
        summary,
        pdfPath: doc.file_path,
        pdfBuffer,
        pdfFilename: doc.filename,
        dashboardUrl: `${config.frontendUrl}/dashboard/assignments/${assignment.id}`,
      });

      // Only mark SENT after verified provider acceptance + non-empty messageId
      await EmailLogs.updateStatus(emailLog.id, 'sent', result.messageId);
      await Assignments.updateEmailSent(assignment.id, 'sent');

      await ActivityLogs.create({
        studentId,
        type: 'email_sent',
        description: `Solution emailed for: ${assignment.title}`,
        metadata: { assignmentId: assignment.id, messageId: result.messageId },
      });

      logger.info('Email sent successfully', {
        studentId,
        assignmentId,
        messageId: result.messageId,
      });

      res.json({
        success: true,
        message: `Solution PDF delivered to ${student.email}`,
        data: { messageId: result.messageId, sentTo: student.email, subject },
      });
    } catch (emailErr) {
      const errMsg = emailErr instanceof Error ? emailErr.message : String(emailErr);
      await EmailLogs.updateStatus(emailLog.id, 'failed', undefined, errMsg);
      await Assignments.updateEmailSent(assignment.id, 'failed');

      await ActivityLogs.create({
        studentId,
        type: 'email_failed',
        description: `Email delivery failed for: ${assignment.title}`,
        metadata: { error: errMsg },
      });

      logger.error('Email delivery failed', { studentId, assignmentId, error: errMsg });
      res.status(502).json({ error: `Email delivery failed: ${errMsg}` });
    }
  } catch (err) {
    logger.error('Send email error', { error: String(err) });
    res.status(500).json({ error: 'Failed to send email.' });
  }
});

router.get('/logs', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = req.student!.id;
    const { page = 1, limit = 20 } = req.query;

    const logs = await EmailLogs.findByStudentId(studentId, {
      page: Number(page),
      limit: Number(limit),
    });

    res.json({
      success: true,
      data: logs.data.map((l) => ({
        id: l.id,
        assignmentId: l.assignment_id,
        recipientEmail: l.recipient_email,
        subject: l.subject,
        status: l.status,
        sentAt: l.sent_at,
        errorMessage: l.error_message,
        messageId: l.message_id,
        createdAt: l.created_at,
      })),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: logs.total,
        pages: Math.ceil(logs.total / Number(limit)),
      },
    });
  } catch (err) {
    logger.error('Get email logs error', { error: String(err) });
    res.status(500).json({ error: 'Failed to retrieve email logs.' });
  }
});

export default router;
