// ============================================================
// CampusSarthi — Assignment & Document Extraction Routes
// GET  /api/v1/assignments
// GET  /api/v1/assignments/:id
// POST /api/v1/assignments/:id/extract
// POST /api/v1/assignments/:id/generate-solution
// POST /api/v1/assignments/:id/analyze (full pipeline trigger)
// POST /api/v1/assignments/solve-all
// GET  /api/v1/assignments/:id/original-document
// GET  /api/v1/assignments/:id/document
// POST /api/v1/assignments/:id/upload-document
// ============================================================

import { Router, Request, Response } from 'express';
import requireAuth from '../middleware/auth';
import {
  Assignments,
  Courses,
  Documents as DocStore,
  EmailLogs,
} from '../db/queries';
import { logger } from '../utils/logger';
import { LMSSessionExpiredError } from '../services/lms/connector';
import {
  runAssignmentExtraction,
  runAssignmentSolutionGeneration,
  getEnrichedAssignmentState,
} from '../services/assignments/pipeline';
import { readStoredFileBuffer, sanitizeStorageSegment } from '../services/storage/documentStorage';
import { validateDocumentBuffer } from '../services/pdf/validator';
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

    const [assignments, courses] = await Promise.all([
      Assignments.findByStudentId(studentId, {
        aiStatus: status as string | undefined,
        page: Number(page),
        limit: Number(limit),
      }),
      Courses.findByStudentId(studentId),
    ]);

    const courseMap = new Map(courses.map((c) => [c.id, c]));

    if (assignments.data.length > 0) {
      const enriched = await Promise.all(
        assignments.data.map(async (a) => {
          const pipeline = await getEnrichedAssignmentState(studentId, a);
          return {
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
            aiStatus: pipeline.status,
            processingStage: pipeline.stageMessage,
            documentId: a.document_id,
            emailSent: Boolean(a.email_sent_at),
            emailSentAt: a.email_sent_at,
            emailStatus: a.email_status,
            lastSyncedAt: a.last_synced_at,
            createdAt: a.created_at,
          };
        })
      );

      res.json({
        success: true,
        data: enriched,
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
          course: {
            id: a.course_id,
            name: demoCourseMap.get(a.course_id)?.name ?? 'CS301 - Design & Analysis of Algorithms',
          },
          title: a.title,
          description: a.description,
          dueDate: a.due_date,
          openDate: a.open_date,
          maxGrade: a.max_grade,
          submissionStatus: a.submission_status,
          attachments: a.attachments ?? [],
          aiStatus: a.ai_status,
          processingStage: a.ai_status === 'completed' ? 'Demo solution ready.' : 'Ready to inspect.',
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
      data: [],
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: 0,
        pages: 0,
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
      const demoAssign =
        DEMO_ASSIGNMENTS.find((a) => a.id === targetId || a.lms_assignment_id === targetId) ??
        DEMO_ASSIGNMENTS[0]!;
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
          processingStage: demoAssign.ai_status === 'completed' ? 'Demo solution ready.' : 'Pending extraction.',
          aiErrorMessage: demoAssign.ai_error_message,
          aiProcessedAt: demoAssign.ai_processed_at,
          originalDocuments: (demoAssign.attachments || []).map((att, idx) => ({
            index: idx,
            filename: att.filename,
            originalUrl: att.url,
            format: att.filename.endsWith('.pdf') ? 'pdf' : 'docx',
            mimeType: att.mimeType || 'application/pdf',
            sizeBytes: att.fileSize || 0,
            pageCount: 2,
            downloadStatus: 'validated',
          })),
          extractedContent: demoDoc
            ? {
                status: 'extracted',
                totalPages: 2,
                charCount: 420,
                extractionConfidence: 'high',
                warnings: [],
                visualFlags: [],
                requiresVisualProcessing: false,
                detectedQuestions: [
                  {
                    id: 'q_1',
                    numberLabel: 'Q1',
                    questionText: demoAssign.description || 'Sample Demo Assignment Question',
                    subquestions: [],
                    sourcePage: 1,
                  },
                ],
                extractedAt: demoDoc.generated_at,
              }
            : null,
          document: demoDoc
            ? {
                id: demoDoc.id,
                filename: demoDoc.filename,
                fileSizeBytes: demoDoc.file_size_bytes,
                generatedAt: demoDoc.generated_at,
                downloadUrl: `/api/v1/documents/${demoDoc.id}/download`,
                previewUrl: `/api/v1/documents/${demoDoc.id}/preview`,
              }
            : null,
          documentId: demoDoc?.id ?? null,
          emailLogs: [],
          lastSyncedAt: demoAssign.last_synced_at,
          createdAt: demoAssign.created_at,
          updatedAt: demoAssign.updated_at,
        },
      });
      return;
    }

    const assignment = await Assignments.findById(targetId);
    if (!assignment) {
      res.status(404).json({ error: 'Assignment not found.' });
      return;
    }
    if (assignment.student_id !== studentId) {
      res.status(403).json({ error: 'Forbidden: assignment belongs to another student.' });
      return;
    }

    const [course, documents, emailLogs, pipeline] = await Promise.all([
      Courses.findById(assignment.course_id),
      DocStore.findByAssignmentId(assignment.id),
      EmailLogs.findByAssignmentId(assignment.id),
      getEnrichedAssignmentState(studentId, assignment),
    ]);

    const doc = documents[0] ?? null;

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
        aiStatus: pipeline.status,
        processingStage: pipeline.stageMessage,
        requiresReauth: pipeline.requiresReauth,
        aiErrorMessage: assignment.ai_error_message,
        errorMessage: assignment.ai_error_message,
        aiProcessedAt: assignment.ai_processed_at,
        originalDocuments: pipeline.originalDocuments,
        extractedContent: pipeline.extraction
          ? {
              status: pipeline.extraction.status,
              documentTitle: pipeline.extraction.documentTitle,
              totalPages: pipeline.extraction.totalPages,
              charCount: pipeline.extraction.charCount,
              extractionConfidence: pipeline.extraction.extractionConfidence,
              warnings: pipeline.extraction.warnings,
              visualFlags: pipeline.extraction.visualFlags,
              requiresVisualProcessing: pipeline.extraction.requiresVisualProcessing,
              instructions: pipeline.extraction.instructions,
              rawTextPreview: pipeline.extraction.rawTextPreview,
              detectedQuestions: pipeline.extraction.detectedQuestions,
              extractedAt: pipeline.extraction.extractedAt,
              error: pipeline.extraction.error,
            }
          : null,
        questionsExtracted: pipeline.extraction?.detectedQuestions.map(
          (q) => `${q.numberLabel}: ${q.questionText}`
        ),
        solutionMeta: pipeline.solution,
        documentId: doc?.id ?? assignment.document_id,
        document: doc
          ? {
              id: doc.id,
              filename: doc.filename,
              fileSizeBytes: doc.file_size_bytes,
              generatedAt: doc.generated_at,
              downloadUrl: `/api/v1/documents/${doc.id}/download`,
              previewUrl: `/api/v1/documents/${doc.id}/preview`,
            }
          : null,
        emailSent: Boolean(assignment.email_sent_at && assignment.email_status === 'sent'),
        emailSentAt: assignment.email_sent_at,
        emailStatus: assignment.email_status,
        emailLogs: emailLogs.map((l) => ({
          id: l.id,
          status: l.status,
          sentAt: l.sent_at,
          messageId: l.message_id,
          errorMessage: l.error_message,
          createdAt: l.created_at,
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

// --- POST /assignments/:id/extract ----------------------------
// Phase 1 only: Download -> Validate -> Store Original -> Extract Questions

router.post('/:id/extract', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const studentId = req.student!.id;
  const assignmentId = String(req.params['id']);
  const force = Boolean(req.body?.force);

  if (isDemoStudent(studentId)) {
    res.json({
      success: true,
      message: 'Demo extraction ready.',
      data: { assignmentId, status: 'extracted' },
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

    const state = await runAssignmentExtraction(studentId, assignment, { force });
    res.json({
      success: true,
      message: state.stageMessage,
      data: {
        assignmentId,
        status: state.status,
        originalDocuments: state.originalDocuments,
        extraction: state.extraction,
      },
    });
  } catch (err) {
    if (err instanceof LMSSessionExpiredError) {
      res.status(401).json({
        success: false,
        requiresReauth: true,
        error: err.message,
      });
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Assignment extraction error', { assignmentId, error: msg });
    res.status(422).json({ success: false, error: msg });
  }
});

// --- POST /assignments/:id/generate-solution ------------------
// Phase 2: Generate verified solutions + A4 PDF (runs extraction first if needed)

router.post('/:id/generate-solution', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const studentId = req.student!.id;
  const assignmentId = String(req.params['id']);
  const forceExtract = Boolean(req.body?.forceExtract);

  if (isDemoStudent(studentId)) {
    res.json({
      success: true,
      message: 'Demo assignment solution completed.',
      data: { assignmentId, status: 'completed' },
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

    await Assignments.updateAIStatus(assignmentId, 'generating_solution', null, 'Starting verified solution pipeline…');

    res.status(202).json({
      success: true,
      message: 'Solution generation started. Status will update automatically as stages complete.',
      data: { assignmentId, status: 'generating_solution' },
    });

    runAssignmentSolutionGeneration(studentId, assignment, { forceExtract }).catch((err) => {
      logger.error('Async solution generation failed', {
        assignmentId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  } catch (err) {
    logger.error('Generate solution trigger error', { error: String(err) });
    res.status(500).json({ error: 'Failed to start solution generation.' });
  }
});

// --- POST /assignments/solve-all ------------------------------

router.post('/solve-all', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const studentId = req.student!.id;
  const forceAll = Boolean(req.body?.forceAll);

  if (isDemoStudent(studentId)) {
    res.json({
      success: true,
      message: 'AI solution drafting queued for demo assignments.',
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
      await Assignments.updateAIStatus(a.id, 'discovering_attachments', null, 'Queued for processing…');
    }

    res.json({
      success: true,
      message: `Started extraction & AI solution drafting for ${targets.length} assignment${targets.length > 1 ? 's' : ''}.`,
      data: { queuedCount: targets.length },
    });

    (async () => {
      for (const a of targets) {
        try {
          await runAssignmentSolutionGeneration(studentId, a);
        } catch (err) {
          logger.error('Bulk assignment solution failed', { assignmentId: a.id, error: String(err) });
        }
      }
    })().catch(() => {});
  } catch (err) {
    logger.error('Solve all assignments error', { error: String(err) });
    res.status(500).json({ error: 'Failed to queue solutions for assignments.' });
  }
});

// --- POST /assignments/:id/analyze ----------------------------
// Full end-to-end trigger (Extraction + Solution + PDF)

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
    if (!assignment) {
      res.status(404).json({ error: 'Assignment not found.' });
      return;
    }
    if (assignment.student_id !== studentId) {
      res.status(403).json({ error: 'Forbidden.' });
      return;
    }

    await Assignments.updateAIStatus(
      assignmentId,
      'discovering_attachments',
      null,
      'Starting document discovery & extraction…'
    );

    res.json({
      success: true,
      message: 'Assignment document extraction and solution generation started.',
      data: { assignmentId, status: 'discovering_attachments' },
    });

    runAssignmentSolutionGeneration(studentId, assignment).catch((err) => {
      logger.error('Assignment analyze pipeline failed', {
        assignmentId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  } catch (err) {
    logger.error('Analyze trigger error', { error: String(err) });
    res.status(500).json({ error: 'Failed to start analysis.' });
  }
});

// --- GET /assignments/:id/original-document -------------------
// Stream or download the persisted original LMS attachment

router.get('/:id/original-document', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = req.student!.id;
    const assignmentId = String(req.params['id']);
    const index = Number(req.query['index'] ?? 0);
    const asAttachment = req.query['download'] === '1' || req.query['download'] === 'true';

    const assignment = await Assignments.findById(assignmentId);
    if (!assignment) {
      res.status(404).json({ error: 'Assignment not found.' });
      return;
    }
    if (assignment.student_id !== studentId) {
      res.status(403).json({ error: 'Forbidden.' });
      return;
    }

    const enriched = await getEnrichedAssignmentState(studentId, assignment);
    const target =
      enriched.originalDocuments.find((d) => d.index === index && d.downloadStatus === 'validated') ??
      enriched.originalDocuments.find((d) => d.downloadStatus === 'validated');

    if (!target) {
      res.status(404).json({
        error: 'No downloaded original document found yet. Run Document Extraction first.',
      });
      return;
    }

    const buffer = await readStoredFileBuffer(target.localPath, target.storageKey);
    if (!buffer || buffer.length === 0) {
      res.status(410).json({
        error: 'Original document is missing from persistent storage. Re-run extraction to download it from LMS.',
      });
      return;
    }

    const safeName = sanitizeStorageSegment(target.filename);
    const disposition = asAttachment ? 'attachment' : 'inline';
    res.setHeader('Content-Type', target.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `${disposition}; filename="${safeName}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) {
    logger.error('Get original document error', { error: String(err) });
    res.status(500).json({ error: 'Failed to stream original document.' });
  }
});

// --- GET /assignments/:id/document ----------------------------

router.get('/:id/document', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = req.student!.id;
    const assignment = await Assignments.findById(String(req.params['id']));

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
        previewUrl: `/api/v1/documents/${doc.id}/preview`,
      },
    });
  } catch (err) {
    logger.error('Get assignment document error', { error: String(err) });
    res.status(500).json({ error: 'Failed to retrieve document.' });
  }
});

// --- POST /assignments/:id/upload-document --------------------

router.post('/:id/upload-document', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = req.student!.id;
    const assignmentId = String(req.params['id']);
    const { filename, fileBase64, autoGenerate } = req.body as {
      filename?: string;
      fileBase64?: string;
      autoGenerate?: boolean;
    };

    if (!fileBase64 || !filename) {
      res.status(400).json({ error: 'filename and fileBase64 are required.' });
      return;
    }

    const assignment = await Assignments.findById(assignmentId);
    if (!assignment) {
      res.status(404).json({ error: 'Assignment not found.' });
      return;
    }
    if (assignment.student_id !== studentId) {
      res.status(403).json({ error: 'Forbidden.' });
      return;
    }

    const cleanName = sanitizeStorageSegment(filename);
    const base64Data = fileBase64.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const validation = await validateDocumentBuffer(buffer, cleanName);
    if (!validation.valid || validation.format === 'unsupported') {
      res.status(422).json({
        success: false,
        error: validation.error || 'Invalid document file format.',
      });
      return;
    }

    const extractedState = await runAssignmentExtraction(studentId, assignment, {
      preloadedFiles: [{ filename: cleanName, buffer, mimeType: validation.mimeType }],
    });

    if (autoGenerate) {
      runAssignmentSolutionGeneration(studentId, assignment).catch((err) => {
        logger.error('Solution generation after upload failed', { assignmentId, error: String(err) });
      });
    }

    res.json({
      success: true,
      message: `Validated and extracted ${extractedState.extraction?.detectedQuestions.length ?? 0} question(s) from ${cleanName}.`,
      data: {
        assignmentId,
        status: extractedState.status,
        questionsFound: extractedState.extraction?.detectedQuestions.length ?? 0,
        extraction: extractedState.extraction,
        originalDocuments: extractedState.originalDocuments,
      },
    });
  } catch (err) {
    logger.error('Upload document error', { error: String(err) });
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to process uploaded assignment document.',
    });
  }
});

export default router;
