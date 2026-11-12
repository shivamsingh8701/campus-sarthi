// ============================================================
// CampusSarthi — Document Routes
// GET  /api/v1/documents
// GET  /api/v1/documents/:id
// GET  /api/v1/documents/:id/download  (attachment stream)
// GET  /api/v1/documents/:id/preview   (inline PDF stream)
// ============================================================

import { Router, Request, Response } from 'express';
import requireAuth from '../middleware/auth';
import { Documents as DocStore, Assignments } from '../db/queries';
import { logger } from '../utils/logger';
import path from 'path';
import { isDemoStudent, DEMO_DOCUMENTS, DEMO_ASSIGNMENTS, DEMO_COURSES } from '../services/demo/demoData';
import { readStoredFileBuffer, sanitizeStorageSegment } from '../services/storage/documentStorage';
import { PdfGenerator } from '../services/pdf/generator';

const router = Router();

function inferSolutionStorageKey(doc: {
  student_id: string;
  assignment_id: string | null;
  file_path: string;
  storage_key?: string | null;
}): string | null {
  if (doc.storage_key) return doc.storage_key;
  if (doc.assignment_id && doc.file_path) {
    return `solutions/${doc.student_id}/${doc.assignment_id}/${path.basename(doc.file_path)}`;
  }
  return null;
}

async function resolveDemoPdfBuffer(targetId: string): Promise<{ buffer: Buffer; filename: string } | null> {
  const demoDoc = DEMO_DOCUMENTS.find((d) => d.id === targetId || d.assignment_id === targetId);
  if (!demoDoc) return null;

  const demoAssign = DEMO_ASSIGNMENTS.find((a) => a.id === demoDoc.assignment_id);
  const demoCourse = DEMO_COURSES.find((c) => c.id === demoAssign?.course_id);

  const generator = new PdfGenerator();
  return generator.generateSolutionPdfBuffer({
    assignmentTitle: demoAssign?.title ?? 'Sample Demo Assignment',
    courseName: demoCourse?.name ?? 'CS301 — Design & Analysis of Algorithms',
    studentName: 'Demo Student',
    dueDate: demoAssign?.due_date ? new Date(demoAssign.due_date) : null,
    summary: 'Demo study guide showcasing CampusSarthi A4 formatted PDF output.',
    questions: [
      {
        numberLabel: 'Q1',
        sourcePage: 1,
        question: demoAssign?.description || 'Explain the core problem formulation for this demo assignment.',
        reasoning: 'Demo Mode renders a structured sample PDF without university LMS credentials.',
        answer: 'Step 1: Connect a real Galgotias LMS account to download authentic assignment PDFs/DOCXs and generate real solutions.',
      },
    ],
    aiDisclaimer: 'AI-prepared academic draft. Please review and verify before academic submission.',
    generatedAt: new Date(demoDoc.generated_at),
  });
}

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = req.student!.id;
    const { page = 1, limit = 20 } = req.query;

    if (isDemoStudent(studentId)) {
      res.json({
        success: true,
        data: DEMO_DOCUMENTS.map((d) => ({
          _id: d.id,
          id: d.id,
          assignmentId: d.assignment_id,
          filename: d.filename,
          fileSize: d.file_size_bytes,
          fileSizeBytes: d.file_size_bytes,
          generatedAt: d.generated_at,
          downloadUrl: `/api/v1/documents/${d.id}/download`,
          previewUrl: `/api/v1/documents/${d.id}/preview`,
        })),
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: DEMO_DOCUMENTS.length,
          pages: 1,
        },
      });
      return;
    }

    const [docs, assignmentsRes] = await Promise.all([
      DocStore.findByStudentId(studentId, { page: Number(page), limit: Number(limit) }),
      Assignments.findByStudentId(studentId, { limit: 200 }),
    ]);

    const assignmentMap = new Map(assignmentsRes.data.map((a) => [a.id, a]));

    res.json({
      success: true,
      data: docs.data.map((d) => {
        const assign = d.assignment_id ? assignmentMap.get(d.assignment_id) : undefined;
        return {
          _id: d.id,
          id: d.id,
          assignmentId: d.assignment_id,
          assignment: assign ? { id: assign.id, title: assign.title } : undefined,
          filename: d.filename,
          fileSize: d.file_size_bytes,
          fileSizeBytes: d.file_size_bytes,
          generatedAt: d.generated_at,
          downloadUrl: `/api/v1/documents/${d.id}/download`,
          previewUrl: `/api/v1/documents/${d.id}/preview`,
        };
      }),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: docs.total,
        pages: Math.ceil(docs.total / Number(limit)),
      },
    });
  } catch (err) {
    logger.error('Get documents error', { error: String(err) });
    res.status(500).json({ error: 'Failed to retrieve documents.' });
  }
});

