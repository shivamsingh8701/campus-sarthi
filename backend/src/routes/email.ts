import type { DocumentRow } from '../types/db';
// ============================================================
// CampusSarthi — Email Routes
// POST /api/v1/email/send/:assignmentId
// POST /api/v1/email/test
// GET  /api/v1/email/logs
// ============================================================

import { Router, Request, Response } from 'express';
import requireAuth from '../middleware/auth';
import { Assignments, Documents as DocStore, Courses, EmailLogs, Students, ActivityLogs } from '../db/queries';
import { EmailSender } from '../services/email/sender';
import { logger } from '../utils/logger';
import config from '../config';
import fs from 'fs';
import { isDemoStudent, DEMO_EMAIL } from '../services/demo/demoData';

const router = Router();

// Test email endpoint — requires authenticated session so we know who to send to
router.post('/test', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    // Use provided email or fall back to the logged-in student's email
    const to = (req.body?.to as string)?.trim();
    if (!to) {
      res.status(400).json({ success: false, error: 'Target email address is required.' });
      return;
    }
    const sender = new EmailSender();
    const result = await sender.sendNotificationEmail(
      to,
      'CampusPilot AI — Integration Test Successful',
      'This email confirms that the CampusPilot AI email delivery system is fully operational.',
      `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #ffffff;">
        <div style="border-bottom: 2px solid #4f46e5; padding-bottom: 16px; margin-bottom: 20px;">
          <h1 style="color: #4f46e5; font-size: 24px; margin: 0;">CampusPilot AI</h1>
          <p style="color: #6b7280; font-size: 13px; margin: 4px 0 0 0;">Intelligent Student LMS Assistant</p>
        </div>
        <h2 style="color: #111827; font-size: 18px; margin-top: 0;">Email Delivery System Verified</h2>
        <p style="color: #374151; font-size: 15px; line-height: 1.6;">Hello,</p>
        <p style="color: #374151; font-size: 15px; line-height: 1.6;">
          This test email confirms that the <strong>CampusPilot AI email integration</strong> is fully active and functioning properly.
        </p>
        <div style="background-color: #f3f4f6; border-left: 4px solid #10b981; padding: 12px 16px; border-radius: 4px; margin: 20px 0;">
          <p style="margin: 0; color: #065f46; font-size: 14px; font-weight: bold;">Status: Active & Verified</p>
          <p style="margin: 4px 0 0 0; color: #047857; font-size: 13px;">Target: ${to}</p>
        </div>
        <p style="color: #374151; font-size: 14px; line-height: 1.6;">
          Real assignment solutions, deadline alerts, and verification codes can now be dispatched securely to student inboxes.
        </p>
      </div>`
    );
    res.json({
      success: true,
      message: `Test email successfully dispatched to ${to}`,
      data: { messageId: result.messageId, sentTo: to },
    });
  } catch (err) {
    logger.error('Test email failed', { error: String(err) });
    res.status(500).json({ success: false, error: `Email test failed: ${String(err)}` });
  }
});

router.post('/send/:assignmentId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const studentId = req.student!.id;
  const assignmentId = String(req.params['assignmentId']);

  if (isDemoStudent(studentId)) {
    res.json({
      success: true,
      message: `Solution document prepared and dispatched to ${DEMO_EMAIL} (Demo Mode).`,
      data: { messageId: 'demo_email_dispatch_01', sentTo: DEMO_EMAIL },
    });
    return;
  }

  try {
    const assignment = await Assignments.findById(assignmentId!);
    if (!assignment || assignment.student_id !== studentId) {
      res.status(404).json({ error: 'Assignment not found.' });
      return;
    }

    if (assignment.ai_status !== 'completed') {
      res.status(400).json({ error: 'Assignment analysis not yet complete. Run AI analysis first.' });
      return;
    }

    const docs = await DocStore.findByAssignmentId(assignment.id);
    if (docs.length === 0 || !fs.existsSync(docs[0]!.file_path)) {
      res.status(400).json({ error: 'No generated document found for this assignment.' });
      return;
    }

    const student = await Students.findById(studentId);
    if (!student) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }

    const course = await Courses.findById(assignment.course_id);
    const doc = docs[0]!;

    // Create email log entry (pending)
    const emailLog = await EmailLogs.create({
      studentId,
      assignmentId: assignment.id,
      recipientEmail: student.email,
      subject: `CampusSarthi: AI Solution for "${assignment.title}"`,
      status: 'pending',
    });

    // Build a brief summary from assignment description
    const summary = assignment.description
      ? assignment.description.slice(0, 300) + (assignment.description.length > 300 ? '...' : '')
      : 'AI-prepared solution draft for your review.';

    try {
      const sender = new EmailSender();
      const result = await sender.sendAssignmentSolution({
        to: student.email,
        studentName: student.full_name ?? student.email,
        assignmentTitle: assignment.title,
        courseName: course?.name ?? 'Unknown Course',
        dueDate: assignment.due_date ? new Date(assignment.due_date) : null,
        summary,
        pdfPath: doc.file_path,
        dashboardUrl: `${config.frontendUrl}/dashboard/assignments/${assignment.id}`,
      });

      // Update log with success
      await EmailLogs.updateStatus(emailLog.id, 'sent', result.messageId);
      await Assignments.updateEmailSent(assignment.id, 'sent');

      await ActivityLogs.create({
        studentId,
        type: 'email_sent',
        description: `Solution emailed for: ${assignment.title}`,
        metadata: { assignmentId: assignment.id, messageId: result.messageId },
      });

      logger.info('Email sent successfully', { studentId, assignmentId, messageId: result.messageId });

      res.json({
        success: true,
        message: `Solution sent to ${student.email}`,
        data: { messageId: result.messageId, sentTo: student.email },
      });
    } catch (emailErr) {
      const errMsg = String(emailErr);
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
