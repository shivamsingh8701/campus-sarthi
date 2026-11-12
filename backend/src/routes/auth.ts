// ============================================================
// CampusSarthi — Authentication Routes
// Genuine Galgotias LMS Auth, Separate Campus Account Auth, & Explicit Demo Mode
// ============================================================

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { Students, LMSSessions, ActivityLogs, SyncRecords } from '../db/queries';
import {
  hashPassword,
  verifyPassword,
  encrypt,
  generateToken as generateHexToken,
} from '../utils/crypto';
import {
  generateToken as generateJwt,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
} from '../middleware/auth';
import { logger } from '../utils/logger';
import { LMSConnector } from '../services/lms/connector';
import { SyncJob } from '../services/scheduler/syncJob';
import { emailSender } from '../services/email/sender';
import {
  DEMO_STUDENT,
  DEMO_STUDENT_ID,
  DEMO_ADMISSION_NUMBER,
  DEMO_EMAIL,
  isDemoStudent,
} from '../services/demo/demoData';
import type { AuthMode, StudentPublic } from '../types';
import type { StudentRow } from '../types/db';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  message: { error: 'Too many authentication attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function buildStudentPublic(
  student: StudentRow,
  opts: {
    isDemo: boolean;
    authMode: AuthMode;
    lmsConnected?: boolean;
    lmsUsername?: string | null;
    lmsExpiresAt?: string | null;
    lastSync?: string | null;
  }
): StudentPublic & { lmsExpiresAt?: string | null } {
  return {
    id: student.id,
    admissionNumber: student.admission_number,
    email: student.email,
    name: student.full_name || student.admission_number,
    fullName: student.full_name,
    isEmailVerified: student.is_email_verified,
    isDemo: opts.isDemo,
    authMode: opts.authMode,
    lmsConnected: opts.lmsConnected ?? false,
    lmsUsername: opts.lmsUsername ?? null,
    lmsExpiresAt: opts.lmsExpiresAt ?? null,
    lastSync: opts.lastSync ?? null,
    createdAt: new Date(student.created_at),
  };
}

function mapLmsStatusToHttp(status?: string): number {
  switch (status) {
    case 'invalid_credentials':
      return 401;
    case 'requires_verification':
    case 'account_disabled':
      return 403;
    case 'lms_unavailable':
      return 503;
    case 'page_changed':
      return 502;
    default:
      return 401;
  }
}

// ─── POST /register ──────────────────────────────────────────

