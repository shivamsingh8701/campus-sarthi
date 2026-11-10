import React, { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import { useLMS } from '@/hooks/useLMS';
import type { LMSStatus } from '@/types';

interface LMSConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentStatus: LMSStatus | null;
  onSuccess?: () => void;
}

function formatSyncDate(lastSync: unknown): string | null {
  if (!lastSync) return null;
  try {
    if (typeof lastSync === 'string') {
      const d = new Date(lastSync);
      return isNaN(d.getTime()) ? null : d.toLocaleString();
    }
    if (typeof lastSync === 'object' && lastSync !== null) {
      const obj = lastSync as {
        completedAt?: string;
        startedAt?: string;
        completed_at?: string;
        started_at?: string;
      };
      const val = obj.completedAt || obj.startedAt || obj.completed_at || obj.started_at;
      if (val) {
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d.toLocaleString();
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function LMSConnectModal({
  isOpen,
  onClose,
  currentStatus,
  onSuccess,
}: LMSConnectModalProps) {
  const { connect, disconnect, isLoading } = useLMS();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const isConnected = currentStatus?.connected;
  const syncDateDisplay = formatSyncDate(currentStatus?.lastSync);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const result = await connect(username, password);
    if (result.success) {
      setUsername('');
      setPassword('');
      onSuccess?.();
      onClose();
    } else {
      setError(result.message || 'Connection failed');
    }
  };

  const handleDisconnect = async () => {
    const result = await disconnect();
    if (result.success) {
      onSuccess?.();
      onClose();
    } else {
      setError(result.message || 'Disconnect failed');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-900">
            {isConnected ? 'LMS Account' : 'Connect LMS Account'}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {isConnected ? (
            <>
              <div className="flex items-center gap-3 rounded-lg bg-green-50 border border-green-200 px-4 py-3">
                <StatusIndicator status="connected" showLabel={false} />
                <div>
                  <p className="text-sm font-medium text-green-800">Connected</p>
                  <p className="text-xs text-green-700">
                    Signed in as <strong>{currentStatus?.username}</strong>
                  </p>
                </div>
              </div>
              {syncDateDisplay && (
                <p className="text-xs text-gray-500">
                  Last synced: {syncDateDisplay}
                </p>
              )}
              {error && (
                <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}
              <Button
                variant="destructive"
                className="w-full"
                onClick={handleDisconnect}
                isLoading={isLoading}
              >
                Disconnect LMS Account
              </Button>
            </>
          ) : (
            <>
              {/* Warning */}
              <div className="flex gap-3 rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 text-yellow-600 mt-0.5" />
                <div className="text-xs text-yellow-800 space-y-1">
                  <p>
                    Your credentials are used only to access the university LMS on
                    your behalf and are <strong>never stored in plain text</strong>.
                  </p>
                  <p className="text-indigo-700 font-medium cursor-pointer hover:underline" onClick={() => { setUsername('21SCSE101001'); setPassword('DemoLMSPassword@123'); }}>
                    💡 Click here to test with Demo LMS credentials (21SCSE101001)
                  </p>
                </div>
              </div>

              <form onSubmit={handleConnect} className="space-y-3">
                <Input
                  label="Galgotias Admission Number / LMS Username"
                  placeholder="e.g. 21SCSE101001 or 22SCSE..."
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                />
                <Input
                  label="Official LMS Password"
                  type="password"
                  placeholder="Enter your university LMS password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />

                {error && (
                  <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                    {error}
                  </p>
                )}

                <Button type="submit" className="w-full" isLoading={isLoading}>
                  {isLoading ? 'Connecting to Galgotias LMS...' : 'Authenticate & Fetch Official Data'}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
