import type { DocumentRow } from '../types/db';
// ============================================================
// CampusSarthi — Assignment Routes
// GET  /api/v1/assignments
// GET  /api/v1/assignments/:id
// POST /api/v1/assignments/:id/analyze
// GET  /api/v1/assignments/:id/document
// ============================================================

import { Router, Request, Response } from 'express';
import requireAuth from '../middleware/auth';
import { Assignments, Courses, Documents as DocStore, EmailLogs, ActivityLogs } from '../db/queries';
import { logger } from '../utils/logger';
import { aiRouter } from '../services/ai/router';
import { PdfExtractor } from '../services/pdf/extractor';
import { PdfGenerator } from '../services/pdf/generator';
import { LMSConnector } from '../services/lms/connector';
import { LMSSessions } from '../db/queries';
import { decrypt } from '../utils/crypto';
import path from 'path';
import fs from 'fs';
import {
  isDemoStudent,
  DEMO_ASSIGNMENTS,
  DEMO_COURSES,
  DEMO_DOCUMENTS,
} from '../services/demo/demoData';

const router = Router();

// --- GET /assignments -----------------------------------------

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = req.student!.id;
    const { status, page = 1, limit = 20 } = req.query;

    const assignments = await Assignments.findByStudentId(studentId, {
      aiStatus: status as string | undefined,
      page: Number(page),
      limit: Number(limit),
    });

    const courses = await Courses.findByStudentId(studentId);
    const courseMap = new Map(courses.map((c) => [c.id, c]));

    // If real assignments exist for this student, return them!
    if (assignments.data.length > 0) {
      res.json({
        success: true,
        data: assignments.data.map((a) => ({
          _id: a.id,
          id: a.id,
          lmsAssignmentId: a.lms_assignment_id,
          courseId: a.course_id,
          courseName: courseMap.get(a.course_id)?.name ?? 'Course',
          course: { id: a.course_id, name: courseMap.get(a.course_id)?.name ?? 'Course' },
          title: a.title,
          description: a.description,
          dueDate: a.due_date,
          openDate: a.open_date,
          maxGrade: a.max_grade,
          submissionStatus: a.submission_status,
          attachments: a.attachments ?? [],
          aiStatus: a.ai_status,
          documentId: a.document_id,
          emailSent: Boolean(a.email_sent_at),
          emailSentAt: a.email_sent_at,
          emailStatus: a.email_status,
          lastSyncedAt: a.last_synced_at,
          createdAt: a.created_at,
        })),
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: assignments.total,
          pages: Math.ceil(assignments.total / Number(limit)),
        },
      });
      return;
    }

    if (isDemoStudent(studentId)) {
      const demoCourseMap = new Map(DEMO_COURSES.map((c) => [c.id, c]));
      let filtered = [...DEMO_ASSIGNMENTS];
      if (status) {
        filtered = filtered.filter((a) => a.ai_status === status);
      }
      res.json({
        success: true,
        data: filtered.map((a) => ({
          _id: a.id,
          id: a.id,
          lmsAssignmentId: a.lms_assignment_id,
          courseId: a.course_id,
          courseName: demoCourseMap.get(a.course_id)?.name ?? 'CS301 - Design & Analysis of Algorithms',
          course: { id: a.course_id, name: demoCourseMap.get(a.course_id)?.name ?? 'CS301 - Design & Analysis of Algorithms' },
          title: a.title,
          description: a.description,
          dueDate: a.due_date,
          openDate: a.open_date,
          maxGrade: a.max_grade,
          submissionStatus: a.submission_status,
          attachments: a.attachments ?? [],
          aiStatus: a.ai_status,
          documentId: a.document_id,
          emailSent: Boolean(a.email_sent_at),
          emailSentAt: a.email_sent_at,
          emailStatus: a.email_status,
          lastSyncedAt: a.last_synced_at,
          createdAt: a.created_at,
        })),
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: filtered.length,
          pages: 1,
        },
      });
      return;
    }

    res.json({
      success: true,
      data: assignments.data.map((a) => ({
        _id: a.id,
        id: a.id,
        lmsAssignmentId: a.lms_assignment_id,
        courseId: a.course_id,
        courseName: courseMap.get(a.course_id)?.name ?? 'Unknown Course',
        course: { id: a.course_id, name: courseMap.get(a.course_id)?.name ?? 'Unknown Course' },
        title: a.title,
        description: a.description,
        dueDate: a.due_date,
        openDate: a.open_date,
        maxGrade: a.max_grade,
        submissionStatus: a.submission_status,
        attachments: a.attachments ?? [],
        aiStatus: a.ai_status,
        documentId: a.document_id,
        emailSent: Boolean(a.email_sent_at),
        emailSentAt: a.email_sent_at,
        emailStatus: a.email_status,
        lastSyncedAt: a.last_synced_at,
        createdAt: a.created_at,
      })),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: assignments.total,
        pages: Math.ceil(assignments.total / Number(limit)),
      },
    });
  } catch (err) {
    logger.error('Get assignments error', { error: String(err) });
    res.status(500).json({ error: 'Failed to retrieve assignments.' });
  }
});