router.post('/register', authLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      name,
      admissionNumber,
      email,
      password,
      confirmPassword,
      authType = 'lms',
    } = req.body as {
      name?: string;
      admissionNumber?: string;
      email?: string;
      password?: string;
      confirmPassword?: string;
      authType?: 'lms' | 'campus';
    };

    if (!admissionNumber?.trim() || !email?.trim() || !password || !confirmPassword) {
      res.status(400).json({ error: 'Admission number, email, password, and confirmation are required.' });
      return;
    }

    const cleanAdmission = admissionNumber.trim().toUpperCase();
    const cleanEmail = email.trim().toLowerCase();

    if (!isValidEmail(cleanEmail)) {
      res.status(400).json({ error: 'Please provide a valid email address.' });
      return;
    }

    if (password !== confirmPassword) {
      res.status(400).json({ error: 'Passwords do not match.' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }

    if (authType === 'campus' && password.length < 8) {
      res.status(400).json({ error: 'CampusSarthi password must be at least 8 characters.' });
      return;
    }

    // Never allow registering reserved demo identifiers
    if (cleanAdmission === DEMO_ADMISSION_NUMBER || cleanEmail === DEMO_EMAIL) {
      res.status(400).json({ error: 'This identifier is reserved for Demo Mode.' });
      return;
    }

    // Check existing records without leaking which field collided to enumerators
    const [existingByEmail, existingByAdm] = await Promise.all([
      Students.findByEmail(cleanEmail),
      Students.findByAdmissionNumber(cleanAdmission),
    ]);

    if (existingByEmail || existingByAdm) {
      res.status(409).json({
        error: 'Unable to complete registration with these details. Please sign in to your existing account or use different details.',
      });
      return;
    }

    let lmsCookies: NonNullable<Awaited<ReturnType<LMSConnector['login']>>['sessionCookies']> | undefined;
    let detectedName = name?.trim() || undefined;

    // Genuine Galgotias LMS credential verification on default registration
    if (authType !== 'campus') {
      const lms = new LMSConnector({ headless: true });
      try {
        await lms.launch();
        const loginResult = await lms.login(cleanAdmission, password);

        if (!loginResult.success || !loginResult.sessionCookies) {
          res.status(mapLmsStatusToHttp(loginResult.status)).json({
            error:
              loginResult.errorMessage ||
              'Galgotias LMS rejected these credentials. Use your real university password or switch to Standalone Account.',
            code: loginResult.status?.toUpperCase() || 'LMS_AUTH_FAILED',
            verificationType: loginResult.verificationType,
          });
          return;
        }

        lmsCookies = loginResult.sessionCookies;
        if (!detectedName && loginResult.studentName) {
          detectedName = loginResult.studentName;
        }
      } finally {
        await lms.close();
      }
    }

    // Never hash or store the university password on CampusSarthi when authType === 'lms'
    const storedHash =
      authType === 'campus'
        ? await hashPassword(password)
        : await hashPassword(generateHexToken(32));

    const verificationToken = generateHexToken(32);

    const student = await Students.create({
      admissionNumber: cleanAdmission,
      name: detectedName,
      email: cleanEmail,
      passwordHash: storedHash,
      verificationToken,
      isEmailVerified: true,
    });

    // Optionally send welcome/verification email asynchronously without failing registration
    void emailSender.sendVerificationEmail(cleanEmail, verificationToken).catch((mailErr) => {
      logger.warn('Verification email skipped/failed during registration', {
        studentId: student.id,
        error: mailErr instanceof Error ? mailErr.message : String(mailErr),
      });
    });

    let lmsConnected = false;
    let expiresAt: string | null = null;

    if (lmsCookies) {
      const encrypted = encrypt(JSON.stringify(lmsCookies));
      const sess = await LMSSessions.create({
        studentId: student.id,
        sessionDataEncrypted: encrypted,
        lmsUsername: cleanAdmission,
      });
      lmsConnected = true;
      expiresAt = sess.expires_at;

      await ActivityLogs.create({
        studentId: student.id,
        type: 'lms_connected',
        description: `Registered and authenticated with Galgotias LMS (${cleanAdmission})`,
      });

      SyncJob.getInstance()
        .runSyncForStudent(student.id)
        .catch((err) => logger.warn('Post-register LMS sync failed', { studentId: student.id, error: String(err) }));
    }

    const authMode: AuthMode = authType === 'campus' ? 'campus' : 'lms';
    const token = generateJwt(student.id, student.email, { isDemo: false, authMode, rememberMe: true });
    setSessionCookie(res, token, true);

    await ActivityLogs.create({
      studentId: student.id,
      type: 'login',
      description: `Student account created (${authMode} authentication)`,
    });

    logger.info('Student registered cleanly', { studentId: student.id, authMode, lmsConnected });

    const publicStudent = buildStudentPublic(student, {
      isDemo: false,
      authMode,
      lmsConnected,
      lmsUsername: lmsConnected ? cleanAdmission : null,
      lmsExpiresAt: expiresAt,
    });

    res.status(201).json({
      success: true,
      message: lmsConnected
        ? 'Account created and connected to Galgotias LMS. Synchronizing your courses now.'
        : 'CampusSarthi account created. Connect Galgotias LMS in Integrations when ready.',
      data: { student: publicStudent },
      student: publicStudent,
    });
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode || 500;
    logger.error('Register error', { error: err instanceof Error ? err.message : String(err) });
    res.status(statusCode).json({
      error: statusCode === 503
        ? 'Database service unavailable. Please check Supabase configuration.'
        : 'Registration failed due to a server error.',
    });
  }
});

// ─── POST /login ─────────────────────────────────────────────

