import React from 'react';
import { cn } from '@/utils/cn';

type StatusType = 'connected' | 'disconnected' | 'warning';

const colorMap: Record<StatusType, string> = {
  connected: 'bg-emerald-500',
  disconnected: 'bg-rose-500',
  warning: 'bg-amber-400',
};

const labelMap: Record<StatusType, string> = {
  connected: 'Connected',
  disconnected: 'Disconnected',
  warning: 'Attention needed',
};

interface StatusIndicatorProps {
  status: StatusType;
  label?: string;
  showLabel?: boolean;
  className?: string;
}

export function StatusIndicator({
  status,
  label,
  showLabel = true,
  className,
}: StatusIndicatorProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className={cn('h-2 w-2 rounded-full shrink-0', colorMap[status])} />
      {showLabel && (
        <span className="text-xs font-medium text-slate-600">{label ?? labelMap[status]}</span>
      )}
    </div>
  );
}
