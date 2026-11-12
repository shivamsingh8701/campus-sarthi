// ============================================================
// CampusSarthi — Academic A4 Solution PDF Generator (PDFKit)
// Clean typography, honest AI disclaimer, proper page breaks,
// no fake university seals or signatures.
// ============================================================

import path from 'path';
import fs from 'fs';
import os from 'os';
import { randomUUID } from 'crypto';
import { logger } from '../../utils/logger';
import type { SolutionPdfData } from '../../types';

const FALLBACK_DIR = path.join(os.tmpdir(), 'campussarthi', 'docs');

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function formatDateTime(d: Date | null): string {
  if (!d) return 'Not specified';
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function buildSolutionPdfFilename(courseName: string, assignmentTitle: string): string {
  const courseCodeMatch = courseName.match(/^([A-Z0-9-]{3,14})/i);
  const coursePart = courseCodeMatch ? courseCodeMatch[1]! : courseName;
  const cleanCourse = coursePart.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 20);
  const cleanTitle = assignmentTitle.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48);
  const parts = ['CampusSarthi', cleanCourse, cleanTitle, 'Solution'].filter(Boolean);
  return `${parts.join('_')}.pdf`;
}

export class PdfGenerator {
  /**
   * Generate a clean A4 academic solution PDF and return both Buffer and suggested filename.
   */
  async generateSolutionPdfBuffer(data: SolutionPdfData): Promise<{
    buffer: Buffer;
    filename: string;
  }> {
    logger.info('Generating A4 solution PDF buffer', {
      assignmentTitle: data.assignmentTitle,
      questions: data.questions.length,
    });

    const suggestedFilename = buildSolutionPdfFilename(data.courseName, data.assignmentTitle);

    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let PDFDocument: new (options?: Record<string, unknown>) => any;
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        PDFDocument = require('pdfkit') as new (options?: Record<string, unknown>) => any;
      } catch {
        return reject(new Error('pdfkit is not installed. Run: npm install pdfkit @types/pdfkit'));
      }

