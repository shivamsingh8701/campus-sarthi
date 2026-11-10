// ============================================================
// CampusSarthi — Auth Routes
// POST /api/v1/auth/register
// POST /api/v1/auth/login
// POST /api/v1/auth/logout
// GET  /api/v1/auth/verify-email
// GET  /api/v1/auth/me
// PUT  /api/v1/auth/change-password
// ============================================================

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Students, ActivityLogs, LMSSessions } from '../db/queries';
import { hashPassword, verifyPassword, generateToken as genCryptoToken, encrypt } from '../utils/crypto';
import { generateToken, setSessionCookie, clearSessionCookie } from '../middleware/auth';
import requireAuth from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import { authLimiter } from '../middleware/rateLimiter';
import { logger } from '../utils/logger';
import type { StudentRow } from '../types/db';
import {
  DEMO_EMAIL,
  DEMO_PASSWORD,
  DEMO_STUDENT,
  DEMO_STUDENT_ID,
  DEMO_ADMISSION_NUMBER,
} from '../services/demo/demoData';
import { EmailSender } from '../services/email/sender';
import { LMSConnector } from '../services/lms/connector';
import { SyncJob } from '../services/scheduler/syncJob';
import config from '../config';

const router = Router();

// ─── Schemas ─────────────────────────────────────────────────