router.post('/login', authLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      identifier,
      admissionNumber,
      email,
      password,
      mode = 'lms',
      rememberMe = true,
      name,
    } = req.body as {
      identifier?: string;
      admissionNumber?: string;
      email?: string;
      password?: string;
      mode?: 'lms' | 'campus';
      rememberMe?: boolean;
      name?: string;
    };

    const rawId = (admissionNumber || identifier || email || '').trim();
    if (!rawId || !password) {
      res.status(400).json({ error: 'Admission number (or email) and password are required.' });
      return;
    }

    // Never silently fall back or accept demo credentials on the real login route
    if (
      rawId.toLowerCase() === DEMO_EMAIL ||
      rawId.toUpperCase() === DEMO_ADMISSION_NUMBER
    ) {
      res.status(400).json({
        error: 'Demo credentials cannot be used for real university login. Use the explicit "Explore Demo Mode" option instead.',
        code: 'USE_EXPLICIT_DEMO',
      });
      return;
    }

    // ── Path A: Independent CampusSarthi App Password Login ──
    if (mode === 'campus') {
      const student = rawId.includes('@')
        ? await Students.findByEmail(rawId)
        : await Students.findByAdmissionNumber(rawId);

      if (!student || isDemoStudent(student.id)) {
        res.status(401).json({ error: 'Invalid CampusSarthi credentials.' });
        return;
      }

      const valid = await verifyPassword(password, student.password_hash);
      if (!valid) {
        res.status(401).json({ error: 'Invalid CampusSarthi credentials.' });
        return;
      }

      const activeLms = await LMSSessions.findActiveByStudentId(student.id);
      const latestSync = await SyncRecords.findLatestByStudentId(student.id);

      const token = generateJwt(student.id, student.email, {
        isDemo: false,
        authMode: 'campus',
        rememberMe,
      });
      setSessionCookie(res, token, rememberMe);

      await ActivityLogs.create({
        studentId: student.id,
        type: 'login',
        description: 'Signed in with CampusSarthi account password',
      });

      const campusPublicStudent = buildStudentPublic(student, {
        isDemo: false,
        authMode: 'campus',
        lmsConnected: Boolean(activeLms),
        lmsUsername: activeLms?.lms_username ?? null,
        lmsExpiresAt: activeLms?.expires_at ?? null,
        lastSync: latestSync?.completed_at ?? latestSync?.started_at ?? null,
      });

      res.json({
        success: true,
        message: 'Signed in successfully.',
        data: { student: campusPublicStudent },
        student: campusPublicStudent,
      });
      return;
    }

    // ── Path B: Genuine Galgotias University LMS Login ───────
    const cleanAdmission = rawId.toUpperCase();
    logger.info('Attempting genuine Galgotias LMS login', { username: cleanAdmission });

    const lms = new LMSConnector({ headless: true });
    let loginResult: Awaited<ReturnType<LMSConnector['login']>>;
    try {
      await lms.launch();
      loginResult = await lms.login(rawId, password);
    } finally {
      await lms.close();
    }

    if (!loginResult.success || !loginResult.sessionCookies) {
      logger.warn('Galgotias LMS login failed', {
        username: cleanAdmission,
        status: loginResult.status,
      });
      res.status(mapLmsStatusToHttp(loginResult.status)).json({
        error: loginResult.errorMessage || 'Invalid university admission number or LMS password.',
        code: loginResult.status?.toUpperCase() || 'INVALID_LMS_CREDENTIALS',
        verificationType: loginResult.verificationType,
      });
      return;
    }

    // LMS authenticated! Retrieve or create the student's real CampusSarthi profile.
    let student = await Students.findByAdmissionNumber(cleanAdmission);
    if (!student && rawId.includes('@')) {
      student = await Students.findByEmail(rawId);
    }

    if (!student) {
      const providedEmail = email?.trim().toLowerCase();
      if (!providedEmail || !isValidEmail(providedEmail)) {
        // LMS credentials succeeded, ask student to provide their email to create profile cleanly (never invent fake records)
        res.status(422).json({
          code: 'EMAIL_REQUIRED',
          requiresEmail: true,
          verifiedAdmissionNumber: cleanAdmission,
          detectedName: loginResult.studentName || null,
          error:
            'Galgotias LMS verified! Enter your email address to complete creating your CampusSarthi profile.',
        });
        return;
      }

      const existingEmailOwner = await Students.findByEmail(providedEmail);
      if (existingEmailOwner) {
        res.status(409).json({
          error: 'Unable to link this email address. Please sign in with the matching account or use another email.',
        });
        return;
      }

      // Create profile with random non-university internal secret hash (never stores university password)
      const verificationToken = generateHexToken(32);
      student = await Students.create({
        admissionNumber: cleanAdmission,
        name: name?.trim() || loginResult.studentName || undefined,
        email: providedEmail,
        passwordHash: await hashPassword(generateHexToken(32)),
        verificationToken,
        isEmailVerified: true,
      });
    } else if (!student.full_name && loginResult.studentName) {
      const updated = await Students.updateProfile(student.id, { fullName: loginResult.studentName });
      if (updated) student = updated;
    }

    // Rotate & store AES-256-GCM encrypted LMS session cookies
    await LMSSessions.deactivateAll(student.id);
    const expiresAtDate = new Date(Date.now() + (rememberMe ? 30 : 1) * 86400000);
    const lmsSession = await LMSSessions.create({
      studentId: student.id,
      sessionDataEncrypted: encrypt(JSON.stringify(loginResult.sessionCookies)),
      lmsUsername: rawId,
      expiresAt: expiresAtDate,
    });

    const token = generateJwt(student.id, student.email, {
      isDemo: false,
      authMode: 'lms',
      rememberMe,
    });
    setSessionCookie(res, token, rememberMe);

    await ActivityLogs.create({
      studentId: student.id,
      type: 'login',
      description: `Signed in via Galgotias LMS (${cleanAdmission})`,
    });

    const latestSync = await SyncRecords.findLatestByStudentId(student.id);

    // Kick off fresh real LMS sync in background
    SyncJob.getInstance()
      .runSyncForStudent(student.id)
      .catch((err) =>
        logger.warn('Post-login background sync failed', { studentId: student?.id, error: String(err) })
      );

    logger.info('Real student authenticated cleanly via Galgotias LMS', { studentId: student.id });

    const lmsPublicStudent = buildStudentPublic(student, {
      isDemo: false,
      authMode: 'lms',
      lmsConnected: true,
      lmsUsername: rawId,
      lmsExpiresAt: lmsSession.expires_at,
      lastSync: latestSync?.completed_at ?? latestSync?.started_at ?? null,
    });

    res.json({
      success: true,
      message: 'Connected with Galgotias LMS. Synchronizing your courses and assignments.',
      data: { student: lmsPublicStudent },
      student: lmsPublicStudent,
    });
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode || 500;
    logger.error('Login error', { error: err instanceof Error ? err.message : String(err) });
    res.status(statusCode).json({
      error: statusCode === 503
        ? 'Database service unavailable. Please check Supabase configuration.'
        : 'Login failed due to a server error.',
    });
  }
});

