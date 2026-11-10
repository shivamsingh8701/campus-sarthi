import React from 'react';
import { cn } from '@/utils/cn';
import type { AssignmentStatus } from '@/types';

type BadgeVariant =
  | AssignmentStatus
  | 'active'
  | 'success'
  | 'expired'
  | 'info'
  | 'warning'
  | 'default';

const variantClasses: Record<BadgeVariant, string> = {
  pending: 'bg-yellow-50 text-yellow-800 border border-yellow-200',
  processing: 'bg-blue-50 text-blue-800 border border-blue-200',
  completed: 'bg-green-50 text-green-800 border border-green-200',
  failed: 'bg-red-50 text-red-800 border border-red-200',
  active: 'bg-green-50 text-green-800 border border-green-200',
  success: 'bg-green-50 text-green-800 border border-green-200',
  expired: 'bg-gray-100 text-gray-600 border border-gray-200',
  info: 'bg-indigo-50 text-indigo-800 border border-indigo-200',
  warning: 'bg-orange-50 text-orange-800 border border-orange-200',
  default: 'bg-gray-100 text-gray-700 border border-gray-200',
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
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
        variantClasses[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
