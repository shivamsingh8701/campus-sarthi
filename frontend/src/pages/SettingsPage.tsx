import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Link, Mail, Cpu, Shield, CheckCircle2, AlertCircle } from 'lucide-react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
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

  // Profile form state
  const [profileForm, setProfileForm] = useState({
    name: student?.name || student?.fullName || '',
    email: student?.email || '',
  });
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);

  useEffect(() => {
    setProfileForm({
      name: student?.name || student?.fullName || '',
      email: student?.email || '',
    });
  }, [student?.name, student?.fullName, student?.email]);

  // Password change state
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    setProfileSaving(true);
    try {
      await authApi.updateProfile({
        name: profileForm.name.trim(),
        email: profileForm.email.trim(),
      });
      await refreshStudent();
      setProfileMsg({ ok: true, text: 'Profile updated successfully.' });
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { error?: string } }; message?: string };
      setProfileMsg({
        ok: false,
        text: e2.response?.data?.error || e2.message || 'Unable to update profile.',
      });
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess(false);
    if (pwForm.newPw !== pwForm.confirm) {
      setPwError('Passwords do not match.');
      return;
    }
    if (pwForm.newPw.length < 8) {
      setPwError('CampusSarthi password must be at least 8 characters.');
      return;
    }
    setPwLoading(true);
    try {
      await authApi.changePassword(pwForm.current, pwForm.newPw);
      setPwSuccess(true);
      setPwForm({ current: '', newPw: '', confirm: '' });
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { error?: string; message?: string } } };
      setPwError(e2.response?.data?.error || e2.response?.data?.message || 'Password update failed.');
    } finally {
      setPwLoading(false);
    }
  };

  const handleLogout = async (disconnectLms: boolean) => {
    await logout(disconnectLms);
    navigate('/login');
  };

  const needsCurrentPw = student?.authMode === 'campus';

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <TopBar title="Settings" subtitle="Manage your profile, university session, and preferences" />
      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="flex flex-col md:flex-row gap-6 max-w-4xl">
          {/* Sidebar tabs */}
          <nav className="flex md:flex-col gap-1 overflow-x-auto md:w-48 shrink-0">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2.5 rounded-xl px-3.5 py-2 text-xs font-medium transition-all text-left whitespace-nowrap',
                  activeTab === tab.id
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-white/75 hover:text-slate-900'
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Content */}
          <div className="flex-1 space-y-5">
            {activeTab === 'profile' && (
              <Card>
                <CardHeader className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900">Student Profile</h2>
                  <Badge variant={student?.isDemo ? 'warning' : 'info'}>
                    {student?.isDemo
                      ? 'Demo Account'
                      : student?.authMode === 'campus'
                      ? 'CampusSarthi Auth'
                      : 'Galgotias LMS Auth'}
                  </Badge>
                </CardHeader>
                <CardBody>
                  <form onSubmit={handleProfileSave} className="space-y-4">
                    <Input
                      label="Full Name"
                      value={profileForm.name}
                      onChange={(e) => setProfileForm((p) => ({ ...p, name: e.target.value }))}
                      disabled={Boolean(student?.isDemo)}
                    />
                    <Input
                      label="Email Address"
                      type="email"
                      value={profileForm.email}
                      onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))}
                      disabled={Boolean(student?.isDemo)}
                      required
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                      <div>
                        <p className="text-xs font-medium text-slate-500 mb-1">Admission Number</p>
                        <p className="text-sm font-mono text-slate-900">{student?.admissionNumber}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-500 mb-1">Member Since</p>
                        <p className="text-sm text-slate-900">
                          {student?.createdAt ? new Date(student.createdAt).toLocaleDateString() : '—'}
                        </p>
                      </div>
                    </div>

                    {profileMsg && (
                      <div
                        className={`flex items-center gap-2 text-xs ${
                          profileMsg.ok ? 'text-emerald-700' : 'text-rose-600'
                        }`}
                      >
                        {profileMsg.ok ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                        ) : (
                          <AlertCircle className="h-4 w-4 shrink-0" />
                        )}
                        <span>{profileMsg.text}</span>
                      </div>
                    )}

                    {!student?.isDemo && (
                      <Button type="submit" size="sm" isLoading={profileSaving}>
                        Save Changes
                      </Button>
                    )}
                  </form>
                </CardBody>
              </Card>
            )}

            {activeTab === 'lms' && (
              <Card>
                <CardHeader>
                  <h2 className="text-sm font-semibold text-slate-900">Galgotias LMS Connection</h2>
                </CardHeader>
                <CardBody className="space-y-4">
                  <StatusIndicator
                    status={student?.lmsConnected ? 'connected' : 'disconnected'}
                    label={
                      student?.lmsConnected
                        ? `Authenticated as ${student.lmsUsername || student.admissionNumber}`
                        : 'No active university session'
                    }
                  />
                  <div className="text-xs text-slate-500 space-y-1">
                    {student?.lastSync && (
                      <p>Last synchronized: {new Date(student.lastSync).toLocaleString()}</p>
                    )}
                    {student?.lmsExpiresAt && (
                      <p>Session expires: {new Date(student.lmsExpiresAt).toLocaleDateString()}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant={student?.lmsConnected ? 'outline' : 'default'}
                    disabled={Boolean(student?.isDemo)}
                    onClick={() => {
                      getLMSStatus();
                      setShowLMSModal(true);
                    }}
                  >
                    {student?.lmsConnected ? 'Manage / Reauthenticate Session' : 'Connect Galgotias LMS'}
                  </Button>
                </CardBody>
              </Card>
            )}

            {activeTab === 'email' && (
              <Card>
                <CardHeader>
                  <h2 className="text-sm font-semibold text-slate-900">Notification Email</h2>
                </CardHeader>
                <CardBody className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1">Registered Email</p>
                    <p className="text-sm font-medium text-slate-900">{student?.email}</p>
                  </div>
                  <StatusIndicator
                    status={student?.isEmailVerified || student?.emailVerified ? 'connected' : 'warning'}
                    label={
                      student?.isEmailVerified || student?.emailVerified
                        ? 'Email verified'
                        : 'Verification pending'
                    }
                  />
                  <p className="text-xs text-slate-500">
                    Generated PDF drafts and deadline summaries are dispatched to this email address. Test SMTP health on the Integrations page.
                  </p>
                </CardBody>
              </Card>
            )}

            {activeTab === 'ai' && (
              <Card>
                <CardHeader>
                  <h2 className="text-sm font-semibold text-slate-900">AI Document Pipeline</h2>
                </CardHeader>
                <CardBody className="space-y-3">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    CampusSarthi extracts questions from assignment attachments (PDF/DOCX) and builds structured revision drafts using Gemini and OpenAI. University credentials are never shared with AI models.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate('/dashboard/integrations')}
                  >
                    Inspect Live AI Provider Status
                  </Button>
                </CardBody>
              </Card>
            )}

            {activeTab === 'security' && (
              <div className="space-y-5">
                <Card>
                  <CardHeader>
                    <h2 className="text-sm font-semibold text-slate-900">
                      {needsCurrentPw
                        ? 'Change CampusSarthi Password'
                        : 'Set Independent CampusSarthi Password'}
                    </h2>
                  </CardHeader>
                  <CardBody>
                    <p className="text-xs text-slate-500 mb-4">
                      Optional separate password for signing into CampusSarthi without changing your official Galgotias LMS password.
                    </p>
                    <form onSubmit={handlePasswordChange} className="space-y-3.5">
                      {needsCurrentPw && (
                        <Input
                          label="Current CampusSarthi Password"
                          type="password"
                          value={pwForm.current}
                          onChange={(e) => setPwForm((p) => ({ ...p, current: e.target.value }))}
                          required
                          disabled={Boolean(student?.isDemo)}
                        />
                      )}
                      <Input
                        label="New App Password"
                        type="password"
                        value={pwForm.newPw}
                        onChange={(e) => setPwForm((p) => ({ ...p, newPw: e.target.value }))}
                        required
                        minLength={8}
                        disabled={Boolean(student?.isDemo)}
                      />
                      <Input
                        label="Confirm New Password"
                        type="password"
                        value={pwForm.confirm}
                        onChange={(e) => setPwForm((p) => ({ ...p, confirm: e.target.value }))}
                        required
                        minLength={8}
                        disabled={Boolean(student?.isDemo)}
                      />
                      {pwError && <p className="text-xs text-rose-600">{pwError}</p>}
                      {pwSuccess && (
                        <p className="text-xs text-emerald-700">
                          CampusSarthi password updated successfully.
                        </p>
                      )}
                      <Button
                        type="submit"
                        size="sm"
                        isLoading={pwLoading}
                        disabled={Boolean(student?.isDemo)}
                      >
                        Update App Password
                      </Button>
                    </form>
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader>
                    <h2 className="text-sm font-semibold text-slate-900">Session Controls</h2>
                  </CardHeader>
                  <CardBody className="flex flex-wrap gap-2.5">
                    <Button variant="outline" size="sm" onClick={() => handleLogout(false)}>
                      Sign Out
                    </Button>
                    {!student?.isDemo && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleLogout(true)}
                      >
                        Sign Out & Disconnect LMS
                      </Button>
                    )}
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
        onSuccess={() => {
          getLMSStatus();
          refreshStudent();
        }}
      />
    </div>
  );
}

export default SettingsPage;