// ─── POST /demo (Explicit Demo Mode Entry) ───────────────────

router.post('/demo', async (_req: Request, res: Response): Promise<void> => {
  try {
    const token = generateJwt(DEMO_STUDENT_ID, DEMO_EMAIL, {
      isDemo: true,
      authMode: 'demo',
      rememberMe: false,
    });
    setSessionCookie(res, token, false);

    const demoPublicStudent = buildStudentPublic(DEMO_STUDENT, {
      isDemo: true,
      authMode: 'demo',
      lmsConnected: true,
      lmsUsername: `${DEMO_ADMISSION_NUMBER} (Demo)`,
      lmsExpiresAt: null,
      lastSync: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: 'Entered Demo Mode using sample demonstration data.',
      data: { student: demoPublicStudent },
      student: demoPublicStudent,
    });
  } catch (err) {
    logger.error('Demo login error', { error: String(err) });
    res.status(500).json({ error: 'Unable to enter Demo Mode.' });
  }
});

// ─── POST /logout ────────────────────────────────────────────

router.post('/logout', async (req: Request, res: Response): Promise<void> => {
  const { disconnectLms } = (req.body || {}) as { disconnectLms?: boolean };

  clearSessionCookie(res);

  // Best-effort activity & optional LMS disconnect if JWT still identifiable
  try {
    const token =
      req.cookies?.['campus_session'] ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7).trim()
        : undefined);

    if (token) {
      const jwt = await import('jsonwebtoken');
      const { getConfig } = await import('../config');
      const decoded = jwt.verify(token, getConfig().jwtSecret) as { studentId?: string };
      if (decoded.studentId && !isDemoStudent(decoded.studentId)) {
        if (disconnectLms) {
          await LMSSessions.deactivateAll(decoded.studentId);
        }
        await ActivityLogs.create({
          studentId: decoded.studentId,
          type: 'logout',
          description: disconnectLms
            ? 'Logged out and disconnected LMS session'
            : 'Logged out of CampusSarthi session',
        });
      }
    }
  } catch {
    // Token may already be expired; cookie still cleared cleanly
  }

  res.json({ message: 'Logged out successfully.' });
});

// ─── GET /verify-email ───────────────────────────────────────