const registerSchema = z.object({
  admissionNumber: z
    .string()
    .min(4, 'Admission number must be at least 4 characters')
    .max(30)
    .regex(/^[A-Za-z0-9_-]+$/, 'Admission number must be alphanumeric'),
  name: z.string().max(100).optional(),
  email: z.string().email('Invalid email address').toLowerCase(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  confirmPassword: z.string().optional(),  // validated on frontend; optional here
});

const loginSchema = z.object({
  email: z.string().min(1, 'Email or Admission Number is required').trim(),
  password: z.string().min(1, 'Password is required'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(8)
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[0-9]/, 'Password must contain a number'),
});

// ─── POST /register ───────────────────────────────────────────

router.post(
  '/register',
  authLimiter,
  validateBody(registerSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { admissionNumber, name, email, password } = req.body as z.infer<typeof registerSchema>;

      // Check uniqueness
      const [existingEmail, existingAdmission] = await Promise.all([
        Students.findByEmail(email),
        Students.findByAdmissionNumber(admissionNumber),
      ]);

      if (existingEmail) {
        res.status(409).json({ error: 'An account with this email already exists.' });
        return;
      }
      if (existingAdmission) {
        res.status(409).json({ error: 'An account with this admission number already exists.' });
        return;
      }

      const passwordHash = await hashPassword(password);
      const verificationToken = genCryptoToken(32);

      const student = await Students.create({
        admissionNumber,
        name,
        email,
        passwordHash,
        verificationToken,
      });

      // Auto-verify immediately so the user can login right away
      const sr = student as unknown as StudentRow;
      try {
        await Students.markEmailVerified(sr.id);
      } catch {
        // Non-fatal
      }

      // Send verification email (non-blocking — don't fail registration if email fails)
      try {
        const emailSender = new EmailSender();
        await emailSender.sendVerificationEmail(email, verificationToken);
      } catch (emailErr) {
        logger.warn('Verification email failed to send', { email, error: String(emailErr) });
      }

      logger.info('Student registered', { studentId: sr.id, email });

      res.status(201).json({
        success: true,
        message: 'Registration successful! You can now log in.',
        data: {
          id: sr.id,
          admissionNumber: sr.admission_number,
          email: sr.email,
          isEmailVerified: true,
        },
      });
    } catch (err) {
      logger.error('Registration failed', { error: String(err) });
      res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
  }
);

// ─── POST /login ──────────────────────────────────────────────

router.post(
  '/login',
  authLimiter,
  validateBody(loginSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password } = req.body as z.infer<typeof loginSchema>;
      const inputLower = email.toLowerCase().trim();

      // Check demo credentials by email or admission number (case-insensitive)
      if (
        (inputLower === DEMO_EMAIL.toLowerCase() || inputLower === DEMO_ADMISSION_NUMBER.toLowerCase()) &&
        password === DEMO_PASSWORD
      ) {
        const token = generateToken(DEMO_STUDENT.id, DEMO_STUDENT.email);
        setSessionCookie(res, token);
        logger.info('Demo student logged in', { studentId: DEMO_STUDENT.id });
        const studentPayload = {
          _id: DEMO_STUDENT.id,
          id: DEMO_STUDENT.id,
          admissionNumber: DEMO_STUDENT.admission_number,
          email: DEMO_STUDENT.email,
          name: DEMO_STUDENT.full_name ?? 'Aarav Sharma (Demo Student)',
          emailVerified: DEMO_STUDENT.is_email_verified,
          isEmailVerified: DEMO_STUDENT.is_email_verified,
          lmsConnected: true,
          lmsUsername: DEMO_STUDENT.admission_number,
          createdAt: DEMO_STUDENT.created_at,
          updatedAt: DEMO_STUDENT.updated_at,
        };
        res.json({
          success: true,
          message: 'Logged in successfully.',
          data: {
            token,
            student: studentPayload,
            ...studentPayload,
          },
        });
        return;
      }

      let student = await Students.findByEmail(email);
      if (!student) {
        student = await Students.findByAdmissionNumber(email);
      }

      let passwordValid = false;
      if (student) {
        passwordValid = await verifyPassword(password, student.password_hash);
      }

      // If user not found OR local password did not match, attempt live Galgotias LMS login
      let lmsConnectedNow = false;
      if (!passwordValid) {
        logger.info('Attempting university LMS authentication for student login', { username: email });
        const connector = new LMSConnector({ headless: true, timeout: 35000 });
        try {
          await connector.launch();
          const lmsResult = await connector.login(email, password);
          if (lmsResult.success) {
            logger.info('University LMS credentials verified, auto-provisioning student', { username: email });
            const passwordHash = await hashPassword(password);
            const verificationToken = genCryptoToken(32);
            const admissionNumber = email.toUpperCase();
            const studentEmail = email.includes('@')
              ? email.toLowerCase()
              : `${email.toLowerCase()}@galgotiasuniversity.edu.in`;

            if (!student) {
              student = await Students.create({
                admissionNumber,
                name: `Student (${admissionNumber})`,
                email: studentEmail,
                passwordHash,
                verificationToken,
              });
            } else {
              await Students.updatePassword(student.id, passwordHash);
            }

            // Ensure email marked verified
            await Students.markEmailVerified(student.id);
            student.is_email_verified = true;

            // Save encrypted LMS session cookies
            const cookiesJson = JSON.stringify(lmsResult.sessionCookies ?? []);
            await LMSSessions.deactivateAll(student.id);
            await LMSSessions.create({
              studentId: student.id,
              sessionDataEncrypted: encrypt(cookiesJson),
              lmsUsername: admissionNumber,
            });

            // Start background sync
            SyncJob.getInstance()
              .runSyncForStudent(student.id)
              .catch((err) => logger.warn('Background sync after LMS login error', { error: String(err) }));

            passwordValid = true;
            lmsConnectedNow = true;
          }
        } catch (lmsErr) {
          logger.warn('Direct LMS auth attempt failed', { error: String(lmsErr) });
        } finally {
          await connector.close().catch(() => {});
        }
      }

      if (!student || !passwordValid) {
        res.status(401).json({ error: 'Invalid admission number/email or password.' });
        return;
      }

      // Auto-verify email if not yet verified (allow login regardless)
      if (!student.is_email_verified) {
        try {
          await Students.markEmailVerified(student.id);
          student.is_email_verified = true;
        } catch {
          // Non-fatal — continue login
        }
      }

      const token = generateToken(student.id, student.email);
      setSessionCookie(res, token);

      await ActivityLogs.create({
        studentId: student.id,
        type: 'login',
        description: 'Student logged in',
        metadata: { ip: req.ip },
      });

      logger.info('Student logged in', { studentId: student.id });

      const activeSession = await LMSSessions.findActiveByStudentId(student.id);
      const isLmsConnected = Boolean(activeSession) || lmsConnectedNow;

      const studentPayload = {
        _id: student.id,
        id: student.id,
        admissionNumber: student.admission_number,
        email: student.email,
        name: student.full_name ?? student.email,
        emailVerified: student.is_email_verified,
        isEmailVerified: student.is_email_verified,
        lmsConnected: isLmsConnected,
        lmsUsername: activeSession?.lms_username ?? (isLmsConnected ? student.admission_number : undefined),
        createdAt: student.created_at,
        updatedAt: student.updated_at,
      };

      res.json({
        success: true,
        message: 'Login successful.',
        data: {
          token,
          student: studentPayload,
          ...studentPayload,
        },
      });
    } catch (err) {
      logger.error('Login failed', { error: String(err) });
      res.status(500).json({ error: 'Login failed. Please try again.' });
    }
  }
);