// --- GET /assignments/:id -------------------------------------

router.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = req.student!.id;
    const targetId = String(req.params['id']);

    if (isDemoStudent(studentId)) {
      const demoAssign = DEMO_ASSIGNMENTS.find((a) => a.id === targetId || a.lms_assignment_id === targetId) ?? DEMO_ASSIGNMENTS[0]!;
      const demoCourse = DEMO_COURSES.find((c) => c.id === demoAssign.course_id);
      const demoDoc = DEMO_DOCUMENTS.find((d) => d.assignment_id === demoAssign.id) ?? null;

      res.json({
        success: true,
        data: {
          _id: demoAssign.id,
          id: demoAssign.id,
          lmsAssignmentId: demoAssign.lms_assignment_id,
          courseId: demoAssign.course_id,
          courseName: demoCourse?.name ?? 'CS301 - Design & Analysis of Algorithms',
          title: demoAssign.title,
          description: demoAssign.description,
          dueDate: demoAssign.due_date,
          openDate: demoAssign.open_date,
          maxGrade: demoAssign.max_grade,
          submissionStatus: demoAssign.submission_status,
          attachments: demoAssign.attachments,
          aiStatus: demoAssign.ai_status,
          aiErrorMessage: demoAssign.ai_error_message,
          aiProcessedAt: demoAssign.ai_processed_at,
          document: demoDoc
            ? {
                id: demoDoc.id,
                filename: demoDoc.filename,
                fileSizeBytes: demoDoc.file_size_bytes,
                generatedAt: demoDoc.generated_at,
              }
            : null,
          emailLogs: [
            {
              id: 'demo_email_log_01',
              status: 'sent',
              sentAt: new Date(Date.now() - 3600000).toISOString(),
              errorMessage: null,
            },
          ],
          lastSyncedAt: demoAssign.last_synced_at,
          createdAt: demoAssign.created_at,
          updatedAt: demoAssign.updated_at,
        },
      });
      return;
    }

    const assignment = await Assignments.findById(String(req.params['id']));

    if (!assignment || assignment.student_id !== studentId) {
      res.status(404).json({ error: 'Assignment not found.' });
      return;
    }

    const course = await Courses.findById(assignment.course_id);

    // Get document if any
    const documents = await DocStore.findByAssignmentId(assignment.id);
    const doc = documents[0] ?? null;

    // Get email logs
    const emailLogs = await EmailLogs.findByAssignmentId(assignment.id);

    res.json({
      success: true,
      data: {
        _id: assignment.id,
        id: assignment.id,
        lmsAssignmentId: assignment.lms_assignment_id,
        courseId: assignment.course_id,
        courseName: course?.name ?? 'Unknown Course',
        title: assignment.title,
        description: assignment.description,
        dueDate: assignment.due_date,
        openDate: assignment.open_date,
        maxGrade: assignment.max_grade,
        submissionStatus: assignment.submission_status,
        attachments: assignment.attachments,
        aiStatus: assignment.ai_status,
        aiErrorMessage: assignment.ai_error_message,
        aiProcessedAt: assignment.ai_processed_at,
        document: doc
          ? {
              id: doc.id,
              filename: doc.filename,
              fileSizeBytes: doc.file_size_bytes,
              generatedAt: doc.generated_at,
            }
          : null,
        emailLogs: emailLogs.map((l) => ({
          id: l.id,
          status: l.status,
          sentAt: l.sent_at,
          errorMessage: l.error_message,
        })),
        lastSyncedAt: assignment.last_synced_at,
        createdAt: assignment.created_at,
        updatedAt: assignment.updated_at,
      },
    });
  } catch (err) {
    logger.error('Get assignment error', { error: String(err) });
    res.status(500).json({ error: 'Failed to retrieve assignment.' });
  }
});

// --- POST /assignments/solve-all -----------------------------

