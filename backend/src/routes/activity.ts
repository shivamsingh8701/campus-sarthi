// ============================================================
// CampusSarthi — Activity Routes
// GET /api/v1/activity
// ============================================================

import { Router, Request, Response } from 'express';
import requireAuth from '../middleware/auth';
import { ActivityLogs } from '../db/queries';
import { logger } from '../utils/logger';
import { isDemoStudent, DEMO_ACTIVITIES } from '../services/demo/demoData';

const router = Router();

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = req.student!.id;
    const limit = Math.min(Number(req.query['limit'] ?? 50), 100);

    if (isDemoStudent(studentId)) {
      res.json({
        success: true,
        data: DEMO_ACTIVITIES.slice(0, limit).map((l) => ({
          _id: l.id,
          id: l.id,
          type: l.type,
          description: l.description,
          metadata: l.metadata,
          createdAt: l.created_at,
        })),
      });
      return;
    }

    const logs = await ActivityLogs.findByStudentId(studentId, limit);

    res.json({
      success: true,
      data: logs.map((l) => ({
        _id: l.id,
        id: l.id,
        type: l.type,
        description: l.description,
        metadata: l.metadata,
        createdAt: l.created_at,
      })),
    });
  } catch (err) {
    logger.error('Get activity error', { error: String(err) });
    res.status(500).json({ error: 'Failed to retrieve activity log.' });
  }
});

export default router;