// ─── POST /logout ─────────────────────────────────────────────

router.post('/logout', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    clearSessionCookie(res);

    if (req.student) {
      await ActivityLogs.create({
        studentId: req.student.id,
        type: 'logout',
        description: 'Student logged out',
        metadata: {},
      });
    }

    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (err) {
    logger.error('Logout error', { error: String(err) });
    res.status(500).json({ error: 'Logout failed.' });
  }
});

// ─── GET /verify-email ────────────────────────────────────────

router.get('/verify-email', async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.query['token'] as string;
    if (!token) {
      res.status(400).json({ error: 'Verification token is required.' });
      return;
    }

    const student = await Students.findByVerificationToken(token);
    if (!student) {
      res.status(400).json({ error: 'Invalid or expired verification token.' });
      return;
    }

    if (student.is_email_verified) {
      res.json({ success: true, message: 'Email already verified. You can log in.' });
      return;
    }

    await Students.markEmailVerified(student.id);

    logger.info('Email verified', { studentId: student.id });

    // Redirect to login with success message
    res.redirect(`${config.frontendUrl}/login?verified=1`);
  } catch (err) {
    logger.error('Email verification failed', { error: String(err) });
    res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
});

// ─── GET /me ──────────────────────────────────────────────────

router.get('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.student?.id === DEMO_STUDENT_ID) {
      const studentPayload = {
        _id: DEMO_STUDENT.id,
        id: DEMO_STUDENT.id,
        admissionNumber: DEMO_STUDENT.admission_number,
        email: DEMO_STUDENT.email,
        name: DEMO_STUDENT.full_name ?? 'Aarav Sharma (Demo Student)',
        emailVerified: DEMO_STUDENT.is_email_verified,
        isEmailVerified: DEMO_STUDENT.is_email_verified,
        lmsConnected: true,
        lmsUsername: DEMO_STUDENT.admission_number,
        createdAt: DEMO_STUDENT.created_at,
        updatedAt: DEMO_STUDENT.updated_at,
      };
      res.json({
        success: true,
        data: {
          student: studentPayload,
          ...studentPayload,
        },
      });
      return;
    }

    const student = await Students.findById(req.student!.id);
    if (!student) {
      clearSessionCookie(res);
      res.status(401).json({ error: 'Student account not found.' });
      return;
    }

    const activeSession = await LMSSessions.findActiveByStudentId(student.id);

    const studentPayload = {
      _id: student.id,
      id: student.id,
      admissionNumber: student.admission_number,
      email: student.email,
      name: student.full_name ?? student.email,
      emailVerified: student.is_email_verified,
      isEmailVerified: student.is_email_verified,
      lmsConnected: Boolean(activeSession),
      lmsUsername: activeSession?.lms_username,
      createdAt: student.created_at,
      updatedAt: student.updated_at,
    };

    res.json({
      success: true,
      data: {
        student: studentPayload,
        ...studentPayload,
      },
    });
  } catch (err) {
    logger.error('Get me failed', { error: String(err) });
    res.status(500).json({ error: 'Failed to retrieve account information.' });
  }
});

// ─── PUT /change-password ─────────────────────────────────────

router.put(
  '/change-password',
  requireAuth,
  validateBody(changePasswordSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { currentPassword, newPassword } = req.body as z.infer<typeof changePasswordSchema>;

      const student = await Students.findById(req.student!.id);
      if (!student) {
        res.status(404).json({ error: 'Student not found.' });
        return;
      }

      const valid = await verifyPassword(currentPassword, student.password_hash);
      if (!valid) {
        res.status(401).json({ error: 'Current password is incorrect.' });
        return;
      }

      const newHash = await hashPassword(newPassword);
      await Students.updatePassword(student.id, newHash);

      // Clear session — force re-login
      clearSessionCookie(res);

      logger.info('Password changed', { studentId: student.id });
      res.json({ success: true, message: 'Password changed. Please log in with your new password.' });
    } catch (err) {
      logger.error('Change password failed', { error: String(err) });
      res.status(500).json({ error: 'Failed to change password.' });
    }
  }
);

export default router;
