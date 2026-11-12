import React from 'react';
import { cn } from '@/utils/cn';
import type { AssignmentStatus } from '@/types';

type BadgeVariant =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'active'
  | 'success'
  | 'expired'
  | 'info'
  | 'warning'
  | 'default';

export function statusToBadgeVariant(status?: AssignmentStatus | string): BadgeVariant {
  if (!status) return 'pending';
  if (status === 'completed') return 'completed';
  if (status === 'failed' || status === 'download_failed' || status === 'extraction_failed') return 'failed';
  if (status === 'extracted') return 'info';
  if (status === 'pending') return 'pending';
  return 'processing';
}

export function statusToLabel(status?: AssignmentStatus | string): string {
  switch (status) {
    case 'discovering_attachments':
      return 'Discovering LMS';
    case 'downloading':
      return 'Downloading';
    case 'download_failed':
      return 'Download Failed';
    case 'validating_document':
      return 'Validating';
    case 'extracting':
      return 'Extracting';
    case 'extraction_failed':
      return 'Extraction Failed';
    case 'extracted':
      return 'Extracted';
    case 'generating_solution':
      return 'Solving';
    case 'verifying_solution':
      return 'Verifying';
    case 'generating_pdf':
      return 'Creating PDF';
    case 'processing':
      return 'Processing';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    default:
      return 'Pending';
  }
}

const variantClasses: Record<BadgeVariant, string> = {
  pending: 'bg-amber-50/90 text-amber-800 border border-amber-200/80',
  processing: 'bg-blue-50/90 text-blue-700 border border-blue-200/80',
  completed: 'bg-emerald-50/90 text-emerald-700 border border-emerald-200/80',
  failed: 'bg-rose-50/90 text-rose-700 border border-rose-200/80',
  active: 'bg-emerald-50/90 text-emerald-700 border border-emerald-200/80',
  success: 'bg-emerald-50/90 text-emerald-700 border border-emerald-200/80',
  expired: 'bg-slate-100/90 text-slate-600 border border-slate-200/80',
  info: 'bg-indigo-50/90 text-indigo-700 border border-indigo-200/80',
  warning: 'bg-amber-50/90 text-amber-800 border border-amber-200/80',
  default: 'bg-slate-100/80 text-slate-700 border border-slate-200/70',
};

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant = 'default', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-tight',
        variantClasses[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
