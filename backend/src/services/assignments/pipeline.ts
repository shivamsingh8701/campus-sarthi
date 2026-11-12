// ============================================================
// CampusSarthi — Real Assignment Discovery, Validation,
// Multi-Format Extraction & Verified Solution Pipeline
// ============================================================

import path from 'path';
import {
  Assignments,
  Courses,
  Documents as DocStore,
  LMSSessions,
  Students,
  ActivityLogs,
} from '../../db/queries';
import { LMSConnector, LMSSessionExpiredError } from '../lms/connector';
import { decrypt } from '../../utils/crypto';
import { logger } from '../../utils/logger';
import { validateDocumentBuffer } from '../pdf/validator';
import { PdfExtractor } from '../pdf/extractor';
import { PdfGenerator } from '../pdf/generator';
import { aiRouter } from '../ai/router';
import {
  saveOriginalDocument,
  saveGeneratedSolutionPdf,
  readStoredFileBuffer,
  savePipelineState,
  loadPipelineState,
  type AssignmentPipelineState,
  type DetectedQuestionItem,
  type ExtractionSnapshot,
  type GranularPipelineStatus,
  type OriginalDocumentRecord,
} from '../storage/documentStorage';
import type { SessionCookie } from '../../types';
import type { AssignmentRow } from '../../types/db';
import { getConfig } from '../../config';

function isProcessingStatus(status: GranularPipelineStatus): boolean {
  return (
    status === 'discovering_attachments' ||
    status === 'downloading' ||
    status === 'validating_document' ||
    status === 'extracting' ||
    status === 'generating_solution' ||
    status === 'verifying_solution' ||
    status === 'generating_pdf' ||
    status === 'processing'
  );
}

async function setStage(
  state: AssignmentPipelineState,
  status: GranularPipelineStatus,
  stageMessage: string,
  errorMessage?: string | null
): Promise<void> {
  state.status = status;
  state.stageMessage = stageMessage;
  if (errorMessage !== undefined) {
    state.errorMessage = errorMessage;
  }
  state.updatedAt = new Date().toISOString();

  await Promise.all([
    savePipelineState(state),
    Assignments.updateAIStatus(state.assignmentId, status, errorMessage, stageMessage),
  ]);
}

function getEffectiveStatus(
  assignment: AssignmentRow,
  state: AssignmentPipelineState | null
): GranularPipelineStatus {
  if (state?.status) {
    // Recover cleanly if a previous run died mid-process (>10 mins stale)
    if (isProcessingStatus(state.status)) {
      const ageMs = Date.now() - new Date(state.updatedAt).getTime();
      if (ageMs > 10 * 60 * 1000) {
        return assignment.ai_status;
      }
    }
    return state.status;
  }
  return assignment.ai_status;
}

export async function getEnrichedAssignmentState(
  studentId: string,
  assignment: AssignmentRow
): Promise<{
  status: GranularPipelineStatus;
  stageMessage: string;
  requiresReauth: boolean;
  originalDocuments: OriginalDocumentRecord[];
  extraction: ExtractionSnapshot | null;
  solution: AssignmentPipelineState['solution'];
}> {
  const state = await loadPipelineState(studentId, assignment.id);
  const status = getEffectiveStatus(assignment, state);

  const originalDocuments =
    state?.originalDocuments ??
    (Array.isArray(assignment.original_documents)
      ? (assignment.original_documents as OriginalDocumentRecord[])
      : []);

  const extraction =
    state?.extraction ??
    (assignment.extracted_content
      ? (assignment.extracted_content as unknown as ExtractionSnapshot)
      : null);

  return {
    status,
    stageMessage:
      state?.stageMessage ||
      assignment.processing_stage ||
      (status === 'completed'
        ? 'Solution PDF ready.'
        : status === 'extracted'
        ? 'Questions extracted and ready for review.'
        : 'Ready to discover and extract assignment documents.'),
    requiresReauth: Boolean(state?.requiresReauth),
    originalDocuments,
    extraction,
    solution: state?.solution ?? null,
  };
}

/**
 * Phase 1: Discover real Moodle activity links -> download via authenticated LMS session ->
 * strictly validate file binary signatures -> save original file -> extract questions & metadata.
 */
