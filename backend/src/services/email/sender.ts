// ============================================================
// CampusSarthi — Email Delivery Service (Nodemailer)
// ============================================================

import nodemailer, { Transporter, SentMessageInfo } from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { getConfig } from '../../config';
import { logger } from '../../utils/logger';

export interface AssignmentEmailParams {
  to: string;
  studentName: string;
  assignmentTitle: string;
  courseName: string;
  dueDate: Date | null;
  summary: string;
  pdfPath?: string;
  pdfBuffer?: Buffer;
  pdfFilename?: string;
  dashboardUrl: string;
}

function formatDate(d: Date | null): string {
  if (!d) return 'No due date';
  return d.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function assignmentEmailHtml(params: AssignmentEmailParams): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>CampusSarthi — Assignment Solution</title>
<style>
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: #f4f6f9; margin: 0; padding: 0; }
  .wrapper { max-width: 620px; margin: 30px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.1); }
  .header { background: #1a237e; color: #fff; padding: 28px 32px; }
  .header h1 { margin: 0; font-size: 22px; font-weight: 700; }
  .header p { margin: 6px 0 0; font-size: 13px; opacity: .8; }
  .body { padding: 28px 32px; color: #333; }
  .greeting { font-size: 15px; margin-bottom: 16px; }
  .meta-table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  .meta-table td { padding: 8px 12px; font-size: 13px; border: 1px solid #e0e0e0; }
  .meta-table td:first-child { font-weight: 600; background: #f5f5f5; width: 130px; }
  .summary { background: #e8f5e9; border-left: 4px solid #43a047; padding: 14px 16px; border-radius: 4px; font-size: 14px; line-height: 1.6; margin: 20px 0; }
  .disclaimer { background: #fff8e1; border: 1px solid #ffe082; border-radius: 4px; padding: 12px 16px; font-size: 12px; color: #c62828; margin: 20px 0; font-weight: 600; }
  .cta { text-align: center; margin: 24px 0; }
  .cta a { background: #1a237e; color: #fff; padding: 12px 28px; border-radius: 4px; text-decoration: none; font-size: 14px; font-weight: 600; }
  .footer { background: #f5f5f5; padding: 16px 32px; font-size: 11px; color: #9e9e9e; text-align: center; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>📚 CampusSarthi</h1>
    <p>AI-powered academic support — Galgotias University</p>
  </div>
  <div class="body">
    <p class="greeting">Hello <strong>${params.studentName}</strong>,</p>
    <p>Your AI-generated assignment solution draft is ready. Please find the PDF attached to this email.</p>

    <table class="meta-table">
      <tr><td>Assignment</td><td>${params.assignmentTitle}</td></tr>
      <tr><td>Course</td><td>${params.courseName}</td></tr>
      <tr><td>Due Date</td><td>${formatDate(params.dueDate)}</td></tr>
    </table>

    <p><strong>Summary:</strong></p>
    <div class="summary">${params.summary.replace(/\n/g, '<br/>')}</div>

    <div class="disclaimer">
      ⚠️ AI-PREPARED DRAFT — FOR STUDENT REVIEW ONLY.<br/>
      This document was automatically generated and may contain errors. Always review, verify, and modify before submission.
    </div>

    <div class="cta">
      <a href="${params.dashboardUrl}">Open Dashboard</a>
    </div>
  </div>
  <div class="footer">
    CampusSarthi · Galgotias University · This email was sent automatically.<br/>
    If you did not request this, please log in and disconnect the LMS integration.
  </div>
</div>
</body>
</html>
  `.trim();
}

function verificationEmailHtml(to: string, verifyUrl: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>Verify Email</title>
<style>
  body { font-family: Arial, sans-serif; background: #f4f6f9; margin: 0; padding: 0; }
  .wrapper { max-width: 540px; margin: 40px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.1); }
  .header { background: #1a237e; color: #fff; padding: 24px 32px; text-align: center; }
  .header h1 { margin: 0; font-size: 20px; }
  .body { padding: 28px 32px; text-align: center; color: #333; }
  .cta a { background: #1a237e; color: #fff; padding: 12px 28px; border-radius: 4px; text-decoration: none; font-size: 14px; font-weight: 600; }
  .footer { background: #f5f5f5; padding: 12px; font-size: 11px; color: #9e9e9e; text-align: center; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header"><h1>CampusSarthi — Verify Email</h1></div>
  <div class="body">
    <p>Welcome! Please click the button below to verify your email address.</p>
    <p><a href="${verifyUrl}">Verify Email Address</a></p>
    <p style="font-size:12px;color:#9e9e9e;">This link expires in 24 hours. If you did not create an account, ignore this email.</p>
  </div>
  <div class="footer">CampusSarthi · Galgotias University</div>
</div>
</body>
</html>
  `.trim();
}

export class EmailSender {
  private transporter: Transporter | null = null;

  private detectTransport(): Transporter {
    const cfg = getConfig();

    if (cfg.email.gmailRefreshToken) {
      logger.info('Email: using Gmail OAuth transport');
      return nodemailer.createTransport({
        service: 'gmail',
        auth: {
          type: 'OAuth2',
          user: cfg.email.smtpUser,
          clientId: cfg.email.gmailClientId,
          clientSecret: cfg.email.gmailClientSecret,
          refreshToken: cfg.email.gmailRefreshToken,
        },
      });
    }

    logger.info('Email: using SMTP transport', {
      host: cfg.email.smtpHost,
      port: cfg.email.smtpPort,
    });

    return nodemailer.createTransport({
      host: cfg.email.smtpHost,
      port: cfg.email.smtpPort,
      secure: cfg.email.smtpPort === 465,
      auth: {
        user: cfg.email.smtpUser,
        pass: cfg.email.smtpPass,
      },
      tls: { rejectUnauthorized: false },
    });
  }

  private getTransporter(): Transporter {
    if (!this.transporter) {
      this.transporter = this.detectTransport();
    }
    return this.transporter;
  }

  async verifyConnection(): Promise<boolean> {
    try {
      await this.getTransporter().verify();
      logger.info('Email connection verified');
      return true;
    } catch (err) {
      logger.error('Email connection failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  async sendAssignmentSolution(
    params: AssignmentEmailParams
  ): Promise<{ messageId: string; accepted: string[] }> {
    const cfg = getConfig();

    const buffer =
      params.pdfBuffer ??
      (params.pdfPath && fs.existsSync(params.pdfPath) ? fs.readFileSync(params.pdfPath) : null);

    if (!buffer || buffer.length === 0) {
      throw new Error(`PDF attachment not found or empty for: ${params.assignmentTitle}`);
    }

    const pdfFilename =
      params.pdfFilename ||
      `CampusSarthi_${params.assignmentTitle.replace(/[^a-z0-9]+/gi, '_').slice(0, 48)}_Solution.pdf`;

    const mailOptions = {
      from: `"CampusSarthi" <${cfg.email.smtpUser}>`,
      to: params.to,
      subject: `Your Assignment Solution Is Ready — ${params.assignmentTitle}`,
      html: assignmentEmailHtml(params),
      attachments: [
        {
          filename: pdfFilename,
          content: buffer,
          contentType: 'application/pdf',
        },
      ],
    };

    logger.info('Sending assignment solution email', {
      to: params.to,
      assignmentTitle: params.assignmentTitle,
      pdfFilename,
      sizeBytes: buffer.length,
    });

    const info: SentMessageInfo = await this.getTransporter().sendMail(mailOptions);

    if (!info.accepted || info.accepted.length === 0 || !info.messageId) {
      throw new Error(`Email was not accepted by the SMTP server. Response: ${info.response || 'No messageId returned'}`);
    }

    logger.info('Assignment email accepted by SMTP provider', {
      messageId: info.messageId,
      accepted: info.accepted,
    });

    return { messageId: info.messageId as string, accepted: info.accepted as string[] };
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const cfg = getConfig();
    const verifyUrl = `${cfg.frontendUrl}/verify-email?token=${token}`;

    const mailOptions = {
      from: `"CampusSarthi" <${cfg.email.smtpUser}>`,
      to,
      subject: '[CampusSarthi] Verify your email address',
      html: verificationEmailHtml(to, verifyUrl),
    };

    logger.info('Sending verification email', { to });
    const info: SentMessageInfo = await this.getTransporter().sendMail(mailOptions);
    logger.info('Verification email sent', { to, messageId: info.messageId });
  }

  async sendNotificationEmail(
    to: string,
    subject: string,
    message: string,
    html?: string
  ): Promise<{ messageId: string }> {
    const cfg = getConfig();
    const info: SentMessageInfo = await this.getTransporter().sendMail({
      from: `"CampusPilot AI" <${cfg.email.smtpUser}>`,
      to,
      subject,
      text: message,
      html:
        html ||
        `<div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: #4f46e5;">CampusPilot AI</h2>
          <p>${message}</p>
        </div>`,
    });
    return { messageId: info.messageId as string };
  }
}

export const emailSender = new EmailSender();
export default emailSender;
