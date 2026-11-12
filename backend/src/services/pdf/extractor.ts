// ============================================================
// CampusSarthi — Multi-Format Document & Question Extractor
// Supports PDF (.pdf via pdf-parse v2 PDFParse), DOCX (mammoth),
// Legacy DOC (word-extractor), TXT, and page-aware parsing.
// ============================================================

import path from 'path';
import fs from 'fs';
import { logger } from '../../utils/logger';
import type { DetectedQuestionItem } from '../storage/documentStorage';

export interface PageTextSlice {
  pageNumber: number;
  text: string;
  charCount: number;
  hasLowText: boolean;
}

export interface ExtractedDocument {
  text: string;
  pageCount: number;
  pages: PageTextSlice[];
  documentTitle?: string | null;
  headings: string[];
  tables: string[];
  instructions: string | null;
  visualFlags: string[];
  requiresVisualProcessing: boolean;
  warnings: string[];
  extractionConfidence: 'high' | 'medium' | 'low';
  metadata?: Record<string, unknown>;
  fileType: 'pdf' | 'docx' | 'doc' | 'txt' | 'other';
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<\/(?:p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<t[dh][^>]*>/gi, ' | ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractHtmlHeadingsAndTables(html: string): {
  headings: string[];
  tables: string[];
  hasEmbeddedImages: boolean;
} {
  const headings: string[] = [];
  const headingMatches = html.matchAll(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi);
  for (const m of headingMatches) {
    const clean = stripHtmlTags(m[1] || '').replace(/\s+/g, ' ').trim();
    if (clean.length >= 3 && clean.length <= 180) {
      headings.push(clean);
    }
  }

  const tables: string[] = [];
  const tableMatches = html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi);
  for (const m of tableMatches) {
    const rows: string[] = [];
    const trMatches = (m[1] || '').matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
    for (const tr of trMatches) {
      const cells: string[] = [];
      const cellMatches = (tr[1] || '').matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi);
      for (const cell of cellMatches) {
        cells.push(stripHtmlTags(cell[1] || '').replace(/\s+/g, ' ').trim());
      }
      if (cells.some(Boolean)) {
        rows.push(`| ${cells.join(' | ')} |`);
      }
    }
    if (rows.length > 0) {
      tables.push(rows.join('\n'));
    }
  }

  const hasEmbeddedImages = /<img\b/i.test(html);
  return { headings, tables, hasEmbeddedImages };
}

function extractInstructionsBlock(text: string): string | null {
  const lines = text.replace(/\r\n/g, '\n').split('\n').slice(0, 35);
  const picked: string[] = [];
  let capturing = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (capturing && picked.length > 0) break;
      continue;
    }
    if (/^(?:instructions?|note|general instructions?|guidelines?|important|marking scheme|submission)\b/i.test(line)) {
      capturing = true;
      picked.push(line);
      continue;
    }
    if (capturing) {
      if (/^(?:Q(?:uestion)?\.?\s*\d+|1\.|Problem\s*\d+)/i.test(line)) break;
      picked.push(line);
    } else if (/(?:max(?:imum)?\s*marks|deadline|attempt all|total marks|co[1-5])/i.test(line)) {
      picked.push(line);
    }
  }

  return picked.length > 0 ? picked.join('\n') : null;
}

async function runConfiguredOcrIfAvailable(buffer: Buffer, filename: string): Promise<string | null> {
  const ocrApiKey = (process.env['OCR_SPACE_API_KEY'] || '').trim();
  if (!ocrApiKey) return null;

  try {
    const form = new FormData();
    const blob = new Blob([new Uint8Array(buffer)], { type: 'application/pdf' });
    form.append('file', blob, filename);
    form.append('apikey', ocrApiKey);
    form.append('language', 'eng');
    form.append('OCREngine', '2');

    const res = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: form,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      ParsedResults?: Array<{ ParsedText?: string }>;
    };
    const combined = (json.ParsedResults || [])
      .map((r) => (r.ParsedText || '').trim())
      .filter(Boolean)
      .join('\n\n');
    return combined || null;
  } catch (err) {
    logger.warn('Optional OCR fallback failed', { error: String(err) });
    return null;
  }
}