router.post('/solve-all', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const studentId = req.student!.id;
  const forceAll = Boolean(req.body?.forceAll);

  if (isDemoStudent(studentId)) {
    res.json({
      success: true,
      message: 'AI solution drafting queued for all demo assignments.',
      data: { queuedCount: DEMO_ASSIGNMENTS.length },
    });
    return;
  }

  try {
    const assignmentsRes = await Assignments.findByStudentId(studentId, { limit: 100 });
    const assignments = assignmentsRes.data;

    const targets = forceAll
      ? assignments
      : assignments.filter((a) => a.ai_status !== 'completed' && a.ai_status !== 'processing');

    if (targets.length === 0) {
      res.json({
        success: true,
        message: 'All assignments already have AI solutions prepared!',
        data: { queuedCount: 0 },
      });
      return;
    }

    for (const a of targets) {
      await Assignments.updateAIStatus(a.id, 'processing');
    }

    res.json({
      success: true,
      message: `Started AI solution drafting for ${targets.length} assignment${targets.length > 1 ? 's' : ''}.`,
      data: { queuedCount: targets.length },
    });

    // Background batch processing
    (async () => {
      for (const a of targets) {
        try {
          await runAssignmentAnalysis(studentId, a);
        } catch (err) {
          logger.error('Bulk assignment solution failed', { assignmentId: a.id, error: String(err) });
          await Assignments.updateAIStatus(a.id, 'failed', String(err)).catch(() => {});
        }
      }
    })().catch(() => {});
  } catch (err) {
    logger.error('Solve all assignments error', { error: String(err) });
    res.status(500).json({ error: 'Failed to queue solutions for assignments.' });
  }
});

// --- POST /assignments/:id/analyze ---------------------------

router.post('/:id/analyze', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const studentId = req.student!.id;
  const assignmentId = String(req.params['id']);

  if (isDemoStudent(studentId)) {
    res.json({
      success: true,
      message: 'AI analysis completed for demo assignment.',
      data: { assignmentId, status: 'completed' },
    });
    return;
  }

  try {
    const assignment = await Assignments.findById(assignmentId);
    if (!assignment || assignment.student_id !== studentId) {
      res.status(404).json({ error: 'Assignment not found.' });
      return;
    }

    if (assignment.ai_status === 'processing') {
      res.status(409).json({ error: 'Analysis already in progress.' });
      return;
    }

    // Mark as processing immediately
    await Assignments.updateAIStatus(assignmentId, 'processing');

    res.json({
      success: true,
      message: 'AI analysis started. This may take a minute.',
      data: { assignmentId, status: 'processing' },
    });

    // Run analysis asynchronously
    runAssignmentAnalysis(studentId, assignment).catch((err) => {
      logger.error('Assignment analysis failed', { assignmentId, error: String(err) });
      Assignments.updateAIStatus(assignmentId, 'failed', String(err)).catch(() => {});
    });
  } catch (err) {
    logger.error('Analyze trigger error', { error: String(err) });
    res.status(500).json({ error: 'Failed to start analysis.' });
  }
});

// --- GET /assignments/:id/document ---------------------------

router.get('/:id/document', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = req.student!.id;
    const assignment = await Assignments.findById(String(req.params['id']));

    if (!assignment || assignment.student_id !== studentId) {
      res.status(404).json({ error: 'Assignment not found.' });
      return;
    }

    const docs = await DocStore.findByAssignmentId(assignment.id);
    if (docs.length === 0) {
      res.status(404).json({ error: 'No document generated yet for this assignment.' });
      return;
    }

    const doc = docs[0]!;
    res.json({
      success: true,
      data: {
        id: doc.id,
        filename: doc.filename,
        fileSizeBytes: doc.file_size_bytes,
        generatedAt: doc.generated_at,
        downloadUrl: `/api/v1/documents/${doc.id}/download`,
      },
    });
  } catch (err) {
    logger.error('Get assignment document error', { error: String(err) });
    res.status(500).json({ error: 'Failed to retrieve document.' });
  }
});

