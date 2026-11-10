import React, { useState } from 'react';
import { RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
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

function formatLastSync(lastSync: unknown): string | null {
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
        <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-4 w-4 flex-shrink-0 text-green-600" />
            <div>
              <p className="text-sm font-medium text-green-800">
                LMS Connected · {status?.username || 'Active'}
              </p>
              {syncTimeStr && (
                <p className="text-xs text-green-600">
                  Last synced {syncTimeStr}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {onSync && (
              <Button
                size="sm"
                variant="outline"
                onClick={onSync}
                isLoading={isSyncing}
                className="border-green-300 text-green-800 hover:bg-green-100 gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Sync Now
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowModal(true)}
              className="text-green-700 hover:bg-green-100"
            >
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
      <div className="flex items-center justify-between rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3">
        <div className="flex items-center gap-3">
          <AlertCircle className="h-4 w-4 flex-shrink-0 text-yellow-600" />
          <div>
            <p className="text-sm font-medium text-yellow-800">LMS Not Connected</p>
            <p className="text-xs text-yellow-600">
              Connect your Galgotias LMS account to track assignments and quizzes automatically.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setShowModal(true)}
          className="flex-shrink-0 border-yellow-300 bg-white hover:bg-yellow-100 text-yellow-900"
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
