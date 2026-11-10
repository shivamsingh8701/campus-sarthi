import React, { useState } from 'react';
import { X, Sparkles, Copy, Check, BookOpen, Brain, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { QuizSolution } from '@/types';

interface QuizSolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  solution: QuizSolution | null;
  isLoading: boolean;
}

export function QuizSolutionModal({
  isOpen,
  onClose,
  solution,
  isLoading,
}: QuizSolutionModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (solution?.solutionGuide) {
      navigator.clipboard.writeText(solution.solutionGuide);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl bg-white shadow-xl overflow-hidden border border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-150 px-6 py-4 bg-gradient-to-r from-emerald-50 via-teal-50/50 to-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-600 text-white shadow-xs">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                {solution ? solution.title : 'Quiz Solution & Revision Guide'}
              </h2>
              <p className="text-xs text-gray-500">
                {solution?.courseName ?? 'AI Academic Review'} • Post-Submission Solutions &amp; Theory
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-gray-900">Generating Quiz Solutions &amp; Review...</p>
                <p className="text-xs text-gray-500">
                  Gemini Flash is analyzing the quiz topics, question patterns, and verified explanations.
                </p>
              </div>
            </div>
          ) : solution ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-3 text-xs text-emerald-900 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Lightbulb className="h-3.5 w-3.5 text-emerald-700" />
                  <span>Verified solution draft prepared for your academic study and post-assessment review.</span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopy}
                  className="h-7 text-xs gap-1 border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                >
                  {copied ? <Check className="h-3 w-3 text-emerald-700" /> : <Copy className="h-3 w-3" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </Button>
              </div>

              {/* Solution Text */}
              <div className="rounded-lg border border-gray-150 bg-gray-50/50 p-4 text-xs font-mono leading-relaxed text-gray-800 whitespace-pre-wrap selection:bg-emerald-200">
                {solution.solutionGuide}
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-gray-400">
              No solution data available. Click Generate to produce solutions.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-150 px-6 py-3 bg-gray-50 flex items-center justify-between">
          <span className="text-[11px] text-gray-400">
            {solution?.generatedAt ? `Generated on ${new Date(solution.generatedAt).toLocaleDateString()}` : ''}
          </span>
          <Button size="sm" variant="default" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

export default QuizSolutionModal;

