import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  BookOpen,
  FileText,
  Clock,
  Download,
  Activity,
  Layers,
  Settings,
  LogOut,
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
  { label: 'AI Documents', to: '/dashboard/documents', icon: <Download className="h-4 w-4" /> },
  { label: 'Activity History', to: '/dashboard/activity', icon: <Activity className="h-4 w-4" /> },
  { label: 'Integrations', to: '/dashboard/integrations', icon: <Layers className="h-4 w-4" /> },
  { label: 'Settings', to: '/dashboard/settings', icon: <Settings className="h-4 w-4" /> },
];

export function Sidebar() {
  const { student } = useAuth();
  const { logout } = useAuthActions();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-gray-200 bg-white">
      {/* Logo */}
      <div className="flex h-14 items-center border-b border-gray-100 px-5">
        <span className="text-sm font-semibold tracking-tight text-gray-900">
          Campus<span className="text-indigo-600">Pilot</span> <span className="text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-mono font-medium ml-1">AI</span>
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/dashboard'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-indigo-50 text-indigo-700 border-l-2 border-indigo-600 pl-[10px]'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  )
                }
              >
                {item.icon}
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Bottom area */}
      <div className="border-t border-gray-100 px-4 py-4 space-y-3">
        {/* LMS Status */}
        <StatusIndicator
          status={student?.lmsConnected ? 'connected' : 'disconnected'}
          label={student?.lmsConnected ? 'LMS Connected' : 'LMS Disconnected'}
        />

        {/* Student info + logout */}
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-gray-900">
              {student?.name || student?.admissionNumber || 'Student'}
            </p>
            <p className="truncate text-xs text-gray-500">{student?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="ml-2 flex-shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            title="Log out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
