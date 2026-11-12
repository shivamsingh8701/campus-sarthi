import React, { useState } from 'react';
import { X, ShieldCheck, Eye, EyeOff, AlertCircle } from 'lucide-react';
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
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const isConnected = currentStatus?.connected;
  const syncDateDisplay = formatSyncDate(currentStatus?.lastSync);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const result = await connect(username.trim(), password);
    if (result.success) {
      setUsername('');
      setPassword('');
      onSuccess?.();
      onClose();
    } else {
      setError(result.message || 'Connection failed. Check your university credentials.');
    }
  };

  const handleDisconnect = async () => {
    setError('');
    const result = await disconnect();
    if (result.success) {
      onSuccess?.();
      onClose();
    } else {
      setError(result.message || 'Disconnect failed.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-xs"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="glass-elevated relative z-10 w-full max-w-md rounded-3xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-900/[0.06] px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-900">
            {isConnected ? 'Galgotias LMS Session' : 'Connect Galgotias LMS'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-900/[0.05] hover:text-slate-700 transition-colors"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {isConnected ? (
            <>
              <div className="flex items-center gap-3 rounded-2xl bg-emerald-50/85 border border-emerald-200/80 px-4 py-3">
                <StatusIndicator status="connected" showLabel={false} />
                <div>
                  <p className="text-xs font-semibold text-emerald-900">Active Authenticated Session</p>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    Admission ID: <strong>{currentStatus?.username}</strong>
                  </p>
                </div>
              </div>
              {syncDateDisplay && (
                <p className="text-xs text-slate-500">
                  Last synchronized: <span className="font-medium text-slate-700">{syncDateDisplay}</span>
                </p>
              )}
              {error && (
                <p className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">
                  {error}
                </p>
              )}
              <Button
                variant="destructive"
                className="w-full"
                onClick={handleDisconnect}
                isLoading={isLoading}
              >
                Disconnect LMS Session
              </Button>
            </>
          ) : (
            <>
              <div className="flex gap-2.5 rounded-2xl bg-slate-900/[0.03] border border-slate-900/[0.06] px-3.5 py-3">
                <ShieldCheck className="h-4 w-4 shrink-0 text-indigo-600 mt-0.5" />
                <p className="text-xs text-slate-600 leading-relaxed">
                  Authenticates directly with <strong>gulms.galgotiasuniversity.org</strong>. Your university password is never stored in plaintext or shared with AI providers.
                </p>
              </div>

              <form onSubmit={handleConnect} className="space-y-3.5">
                <Input
                  label="Admission Number"
                  placeholder="e.g. 24SCSE101001"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                />
                <Input
                  label="University LMS Password"
                  type={showPw ? 'text' : 'password'}
                  placeholder="Enter your LMS password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  rightElement={
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      className="rounded-lg p-1 text-slate-400 hover:text-slate-700"
                      aria-label={showPw ? 'Hide password' : 'Show password'}
                    >
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  }
                />

                {error && (
                  <div className="flex items-start gap-2 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <Button type="submit" size="lg" className="w-full" isLoading={isLoading}>
                  {isLoading ? 'Verifying with Galgotias LMS...' : 'Connect & Sync Courses'}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
