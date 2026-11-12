import React, { useState, useEffect, useCallback } from 'react';
import {
  Link2,
  Mail,
  Cpu,
  Sparkles,
  Database,
  RefreshCw,
  ExternalLink,
  Send,
  AlertCircle,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { LMSConnectModal } from '@/components/auth/LMSConnectModal';
import { useLMS } from '@/hooks/useLMS';
import { useAuth } from '@/store/authStore';
import { emailApi, integrationsApi } from '@/services/api';
import type { IntegrationCheck } from '@/types';

const iconMap: Record<IntegrationCheck['id'], React.ReactNode> = {
  lms: <Link2 className="h-4 w-4 text-indigo-600" />,
  gemini: <Sparkles className="h-4 w-4 text-purple-600" />,
  openai: <Cpu className="h-4 w-4 text-slate-700" />,
  email: <Mail className="h-4 w-4 text-blue-600" />,
  supabase: <Database className="h-4 w-4 text-emerald-600" />,
};

function getBadgeForState(state: IntegrationCheck['state']) {
  switch (state) {
    case 'connected':
      return { variant: 'success' as const, label: 'Connected' };
    case 'reachable':
      return { variant: 'info' as const, label: 'Reachable' };
    case 'disconnected':
      return { variant: 'warning' as const, label: 'Disconnected' };
    case 'unconfigured':
      return { variant: 'default' as const, label: 'Not configured' };
    case 'error':
      return { variant: 'failed' as const, label: 'Error' };
  }
}

export function IntegrationsPage() {
  const { status, getLMSStatus } = useLMS();
  const { student, refreshStudent } = useAuth();

  const [checks, setChecks] = useState<IntegrationCheck[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [showLMSModal, setShowLMSModal] = useState(false);
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);
  const [emailStatusMsg, setEmailStatusMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchHealth = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await integrationsApi.getHealth();
      if (Array.isArray(res.integrations)) {
        setChecks(res.integrations);
      }
    } catch {
      // keep existing checks if transient failure
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    getLMSStatus();
    fetchHealth();
  }, [getLMSStatus, fetchHealth]);

  const handleTestOne = async (service: IntegrationCheck['id']) => {
    setTestingId(service);
    try {
      const res = await integrationsApi.testService(service);
      if (res.integration) {
        setChecks((prev) =>
          prev.map((item) => (item.id === service ? res.integration : item))
        );
      }
    } finally {
      setTestingId(null);
    }
  };

  const handleSendTestEmail = async () => {
    const targetEmail = student?.email;
    if (!targetEmail) {
      setEmailStatusMsg({ ok: false, text: 'No email address associated with this account.' });
      return;
    }
    setIsSendingTestEmail(true);
    setEmailStatusMsg(null);
    try {
      const res = await emailApi.sendTestEmail(targetEmail);
      setEmailStatusMsg({
        ok: true,
        text: res.message || `Test email sent to ${targetEmail}`,
      });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      setEmailStatusMsg({
        ok: false,
        text: e.response?.data?.error || e.message || 'Email delivery failed.',
      });
    } finally {
      setIsSendingTestEmail(false);
    }
  };

  const healthyCount = checks.filter((c) => c.healthy).length;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <TopBar
        title="Integrations"
        subtitle={
          checks.length > 0
            ? `${healthyCount} of ${checks.length} services verified healthy`
            : 'Live service health & credentials'
        }
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={fetchHealth}
            isLoading={isLoading}
            className="gap-1.5 rounded-full"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Re-check All</span>
          </Button>
        }
      />
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Service Connections</h2>
            <p className="text-xs text-slate-500">
              Each status badge reflects a live runtime probe against the underlying API or database.
            </p>
          </div>
        </div>

        {isLoading && checks.length === 0 ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner size="lg" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {checks.map((item) => {
              const badge = getBadgeForState(item.state);
              const checkedRel = (() => {
                try {
                  return formatDistanceToNow(new Date(item.lastCheckedAt), { addSuffix: true });
                } catch {
                  return 'just now';
                }
              })();

              return (
                <Card key={item.id} className="flex flex-col">
                  <CardHeader className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-xl bg-slate-900/[0.04] border border-slate-900/[0.06] flex items-center justify-center shrink-0">
                        {iconMap[item.id]}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-slate-900 truncate">{item.name}</h3>
                        <p className="text-[11px] text-slate-500 truncate">
                          Checked {checkedRel}
                          {item.latencyMs !== undefined ? ` · ${item.latencyMs} ms` : ''}
                        </p>
                      </div>
                    </div>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </CardHeader>

                  <CardBody className="flex flex-1 flex-col justify-between gap-4">
                    <div className="space-y-2">
                      <p className="text-xs text-slate-600 leading-relaxed">{item.detail}</p>

                      {item.error && (
                        <div className="flex items-start gap-2 rounded-xl border border-rose-200/80 bg-rose-50/80 px-3 py-2 text-[11px] text-rose-700">
                          <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-rose-600" />
                          <span className="break-words">{item.error}</span>
                        </div>
                      )}

                      {item.id === 'lms' && Boolean(item.meta?.['username']) && (
                        <div className="rounded-xl bg-white/60 border border-slate-900/[0.06] px-3 py-2 text-[11px] text-slate-600 space-y-0.5">
                          <p>
                            Admission ID:{' '}
                            <strong className="text-slate-900">{String(item.meta?.['username'])}</strong>
                          </p>
                          {Boolean(item.meta?.['expiresAt']) && (
                            <p>
                              Expires:{' '}
                              {new Date(String(item.meta?.['expiresAt'])).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      )}

                      {item.id === 'email' && emailStatusMsg && (
                        <div
                          className={`flex items-center gap-1.5 text-[11px] ${
                            emailStatusMsg.ok ? 'text-emerald-700' : 'text-rose-600'
                          }`}
                        >
                          {emailStatusMsg.ok ? (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          ) : (
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          )}
                          <span>{emailStatusMsg.text}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-900/[0.06]">
                      {item.id === 'lms' && (
                        <>
                          <Button
                            size="sm"
                            variant={item.healthy ? 'outline' : 'default'}
                            onClick={() => setShowLMSModal(true)}
                            disabled={Boolean(student?.isDemo)}
                          >
                            {item.healthy ? 'Manage Session' : 'Connect LMS'}
                          </Button>
                          <a
                            href="https://gulms.galgotiasuniversity.org/"
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 ml-auto"
                          >
                            Portal <ExternalLink className="h-3 w-3" />
                          </a>
                        </>
                      )}

                      {item.id === 'email' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleSendTestEmail}
                          isLoading={isSendingTestEmail}
                          disabled={!student?.email}
                          className="gap-1.5"
                        >
                          <Send className="h-3 w-3" />
                          <span>Send Test Email</span>
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleTestOne(item.id)}
                        isLoading={testingId === item.id}
                        className={item.id === 'lms' ? '' : 'ml-auto'}
                      >
                        Verify Connection
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      <LMSConnectModal
        isOpen={showLMSModal}
        onClose={() => setShowLMSModal(false)}
        currentStatus={status}
        onSuccess={() => {
          getLMSStatus();
          fetchHealth();
          refreshStudent();
        }}
      />
    </div>
  );
}

export default IntegrationsPage;