// --- POST /assignments/:id/upload-document -------------------
// Upload official assignment question PDF or DOCX directly
router.post('/:id/upload-document', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = req.student!.id;
    const assignmentId = String(req.params['id']);
    const { filename, fileBase64 } = req.body as { filename?: string; fileBase64?: string };

    if (!fileBase64 || !filename) {
      res.status(400).json({ error: 'filename and fileBase64 are required.' });
      return;
    }

    const assignment = await Assignments.findById(assignmentId);
    if (!assignment || assignment.student_id !== studentId) {
      res.status(404).json({ error: 'Assignment not found.' });
      return;
    }

    // Save uploaded file to temp directory
    const tmpDir = path.join(process.env['TEMP'] ?? '/tmp', 'campussarthi', 'uploads');
    fs.mkdirSync(tmpDir, { recursive: true });
    const cleanName = filename.replace(/[\\/:*?"<>|]/g, '_').trim();
    const destPath = path.join(tmpDir, `${Date.now()}_${cleanName}`);

    const base64Data = fileBase64.replace(/^data:[^;]+;base64,/, '');
    fs.writeFileSync(destPath, Buffer.from(base64Data, 'base64'));

    // Extract questions and text
    const extractor = new PdfExtractor();
    const doc = await extractor.extractDocumentText(destPath);
    const questions = await extractor.extractQuestions(doc.text);

    // Update assignment attachments
    const existingAtts: Array<{ url: string; filename: string; fileSize: number | null; mimeType: string | null }> =
      Array.isArray(assignment.attachments)
        ? assignment.attachments.map((a: any) => ({
            url: String(a.url || ''),
            filename: String(a.filename || ''),
            fileSize: a.fileSize ?? null,
            mimeType: a.mimeType ?? null,
          }))
        : [];

    const newAtt = {
      url: '',
      filename: cleanName,
      fileSize: fs.statSync(destPath).size,
      mimeType: cleanName.endsWith('.pdf')
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };

    const combinedAtts = [
      ...existingAtts.filter((a) => a.filename !== cleanName),
      newAtt,
    ];

    await Assignments.upsert({
      studentId,
      courseId: assignment.course_id,
      lmsAssignmentId: assignment.lms_assignment_id,
      title: assignment.title,
      description: assignment.description ?? undefined,
      dueDate: assignment.due_date ? new Date(assignment.due_date) : undefined,
      attachments: combinedAtts,
    });

    await Assignments.updateAIStatus(assignmentId, 'processing');

    res.json({
      success: true,
      message: `Uploaded ${cleanName}. Extracted ${questions.length} questions. Starting AI solution drafting.`,
      data: { assignmentId, questionsFound: questions.length },
    });

    // Run solution generation asynchronously
    runAssignmentAnalysis(studentId, assignment, [destPath]).catch((err) => {
      logger.error('Analysis of uploaded document failed', { assignmentId, error: String(err) });
      Assignments.updateAIStatus(assignmentId, 'failed', String(err)).catch(() => {});
    });
  } catch (err) {
    logger.error('Upload document error', { error: String(err) });
    res.status(500).json({ error: 'Failed to process uploaded assignment document.' });
  }
});

// --- Analysis Pipeline (async) --------------------------------