export class PdfExtractor {
  /**
   * Extract full structured content from a buffer or file path.
   */
  async extractFromBuffer(
    fileBuffer: Buffer,
    filename: string
  ): Promise<ExtractedDocument> {
    const ext = path.extname(filename).toLowerCase();
    const warnings: string[] = [];
    const visualFlags: string[] = [];

    // ── PDF ────────────────────────────────────────────────────────────────
    if (ext === '.pdf' || fileBuffer.subarray(0, 5).toString('latin1') === '%PDF-') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PDFParse } = require('pdf-parse') as {
        PDFParse: new (opts: { data: Buffer }) => {
          getText: (opts?: Record<string, unknown>) => Promise<{
            pages: Array<{ text: string; num: number }>;
            total: number;
            text: string;
          }>;
          getInfo: (opts?: Record<string, unknown>) => Promise<{
            total?: number;
            info?: Record<string, unknown>;
          }>;
          destroy: () => Promise<void>;
        };
      };

      const parser = new PDFParse({ data: fileBuffer });
      try {
        const [textRes, infoRes] = await Promise.all([
          parser.getText(),
          parser.getInfo({ parsePageInfo: false }).catch(() => ({ total: 0, info: {} })),
        ]);

        const pageCount = Math.max(
          Number(textRes.total || 0),
          Number(infoRes?.total || 0),
          textRes.pages?.length || 0
        );

        const pages: PageTextSlice[] = (textRes.pages || []).map((p) => {
          const clean = (p.text || '').replace(/\r\n/g, '\n').trim();
          const hasLowText = clean.length < 30;
          return {
            pageNumber: p.num,
            text: clean,
            charCount: clean.length,
            hasLowText,
          };
        });

        let fullText = pages.length > 0
          ? pages.map((p) => p.text).filter(Boolean).join('\n\n')
          : (textRes.text || '').trim();

        const rawPdfLatin = fileBuffer.toString('latin1');
        const imageObjectCount = (rawPdfLatin.match(/\/Subtype\s*\/Image\b/g) || []).length;
        if (imageObjectCount > 0) {
          visualFlags.push(
            `PDF contains ${imageObjectCount} embedded image object(s) or scanned diagrams.`
          );
        }

        const lowTextPages = pages.filter((p) => p.hasLowText).map((p) => p.pageNumber);
        if (lowTextPages.length > 0) {
          visualFlags.push(
            `Page(s) ${lowTextPages.join(', ')} contain little or no selectable text (likely scanned or diagram-heavy).`
          );
        }

        let requiresVisualProcessing =
          imageObjectCount > 0 || lowTextPages.length > 0 || (pageCount > 0 && fullText.length < 40);

        // Optional OCR pass only when scanned PDF lacks usable embedded text & OCR is configured
        if (pageCount > 0 && fullText.length < 40) {
          const ocrText = await runConfiguredOcrIfAvailable(fileBuffer, filename);
          if (ocrText && ocrText.length > 20) {
            fullText = ocrText;
            warnings.push('Extracted text using configured OCR fallback for scanned PDF.');
          } else {
            warnings.push(
              'PDF appears to be scanned or image-based with minimal embedded text; flagged for multimodal visual inspection.'
            );
            requiresVisualProcessing = true;
          }
        }

        const headings = fullText
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.length >= 4 && l.length <= 90 && (/^(?:UNIT|SECTION|PART|MODULE|ASSIGNMENT|CO\d|COURSE)/i.test(l) || l === l.toUpperCase()))
          .slice(0, 12);

        const infoRecord = (infoRes?.info ?? {}) as Record<string, unknown>;
        const docTitle =
          typeof infoRecord['Title'] === 'string' && infoRecord['Title'].trim()
            ? infoRecord['Title'].trim()
            : headings[0] ?? null;

        const confidence: 'high' | 'medium' | 'low' =
          fullText.length >= 180 && lowTextPages.length === 0
            ? 'high'
            : fullText.length >= 50
            ? 'medium'
            : 'low';

        logger.info('PDF detailed extraction complete', {
          filename,
          pageCount,
          charCount: fullText.length,
          imageObjectCount,
          confidence,
        });

