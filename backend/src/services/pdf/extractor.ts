// ============================================================
// CampusPilot AI — Document & PDF Text / Question Extractor
// Supports PDF (.pdf) via pdf-parse and Word (.docx) via mammoth
// ============================================================

import path from 'path';
import fs from 'fs';
import { logger } from '../../utils/logger';

export interface ExtractedDocument {
  text: string;
  pageCount?: number;
  metadata?: Record<string, unknown>;
  fileType: 'pdf' | 'docx' | 'txt' | 'other';
}

export class PdfExtractor {
  /**
   * Extract text content from any supported document (PDF, DOCX, TXT).
   */
  async extractDocumentText(filePath: string): Promise<ExtractedDocument> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const ext = path.extname(filePath).toLowerCase();
    logger.info('Extracting text from document', { filePath, ext });

    if (ext === '.docx') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mammoth = require('mammoth');
        const res = await mammoth.extractRawText({ path: filePath });
        const text = (res.value || '').trim();
        logger.info('DOCX text extraction complete', { filePath, charCount: text.length });
        return {
          text,
          fileType: 'docx',
        };
      } catch (err) {
        logger.warn('Mammoth docx extraction failed, trying fallback', { error: String(err) });
      }
    }

    if (ext === '.pdf') {
      try {
        const result = await this.extractText(filePath);
        return {
          text: result.text,
          pageCount: result.pageCount,
          metadata: result.metadata,
          fileType: 'pdf',
        };
      } catch (err) {
        logger.warn('PDF extraction failed', { error: String(err) });
      }
    }

    if (ext === '.txt') {
      try {
        const text = fs.readFileSync(filePath, 'utf-8');
        return { text, fileType: 'txt' };
      } catch (err) {
        logger.warn('TXT read failed', { error: String(err) });
      }
    }

    // Binary / XML fallback for docx if mammoth fails
    try {
      const buffer = fs.readFileSync(filePath);
      const str = buffer.toString('utf-8', 0, Math.min(buffer.length, 50000));
      // Extract text inside XML tags <w:t>...</w:t>
      const matches = str.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
      if (matches && matches.length > 0) {
        const text = matches
          .map((m) => m.replace(/<[^>]+>/g, ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (text.length > 20) {
          return { text, fileType: 'docx' };
        }
      }
    } catch {
      // Ignored
    }

    return { text: '', fileType: 'other' };
  }

  /**
   * Extract text content from a PDF file.
   */
  async extractText(filePath: string): Promise<{ text: string; pageCount: number; metadata: Record<string, unknown> }> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`PDF file not found: ${filePath}`);
    }

    logger.info('Extracting text from PDF', { filePath });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse') as (
      data: Buffer,
      options?: Record<string, unknown>
    ) => Promise<{ text: string; numpages: number; info: Record<string, unknown> }>;

    const fileBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(fileBuffer, { max: 0 });

    const result = {
      text: data.text ?? '',
      pageCount: data.numpages ?? 0,
      metadata: data.info ?? {},
    };

    logger.info('PDF extraction complete', {
      filePath,
      pageCount: result.pageCount,
      charCount: result.text.length,
    });

    return result;
  }

  /**
   * Heuristically identify individual questions from raw assignment text.
   * Recognizes:
   * "Q1. ...", "Question 1:", "1. ...", "Problem 1:", "(a) ...", etc.
   */
  async extractQuestions(text: string): Promise<string[]> {
    if (!text || text.trim().length === 0) return [];

    const questions: string[] = [];
    const lines = text.replace(/\r\n/g, '\n').split('\n');

    const questionPatterns = [
      /^(?:Q(?:uestion)?\.?\s*)?(\d+)[.)]\s+.{8,}/i,   // "1. ...", "Q1. ...", "Question 1. ..."
      /^(?:Problem|Task|Exercise)\s*(\d+)[:.]\s+.{8,}/i, // "Problem 1: ...", "Task 2. ..."
      /^(?:Q\.?\s+).{8,}/i,                             // "Q. ..."
      /^[A-Z][^.!?\n]{8,}\?$/,                          // Sentence ending with "?"
      /^\([a-z0-9]+\)\.?\s+.{8,}/i,                     // "(a) ...", "(1) ..."
    ];

    let i = 0;
    while (i < lines.length) {
      const line = lines[i]?.trim() ?? '';

      let matched = false;
      for (const pattern of questionPatterns) {
        if (pattern.test(line)) {
          let question = line;
          let j = i + 1;
          while (j < lines.length) {
            const next = lines[j]?.trim() ?? '';
            if (!next) break; // paragraph break
            if (questionPatterns.some((p) => p.test(next))) break; // start of next question
            question += ' ' + next;
            j++;
          }
          questions.push(question.trim().replace(/\s+/g, ' '));
          i = j;
          matched = true;
          break;
        }
      }

      if (!matched) {
        i++;
      }
    }

    // Secondary scan: detect questions ending with "?"
    const capturedPrefixes = new Set(questions.map((q) => q.toLowerCase().slice(0, 35)));
    for (const line of lines) {
      const trimmed = line.trim();
      if (
        trimmed.length >= 15 &&
        trimmed.endsWith('?') &&
        !capturedPrefixes.has(trimmed.toLowerCase().slice(0, 35))
      ) {
        questions.push(trimmed.replace(/\s+/g, ' '));
        capturedPrefixes.add(trimmed.toLowerCase().slice(0, 35));
      }
    }

    logger.info('Questions extracted from document', { count: questions.length });
    return questions;
  }
}

export default PdfExtractor;