router.get('/verify-email', async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.query;
    if (!token || typeof token !== 'string') {
      res.status(400).json({ error: 'Verification token is required.' });
      return;
    }

    const student = await Students.findByVerificationToken(token);
    if (!student) {
      res.status(400).json({ error: 'Invalid or expired verification token.' });
      return;
    }

    await Students.markEmailVerified(student.id);
    res.json({ message: 'Email verified successfully.' });
  } catch (err) {
    logger.error('Verify email error', { error: String(err) });
    res.status(500).json({ error: 'Email verification failed.' });
  }
});

// ─── GET /me ─────────────────────────────────────────────────

router.get('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.student?.isDemo || isDemoStudent(req.student!.id)) {
      const demoPublic = buildStudentPublic(DEMO_STUDENT, {
        isDemo: true,
        authMode: 'demo',
        lmsConnected: true,
        lmsUsername: `${DEMO_ADMISSION_NUMBER} (Demo)`,
        lastSync: new Date().toISOString(),
      });
      res.json({
        success: true,
        data: demoPublic,
        student: demoPublic,
      });
      return;
    }

    const student = await Students.findById(req.student!.id);
    if (!student) {
      clearSessionCookie(res);
      res.status(404).json({ error: 'Student profile not found.' });
      return;
    }

    const [activeLms, latestSync] = await Promise.all([
      LMSSessions.findActiveByStudentId(student.id),
      SyncRecords.findLatestByStudentId(student.id),
    ]);

    const realPublic = buildStudentPublic(student, {
      isDemo: false,
      authMode: req.student?.authMode ?? 'lms',
      lmsConnected: Boolean(activeLms),
      lmsUsername: activeLms?.lms_username ?? null,
      lmsExpiresAt: activeLms?.expires_at ?? null,
      lastSync: latestSync?.completed_at ?? latestSync?.started_at ?? null,
    });

    res.json({
      success: true,
      data: realPublic,
      student: realPublic,
    });
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode || 500;
    logger.error('Get /me error', { error: String(err) });
    res.status(statusCode).json({ error: 'Failed to retrieve student profile.' });
  }
});

// ─── PUT /profile ────────────────────────────────────────────

router.put('/profile', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.student?.isDemo || isDemoStudent(req.student!.id)) {
      res.status(403).json({ error: 'Profile edits are disabled in Demo Mode.' });
      return;
    }

    const { name, email } = req.body as { name?: string; email?: string };
    if (email !== undefined && !isValidEmail(email)) {
      res.status(400).json({ error: 'Please provide a valid email address.' });
      return;
    }

    const updated = await Students.updateProfile(req.student!.id, {
      fullName: name,
      email,
    });

    if (!updated) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }

    const [activeLms, latestSync] = await Promise.all([
      LMSSessions.findActiveByStudentId(updated.id),
      SyncRecords.findLatestByStudentId(updated.id),
    ]);

    res.json({
      message: 'Profile updated.',
      student: buildStudentPublic(updated, {
        isDemo: false,
        authMode: req.student?.authMode ?? 'lms',
        lmsConnected: Boolean(activeLms),
        lmsUsername: activeLms?.lms_username ?? null,
        lmsExpiresAt: activeLms?.expires_at ?? null,
        lastSync: latestSync?.completed_at ?? latestSync?.started_at ?? null,
      }),
    });
  } catch (err) {
    logger.error('Profile update error', { error: String(err) });
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

// ─── POST /change-password ───────────────────────────────────

router.post('/change-password', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.student?.isDemo || isDemoStudent(req.student!.id)) {
      res.status(403).json({ error: 'Password changes are not allowed in Demo Mode.' });
      return;
    }

    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };

    if (!newPassword || newPassword.length < 8) {
      res.status(400).json({ error: 'New CampusSarthi password must be at least 8 characters.' });
      return;
    }

    const student = await Students.findById(req.student!.id);
    if (!student) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }

    // Campus-password users must verify currentPassword; LMS-authenticated users can set an independent CampusSarthi password
    if (req.student?.authMode === 'campus') {
      if (!currentPassword) {
        res.status(400).json({ error: 'Current password is required.' });
        return;
      }
      const valid = await verifyPassword(currentPassword, student.password_hash);
      if (!valid) {
        res.status(401).json({ error: 'Current password is incorrect.' });
        return;
      }
    }

    const newHash = await hashPassword(newPassword);
    await Students.updatePassword(student.id, newHash);

    res.json({ message: 'CampusSarthi application password updated successfully.' });
  } catch (err) {
    logger.error('Change password error', { error: String(err) });
    res.status(500).json({ error: 'Failed to change password.' });
  }
});

export default router;