async function runAssignmentAnalysis(
  studentId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assignment: any,
  preloadedFiles: string[] = []
): Promise<void> {
  const assignmentId: string = assignment.id;
  logger.info('Starting assignment analysis', { assignmentId, title: assignment.title });

  const course = await Courses.findById(assignment.course_id);
  const courseName = course?.name ?? 'Unknown Course';

  let extractedText = '';
  const downloadedFiles: string[] = [...preloadedFiles];

  // -- Step 1: Download attachments (DOCX, PDF, etc.) -------
  const attachments: Array<{ url: string; filename: string }> =
    Array.isArray(assignment.attachments) ? assignment.attachments : [];

  if (attachments.length > 0) {
    const session = await LMSSessions.findActiveByStudentId(studentId);
    if (session) {
      const connector = new LMSConnector({ headless: true, timeout: 30000 });
      try {
        await connector.launch();
        // Restore session cookies
        const cookies = JSON.parse(decrypt(String(session['session_data_encrypted'] ?? '')));
        await connector.restoreSession(cookies);

        for (const att of attachments) {
          if (att.url) {
            try {
              const tmpDir = path.join(process.env['TEMP'] ?? '/tmp', 'campussarthi', 'downloads');
              fs.mkdirSync(tmpDir, { recursive: true });
              // Sanitize filename to avoid filesystem errors on Windows (colons, slashes)
              const safeFilename = (att.filename || 'assignment_document')
                .replace(/[\\/:*?"<>|]/g, '_')
                .replace(/\s+/g, ' ')
                .trim();
              const destPath = path.join(tmpDir, `${Date.now()}_${safeFilename}`);
              await connector.downloadFile(att.url, destPath);
              downloadedFiles.push(destPath);
            } catch (dlErr) {
              logger.warn('File download failed', { url: att.url, error: String(dlErr) });
            }
          }
        }
      } finally {
        await connector.close().catch(() => {});
      }
    }
  }

  // -- Step 2: Extract text and questions from documents -----
  const extractor = new PdfExtractor();
  const allExtractedQuestions: string[] = [];

  for (const filePath of downloadedFiles) {
    try {
      const doc = await extractor.extractDocumentText(filePath);
      if (doc.text && doc.text.trim()) {
        extractedText += `\n\n--- Content from ${path.basename(filePath)} ---\n${doc.text.trim()}`;
        const questionsInDoc = await extractor.extractQuestions(doc.text);
        for (const q of questionsInDoc) {
          if (!allExtractedQuestions.includes(q)) {
            allExtractedQuestions.push(q);
          }
        }
      } else {
        extractedText += `\n\n--- Attached Document: ${path.basename(filePath)} ---\n[Document file ${path.basename(filePath)} attached by instructor]`;
      }
    } catch (extractErr) {
      logger.warn('Document extraction failed', { filePath, error: String(extractErr) });
    }
  }

  // Also extract questions from assignment description if present
  if (assignment.description) {
    const descQuestions = await extractor.extractQuestions(assignment.description);
    for (const q of descQuestions) {
      if (!allExtractedQuestions.includes(q)) {
        allExtractedQuestions.push(q);
      }
    }
  }

  // -- Step 3: Build prompt -----------------------------------
  const assignmentContext = `
Assignment Title: ${assignment.title}
Course: ${courseName}
Due Date: ${assignment.due_date ? new Date(assignment.due_date).toLocaleDateString() : 'Not specified'}
Description: ${assignment.description ?? 'No description provided'}
${allExtractedQuestions.length > 0 ? `\nExtracted Assignment Questions (${allExtractedQuestions.length} identified):\n${allExtractedQuestions.map((q, idx) => `Q${idx + 1}: ${q}`).join('\n')}` : ''}
${extractedText ? `\nAttached Document Content:\n${extractedText}` : ''}
`.trim();

  const analysisPrompt = `You are an academic assistant helping a university student solve and understand their assignment.

ASSIGNMENT DETAILS:
${assignmentContext}

Please:
1. Address every question identified from the assignment and attached document (${allExtractedQuestions.length > 0 ? `${allExtractedQuestions.length} questions` : 'all questions found in text'}).
2. For each question, provide:
   - "question": The exact question or task statement
   - "reasoning": The governing academic principles, theory, formulas, and method of solution
   - "answer": Complete step-by-step solved derivation, calculated answers with units, and clear conclusions
3. Format your response strictly as valid JSON with this structure:
{
  "questions": [
    {
      "question": "The question text",
      "answer": "Detailed step-by-step solution",
      "reasoning": "Relevant formulas, theory, and approach"
    }
  ],
  "summary": "Brief summary of the topics covered in this assignment and key takeaways for exam review"
}

IMPORTANT: This is an academic study guide to help the student understand and verify their coursework.`;

  // -- Step 4: Call AI router --------------------------------
  interface AnalysisResult {
    questions: Array<{ question: string; answer: string; reasoning?: string }>;
    summary: string;
  }

  const analysisResult = await aiRouter.analyzeWithStructuredOutput<AnalysisResult>(
    'solution_generation',
    analysisPrompt,
    '{"questions": [{"question": "string", "answer": "string", "reasoning": "string (optional)"}], "summary": "string"}'
  );

  // -- Step 5: Generate PDF -----------------------------------
  const pdfGenerator = new PdfGenerator();
  const pdfPath = await pdfGenerator.generateSolutionPdf({
    assignmentTitle: assignment.title,
    courseName,
    studentName: 'Student',
    dueDate: assignment.due_date ? new Date(assignment.due_date) : null,
    questions: analysisResult.questions,
    aiDisclaimer:
      'AI-PREPARED DRAFT — FOR STUDENT REVIEW ONLY. Review all answers carefully before any use. Do not submit without reading and verifying.',
    generatedAt: new Date(),
  });

  // -- Step 6: Save document record --------------------------
  const stats = fs.statSync(pdfPath);
  const doc = await DocStore.create({
    studentId,
    assignmentId,
    filename: path.basename(pdfPath),
    filePath: pdfPath,
    fileSizeBytes: stats.size,
  });

  await Assignments.updatePdfDocument(assignmentId, doc.id);
  await Assignments.updateAIStatus(assignmentId, 'completed');

  await ActivityLogs.create({
    studentId,
    type: 'document_generated',
    description: `AI solution generated for: ${assignment.title}`,
    metadata: { assignmentId, documentId: doc.id, questionsCount: analysisResult.questions.length },
  });

  // -- Cleanup downloaded files -------------------------------
  for (const f of downloadedFiles) {
    fs.unlink(f, () => {});
  }

  logger.info('Assignment analysis completed', {
    assignmentId,
    documentId: doc.id,
    questionsFound: analysisResult.questions.length,
  });
}

export default router;
export { runAssignmentAnalysis };
