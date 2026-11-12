// ============================================================
// CampusSarthi — Gemini + OpenAI Solution & Verification Router
// No fabricated solutions. Strictly requires real extracted content
// and configured AI provider responses.
// ============================================================

import { logger } from '../../utils/logger';
import { getConfig } from '../../config';
import type { AIProvider, AITask, AIResponse, AIOptions } from '../../types';
import type { DetectedQuestionItem } from '../storage/documentStorage';

// ─── Task Configuration ──────────────────────────────────────

interface TaskConfig {
  primary: AIProvider;
  fallback: AIProvider;
}

const TASK_CONFIG: Record<AITask, TaskConfig> = {
  assignment_analysis: { primary: 'gemini', fallback: 'openai' },
  solution_generation: { primary: 'gemini', fallback: 'openai' },
  quiz_analysis: { primary: 'gemini', fallback: 'openai' },
  answer_verification: { primary: 'openai', fallback: 'gemini' },
  summary_generation: { primary: 'gemini', fallback: 'openai' },
};

function getModelForTask(provider: AIProvider, task: AITask): string {
  const cfg = getConfig();
  if (provider === 'gemini') {
    if (task === 'answer_verification') return cfg.ai.geminiProModel || 'gemini-3-flash-preview';
    return cfg.ai.geminiModel || 'gemini-3-flash-preview';
  }
  if (task === 'solution_generation' || task === 'answer_verification') {
    return cfg.ai.openaiReasoningModel || 'gpt-4o';
  }
  return cfg.ai.openaiModel || 'gpt-4o-mini';
}

// ─── Token Usage Tracking ────────────────────────────────────

interface UsageStats {
  inputTokens: number;
  outputTokens: number;
  calls: number;
  errors: number;
}

const usageByProvider: Record<AIProvider, UsageStats> = {
  gemini: { inputTokens: 0, outputTokens: 0, calls: 0, errors: 0 },
  openai: { inputTokens: 0, outputTokens: 0, calls: 0, errors: 0 },
};

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 1000
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Do not retry configuration/auth errors
      if (/not configured|API_KEY|401|403|invalid api key/i.test(lastError.message)) {
        throw lastError;
      }
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        logger.warn('AI call failed, retrying', { attempt, delay, error: lastError.message });
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError ?? new Error('AI call failed after retries');
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`AI call timed out after ${ms}ms`)), ms)
    ),
  ]);
}