      const doc = new PDFDocument({
        margin: 50,
        size: 'A4',
        bufferPages: true,
        info: {
          Title: `CampusSarthi AI — ${data.assignmentTitle}`,
          Author: 'CampusSarthi Academic Assistant',
          Subject: data.courseName,
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('error', (err: Error) => reject(err));
      doc.on('end', () => {
        const buffer = Buffer.concat(chunks);
        logger.info('Solution PDF buffer generated', {
          filename: suggestedFilename,
          sizeBytes: buffer.length,
        });
        resolve({ buffer, filename: suggestedFilename });
      });

      const COLOR = {
        navy: '#1e3a8a',
        ink: '#0f172a',
        body: '#1e293b',
        muted: '#475569',
        subtle: '#64748b',
        accentGreen: '#166534',
        amberBg: '#fffbeb',
        amberBorder: '#f59e0b',
        amberText: '#92400e',
        softBg: '#f8fafc',
        border: '#cbd5e1',
      };

      const PAGE_W = doc.page.width;
      const PAGE_H = doc.page.height;
      const M = 50;
      const CW = PAGE_W - M * 2;
      const BOTTOM_LIMIT = PAGE_H - 65;

      const ensureSpace = (neededHeight: number) => {
        if (doc.y + neededHeight > BOTTOM_LIMIT) {
          doc.addPage();
          doc.y = 58;
        }
      };

      // ── Cover / Title Header ─────────────────────────────────────────────
      doc.rect(M, 38, CW, 4).fill(COLOR.navy);

      doc
        .fontSize(17)
        .fillColor(COLOR.navy)
        .font('Helvetica-Bold')
        .text('CAMPUSSARTHI AI — ASSIGNMENT SOLUTION', M, 50, { width: CW });

      doc
        .fontSize(9.5)
        .fillColor(COLOR.subtle)
        .font('Helvetica')
        .text('Structured Academic Study Draft · Automated Coursework Assistant', M, 73, { width: CW });

      doc.y = 92;
      doc.rect(M, doc.y, CW, 0.8).fill(COLOR.border);
      doc.y += 12;

      // ── Academic Metadata Card ───────────────────────────────────────────
      const metaRows: Array<[string, string]> = [
        ['Assignment', data.assignmentTitle],
        ['Course', data.courseName],
        ['Student', data.admissionNumber ? `${data.studentName} (${data.admissionNumber})` : data.studentName || 'Student'],
        ['Deadline', formatDateTime(data.dueDate)],
        ['Generated At', formatDateTime(data.generatedAt)],
      ];
      if (data.sourceFilename) {
        metaRows.push([
          'Source Document',
          data.sourcePageCount ? `${data.sourceFilename} (${data.sourcePageCount} page${data.sourcePageCount === 1 ? '' : 's'})` : data.sourceFilename,
        ]);
      }
      if (data.aiProviderUsed) {
        metaRows.push(['AI Engine', data.aiProviderUsed]);
      }

      const cardTop = doc.y;
      const cardHeight = metaRows.length * 17 + 14;
      doc.roundedRect(M, cardTop, CW, cardHeight, 4).fillAndStroke(COLOR.softBg, COLOR.border);

      let metaY = cardTop + 9;
      for (const [label, val] of metaRows) {
        doc
          .fontSize(9)
          .font('Helvetica-Bold')
          .fillColor(COLOR.muted)
          .text(`${label}:`, M + 12, metaY, { width: 95, lineBreak: false });
        doc
          .fontSize(9)
          .font('Helvetica')
          .fillColor(COLOR.ink)
          .text(val, M + 108, metaY, { width: CW - 120, lineBreak: false, ellipsis: true });
        metaY += 17;
      }

      doc.y = cardTop + cardHeight + 12;

      // ── Mandatory Academic Integrity Disclaimer ──────────────────────────
      const disclaimerText =
        data.aiDisclaimer ||
        'AI-prepared academic draft. Please review and verify before academic submission.';
      const discH = Math.max(36, doc.heightOfString(disclaimerText, { width: CW - 24 }) + 16);
      doc.roundedRect(M, doc.y, CW, discH, 4).fillAndStroke(COLOR.amberBg, COLOR.amberBorder);
      doc
        .fontSize(8.5)
        .font('Helvetica-Bold')
        .fillColor(COLOR.amberText)
        .text(disclaimerText, M + 12, doc.y + 9, { width: CW - 24 });
      doc.y += discH + 14;

      // ── Executive Topic Summary (if present) ─────────────────────────────
      if (data.summary && data.summary.trim()) {
        const sumH = doc.heightOfString(data.summary, { width: CW }) + 26;
        ensureSpace(sumH);
        doc
          .fontSize(11)
          .font('Helvetica-Bold')
          .fillColor(COLOR.navy)
          .text('Overview & Key Concepts', M, doc.y);
        doc.moveDown(0.35);
        doc
          .fontSize(9.5)
          .font('Helvetica')
          .fillColor(COLOR.body)
          .text(data.summary.trim(), M, doc.y, { width: CW, lineGap: 2 });
        doc.moveDown(1);
      }

      // ── Table of Contents (shown when >= 4 questions) ────────────────────
      if (data.questions.length >= 4) {
        ensureSpace(40 + Math.min(data.questions.length, 8) * 18);
        doc
          .fontSize(11)
          .font('Helvetica-Bold')
          .fillColor(COLOR.navy)
          .text('Table of Contents', M, doc.y);
        doc.moveDown(0.4);

        data.questions.forEach((q, idx) => {
          ensureSpace(18);
          const qNum = q.numberLabel || `Q${idx + 1}`;
          const preview = q.question.replace(/\s+/g, ' ').slice(0, 92);
          const suffix = q.question.length > 92 ? '…' : '';
          doc
            .fontSize(9)
            .font('Helvetica-Bold')
            .fillColor(COLOR.ink)
            .text(`${qNum}. `, M + 6, doc.y, { continued: true })
            .font('Helvetica')
            .fillColor(COLOR.muted)
            .text(`${preview}${suffix}`, { width: CW - 12 });
          doc.moveDown(0.2);
        });

        doc.addPage();
        doc.y = 58;
      }

      // ── Questions & Complete Step-by-Step Solutions ──────────────────────
      data.questions.forEach((qa, idx) => {
        const qLabel = qa.numberLabel || `Q${idx + 1}`;
        const pageTag = qa.sourcePage ? `Source Page ${qa.sourcePage}` : '';

        // Measure header + question statement so heading never orphans at page bottom
        const qStatementH = doc.heightOfString(qa.question, { width: CW - 16 });
        ensureSpace(Math.min(180, 56 + qStatementH));

        // Question Banner
        const barY = doc.y;
        doc.roundedRect(M, barY, CW, 24, 3).fill(COLOR.navy);
        doc
          .fontSize(10.5)
          .font('Helvetica-Bold')
          .fillColor('#ffffff')
          .text(qLabel, M + 10, barY + 6, { width: CW - 110, lineBreak: false });

        if (pageTag) {
          doc
            .fontSize(8.5)
            .font('Helvetica')
            .fillColor('#dbeafe')
            .text(pageTag, M + CW - 105, barY + 7, { width: 95, align: 'right', lineBreak: false });
        }

        doc.y = barY + 30;

        // Question Text
        doc
          .fontSize(10)
          .font('Helvetica-Bold')
          .fillColor(COLOR.ink)
          .text(qa.question, M + 4, doc.y, { width: CW - 8, lineGap: 2 });
        doc.moveDown(0.6);

        // Reasoning / Formulas
        if (qa.reasoning && qa.reasoning.trim()) {
          const reasonH = doc.heightOfString(qa.reasoning.trim(), { width: CW - 20 });
          if (reasonH < 240) {
            ensureSpace(reasonH + 26);
          } else {
            ensureSpace(50);
          }

          doc
            .fontSize(9)
            .font('Helvetica-Bold')
            .fillColor(COLOR.navy)
            .text('Theory, Formulas & Approach', M + 4, doc.y);
          doc.moveDown(0.25);
          doc
            .fontSize(9.5)
            .font('Helvetica')
            .fillColor(COLOR.muted)
            .text(qa.reasoning.trim(), M + 8, doc.y, { width: CW - 16, lineGap: 2 });
          doc.moveDown(0.6);
        }

        // Solution Answer
        ensureSpace(48);
        doc
          .fontSize(9.5)
          .font('Helvetica-Bold')
          .fillColor(COLOR.accentGreen)
          .text('Step-by-Step Solution', M + 4, doc.y);
        doc.moveDown(0.25);

        doc
          .fontSize(9.8)
          .font('Helvetica')
          .fillColor(COLOR.body)
          .text(qa.answer.trim(), M + 8, doc.y, { width: CW - 16, lineGap: 2.5 });

        if (qa.verificationNote && qa.verificationNote.trim()) {
          doc.moveDown(0.45);
          ensureSpace(26);
          doc
            .fontSize(8.5)
            .font('Helvetica-Oblique')
            .fillColor(COLOR.subtle)
            .text(`Verification Note: ${qa.verificationNote.trim()}`, M + 8, doc.y, {
              width: CW - 16,
            });
        }

        doc.moveDown(0.9);
        doc.rect(M, doc.y, CW, 0.5).fill(COLOR.border);
        doc.y += 14;
      });

      // ── Verification & References Summary Block ──────────────────────────
      if (data.verificationNotes && data.verificationNotes.trim()) {
        const vH = doc.heightOfString(data.verificationNotes.trim(), { width: CW - 20 }) + 34;
        ensureSpace(Math.min(vH, 160));
        doc
          .fontSize(10)
          .font('Helvetica-Bold')
          .fillColor(COLOR.navy)
          .text('Technical Verification & Review Notes', M, doc.y);
        doc.moveDown(0.3);
        doc
          .fontSize(9)
          .font('Helvetica')
          .fillColor(COLOR.muted)
          .text(data.verificationNotes.trim(), M, doc.y, { width: CW, lineGap: 2 });
      }

      // ── Consistent Page Headers (p2+) and Footers (all pages) ────────────
      try {
        const range = doc.bufferedPageRange();
        for (let i = 0; i < range.count; i++) {
          doc.switchToPage(i);
          const origBottomMargin = doc.page.margins.bottom;
          // Temporarily disable bottom margin so footer text never triggers extra PDFKit page breaks
          doc.page.margins.bottom = 0;

          if (i > 0) {
            doc
              .fontSize(7.5)
              .font('Helvetica')
              .fillColor(COLOR.subtle)
              .text(
                `CAMPUSSARTHI AI — ${data.assignmentTitle.slice(0, 65)}`,
                M,
                26,
                { width: CW, align: 'left', lineBreak: false }
              );
            doc.rect(M, 38, CW, 0.4).fill(COLOR.border);
          }

          doc.rect(M, PAGE_H - 42, CW, 0.4).fill(COLOR.border);
          doc
            .fontSize(7.5)
            .font('Helvetica')
            .fillColor(COLOR.subtle)
            .text(
              'AI-prepared academic draft. Please review and verify before academic submission.',
              M,
              PAGE_H - 34,
              { width: CW - 75, align: 'left', height: 14, lineBreak: false }
            );
          doc
            .fontSize(7.5)
            .font('Helvetica-Bold')
            .fillColor(COLOR.muted)
            .text(`Page ${i + 1} of ${range.count}`, M + CW - 70, PAGE_H - 34, {
              width: 70,
              align: 'right',
              height: 14,
              lineBreak: false,
            });

          doc.page.margins.bottom = origBottomMargin;
        }
      } catch (pageErr) {
        logger.warn('PDF header/footer numbering warning', { error: String(pageErr) });
      }

      doc.end();
    });
  }

  /**
   * Backward-compatible wrapper writing the PDF to disk and returning filePath.
   */
  async generateSolutionPdf(data: SolutionPdfData): Promise<string> {
    fs.mkdirSync(FALLBACK_DIR, { recursive: true });
    const { buffer } = await this.generateSolutionPdfBuffer(data);
    const filePath = path.join(FALLBACK_DIR, `solution-${randomUUID()}.pdf`);
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }
}

export default PdfGenerator;