router.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = req.student!.id;
    const targetId = String(req.params['id']);

    if (isDemoStudent(studentId)) {
      const demoDoc =
        DEMO_DOCUMENTS.find((d) => d.id === targetId || d.assignment_id === targetId) ??
        DEMO_DOCUMENTS[0]!;
      res.json({
        success: true,
        data: {
          _id: demoDoc.id,
          id: demoDoc.id,
          assignmentId: demoDoc.assignment_id,
          filename: demoDoc.filename,
          fileSizeBytes: demoDoc.file_size_bytes,
          generatedAt: demoDoc.generated_at,
          downloadUrl: `/api/v1/documents/${demoDoc.id}/download`,
          previewUrl: `/api/v1/documents/${demoDoc.id}/preview`,
        },
      });
      return;
    }

    const doc = await DocStore.findById(targetId);
    if (!doc) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }
    if (doc.student_id !== studentId) {
      res.status(403).json({ error: 'You do not have permission to access this document.' });
      return;
    }

    res.json({
      success: true,
      data: {
        id: doc.id,
        assignmentId: doc.assignment_id,
        filename: doc.filename,
        fileSizeBytes: doc.file_size_bytes,
        generatedAt: doc.generated_at,
        downloadUrl: `/api/v1/documents/${doc.id}/download`,
        previewUrl: `/api/v1/documents/${doc.id}/preview`,
      },
    });
  } catch (err) {
    logger.error('Get document error', { error: String(err) });
    res.status(500).json({ error: 'Failed to retrieve document.' });
  }
});

async function streamDocument(
  req: Request,
  res: Response,
  disposition: 'attachment' | 'inline'
): Promise<void> {
  try {
    const studentId = req.student!.id;
    const targetId = String(req.params['id']);

    if (isDemoStudent(studentId)) {
      const demo = await resolveDemoPdfBuffer(targetId);
      if (!demo) {
        res.status(404).json({ error: 'Demo document not found.' });
        return;
      }
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `${disposition}; filename="${demo.filename}"`);
      res.setHeader('Content-Length', demo.buffer.length);
      res.send(demo.buffer);
      return;
    }

    const doc = await DocStore.findById(targetId);
    if (!doc) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }
    if (doc.student_id !== studentId) {
      res.status(403).json({ error: 'Forbidden: document belongs to another student.' });
      return;
    }

    const storageKey = inferSolutionStorageKey(doc);
    const buffer = await readStoredFileBuffer(doc.file_path, storageKey);
    if (!buffer || buffer.length === 0) {
      res.status(410).json({
        error: 'Solution PDF file is missing from persistent storage. Regenerate the solution to recreate it.',
      });
      return;
    }

    const safeFilename = sanitizeStorageSegment(path.basename(doc.filename));
    res.setHeader('Content-Type', doc.mime_type || 'application/pdf');
    res.setHeader('Content-Disposition', `${disposition}; filename="${safeFilename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(buffer);
  } catch (err) {
    logger.error('Stream document error', { disposition, error: String(err) });
    res.status(500).json({ error: 'Failed to stream document.' });
  }
}

router.get('/:id/download', requireAuth, (req: Request, res: Response) =>
  streamDocument(req, res, 'attachment')
);

router.get('/:id/preview', requireAuth, (req: Request, res: Response) =>
  streamDocument(req, res, 'inline')
);

export default router;
