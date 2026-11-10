// ============================================================
// CampusSarthi — Document Routes
// GET  /api/v1/documents
// GET  /api/v1/documents/:id
// GET  /api/v1/documents/:id/download  (stream PDF)
// ============================================================

import { Router, Request, Response } from 'express';
import requireAuth from '../middleware/auth';
import { Documents as DocStore } from '../db/queries';
import { logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';
import { isDemoStudent, DEMO_DOCUMENTS } from '../services/demo/demoData';

const router = Router();

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

    const docs = await DocStore.findByStudentId(studentId, {
      page: Number(page),
      limit: Number(limit),
    });

    res.json({
      success: true,
      data: docs.data.map((d) => ({
        _id: d.id,
        id: d.id,
        assignmentId: d.assignment_id,
        filename: d.filename,
        fileSize: d.file_size_bytes,
        fileSizeBytes: d.file_size_bytes,
        generatedAt: d.generated_at,
        downloadUrl: `/api/v1/documents/${d.id}/download`,
      })),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: docs.total,
        pages: Math.ceil(docs.total / Number(limit)),
      },
    });
  } catch (err) {
    logger.error('Get documents error', { error: String(err) });
    res.status(500).json({ error: 'Failed to retrieve DocStore.' });
  }
});

router.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = req.student!.id;
    const targetId = String(req.params['id']);

    if (isDemoStudent(studentId)) {
      const demoDoc = DEMO_DOCUMENTS.find((d) => d.id === targetId || d.assignment_id === targetId) ?? DEMO_DOCUMENTS[0]!;
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
        },
      });
      return;
    }

    const doc = await DocStore.findById(String(req.params['id']));

    if (!doc || doc.student_id !== studentId) {
      res.status(404).json({ error: 'Document not found.' });
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
      },
    });
  } catch (err) {
    logger.error('Get document error', { error: String(err) });
    res.status(500).json({ error: 'Failed to retrieve document.' });
  }
});

router.get('/:id/download', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = req.student!.id;
    const doc = await DocStore.findById(String(req.params['id']));

    if (!doc || doc.student_id !== studentId) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }

    if (!fs.existsSync(doc.file_path)) {
      res.status(410).json({ error: 'Document file no longer available on disk.' });
      return;
    }

    const filename = path.basename(doc.filename);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', doc.file_size_bytes ?? fs.statSync(doc.file_path).size);

    const stream = fs.createReadStream(doc.file_path);
    stream.pipe(res);
    stream.on('error', (err) => {
      logger.error('File stream error', { error: String(err) });
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream document.' });
      }
    });
  } catch (err) {
    logger.error('Download document error', { error: String(err) });
    res.status(500).json({ error: 'Failed to download document.' });
  }
});

export default router;
