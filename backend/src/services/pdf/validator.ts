// ============================================================
// CampusSarthi — Strict Assignment Document Binary Validator
// Rejects HTML login redirects, empty files, corrupted archives
// Never treats HTTP 200 as proof of a valid document.
// ============================================================

import path from 'path';

export type SupportedDocumentFormat = 'pdf' | 'docx' | 'doc' | 'txt';

export interface DocumentValidationResult {
  valid: boolean;
  format: SupportedDocumentFormat | 'unsupported';
  mimeType: string;
  sizeBytes: number;
  pageCount?: number;
  error?: string;
  isHtmlLoginRedirect?: boolean;
  warnings: string[];
}

const OLE2_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

function looksLikeHtmlOrLogin(buffer: Buffer, contentType?: string): boolean {
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('text/html')) return true;

  const sample = buffer.subarray(0, Math.min(buffer.length, 4096)).toString('utf-8').trimStart().toLowerCase();
  return (
    sample.startsWith('<!doctype html') ||
    sample.startsWith('<html') ||
    sample.startsWith('<?xml') && sample.includes('<html') ||
    sample.includes('/login/index.php') ||
    sample.includes('forgotten your username or password') ||
    sample.includes('<form') && sample.includes('logintoken')
  );
}

function inferFormatFromFilename(filename: string): SupportedDocumentFormat | null {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.pdf') return 'pdf';
  if (ext === '.docx') return 'docx';
  if (ext === '.doc') return 'doc';
  if (ext === '.txt') return 'txt';
  return null;
}

/**
 * Strictly validate binary content + internal structure of a downloaded file.
 */