function parseJsonSafe<T>(rawText: string, providerName: string): T {
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```$/i, '').trim();
  }
  // Extract first JSON object if wrapped in stray commentary
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  try {
    return JSON.parse(cleaned) as T;
  } catch (err) {
    throw new Error(
      `AI response from ${providerName} was not valid JSON (${err instanceof Error ? err.message : String(err)}). Sample: ${cleaned.slice(0, 220)}`
    );
  }
}

// ─── Gemini Provider ─────────────────────────────────────────

async function callGemini(
  model: string,
  prompt: string,
  options: AIOptions = {}
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GoogleGenerativeAI } = require('@google/generative-ai') as typeof import('@google/generative-ai');

  const cfg = getConfig();
  if (!cfg.ai.geminiApiKey) throw new Error('GEMINI_API_KEY is not configured');

  const genAI = new GoogleGenerativeAI(cfg.ai.geminiApiKey);
  const generativeModel = genAI.getGenerativeModel({
    model,
    systemInstruction: options.systemInstruction,
    generationConfig: {
      temperature: options.temperature ?? 0.35,
      maxOutputTokens: options.maxOutputTokens ?? 8192,
    },
  });

  const parts: Array<string | { inlineData: { mimeType: string; data: string } }> = [];
  if (options.inlineAttachments && options.inlineAttachments.length > 0) {
    for (const att of options.inlineAttachments) {
      parts.push({ inlineData: { mimeType: att.mimeType, data: att.dataBase64 } });
    }
  }
  parts.push(prompt);

  const result = await generativeModel.generateContent(parts);
  const response = result.response;
  const text = response.text();
  if (!text || !text.trim()) throw new Error('Gemini returned an empty response');
  const usage = response.usageMetadata;

  return {
    text,
    inputTokens: usage?.promptTokenCount ?? 0,
    outputTokens: usage?.candidatesTokenCount ?? 0,
  };
}

// ─── OpenAI Provider ─────────────────────────────────────────

async function callOpenAI(
  model: string,
  prompt: string,
  options: AIOptions = {}
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const OpenAI = require('openai') as typeof import('openai');
  const OpenAIClient = (OpenAI as unknown as { default: typeof import('openai').default }).default ?? OpenAI;

  const cfg = getConfig();
  if (!cfg.ai.openaiApiKey) throw new Error('OPENAI_API_KEY is not configured');

  const client = new (OpenAIClient as unknown as new (opts: { apiKey: string }) => import('openai').default)({
    apiKey: cfg.ai.openaiApiKey,
  });

  const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
  if (options.systemInstruction) {
    messages.push({ role: 'system', content: options.systemInstruction });
  }
  messages.push({ role: 'user', content: prompt });

  const completion = await (client as unknown as import('openai').default).chat.completions.create({
    model,
    messages,
    temperature: options.temperature ?? 0.35,
    max_tokens: options.maxOutputTokens ?? 4096,
  });

  const choice = completion.choices[0];
  if (!choice?.message?.content) throw new Error('OpenAI returned empty response');

  return {
    text: choice.message.content,
    inputTokens: completion.usage?.prompt_tokens ?? 0,
    outputTokens: completion.usage?.completion_tokens ?? 0,
  };
}

// ─── Solution & Verification Types ───────────────────────────

export interface SolvedQuestionOutput {
  numberLabel: string;
  sourcePage: number | null;
  question: string;
  reasoning: string;
  answer: string;
  verificationNote?: string;
}

export interface AssignmentSolutionBundle {
  questions: SolvedQuestionOutput[];
  summary: string;
  providerUsed: string;
  verificationProvider: string | null;
  verificationApplied: boolean;
  verificationNotes: string;
  extractedVisualQuestions?: DetectedQuestionItem[];
}

// ─── Main Router Class ───────────────────────────────────────

export class AIRouter {
  private static instance: AIRouter;

  static getInstance(): AIRouter {
    if (!AIRouter.instance) {
      AIRouter.instance = new AIRouter();
    }
    return AIRouter.instance;
  }

  private async callProvider(
    provider: AIProvider,
    model: string,
    prompt: string,
    options: AIOptions
  ): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
    if (provider === 'gemini') {
      return callGemini(model, prompt, options);
    }
    return callOpenAI(model, prompt, options);
  }

  /**
   * Analyze using the AI router with automatic configured provider fallback.
   * Never fabricates assignment solutions when external AI providers fail.
   */
  async analyze(task: AITask, prompt: string, options: AIOptions = {}): Promise<AIResponse> {
    const taskCfg = TASK_CONFIG[task];
    const startMs = Date.now();
    const cfg = getConfig();

    const candidates: AIProvider[] = [taskCfg.primary, taskCfg.fallback].filter((p) =>
      p === 'gemini' ? Boolean(cfg.ai.geminiApiKey) : Boolean(cfg.ai.openaiApiKey)
    );

    if (candidates.length === 0) {
      throw new Error(
        'No AI provider is configured. Set GEMINI_API_KEY or OPENAI_API_KEY in backend environment.'
      );
    }

    let lastError: Error | undefined;

    for (const provider of candidates) {
      const model = getModelForTask(provider, task);

      try {
        const result = await withRetry(
          () => withTimeout(this.callProvider(provider, model, prompt, options), 90_000),
          3,
          1200
        );

        const durationMs = Date.now() - startMs;

        usageByProvider[provider].inputTokens += result.inputTokens;
        usageByProvider[provider].outputTokens += result.outputTokens;
        usageByProvider[provider].calls += 1;

        logger.info('AI call succeeded', {
          task,
          provider,
          model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          durationMs,
        });

        return {
          text: result.text,
          usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
          provider,
          model,
          durationMs,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        usageByProvider[provider].errors += 1;

        logger.warn('AI provider failed', {
          task,
          provider,
          model,
          error: lastError.message,
        });
      }
    }

    throw lastError ?? new Error('All configured AI providers failed.');
  }

  async analyzeWithStructuredOutput<T>(
    task: AITask,
    prompt: string,
    schemaDescription: string,
    options: AIOptions = {}
  ): Promise<T> {
    const structuredPrompt = `${prompt}

IMPORTANT: Respond ONLY with valid JSON matching this schema:
${schemaDescription}

Do not wrap in markdown code fences or add commentary before/after JSON.`;

    const response = await this.analyze(task, structuredPrompt, {
      ...options,
      temperature: options.temperature ?? 0.25,
    });

    return parseJsonSafe<T>(response.text, `${response.provider}:${response.model}`);
  }

  /**
   * Two-stage Assignment Solution Generation + Technical/Mathematical Verification.
   * Strictly relies on extracted assignment content / document attachments.
   */
  async generateAndVerifyAssignmentSolution(params: {
    assignmentTitle: string;
    courseName: string;
    dueDate: Date | null;
    instructions: string | null;
    extractedText: string;
    detectedQuestions: DetectedQuestionItem[];
    visualFlags: string[];
    inlineAttachments?: Array<{ mimeType: string; dataBase64: string }>;
    onStageChange?: (stage: 'generating_solution' | 'verifying_solution', message: string) => Promise<void>;
  }): Promise<AssignmentSolutionBundle> {
    const cfg = getConfig();

    const hasDocumentContent = params.extractedText.trim().length >= 25 || (params.inlineAttachments?.length ?? 0) > 0;
    const hasInstructions = (params.instructions || '').trim().length >= 25;
    if (!hasDocumentContent && !hasInstructions && params.detectedQuestions.length === 0) {
      throw new Error(
        'Insufficient authentic assignment content to solve. Download and extract the assignment document before generating solutions.'
      );
    }

    if (params.onStageChange) {
      await params.onStageChange(
        'generating_solution',
        'Generating step-by-step academic solutions from extracted document content…'
      );
    }

    const questionBlock =
      params.detectedQuestions.length > 0
        ? params.detectedQuestions
            .map(
              (q, i) =>
                `${q.numberLabel || `Q${i + 1}`} (Source page: ${q.sourcePage ?? 'N/A'}${
                  q.marksHint ? `, Marks: ${q.marksHint}` : ''
                }${q.requiresVisualContext ? ', Visual/Diagram referenced' : ''}): ${q.questionText}`
            )
            .join('\n\n')
        : 'Identify every question directly from the attached document content and instructions below, preserving original question numbering.';

    const visualSection =
      params.visualFlags.length > 0
        ? `\nVISUAL / SCANNED DOCUMENT NOTES:\n- ${params.visualFlags.join('\n- ')}\nIf a question refers to an unreadable diagram or missing numeric figure, state clearly what is unreadable rather than inventing values.`
        : '';

    const stage1Prompt = `You are a university STEM & engineering professor preparing clear, complete undergraduate solutions based STRICTLY on the authentic assignment document provided below.

COURSE: ${params.courseName}
ASSIGNMENT TITLE: ${params.assignmentTitle}
DUE DATE: ${params.dueDate ? params.dueDate.toISOString().split('T')[0] : 'Not specified'}
${params.instructions ? `\nASSIGNMENT INSTRUCTIONS:\n${params.instructions}\n` : ''}
DETECTED QUESTIONS (${params.detectedQuestions.length}):
${questionBlock}
${visualSection}

EXTRACTED ASSIGNMENT DOCUMENT TEXT:
${params.extractedText.slice(0, 28000)}

REQUIREMENTS:
1. Address EVERY question in its exact original numbering ("numberLabel": e.g. "Q1", "Q2", "Problem 1") and preserve order.
2. Provide complete, thorough undergraduate engineering explanations — never shorten answers or skip derivation steps.
3. For each question provide:
   - "numberLabel": Exact question number label
   - "sourcePage": Numeric page number from the document if known, else null
   - "question": Exact complete question statement from the source document
   - "reasoning": Required theory, governing laws/theorems, formulas, given variables, and approach
   - "answer": Full step-by-step derivation, numerical substitution, intermediate math, unit verification, and clearly labeled Final Answer
4. Do NOT fabricate missing data, syllabus codes, or unreadable diagram measurements. If any portion is illegible or depends on an unextractable image, explicitly note it in "answer".
5. Return ONLY valid JSON:
{
  "questions": [
    {
      "numberLabel": "Q1",
      "sourcePage": 1,
      "question": "string",
      "reasoning": "string",
      "answer": "string"
    }
  ],
  "summary": "Concise 2-4 sentence summary of topics and formulas covered"
}`;

    const stage1Res = await this.analyze('solution_generation', stage1Prompt, {
      temperature: 0.25,
      maxOutputTokens: 8192,
      inlineAttachments: params.inlineAttachments,
    });

    interface Stage1Payload {
      questions: Array<{
        numberLabel?: string;
        sourcePage?: number | null;
        question: string;
        reasoning?: string;
        answer: string;
      }>;
      summary: string;
    }

    const draft = parseJsonSafe<Stage1Payload>(stage1Res.text, `${stage1Res.provider}:${stage1Res.model}`);
    if (!Array.isArray(draft.questions) || draft.questions.length === 0) {
      throw new Error('AI returned 0 solved questions from the assignment document.');
    }

    let finalQuestions: SolvedQuestionOutput[] = draft.questions.map((q, idx) => ({
      numberLabel: q.numberLabel || params.detectedQuestions[idx]?.numberLabel || `Q${idx + 1}`,
      sourcePage: q.sourcePage ?? params.detectedQuestions[idx]?.sourcePage ?? null,
      question: q.question,
      reasoning: q.reasoning || '',
      answer: q.answer,
    }));
    let finalSummary = draft.summary || `Academic solution draft for ${params.assignmentTitle}.`;

    // ── Stage 2: Verification & Technical Review ─────────────────────────────
    let verificationProvider: string | null = null;
    let verificationApplied = false;
    let verificationNotes = '';

    if (params.onStageChange) {
      await params.onStageChange(
        'verifying_solution',
        cfg.ai.openaiApiKey
          ? 'Verifying formulas, calculations, units, and explanation clarity with OpenAI…'
          : 'Performing mathematical & academic self-verification check…'
      );
    }

    const verifyPrompt = `You are a rigorous academic reviewer verifying solutions against the original assignment questions and document text.

ASSIGNMENT: ${params.assignmentTitle} (${params.courseName})
ORIGINAL DETECTED QUESTIONS / DOCUMENT SNIPPET:
${questionBlock.slice(0, 6000)}

DRAFT SOLUTIONS TO VERIFY:
${JSON.stringify({ questions: finalQuestions, summary: finalSummary }, null, 2).slice(0, 22000)}

Check every item for:
1. Mathematical / numerical accuracy and formula correctness.
2. Proper SI/engineering units and dimensional consistency.
3. Completeness (no skipped steps or unaddressed subquestions).
4. Zero fabricated values where source text was missing.

Return ONLY valid JSON preserving every question in the exact same order, making corrections directly in "answer" and "reasoning" where needed, and adding a brief "verificationNote" per question plus an overall "verificationNotes" summary:
{
  "questions": [
    {
      "numberLabel": "string",
      "sourcePage": 1,
      "question": "string",
      "reasoning": "string",
      "answer": "string",
      "verificationNote": "string"
    }
  ],
  "summary": "string",
  "verificationNotes": "Overall audit notes (checks passed / corrections made)"
}`;

    // Prefer OpenAI as dedicated second-opinion reviewer when configured (and not already the generator)
    if (cfg.ai.openaiApiKey) {
      try {
        const openaiModel = getModelForTask('openai', 'answer_verification');
        const verifyRes = await withRetry(
          () => withTimeout(callOpenAI(openaiModel, verifyPrompt, { temperature: 0.15, maxOutputTokens: 4096 }), 90_000),
          2,
          1200
        );
        usageByProvider.openai.inputTokens += verifyRes.inputTokens;
        usageByProvider.openai.outputTokens += verifyRes.outputTokens;
        usageByProvider.openai.calls += 1;

        interface VerifyPayload {
          questions?: SolvedQuestionOutput[];
          summary?: string;
          verificationNotes?: string;
        }
        const verified = parseJsonSafe<VerifyPayload>(verifyRes.text, `openai:${openaiModel}`);
        if (Array.isArray(verified.questions) && verified.questions.length === finalQuestions.length) {
          finalQuestions = verified.questions.map((vq, idx) => ({
            numberLabel: vq.numberLabel || finalQuestions[idx]!.numberLabel,
            sourcePage: vq.sourcePage ?? finalQuestions[idx]!.sourcePage,
            question: vq.question || finalQuestions[idx]!.question,
            reasoning: vq.reasoning || finalQuestions[idx]!.reasoning,
            answer: vq.answer || finalQuestions[idx]!.answer,
            verificationNote: vq.verificationNote || 'Verified for formulas, units, and step-by-step clarity.',
          }));
          if (verified.summary) finalSummary = verified.summary;
          verificationProvider = `openai:${openaiModel}`;
          verificationApplied = true;
          verificationNotes =
            verified.verificationNotes ||
            `Verified numerical calculations, formulas, units, and explanations via ${openaiModel}.`;
        }
      } catch (verifyErr) {
        logger.warn('OpenAI secondary verification pass failed, falling back to Gemini verification', {
          error: String(verifyErr),
        });
      }
    }

    // If OpenAI not configured or unavailable, use Gemini verification pass cleanly & disclose honestly
    if (!verificationApplied && cfg.ai.geminiApiKey) {
      try {
        const geminiVerifier = cfg.ai.geminiProModel || cfg.ai.geminiModel || 'gemini-3-flash-preview';
        const verifyRes = await withTimeout(
          callGemini(geminiVerifier, verifyPrompt, { temperature: 0.15, maxOutputTokens: 8192 }),
          60_000
        );
        usageByProvider.gemini.inputTokens += verifyRes.inputTokens;
        usageByProvider.gemini.outputTokens += verifyRes.outputTokens;
        usageByProvider.gemini.calls += 1;

        interface VerifyPayload {
          questions?: SolvedQuestionOutput[];
          summary?: string;
          verificationNotes?: string;
        }
        const verified = parseJsonSafe<VerifyPayload>(verifyRes.text, `gemini:${geminiVerifier}`);
        if (Array.isArray(verified.questions) && verified.questions.length === finalQuestions.length) {
          finalQuestions = verified.questions.map((vq, idx) => ({
            numberLabel: vq.numberLabel || finalQuestions[idx]!.numberLabel,
            sourcePage: vq.sourcePage ?? finalQuestions[idx]!.sourcePage,
            question: vq.question || finalQuestions[idx]!.question,
            reasoning: vq.reasoning || finalQuestions[idx]!.reasoning,
            answer: vq.answer || finalQuestions[idx]!.answer,
            verificationNote: vq.verificationNote,
          }));
          if (verified.summary) finalSummary = verified.summary;
          verificationProvider = `gemini:${geminiVerifier}`;
          verificationApplied = true;
          verificationNotes =
            verified.verificationNotes ||
            `Verification check completed via ${geminiVerifier}${cfg.ai.openaiApiKey ? '' : ' (OPENAI_API_KEY not configured for cross-model review)'}.`;
        }
      } catch (gemVerifyErr) {
        logger.warn('Gemini verification pass skipped', { error: String(gemVerifyErr) });
        verificationNotes = 'Draft generated cleanly; secondary verification pass timed out or skipped.';
      }
    }

    return {
      questions: finalQuestions,
      summary: finalSummary,
      providerUsed: `${stage1Res.provider}:${stage1Res.model}`,
      verificationProvider,
      verificationApplied,
      verificationNotes:
        verificationNotes ||
        `Generated by ${stage1Res.provider}:${stage1Res.model}.`,
    };
  }

  getUsageStats(): Record<AIProvider, UsageStats> {
    return { ...usageByProvider };
  }
}

export const aiRouter = AIRouter.getInstance();
export default aiRouter;