        return {
          text: fullText,
          pageCount,
          pages,
          documentTitle: docTitle,
          headings,
          tables: [],
          instructions: extractInstructionsBlock(fullText),
          visualFlags,
          requiresVisualProcessing,
          warnings,
          extractionConfidence: confidence,
          metadata: infoRecord,
          fileType: 'pdf',
        };
      } finally {
        await parser.destroy().catch(() => {});
      }
    }

    // ── DOCX (mammoth) ────────────────────────────────────────────────────
    if (ext === '.docx') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require('mammoth') as {
        extractRawText: (input: { buffer: Buffer }) => Promise<{ value: string; messages: Array<{ message: string }> }>;
        convertToHtml: (input: { buffer: Buffer }) => Promise<{ value: string; messages: Array<{ message: string }> }>;
      };

      const [rawRes, htmlRes] = await Promise.all([
        mammoth.extractRawText({ buffer: fileBuffer }),
        mammoth.convertToHtml({ buffer: fileBuffer }).catch(() => ({ value: '', messages: [] })),
      ]);

      const { headings, tables, hasEmbeddedImages } = extractHtmlHeadingsAndTables(htmlRes.value || '');
      let fullText = (rawRes.value || '').replace(/\r\n/g, '\n').trim();

      if (tables.length > 0 && !fullText.includes('|')) {
        fullText = `${fullText}\n\n[Extracted Tables]\n${tables.join('\n\n')}`.trim();
      }

      if (hasEmbeddedImages) {
        visualFlags.push('DOCX contains embedded image(s)/diagram(s) that may require visual inspection.');
      }

      const estPages = Math.max(1, Math.ceil(fullText.length / 2400));
      const confidence: 'high' | 'medium' | 'low' =
        fullText.length >= 120 ? 'high' : fullText.length >= 30 ? 'medium' : 'low';

      return {
        text: fullText,
        pageCount: estPages,
        pages: [{ pageNumber: 1, text: fullText, charCount: fullText.length, hasLowText: fullText.length < 30 }],
        documentTitle: headings[0] ?? null,
        headings,
        tables,
        instructions: extractInstructionsBlock(fullText),
        visualFlags,
        requiresVisualProcessing: hasEmbeddedImages || fullText.length < 30,
        warnings,
        extractionConfidence: confidence,
        fileType: 'docx',
      };
    }

    // ── Legacy DOC (word-extractor) ───────────────────────────────────────
    if (ext === '.doc') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const WordExtractor = require('word-extractor') as new () => {
        extract: (input: Buffer) => Promise<{
          getBody: () => string;
          getHeaders: (opts?: Record<string, unknown>) => string;
          getFootnotes: () => string;
          getTextboxes: () => string;
        }>;
      };

      const extractor = new WordExtractor();
      const parsed = await extractor.extract(fileBuffer);
      const parts = [
        parsed.getBody?.() || '',
        parsed.getTextboxes?.() || '',
        parsed.getFootnotes?.() || '',
      ]
        .map((s) => s.trim())
        .filter(Boolean);

      const fullText = parts.join('\n\n').replace(/\r\n/g, '\n').trim();
      const estPages = Math.max(1, Math.ceil(fullText.length / 2400));

      return {
        text: fullText,
        pageCount: estPages,
        pages: [{ pageNumber: 1, text: fullText, charCount: fullText.length, hasLowText: fullText.length < 30 }],
        documentTitle: fullText.split('\n')[0]?.trim().slice(0, 120) || null,
        headings: [],
        tables: [],
        instructions: extractInstructionsBlock(fullText),
        visualFlags,
        requiresVisualProcessing: fullText.length < 30,
        warnings,
        extractionConfidence: fullText.length >= 80 ? 'high' : fullText.length >= 25 ? 'medium' : 'low',
        fileType: 'doc',
      };
    }

    // ── Plain TXT ─────────────────────────────────────────────────────────
    if (ext === '.txt') {
      const fullText = fileBuffer.toString('utf-8').replace(/\r\n/g, '\n').trim();
      return {
        text: fullText,
        pageCount: 1,
        pages: [{ pageNumber: 1, text: fullText, charCount: fullText.length, hasLowText: fullText.length < 30 }],
        documentTitle: fullText.split('\n')[0]?.trim().slice(0, 120) || null,
        headings: [],
        tables: [],
        instructions: extractInstructionsBlock(fullText),
        visualFlags: [],
        requiresVisualProcessing: false,
        warnings: [],
        extractionConfidence: fullText.length >= 40 ? 'high' : 'low',
        fileType: 'txt',
      };
    }

    return {
      text: '',
      pageCount: 0,
      pages: [],
      headings: [],
      tables: [],
      instructions: null,
      visualFlags: [],
      requiresVisualProcessing: false,
      warnings: [`Unsupported extension: ${ext || 'unknown'}`],
      extractionConfidence: 'low',
      fileType: 'other',
    };
  }

  /**
   * Extract text content from any supported document on disk.
   */
  async extractDocumentText(filePath: string): Promise<ExtractedDocument> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    const buf = fs.readFileSync(filePath);
    return this.extractFromBuffer(buf, path.basename(filePath));
  }

  /**
   * Extract text content from a PDF file on disk.
   */
  async extractText(filePath: string): Promise<{ text: string; pageCount: number; metadata: Record<string, unknown> }> {
    const res = await this.extractDocumentText(filePath);
    return {
      text: res.text,
      pageCount: res.pageCount,
      metadata: res.metadata ?? {},
    };
  }

  /**
   * Page-aware structured question parser preserving original numbering and subquestions.
   * Supports: Q1., Question 1:, 1., Problem 1., (a)-(c), (i)-(iii), CO/marks hints, and sentences with '?'.
   */
  extractStructuredQuestions(
    extracted: Pick<ExtractedDocument, 'text' | 'pages' | 'requiresVisualProcessing'>,
    sourceFilename?: string
  ): DetectedQuestionItem[] {
    const pages: PageTextSlice[] =
      extracted.pages && extracted.pages.length > 0
        ? extracted.pages
        : [{ pageNumber: 1, text: extracted.text, charCount: extracted.text.length, hasLowText: false }];

    // Top-level question start markers (preserves original number label without splitting on wrapped numbers like "10 L")
    const topQuestionRegex =
      /^(?:(Q(?:uestion)?\.?\s*\d+)\s*[:.)-]\s*|(Q(?:uestion)?\s+\d+)\s+|((?:Problem|Task|Exercise)\s*\d+)\s*[:.)-]?\s+|(\d{1,2})\s*[.):]\s+)(.+)/i;
    const standaloneHeaderRegex =
      /^(?:(Q(?:uestion)?\.?\s*\d+)|((?:Problem|Task|Exercise)\s*\d+))\s*[:.)-]?\s*$/i;
    const subQuestionRegex = /^(\([a-z0-9]+\)|[a-z]\)|[ivx]+\))\s+(.+)/i;

    const detected: DetectedQuestionItem[] = [];
    let current: DetectedQuestionItem | null = null;
    let currentIndex = 0;

    const flushCurrent = () => {
      if (!current) return;
      current.questionText = current.questionText.replace(/\s+/g, ' ').trim();
      if (current.questionText.length >= 6) {
        const marksMatch = current.questionText.match(/\[(\d+\s*(?:marks?|pts?|points?))\]|\((\d+\s*(?:marks?|pts?|points?))\)/i);
        if (marksMatch) {
          current.marksHint = (marksMatch[1] || marksMatch[2] || '').trim();
        }
        detected.push(current);
      }
      current = null;
    };

    for (const page of pages) {
      const lines = (page.text || '').replace(/\r\n/g, '\n').split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = (lines[i] || '').trim();
        if (!line) continue;

        // Ignore obvious header/footer noise like "Page 1 of 3"
        if (/^page\s+\d+(?:\s+of\s+\d+)?$/i.test(line)) continue;

        const topMatch = line.match(topQuestionRegex);
        const headerOnlyMatch = !topMatch ? line.match(standaloneHeaderRegex) : null;

        if (topMatch) {
          const label = (topMatch[1] || topMatch[2] || topMatch[3] || topMatch[4] || `${currentIndex + 1}`).trim();
          const body = (topMatch[5] || '').trim();

          // Guard against false-positive numbered headers like "2026."
          if (/^\d{4}$/.test(label)) continue;

          flushCurrent();
          currentIndex += 1;
          current = {
            id: `q_${currentIndex}`,
            numberLabel: /^\d+$/.test(label) ? `Q${label}` : label.replace(/\s+/g, ' '),
            questionText: body,
            subquestions: [],
            sourcePage: page.pageNumber,
            sourceFilename,
            requiresVisualContext:
              extracted.requiresVisualProcessing &&
              /(?:figure|diagram|graph|circuit|chart|image|below|shown|given\s+fig)/i.test(body),
          };
          continue;
        }

        if (headerOnlyMatch) {
          flushCurrent();
          currentIndex += 1;
          const label = (headerOnlyMatch[1] || headerOnlyMatch[2] || `Q${currentIndex}`).trim();
          current = {
            id: `q_${currentIndex}`,
            numberLabel: label,
            questionText: '',
            subquestions: [],
            sourcePage: page.pageNumber,
            sourceFilename,
            requiresVisualContext: false,
          };
          continue;
        }

        const subMatch = line.match(subQuestionRegex);
        if (subMatch) {
          const subLine = `${subMatch[1]} ${subMatch[2]}`.trim();
          if (current) {
            current.subquestions.push(subLine);
            if (!current.questionText) current.questionText = subLine;
            else current.questionText += `\n${subLine}`;
            if (
              extracted.requiresVisualProcessing &&
              /(?:figure|diagram|graph|circuit|chart|image|below|shown|given\s+fig)/i.test(subLine)
            ) {
              current.requiresVisualContext = true;
            }
            continue;
          }
          // Subquestion without explicit parent question: promote cleanly
          currentIndex += 1;
          current = {
            id: `q_${currentIndex}`,
            numberLabel: subMatch[1]!,
            questionText: subMatch[2]!,
            subquestions: [],
            sourcePage: page.pageNumber,
            sourceFilename,
          };
          continue;
        }

        // Continue accumulating multi-line question text until an obvious separator/footer
        if (current) {
          if (/^(?:---+|===+|submitted by|end of assignment|all the best)/i.test(line)) {
            flushCurrent();
            continue;
          }
          current.questionText = current.questionText
            ? `${current.questionText} ${line}`
            : line;
          if (
            extracted.requiresVisualProcessing &&
            /(?:figure|diagram|graph|circuit|chart|image|below|shown|given\s+fig)/i.test(line)
          ) {
            current.requiresVisualContext = true;
          }
        }
      }
    }

    flushCurrent();

    // Secondary scan for unnumbered direct question sentences ending with '?'
    const seenPrefixes = new Set(detected.map((d) => d.questionText.toLowerCase().slice(0, 40)));
    for (const page of pages) {
      const lines = (page.text || '').replace(/\r\n/g, '\n').split('\n');
      for (const raw of lines) {
        const trimmed = raw.trim();
        if (
          trimmed.length >= 16 &&
          trimmed.endsWith('?') &&
          !seenPrefixes.has(trimmed.toLowerCase().slice(0, 40)) &&
          !detected.some((d) => d.questionText.includes(trimmed))
        ) {
          currentIndex += 1;
          detected.push({
            id: `q_${currentIndex}`,
            numberLabel: `Q${detected.length + 1}`,
            questionText: trimmed,
            subquestions: [],
            sourcePage: page.pageNumber,
            sourceFilename,
            requiresVisualContext:
              extracted.requiresVisualProcessing &&
              /(?:figure|diagram|graph|circuit|chart|image|below|shown|given\s+fig)/i.test(trimmed),
          });
          seenPrefixes.add(trimmed.toLowerCase().slice(0, 40));
        }
      }
    }

    return detected;
  }

  /**
   * Backward-compatible flat question list extractor.
   */
  async extractQuestions(text: string): Promise<string[]> {
    if (!text || text.trim().length === 0) return [];
    const structured = this.extractStructuredQuestions({
      text,
      pages: [{ pageNumber: 1, text, charCount: text.length, hasLowText: false }],
      requiresVisualProcessing: false,
    });
    return structured.map((q) =>
      q.numberLabel && !q.questionText.startsWith(q.numberLabel)
        ? `${q.numberLabel}: ${q.questionText}`
        : q.questionText
    );
  }
}

export default PdfExtractor;