export async function runAssignmentExtraction(
  studentId: string,
  assignment: AssignmentRow,
  opts: { force?: boolean; preloadedFiles?: Array<{ filename: string; buffer: Buffer; mimeType: string }> } = {}
): Promise<AssignmentPipelineState> {
  const cfg = getConfig();
  const existingState = await loadPipelineState(studentId, assignment.id);

  const state: AssignmentPipelineState = existingState ?? {
    assignmentId: assignment.id,
    studentId,
    status: 'discovering_attachments',
    stageMessage: 'Discovering assignment details and attachments on LMS…',
    errorMessage: null,
    requiresReauth: false,
    originalDocuments: [],
    extraction: null,
    solution: null,
    updatedAt: new Date().toISOString(),
  };

  state.requiresReauth = false;
  state.errorMessage = null;

  const validatedBuffers: Array<{
    record: OriginalDocumentRecord;
    buffer: Buffer;
  }> = [];

  // ── 0. Handle directly uploaded verified buffers (if provided) ────────────
  if (opts.preloadedFiles && opts.preloadedFiles.length > 0) {
    await setStage(state, 'validating_document', 'Validating uploaded assignment document…', null);
    for (let i = 0; i < opts.preloadedFiles.length; i++) {
      const f = opts.preloadedFiles[i]!;
      const val = await validateDocumentBuffer(f.buffer, f.filename, f.mimeType);
      if (!val.valid || val.format === 'unsupported') {
        const err = val.error || `Uploaded file "${f.filename}" failed validation.`;
        await setStage(state, 'extraction_failed', err, err);
        throw new Error(err);
      }
      const saved = await saveOriginalDocument({
        studentId,
        assignmentId: assignment.id,
        filename: f.filename,
        buffer: f.buffer,
        mimeType: val.mimeType,
      });
      const rec: OriginalDocumentRecord = {
        index: state.originalDocuments.length,
        filename: saved.filename,
        originalUrl: '',
        format: val.format,
        mimeType: val.mimeType,
        sizeBytes: val.sizeBytes,
        pageCount: val.pageCount ?? null,
        downloadStatus: 'validated',
        validationError: null,
        localPath: saved.localPath,
        storageKey: saved.storageKey,
        downloadedAt: new Date().toISOString(),
      };
      state.originalDocuments.push(rec);
      validatedBuffers.push({ record: rec, buffer: f.buffer });
    }
  } else {
    // Check if we already have valid stored originals and force wasn't requested
    if (!opts.force && state.originalDocuments.length > 0) {
      for (const existingDoc of state.originalDocuments) {
        if (existingDoc.downloadStatus === 'validated') {
          const buf = await readStoredFileBuffer(existingDoc.localPath, existingDoc.storageKey);
          if (buf && buf.length > 0) {
            validatedBuffers.push({ record: existingDoc, buffer: buf });
          }
        }
      }
    }

    // Otherwise discover & download real attachments from authenticated Galgotias LMS
    if (validatedBuffers.length === 0 || opts.force) {
      await setStage(
        state,
        'discovering_attachments',
        'Inspecting LMS assignment activity and attachments…',
        null
      );

      const session = await LMSSessions.findActiveByStudentId(studentId);
      let attachments = Array.isArray(assignment.attachments) ? [...assignment.attachments] : [];
      let refreshedDescription = assignment.description;

      if (session) {
        const connector = new LMSConnector({ headless: true, timeout: 45_000 });
        try {
          await connector.launch();
          const cookies = JSON.parse(
            decrypt(String(session['session_data_encrypted'] ?? ''))
          ) as SessionCookie[];
          await connector.restoreSession(cookies);

          // Navigate to the actual Moodle assignment page to discover all current links & description
          if (assignment.lms_assignment_id && !assignment.lms_assignment_id.startsWith('cal_')) {
            const activityUrl = `${cfg.lms.baseUrl}/mod/assign/view.php?id=${assignment.lms_assignment_id}`;
            const liveDetails = await connector.getAssignmentDetails(activityUrl);
            if (liveDetails.description && liveDetails.description.trim()) {
              refreshedDescription = liveDetails.description.trim();
            }
            if (liveDetails.attachments && liveDetails.attachments.length > 0) {
              attachments = liveDetails.attachments.map((a) => ({
                url: a.url,
                filename: a.filename,
                fileSize: a.fileSize ?? undefined,
                mimeType: a.mimeType ?? undefined,
              }));

              await Assignments.upsert({
                studentId,
                courseId: assignment.course_id,
                lmsAssignmentId: assignment.lms_assignment_id,
                title: liveDetails.title || assignment.title,
                description: refreshedDescription ?? undefined,
                dueDate: liveDetails.dueDate ?? (assignment.due_date ? new Date(assignment.due_date) : undefined),
                attachments: liveDetails.attachments,
              });
            }
          }

          const downloadableAttachments = attachments.filter(
            (a) => typeof a.url === 'string' && a.url.trim().length > 0
          );

          if (downloadableAttachments.length > 0) {
            state.originalDocuments = [];
            await setStage(
              state,
              'downloading',
              `Downloading ${downloadableAttachments.length} attachment(s) from authenticated LMS session…`
            );

            for (let idx = 0; idx < downloadableAttachments.length; idx++) {
              const att = downloadableAttachments[idx]!;
              try {
                const downloaded = await connector.downloadFileBuffer(att.url);
                const actualFilename = downloaded.filename || att.filename || `attachment_${idx + 1}`;

                await setStage(
                  state,
                  'validating_document',
                  `Validating document signature and structure for ${actualFilename}…`
                );

                const validation = await validateDocumentBuffer(
                  downloaded.buffer,
                  actualFilename,
                  downloaded.mimeType
                );

                if (validation.isHtmlLoginRedirect) {
                  state.requiresReauth = true;
                  await LMSSessions.deactivateAll(studentId).catch(() => {});
                  const errMsg = validation.error || 'LMS session expired while downloading attachment.';
                  await setStage(state, 'download_failed', errMsg, errMsg);
                  throw new LMSSessionExpiredError(errMsg);
                }

                if (!validation.valid || validation.format === 'unsupported') {
                  const errMsg = validation.error || `Document validation failed for ${actualFilename}`;
                  state.originalDocuments.push({
                    index: idx,
                    filename: actualFilename,
                    originalUrl: att.url,
                    format: 'other',
                    mimeType: validation.mimeType,
                    sizeBytes: downloaded.buffer.length,
                    pageCount: null,
                    downloadStatus: 'failed',
                    validationError: errMsg,
                    downloadedAt: new Date().toISOString(),
                  });
                  logger.warn('Downloaded attachment failed strict validation', {
                    assignmentId: assignment.id,
                    filename: actualFilename,
                    error: errMsg,
                  });
                  continue;
                }

                const savedArtifact = await saveOriginalDocument({
                  studentId,
                  assignmentId: assignment.id,
                  filename: actualFilename,
                  buffer: downloaded.buffer,
                  mimeType: validation.mimeType,
                });

                const rec: OriginalDocumentRecord = {
                  index: idx,
                  filename: savedArtifact.filename,
                  originalUrl: att.url,
                  format: validation.format,
                  mimeType: validation.mimeType,
                  sizeBytes: validation.sizeBytes,
                  pageCount: validation.pageCount ?? null,
                  downloadStatus: 'validated',
                  validationError: null,
                  localPath: savedArtifact.localPath,
                  storageKey: savedArtifact.storageKey,
                  downloadedAt: new Date().toISOString(),
                };
                state.originalDocuments.push(rec);
                validatedBuffers.push({ record: rec, buffer: downloaded.buffer });
              } catch (dlErr) {
                if (dlErr instanceof LMSSessionExpiredError) {
                  throw dlErr;
                }
                const errText = dlErr instanceof Error ? dlErr.message : String(dlErr);
                state.originalDocuments.push({
                  index: idx,
                  filename: att.filename || `attachment_${idx + 1}`,
                  originalUrl: att.url,
                  format: 'other',
                  mimeType: att.mimeType || 'application/octet-stream',
                  sizeBytes: 0,
                  pageCount: null,
                  downloadStatus: 'failed',
                  validationError: errText,
                  downloadedAt: new Date().toISOString(),
                });
              }
            }

            if (downloadableAttachments.length > 0 && validatedBuffers.length === 0) {
              const firstErr =
                state.originalDocuments.find((d) => d.validationError)?.validationError ||
                'All attachment downloads failed validation.';
              await setStage(state, 'download_failed', firstErr, firstErr);
              throw new Error(firstErr);
            }
          }
        } catch (err) {
          if (err instanceof LMSSessionExpiredError) {
            state.requiresReauth = true;
            await LMSSessions.deactivateAll(studentId).catch(() => {});
            await setStage(state, 'download_failed', err.message, err.message);
            throw err;
          }
          // If attachments existed and could not be downloaded cleanly, fail explicitly rather than falling back to title
          if (attachments.some((a) => a.url)) {
            const msg = err instanceof Error ? err.message : String(err);
            await setStage(state, 'download_failed', msg, msg);
            throw new Error(`LMS download error: ${msg}`);
          }
        } finally {
          await connector.close().catch(() => {});
        }
      } else if (attachments.some((a) => a.url)) {
        // Attachments exist on LMS, but student has no active LMS session!
        state.requiresReauth = true;
        const msg =
          'No active Galgotias LMS session found. Reconnect your university LMS account so CampusSarthi can download the assignment document.';
        await setStage(state, 'download_failed', msg, msg);
        throw new LMSSessionExpiredError(msg);
      }

      assignment.description = refreshedDescription;
    }
  }

  // ── Extract Structured Text, Metadata & Questions ────────────────────────
  await setStage(state, 'extracting', 'Extracting text, pages, tables, and questions from document…');

  const extractor = new PdfExtractor();
  const combinedTextParts: string[] = [];
  const allQuestions: DetectedQuestionItem[] = [];
  const allWarnings: string[] = [];
  const allVisualFlags: string[] = [];
  let totalPages = 0;
  let requiresVisualProcessing = false;
  let primaryDocTitle: string | null = null;
  let combinedInstructions: string | null = null;
  let minConfidence: 'high' | 'medium' | 'low' = 'high';

  for (const { record, buffer } of validatedBuffers) {
    try {
      const extracted = await extractor.extractFromBuffer(buffer, record.filename);
      if (extracted.pageCount > 0 && record.pageCount == null) {
        record.pageCount = extracted.pageCount;
      }
      totalPages += extracted.pageCount || 1;
      if (!primaryDocTitle && extracted.documentTitle) {
        primaryDocTitle = extracted.documentTitle;
      }
      if (!combinedInstructions && extracted.instructions) {
        combinedInstructions = extracted.instructions;
      }
      allWarnings.push(...extracted.warnings);
      allVisualFlags.push(...extracted.visualFlags);
      if (extracted.requiresVisualProcessing) requiresVisualProcessing = true;
      if (extracted.extractionConfidence === 'low') minConfidence = 'low';
      else if (extracted.extractionConfidence === 'medium' && minConfidence === 'high') {
        minConfidence = 'medium';
      }

      if (extracted.text.trim()) {
        combinedTextParts.push(`=== Document: ${record.filename} ===\n${extracted.text.trim()}`);
        const parsedQs = extractor.extractStructuredQuestions(extracted, record.filename);
        for (const q of parsedQs) {
          allQuestions.push({
            ...q,
            id: `q_${allQuestions.length + 1}`,
          });
        }
      } else if (record.format === 'pdf') {
        requiresVisualProcessing = true;
        allVisualFlags.push(
          `${record.filename} contains 0 selectable text characters; multimodal vision inspection required during solving.`
        );
      }
    } catch (extErr) {
      const msg = extErr instanceof Error ? extErr.message : String(extErr);
      allWarnings.push(`Extraction warning for ${record.filename}: ${msg}`);
    }
  }

  // Also inspect LMS assignment description for inline questions / instructions
  const cleanDescription = (assignment.description || '').trim();
  if (cleanDescription) {
    const descQs = extractor.extractStructuredQuestions(
      {
        text: cleanDescription,
        pages: [{ pageNumber: 1, text: cleanDescription, charCount: cleanDescription.length, hasLowText: false }],
        requiresVisualProcessing: false,
      },
      'LMS Activity Description'
    );
    for (const dq of descQs) {
      const duplicate = allQuestions.some(
        (existing) =>
          existing.questionText.toLowerCase().slice(0, 45) ===
          dq.questionText.toLowerCase().slice(0, 45)
      );
      if (!duplicate) {
        allQuestions.push({
          ...dq,
          id: `q_${allQuestions.length + 1}`,
        });
      }
    }
  }

  const fullText = [
    cleanDescription ? `=== LMS Activity Instructions ===\n${cleanDescription}` : '',
    ...combinedTextParts,
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim();

  // Fail loudly if there is neither document content/visual PDF nor substantial LMS instructions
  if (fullText.length < 25 && !requiresVisualProcessing) {
    const err =
      'No readable question text or attached document found in this assignment. Upload the question PDF/DOCX or reconnect LMS if attachments are missing.';
    state.extraction = {
      status: 'failed',
      documentTitle: primaryDocTitle,
      totalPages,
      charCount: 0,
      extractionConfidence: 'low',
      warnings: allWarnings,
      visualFlags: allVisualFlags,
      requiresVisualProcessing: false,
      instructions: combinedInstructions,
      rawTextPreview: '',
      fullText: '',
      detectedQuestions: [],
      extractedAt: new Date().toISOString(),
      error: err,
    };
    await setStage(state, 'extraction_failed', err, err);
    throw new Error(err);
  }

  const snapshot: ExtractionSnapshot = {
    status: 'extracted',
    documentTitle: primaryDocTitle,
    totalPages,
    charCount: fullText.length,
    extractionConfidence: minConfidence,
    warnings: Array.from(new Set(allWarnings)),
    visualFlags: Array.from(new Set(allVisualFlags)),
    requiresVisualProcessing,
    instructions: combinedInstructions || cleanDescription || null,
    rawTextPreview: fullText.slice(0, 3500),
    fullText,
    detectedQuestions: allQuestions,
    extractedAt: new Date().toISOString(),
    error: null,
  };

  state.extraction = snapshot;

  await Promise.all([
    Assignments.updatePipelineColumns(assignment.id, {
      processingStage: 'Extracted assignment content and questions',
      originalDocuments: state.originalDocuments,
      extractedContent: {
        documentTitle: snapshot.documentTitle,
        totalPages: snapshot.totalPages,
        charCount: snapshot.charCount,
        extractionConfidence: snapshot.extractionConfidence,
        warnings: snapshot.warnings,
        visualFlags: snapshot.visualFlags,
        requiresVisualProcessing: snapshot.requiresVisualProcessing,
        extractedAt: snapshot.extractedAt,
      },
      detectedQuestions: snapshot.detectedQuestions,
    }),
    setStage(
      state,
      'extracted',
      allQuestions.length > 0
        ? `Extracted ${allQuestions.length} question(s) from ${state.originalDocuments.length || 1} source.`
        : 'Document text extracted and ready for solution generation.',
      null
    ),
  ]);

  return state;
}

/**
 * Phase 2: Generate verified step-by-step academic solutions + A4 PDF from authentic extracted content.
 */
export async function runAssignmentSolutionGeneration(
  studentId: string,
  assignment: AssignmentRow,
  opts: { forceExtract?: boolean } = {}
): Promise<AssignmentPipelineState> {
  let state = await loadPipelineState(studentId, assignment.id);

  // Always ensure authentic extracted document exists before solving
  if (opts.forceExtract || !state?.extraction || state.extraction.status !== 'extracted') {
    state = await runAssignmentExtraction(studentId, assignment, { force: opts.forceExtract });
  }

  const extraction = state.extraction;
  if (!extraction || (extraction.fullText.trim().length < 25 && !extraction.requiresVisualProcessing)) {
    const err = 'Cannot generate solution without extracted assignment content.';
    await setStage(state, 'failed', err, err);
    throw new Error(err);
  }

  const [course, student] = await Promise.all([
    Courses.findById(assignment.course_id),
    Students.findById(studentId),
  ]);
  const courseName = course?.name ?? 'Unknown Course';

  // Load binary PDF attachment for multimodal Gemini vision ONLY when scanned/visual flags apply
  const inlineAttachments: Array<{ mimeType: string; dataBase64: string }> = [];
  if (extraction.requiresVisualProcessing) {
    for (const orig of state.originalDocuments) {
      if (orig.format === 'pdf' && orig.sizeBytes > 0 && orig.sizeBytes <= 8 * 1024 * 1024) {
        const buf = await readStoredFileBuffer(orig.localPath, orig.storageKey);
        if (buf) {
          inlineAttachments.push({
            mimeType: 'application/pdf',
            dataBase64: buf.toString('base64'),
          });
        }
      }
    }
  }

  try {
    const solutionBundle = await aiRouter.generateAndVerifyAssignmentSolution({
      assignmentTitle: assignment.title,
      courseName,
      dueDate: assignment.due_date ? new Date(assignment.due_date) : null,
      instructions: extraction.instructions,
      extractedText: extraction.fullText,
      detectedQuestions: extraction.detectedQuestions,
      visualFlags: extraction.visualFlags,
      inlineAttachments,
      onStageChange: async (stage, message) => {
        await setStage(state!, stage, message, null);
      },
    });

    await setStage(state, 'generating_pdf', 'Formatting verified solutions into A4 academic PDF…', null);

    const primaryOriginal = state.originalDocuments.find((d) => d.downloadStatus === 'validated');
    const pdfGenerator = new PdfGenerator();
    const { buffer: pdfBuffer, filename: pdfFilename } = await pdfGenerator.generateSolutionPdfBuffer({
      assignmentTitle: assignment.title,
      courseName,
      studentName: student?.full_name || student?.admission_number || 'Student',
      admissionNumber: student?.admission_number ?? undefined,
      dueDate: assignment.due_date ? new Date(assignment.due_date) : null,
      sourceFilename: primaryOriginal?.filename,
      sourcePageCount: primaryOriginal?.pageCount ?? extraction.totalPages,
      summary: solutionBundle.summary,
      aiProviderUsed: solutionBundle.verificationProvider
        ? `${solutionBundle.providerUsed} (Verified by ${solutionBundle.verificationProvider})`
        : solutionBundle.providerUsed,
      verificationNotes: solutionBundle.verificationNotes,
      questions: solutionBundle.questions,
      aiDisclaimer: 'AI-prepared academic draft. Please review and verify before academic submission.',
      generatedAt: new Date(),
    });

    const savedPdf = await saveGeneratedSolutionPdf({
      studentId,
      assignmentId: assignment.id,
      filename: pdfFilename,
      buffer: pdfBuffer,
    });

    const docRecord = await DocStore.create({
      studentId,
      assignmentId: assignment.id,
      filename: savedPdf.filename,
      filePath: savedPdf.localPath,
      fileSizeBytes: savedPdf.fileSizeBytes,
      documentKind: 'generated_solution',
      mimeType: 'application/pdf',
      storageBucket: savedPdf.storageBucket,
      storageKey: savedPdf.storageKey,
    });

    await Assignments.updatePdfDocument(assignment.id, docRecord.id);

    state.solution = {
      summary: solutionBundle.summary,
      questionsCount: solutionBundle.questions.length,
      providerUsed: solutionBundle.providerUsed,
      verificationProvider: solutionBundle.verificationProvider,
      verificationApplied: solutionBundle.verificationApplied,
      verificationNotes: solutionBundle.verificationNotes,
      generatedAt: new Date().toISOString(),
      documentId: docRecord.id,
      documentFilename: docRecord.filename,
    };

    await Promise.all([
      Assignments.updatePipelineColumns(assignment.id, {
        aiProviderUsed: solutionBundle.providerUsed,
        aiVerificationNotes: solutionBundle.verificationNotes,
      }),
      setStage(state, 'completed', 'Your assignment solution is ready.', null),
      ActivityLogs.create({
        studentId,
        type: 'document_generated',
        description: `Verified AI solution PDF generated for: ${assignment.title}`,
        metadata: {
          assignmentId: assignment.id,
          documentId: docRecord.id,
          questionsCount: solutionBundle.questions.length,
          providerUsed: solutionBundle.providerUsed,
          verificationProvider: solutionBundle.verificationProvider,
        },
      }),
    ]);

    logger.info('Assignment solution pipeline completed', {
      assignmentId: assignment.id,
      documentId: docRecord.id,
      questionsCount: solutionBundle.questions.length,
    });

    return state;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await setStage(state, 'failed', 'Solution generation failed.', errMsg);
    throw err;
  }
}
