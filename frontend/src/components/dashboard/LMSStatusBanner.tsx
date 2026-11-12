import React, { useState } from 'react';
import { RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/Button';
import { LMSConnectModal } from '@/components/auth/LMSConnectModal';
import type { LMSStatus } from '@/types';

interface LMSStatusBannerProps {
  status: LMSStatus | null;
  onSync?: () => void;
  isSyncing?: boolean;
  onStatusChange?: () => void;
}

function parseLastSyncDate(lastSync: unknown): Date | null {
  if (!lastSync) return null;
  try {
    if (typeof lastSync === 'string') {
      const d = new Date(lastSync);
      return isNaN(d.getTime()) ? null : d;
    }
    if (typeof lastSync === 'object' && lastSync !== null) {
      const obj = lastSync as {
        completedAt?: string;
        startedAt?: string;
        completed_at?: string;
        started_at?: string;
      };
      const candidate = obj.completedAt || obj.startedAt || obj.completed_at || obj.started_at;
      if (candidate) {
        const d = new Date(candidate);
        return isNaN(d.getTime()) ? null : d;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function formatLastSync(lastSync: unknown): string | null {
  const date = parseLastSyncDate(lastSync);
  if (!date) return null;
  try {
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return null;
  }
}

export function LMSStatusBanner({
  status,
  onSync,
  isSyncing,
  onStatusChange,
}: LMSStatusBannerProps) {
  const [showModal, setShowModal] = useState(false);
  const isConnected = Boolean(status?.connected);
  const syncTimeStr = formatLastSync(status?.lastSync);

  if (isConnected) {
    return (
      <>
        <div className="glass-surface flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl px-5 py-3.5 border-emerald-500/20">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-emerald-50 border border-emerald-200/70 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-900">
                Galgotias LMS Connected · {status?.username || 'Active Session'}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {syncTimeStr
                  ? `Last successful sync ${syncTimeStr}`
                  : 'Authenticated session active and ready to synchronize'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onSync && (
              <Button
                size="sm"
                variant="outline"
                onClick={onSync}
                isLoading={isSyncing}
                className="gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Sync Now
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setShowModal(true)}>
              Manage
            </Button>
          </div>
        </div>

        <LMSConnectModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          currentStatus={status}
          onSuccess={onStatusChange}
        />
      </>
    );
  }

  return (
    <>
      <div className="glass-surface flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl px-5 py-3.5 border-amber-400/35">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl bg-amber-50 border border-amber-200/80 flex items-center justify-center shrink-0">
            <AlertCircle className="h-4 w-4 text-amber-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-900">Galgotias LMS Disconnected</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Connect your university account to sync real courses, deadlines, and PDF assignments.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="default"
          onClick={() => setShowModal(true)}
          className="shrink-0"
        >
          Connect LMS
        </Button>
      </div>

      <LMSConnectModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        currentStatus={status}
        onSuccess={onStatusChange}
      />
    </>
  );
}
