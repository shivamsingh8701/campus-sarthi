import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Link, Mail, Cpu, Shield } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import { LMSConnectModal } from '@/components/auth/LMSConnectModal';
import { useAuth } from '@/store/authStore';
import { useAuthActions } from '@/hooks/useAuth';
import { useLMS } from '@/hooks/useLMS';
import { authApi } from '@/services/api';
import { cn } from '@/utils/cn';

type Tab = 'profile' | 'lms' | 'email' | 'ai' | 'security';

const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'profile', label: 'Profile', icon: <User className="h-4 w-4" /> },
  { id: 'lms', label: 'LMS Account', icon: <Link className="h-4 w-4" /> },
  { id: 'email', label: 'Email', icon: <Mail className="h-4 w-4" /> },
  { id: 'ai', label: 'AI Model', icon: <Cpu className="h-4 w-4" /> },
  { id: 'security', label: 'Security', icon: <Shield className="h-4 w-4" /> },
];

export function SettingsPage() {
  const { student, refreshStudent } = useAuth();
  const { logout } = useAuthActions();
  const { status, getLMSStatus } = useLMS();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [showLMSModal, setShowLMSModal] = useState(false);

  // Password change state
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    if (pwForm.newPw !== pwForm.confirm) {
      setPwError('Passwords do not match');
      return;
    }
    setPwLoading(true);
    try {
      await authApi.changePassword(pwForm.current, pwForm.newPw);
      setPwSuccess(true);
      setPwForm({ current: '', newPw: '', confirm: '' });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setPwError(e.response?.data?.message || 'Password change failed');
    } finally {
      setPwLoading(false);
    }
  };

  const handleLogoutAll = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <TopBar title="Settings" />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="flex gap-6">
          {/* Sidebar tabs */}
          <nav className="w-44 flex-shrink-0 space-y-0.5">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors text-left',
                  activeTab === tab.id
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Content */}
          <div className="flex-1 max-w-xl space-y-5">
            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <Card>
                <CardHeader><h2 className="text-sm font-semibold text-gray-900">Profile</h2></CardHeader>
                <CardBody className="space-y-4">
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Name</p>
                    <p className="text-sm text-gray-900">{student?.name || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Email</p>
                    <p className="text-sm text-gray-900">{student?.email}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Admission Number</p>
                    <p className="text-sm text-gray-900">{student?.admissionNumber}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Account Created</p>
                    <p className="text-sm text-gray-900">
                      {student?.createdAt ? new Date(student.createdAt).toLocaleDateString() : '—'}
                    </p>
                  </div>
                </CardBody>
              </Card>
            )}

            {/* LMS Tab */}
            {activeTab === 'lms' && (
              <Card>
                <CardHeader><h2 className="text-sm font-semibold text-gray-900">LMS Account</h2></CardHeader>
                <CardBody className="space-y-4">
                  <StatusIndicator
                    status={student?.lmsConnected ? 'connected' : 'disconnected'}
                    label={student?.lmsConnected ? `Connected as ${student.lmsUsername || 'unknown'}` : 'Not connected'}
                  />
                  {student?.lastSync && (
                    <p className="text-xs text-gray-500">
                      Last synced: {new Date(student.lastSync).toLocaleString()}
                    </p>
                  )}
                  <Button
                    size="sm"
                    variant={student?.lmsConnected ? 'outline' : 'default'}
                    onClick={() => { getLMSStatus(); setShowLMSModal(true); }}
                  >
                    {student?.lmsConnected ? 'Manage Connection' : 'Connect LMS'}
                  </Button>
                </CardBody>
              </Card>
            )}

            {/* Email Tab */}
            {activeTab === 'email' && (
              <Card>
                <CardHeader><h2 className="text-sm font-semibold text-gray-900">Email</h2></CardHeader>
                <CardBody className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Email Address</p>
                    <p className="text-sm text-gray-900">{student?.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusIndicator
                      status={student?.emailVerified ? 'connected' : 'warning'}
                      label={student?.emailVerified ? 'Verified' : 'Not verified'}
                    />
                  </div>
                  <p className="text-xs text-gray-500">
                    Generated documents and analysis results are sent to this address.
                  </p>
                </CardBody>
              </Card>
            )}

            {/* AI Tab */}
            {activeTab === 'ai' && (
              <Card>
                <CardHeader><h2 className="text-sm font-semibold text-gray-900">AI Model</h2></CardHeader>
                <CardBody className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Active Provider</p>
                    <p className="text-sm text-gray-900">Google Gemini</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Usage</p>
                    <p className="text-sm text-gray-900">Assignment analysis, question extraction, document generation</p>
                  </div>
                  <p className="text-xs text-gray-400">
                    AI provider configuration is managed by your administrator.
                  </p>
                </CardBody>
              </Card>
            )}

            {/* Security Tab */}
            {activeTab === 'security' && (
              <div className="space-y-5">
                <Card>
                  <CardHeader><h2 className="text-sm font-semibold text-gray-900">Change Password</h2></CardHeader>
                  <CardBody>
                    <form onSubmit={handlePasswordChange} className="space-y-4">
                      <Input
                        label="Current Password"
                        type="password"
                        value={pwForm.current}
                        onChange={(e) => setPwForm((p) => ({ ...p, current: e.target.value }))}
                        required
                      />
                      <Input
                        label="New Password"
                        type="password"
                        value={pwForm.newPw}
                        onChange={(e) => setPwForm((p) => ({ ...p, newPw: e.target.value }))}
                        required
                      />
                      <Input
                        label="Confirm New Password"
                        type="password"
                        value={pwForm.confirm}
                        onChange={(e) => setPwForm((p) => ({ ...p, confirm: e.target.value }))}
                        required
                      />
                      {pwError && (
                        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                          {pwError}
                        </p>
                      )}
                      {pwSuccess && (
                        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                          Password changed successfully.
                        </p>
                      )}
                      <Button type="submit" size="sm" isLoading={pwLoading}>
                        Update Password
                      </Button>
                    </form>
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader><h2 className="text-sm font-semibold text-gray-900">Sessions</h2></CardHeader>
                  <CardBody>
                    <p className="text-sm text-gray-600 mb-4">
                      Logging out will end your current session and redirect you to the login page.
                    </p>
                    <Button variant="destructive" size="sm" onClick={handleLogoutAll}>
                      Log Out
                    </Button>
                  </CardBody>
                </Card>
              </div>
            )}
          </div>
        </div>
      </main>

      <LMSConnectModal
        isOpen={showLMSModal}
        onClose={() => setShowLMSModal(false)}
        currentStatus={status}
        onSuccess={refreshStudent}
      />
    </div>
  );
}

export default SettingsPage