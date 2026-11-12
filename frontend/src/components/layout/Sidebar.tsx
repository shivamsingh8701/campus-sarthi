import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  BookOpen,
  FileText,
  Clock,
  Sparkles,
  Download,
  Activity,
  Layers,
  Settings,
  LogOut,
  X,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import { useAuth } from '@/store/authStore';
import { useAuthActions } from '@/hooks/useAuth';

interface NavItem {
  label: string;
  to: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { label: 'Overview', to: '/dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { label: 'My Courses', to: '/dashboard/courses', icon: <BookOpen className="h-4 w-4" /> },
  { label: 'Assignments', to: '/dashboard/assignments', icon: <FileText className="h-4 w-4" /> },
  { label: 'Quizzes', to: '/dashboard/quizzes', icon: <Clock className="h-4 w-4" /> },
  { label: 'AI Solutions', to: '/dashboard/solutions', icon: <Sparkles className="h-4 w-4" /> },
  { label: 'Documents', to: '/dashboard/documents', icon: <Download className="h-4 w-4" /> },
  { label: 'Activity', to: '/dashboard/activity', icon: <Activity className="h-4 w-4" /> },
  { label: 'Integrations', to: '/dashboard/integrations', icon: <Layers className="h-4 w-4" /> },
  { label: 'Settings', to: '/dashboard/settings', icon: <Settings className="h-4 w-4" /> },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function Sidebar({ mobileOpen = false, onCloseMobile }: SidebarProps) {
  const { student } = useAuth();
  const { logout } = useAuthActions();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout(false);
    navigate('/login');
  };

  const sidebarContent = (
    <aside className="glass-sidebar flex h-full w-64 flex-col rounded-2xl overflow-hidden">
      {/* Brand */}
      <div className="flex h-14 items-center justify-between border-b border-slate-900/[0.06] px-4">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs">
            <span className="text-[11px] font-bold tracking-tight">CS</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold tracking-tight text-slate-900">
              CampusSarthi
            </span>
            <span className="rounded-full bg-indigo-50 border border-indigo-200/70 px-1.5 py-0.2 text-[10px] font-medium text-indigo-700">
              AI
            </span>
          </div>
        </div>
        {onCloseMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            className="lg:hidden rounded-lg p-1 text-slate-400 hover:bg-slate-900/[0.05] hover:text-slate-700"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-3">
        <ul className="space-y-0.5">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/dashboard'}
                onClick={onCloseMobile}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition-all duration-150',
                    isActive
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-900/[0.045] hover:text-slate-900'
                  )
                }
              >
                {item.icon}
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Bottom Profile & Session State */}
      <div className="border-t border-slate-900/[0.06] px-3.5 py-3.5 space-y-3 bg-white/40">
        <div className="flex items-center justify-between">
          <StatusIndicator
            status={student?.isDemo ? 'warning' : student?.lmsConnected ? 'connected' : 'disconnected'}
            label={
              student?.isDemo
                ? 'Demo Mode'
                : student?.lmsConnected
                ? 'LMS Connected'
                : 'LMS Offline'
            }
          />
          {student?.admissionNumber && (
            <span className="text-[10px] font-mono text-slate-400 truncate max-w-[92px]">
              {student.admissionNumber}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 rounded-xl bg-white/70 border border-slate-900/[0.06] px-2.5 py-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-slate-900">
              {student?.name || student?.fullName || student?.admissionNumber || 'Student'}
            </p>
            <p className="truncate text-[11px] text-slate-500">{student?.email}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop Floating Rail */}
      <div className="hidden lg:block p-3 pr-0 h-screen shrink-0">
        {sidebarContent}
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex p-3">
          <div
            className="fixed inset-0 bg-slate-900/25 backdrop-blur-xs"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{sidebarContent}</div>
        </div>
      )}
    </>
  );
}