export async function validateDocumentBuffer(
  buffer: Buffer,
  filename: string,
  contentType?: string
): Promise<DocumentValidationResult> {
  const warnings: string[] = [];

  if (!buffer || buffer.length === 0) {
    return {
      valid: false,
      format: 'unsupported',
      mimeType: contentType || 'application/octet-stream',
      sizeBytes: 0,
      error: 'Downloaded file is empty (0 bytes).',
      warnings,
    };
  }

  if (looksLikeHtmlOrLogin(buffer, contentType)) {
    return {
      valid: false,
      format: 'unsupported',
      mimeType: 'text/html',
      sizeBytes: buffer.length,
      isHtmlLoginRedirect: true,
      error:
        'Received an HTML university login page instead of the document. Your LMS session may have expired — please reconnect your Galgotias LMS account.',
      warnings,
    };
  }

  const headAscii = buffer.subarray(0, Math.min(buffer.length, 1024)).toString('latin1');
  const expectedFromName = inferFormatFromFilename(filename);

  // ── 1. PDF validation ─────────────────────────────────────────────────────
  const pdfSigIdx = headAscii.indexOf('%PDF-');
  if (pdfSigIdx === 0 || (expectedFromName === 'pdf' && pdfSigIdx >= 0 && pdfSigIdx < 32)) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PDFParse } = require('pdf-parse') as {
        PDFParse: new (opts: { data: Buffer }) => {
          getInfo: (opts?: Record<string, unknown>) => Promise<{ total?: number; permission?: Record<string, unknown> }>;
          destroy: () => Promise<void>;
        };
      };

      const parser = new PDFParse({ data: buffer });
      try {
        const info = await parser.getInfo({ parsePageInfo: false });
        const pageCount = Number(info?.total ?? 0);
        if (!pageCount || pageCount < 1) {
          return {
            valid: false,
            format: 'pdf',
            mimeType: 'application/pdf',
            sizeBytes: buffer.length,
            error: 'PDF file has 0 readable pages or invalid structure.',
            warnings,
          };
        }

        return {
          valid: true,
          format: 'pdf',
          mimeType: 'application/pdf',
          sizeBytes: buffer.length,
          pageCount,
          warnings,
        };
      } finally {
        await parser.destroy().catch(() => {});
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isPassword = /password|encrypted/i.test(msg);
      return {
        valid: false,
        format: 'pdf',
        mimeType: 'application/pdf',
        sizeBytes: buffer.length,
        error: isPassword
          ? 'PDF is password-protected and cannot be read automatically.'
          : `PDF validation failed (corrupted or malformed PDF): ${msg}`,
        warnings,
      };
    }
  }

  if (expectedFromName === 'pdf') {
    return {
      valid: false,
      format: 'pdf',
      mimeType: contentType || 'application/octet-stream',
      sizeBytes: buffer.length,
      error: 'Invalid PDF header (%PDF- signature missing). File may be corrupted or blocked by LMS.',
      warnings,
    };
  }

  // ── 2. DOCX validation (ZIP/OOXML signature PK\x03\x04) ───────────────────
  const isZipSig =
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05) &&
    (buffer[3] === 0x04 || buffer[3] === 0x06);

  if (isZipSig && (expectedFromName === 'docx' || expectedFromName === null)) {
    const rawLatin = buffer.toString('latin1');
    const hasOoxmlMarkers =
      rawLatin.includes('word/document.xml') || rawLatin.includes('[Content_Types].xml');

    if (!hasOoxmlMarkers) {
      return {
        valid: false,
        format: 'docx',
        mimeType: 'application/zip',
        sizeBytes: buffer.length,
        error: 'ZIP archive does not contain valid Word OOXML (word/document.xml) structure.',
        warnings,
      };
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require('mammoth') as {
        extractRawText: (input: { buffer: Buffer }) => Promise<{ value: string; messages: unknown[] }>;
      };
      const extracted = await mammoth.extractRawText({ buffer });
      if ((extracted.value || '').trim().length === 0) {
        warnings.push('DOCX document parsed cleanly but contains no plain text (may contain only images or embedded scans).');
      }

      return {
        valid: true,
        format: 'docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sizeBytes: buffer.length,
        warnings,
      };
    } catch (err) {
      return {
        valid: false,
        format: 'docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sizeBytes: buffer.length,
        error: `Corrupted DOCX file: ${err instanceof Error ? err.message : String(err)}`,
        warnings,
      };
    }
  }

  if (expectedFromName === 'docx') {
    return {
      valid: false,
      format: 'docx',
      mimeType: contentType || 'application/octet-stream',
      sizeBytes: buffer.length,
      error: 'Invalid DOCX file (ZIP/OOXML signature PK missing).',
      warnings,
    };
  }

  // ── 3. Legacy DOC validation (OLE2 binary + word-extractor) ───────────────
  const isOle2 = buffer.length >= 8 && buffer.subarray(0, 8).equals(OLE2_MAGIC);
  if (isOle2 || expectedFromName === 'doc') {
    if (!isOle2) {
      return {
        valid: false,
        format: 'doc',
        mimeType: 'application/msword',
        sizeBytes: buffer.length,
        error: 'Invalid legacy .doc file (OLE2 binary signature missing).',
        warnings,
      };
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const WordExtractor = require('word-extractor') as new () => {
        extract: (input: Buffer) => Promise<{ getBody: () => string }>;
      };
      const extractor = new WordExtractor();
      const doc = await extractor.extract(buffer);
      if ((doc.getBody() || '').trim().length === 0) {
        warnings.push('DOC document has no extractable body text.');
      }
      return {
        valid: true,
        format: 'doc',
        mimeType: 'application/msword',
        sizeBytes: buffer.length,
        warnings,
      };
    } catch (err) {
      return {
        valid: false,
        format: 'doc',
        mimeType: 'application/msword',
        sizeBytes: buffer.length,
        error: `Corrupted legacy .doc file: ${err instanceof Error ? err.message : String(err)}`,
        warnings,
      };
    }
  }

  // ── 4. TXT validation ─────────────────────────────────────────────────────
  if (expectedFromName === 'txt' || (contentType || '').toLowerCase().includes('text/plain')) {
    // Reject binary files pretending to be .txt (null bytes)
    if (buffer.includes(0x00)) {
      return {
        valid: false,
        format: 'txt',
        mimeType: 'text/plain',
        sizeBytes: buffer.length,
        error: 'File appears to be binary rather than plain UTF-8 text.',
        warnings,
      };
    }
    return {
      valid: true,
      format: 'txt',
      mimeType: 'text/plain; charset=utf-8',
      sizeBytes: buffer.length,
      warnings,
    };
  }

  return {
    valid: false,
    format: 'unsupported',
    mimeType: contentType || 'application/octet-stream',
    sizeBytes: buffer.length,
    error: `Unsupported or unrecognized document format for "${filename}". Supported formats: PDF, DOCX, DOC, TXT.`,
    warnings,
  };
}

