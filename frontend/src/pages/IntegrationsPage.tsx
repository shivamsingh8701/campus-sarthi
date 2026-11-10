import React, { useState, useEffect } from 'react';
import {
  Link2,
  Mail,
  Cpu,
  Sparkles,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Send,
} from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LMSConnectModal } from '@/components/auth/LMSConnectModal';
import { useLMS } from '@/hooks/useLMS';
import { useAuth } from '@/store/authStore';
import { emailApi } from '@/services/api';

export function IntegrationsPage() {
  const { status, getLMSStatus } = useLMS();
  const { student } = useAuth();
  const [showLMSModal, setShowLMSModal] = useState(false);
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);
  const [emailStatusMsg, setEmailStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    getLMSStatus();
  }, [getLMSStatus]);

  const handleSendTestEmail = async () => {
    const targetEmail = student?.email;
    if (!targetEmail) {
      setEmailStatusMsg('No email address found for your account.');
      return;
    }
    setIsSendingTestEmail(true);
    setEmailStatusMsg(null);
    try {
      const res = await emailApi.sendTestEmail(targetEmail);
      setEmailStatusMsg(res.message || `Test email dispatched to ${targetEmail}`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      setEmailStatusMsg('Failed: ' + (e.response?.data?.error || e.message || 'Email delivery failed'));
    } finally {
      setIsSendingTestEmail(false);
    }
  };

  const isLMSConnected = Boolean(status?.connected);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <TopBar title="Integrations" />
      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Service Integrations</h1>
          <p className="text-xs text-gray-500">
            Monitor and manage actual connections to Galgotias LMS, Google Workspace, and AI reasoning providers.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Galgotias LMS */}
          <Card className="flex flex-col">
            <CardHeader className="flex items-center justify-between pb-2">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-orange-50 p-2 text-orange-600">
                  <Link2 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Galgotias University LMS</h2>
                  <p className="text-xs text-gray-400">gulms.galgotiasuniversity.org</p>
                </div>
              </div>
              <Badge variant={isLMSConnected ? 'success' : 'expired'}>
                {isLMSConnected ? 'Connected' : 'Disconnected'}
              </Badge>
            </CardHeader>
            <CardBody className="space-y-4 flex flex-1 flex-col justify-between">
              <p className="text-xs text-gray-600">
                Playwright Moodle automation connector links your official university account to fetch courses,
                assignment PDFs, quiz schedules, and deadlines directly from ActiLearn.
              </p>

              {isLMSConnected && (
                <div className="rounded-md bg-gray-50 p-3 text-xs space-y-1">
                  <p className="text-gray-500">
                    Logged in user: <span className="font-semibold text-gray-900">{status?.username}</span>
                  </p>
                  <p className="text-gray-500">
                    Session state: <span className="text-green-700 font-medium">Encrypted & Active</span>
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <Button
                  size="sm"
                  variant={isLMSConnected ? 'outline' : 'default'}
                  onClick={() => setShowLMSModal(true)}
                  className="gap-2"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {isLMSConnected ? 'Manage LMS Connection' : 'Connect University LMS'}
                </Button>
                <a
                  href="https://gulms.galgotiasuniversity.org/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-gray-500 hover:text-gray-900 flex items-center gap-1 ml-auto"
                >
                  Visit Portal <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </CardBody>
          </Card>

          {/* Google / Email Delivery */}
          <Card className="flex flex-col">
            <CardHeader className="flex items-center justify-between pb-2">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
                  <Mail className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Email & Gmail Delivery</h2>
                  <p className="text-xs text-gray-400">Verified SMTP & Gmail OAuth</p>
                </div>
              </div>
              <Badge variant="info">Configured</Badge>
            </CardHeader>
            <CardBody className="space-y-4 flex flex-1 flex-col justify-between">
              <p className="text-xs text-gray-600">
                Delivers AI-generated assignment solution PDF reports and deadline notifications directly to your
                verified student email address with confirmation logging.
              </p>
              <div className="rounded-md bg-gray-50 p-3 text-xs space-y-1">
                <p className="text-gray-500">
                  Delivery mode: <span className="font-medium text-gray-900">Nodemailer SMTP / OAuth2</span>
                </p>
                <p className="text-gray-500">
                  Attachment support: <span className="font-medium text-green-700">PDF Document Delivery</span>
                </p>
              </div>
              <div className="flex flex-col gap-2 pt-2">
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSendTestEmail}
                    isLoading={isSendingTestEmail}
                    disabled={!student?.email}
                    className="gap-2 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {student?.email
                      ? `Send Test Email to ${student.email}`
                      : 'Send Test Email (login required)'}
                  </Button>
                </div>
                {emailStatusMsg && (
                  <p className={`text-xs ${emailStatusMsg.startsWith('Failed') ? 'text-red-600' : 'text-green-600'}`}>
                    {emailStatusMsg}
                  </p>
                )}
              </div>
            </CardBody>
          </Card>

          {/* Google Gemini */}
          <Card className="flex flex-col">
            <CardHeader className="flex items-center justify-between pb-2">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-purple-50 p-2 text-purple-600">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Google Gemini</h2>
                  <p className="text-xs text-gray-400">gemini-1.5-flash / gemini-1.5-pro</p>
                </div>
              </div>
              <Badge variant="success">Active Provider</Badge>
            </CardHeader>
            <CardBody className="space-y-4 flex flex-1 flex-col justify-between">
              <p className="text-xs text-gray-600">
                Powers multimodal document understanding, question extraction from assignment PDFs, topic
                summarization, and step-by-step solution drafts.
              </p>
              <div className="rounded-md bg-gray-50 p-3 text-xs space-y-1">
                <p className="text-gray-500">
                  Task routing: <span className="font-medium text-gray-900">Document Extraction & Drafting</span>
                </p>
                <p className="text-gray-500">
                  Status: <span className="text-green-700 font-medium">Ready</span>
                </p>
              </div>
              <div className="pt-2">
                <Badge variant="info">Primary AI Engine</Badge>
              </div>
            </CardBody>
          </Card>

          {/* OpenAI */}
          <Card className="flex flex-col">
            <CardHeader className="flex items-center justify-between pb-2">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
                  <Cpu className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">OpenAI</h2>
                  <p className="text-xs text-gray-400">gpt-4o-mini / gpt-4o</p>
                </div>
              </div>
              <Badge variant="success">Active Fallback & Review</Badge>
            </CardHeader>
            <CardBody className="space-y-4 flex flex-1 flex-col justify-between">
              <p className="text-xs text-gray-600">
                Provides complex reasoning, technical problem-solving verification, calculation checks, and automated
                failover when the primary model is constrained.
              </p>
              <div className="rounded-md bg-gray-50 p-3 text-xs space-y-1">
                <p className="text-gray-500">
                  Task routing: <span className="font-medium text-gray-900">Answer Verification & Fallback</span>
                </p>
                <p className="text-gray-500">
                  Status: <span className="text-green-700 font-medium">Ready</span>
                </p>
              </div>
              <div className="pt-2">
                <Badge variant="info">Verification Engine</Badge>
              </div>
            </CardBody>
          </Card>
        </div>
      </main>

      <LMSConnectModal
        isOpen={showLMSModal}
        onClose={() => setShowLMSModal(false)}
        currentStatus={status}
        onSuccess={getLMSStatus}
      />
    </div>
  );
}

export default IntegrationsPage;

