// ============================================================
// CampusSarthi — PDF Solution Generator (PDFKit)
// ============================================================

import path from 'path';
import fs from 'fs';
import os from 'os';
import { randomUUID } from 'crypto';
import { logger } from '../../utils/logger';
import type { SolutionPdfData } from '../../types';

const OUTPUT_DIR = path.join(os.tmpdir(), 'campuspilot', 'docs');

function ensureOutputDir(): void {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Pad single digit numbers
function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function formatDate(d: Date | null): string {
  if (!d) return 'N/A';
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export class PdfGenerator {
  /**
   * Generate a professionally formatted solution PDF.
   * Returns the absolute path to the generated file.
   */
  async generateSolutionPdf(data: SolutionPdfData): Promise<string> {
    ensureOutputDir();

    const filename = `solution-${randomUUID()}.pdf`;
    const filePath = path.join(OUTPUT_DIR, filename);

    logger.info('Generating solution PDF', {
      assignmentTitle: data.assignmentTitle,
      questions: data.questions.length,
      filePath,
    });

    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let PDFDocument: new (options?: Record<string, unknown>) => any;
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        PDFDocument = require('pdfkit') as new (options?: Record<string, unknown>) => any;
      } catch {
        return reject(
          new Error('pdfkit is not installed. Run: npm install pdfkit @types/pdfkit')
        );
      }

      const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
      const stream = fs.createWriteStream(filePath);

      doc.pipe(stream);

      // ── Color Palette ────────────────────────────────────
      const COLOR = {
        primary: '#1a237e',    // Dark blue
        accent: '#e53935',     // Red for disclaimers
        muted: '#757575',      // Gray for metadata
        black: '#212121',
        lightGray: '#f5f5f5',
        border: '#e0e0e0',
      };

      const PAGE_WIDTH = doc.page.width;
      const MARGIN = 50;
      const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

      // ── Header ────────────────────────────────────────────
      // Brand bar
      doc.rect(MARGIN, 40, CONTENT_WIDTH, 4).fill(COLOR.primary);

      doc
        .fontSize(20)
        .fillColor(COLOR.primary)
        .font('Helvetica-Bold')
        .text('CAMPUSPILOT AI — ASSIGNMENT SOLUTION', MARGIN, 54, { width: CONTENT_WIDTH });

      doc
        .fontSize(11)
        .fillColor(COLOR.muted)
        .font('Helvetica')
        .text('Automated Academic Assistant · Galgotias University LMS', MARGIN, 80, {
          width: CONTENT_WIDTH,
        });

      doc.moveDown(1.5);

      // Divider
      doc.rect(MARGIN, doc.y, CONTENT_WIDTH, 1).fill(COLOR.border);
      doc.moveDown(1);

      // ── Disclaimer Box ────────────────────────────────────
      const disclaimerTop = doc.y;
      doc.rect(MARGIN, disclaimerTop, CONTENT_WIDTH, 50).fill('#fff8e1');

      doc
        .fontSize(9.5)
        .fillColor(COLOR.accent)
        .font('Helvetica-Bold')
        .text(
          '⚠  AI-PREPARED DRAFT — FOR STUDENT REVIEW ONLY. Do not submit without reviewing and verifying.',
          MARGIN + 10,
          disclaimerTop + 10,
          { width: CONTENT_WIDTH - 20, align: 'center' }
        );

      doc
        .fontSize(8)
        .fillColor(COLOR.muted)
        .font('Helvetica')
        .text(
          data.aiDisclaimer,
          MARGIN + 10,
          disclaimerTop + 28,
          { width: CONTENT_WIDTH - 20, align: 'center' }
        );

      doc.y = disclaimerTop + 60;
      doc.moveDown(1);

      // ── Assignment Metadata ───────────────────────────────
      doc
        .fontSize(16)
        .fillColor(COLOR.black)
        .font('Helvetica-Bold')
        .text(data.assignmentTitle, MARGIN, doc.y, { width: CONTENT_WIDTH });

      doc.moveDown(0.5);

      const metaItems = [
        { label: 'Student name', value: data.studentName || 'Student' },
        { label: 'Course', value: data.courseName },
        { label: 'Assignment title', value: data.assignmentTitle },
        { label: 'Due date', value: formatDate(data.dueDate) },
        { label: 'Generated', value: formatDate(data.generatedAt) },
      ];

      for (const item of metaItems) {
        doc
          .fontSize(10)
          .font('Helvetica-Bold')
          .fillColor(COLOR.muted)
          .text(`${item.label}: `, MARGIN, doc.y, { continued: true })
          .font('Helvetica')
          .fillColor(COLOR.black)
          .text(item.value);
      }

      doc.moveDown(1.5);

      // ── Table of Contents ─────────────────────────────────
      doc.rect(MARGIN, doc.y, CONTENT_WIDTH, 1).fill(COLOR.border);
      doc.moveDown(0.5);

      doc
        .fontSize(13)
        .fillColor(COLOR.primary)
        .font('Helvetica-Bold')
        .text('Questions Summary', MARGIN);
      doc.moveDown(0.5);

      data.questions.forEach((q, idx) => {
        const shortQ =
          q.question.length > 90 ? q.question.slice(0, 87) + '...' : q.question;
        doc
          .fontSize(9.5)
          .font('Helvetica')
          .fillColor(COLOR.black)
          .text(`${idx + 1}. ${shortQ}`, MARGIN + 10, doc.y, {
            width: CONTENT_WIDTH - 10,
          });
      });

      doc.addPage();

      // ── Individual Questions & Answers ────────────────────
      data.questions.forEach((qa, idx) => {
        // Check if we need a new page (rough estimate)
        const spaceNeeded = 80 + (qa.answer.length / 80) * 14 + (qa.reasoning ? 60 : 0);
        if (doc.y + spaceNeeded > doc.page.height - 80) {
          doc.addPage();
        }

        // Question header bar
        doc
          .rect(MARGIN, doc.y, CONTENT_WIDTH, 24)
          .fill(COLOR.primary);

        doc
          .fontSize(11)
          .fillColor('white')
          .font('Helvetica-Bold')
          .text(`Q${idx + 1}`, MARGIN + 8, doc.y - 18, { continued: true })
          .font('Helvetica')
          .text(` — ${qa.question.slice(0, 80)}${qa.question.length > 80 ? '...' : ''}`, {
            width: CONTENT_WIDTH - 60,
          });

        doc.y += 10;
        doc.fillColor(COLOR.black);

        // Full question text if truncated
        if (qa.question.length > 80) {
          doc
            .fontSize(10)
            .font('Helvetica-Bold')
            .fillColor(COLOR.muted)
            .text('Full Question:', MARGIN + 8, doc.y);
          doc.moveDown(0.3);
          doc
            .fontSize(10)
            .font('Helvetica')
            .fillColor(COLOR.black)
            .text(qa.question, MARGIN + 8, doc.y, { width: CONTENT_WIDTH - 16 });
          doc.moveDown(0.7);
        }

        // Answer
        doc
          .fontSize(10)
          .font('Helvetica-Bold')
          .fillColor('#1b5e20')
          .text('Answer:', MARGIN + 8, doc.y);
        doc.moveDown(0.3);

        doc
          .fontSize(10)
          .font('Helvetica')
          .fillColor(COLOR.black)
          .text(qa.answer, MARGIN + 8, doc.y, {
            width: CONTENT_WIDTH - 16,
            lineGap: 2,
          });

        // Reasoning (if provided)
        if (qa.reasoning) {
          doc.moveDown(0.5);
          doc
            .fontSize(9.5)
            .font('Helvetica-BoldOblique')
            .fillColor(COLOR.muted)
            .text('Reasoning / Explanation:', MARGIN + 8, doc.y);
          doc.moveDown(0.2);
          doc
            .fontSize(9.5)
            .font('Helvetica-Oblique')
            .fillColor(COLOR.muted)
            .text(qa.reasoning, MARGIN + 8, doc.y, {
              width: CONTENT_WIDTH - 16,
              lineGap: 2,
            });
        }

        doc.moveDown(1.5);
        // Separator
        doc.rect(MARGIN, doc.y, CONTENT_WIDTH, 0.5).fill(COLOR.border);
        doc.moveDown(1);
      });

      // ── Footers on all pages (buffered page range) ─────────
      try {
        const range = doc.bufferedPageRange();
        for (let i = 0; i < range.count; i++) {
          doc.switchToPage(i);
          doc
            .fontSize(8)
            .fillColor(COLOR.muted)
            .font('Helvetica')
            .text(
              `CampusPilot AI · Academic Study Draft · Page ${i + 1} of ${range.count}`,
              MARGIN,
              doc.page.height - 30,
              {
                align: 'center',
                width: CONTENT_WIDTH,
                lineBreak: false,
              }
            );
        }
      } catch (pageErr) {
        logger.warn('Page numbering warning', { error: String(pageErr) });
      }

      doc.end();

      stream.on('finish', () => {
        const stats = fs.statSync(filePath);
        logger.info('Solution PDF generated', { filePath, sizeBytes: stats.size });
        resolve(filePath);
      });

      stream.on('error', (err: Error) => {
        logger.error('PDF stream error', { error: err.message });
        reject(err);
      });
    });
  }
}

export default PdfGenerator;
