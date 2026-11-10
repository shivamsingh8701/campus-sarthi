import React from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface TopBarProps {
  title: string;
  onSync?: () => void;
  isSyncing?: boolean;
  actions?: React.ReactNode;
}

export function TopBar({ title, onSync, isSyncing, actions }: TopBarProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6">
      <h1 className="text-sm font-semibold text-gray-900">{title}</h1>
      <div className="flex items-center gap-2">
        {actions}
        {onSync && (
          <Button
            variant="outline"
            size="sm"
            onClick={onSync}
            isLoading={isSyncing}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            Sync
          </Button>
        )}
      </div>
    </header>
  );
}
