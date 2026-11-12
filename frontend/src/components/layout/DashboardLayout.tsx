import React, { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { FlaskConical } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useAuth } from '@/store/authStore';
import { useAuthActions } from '@/hooks/useAuth';

export interface DashboardOutletContext {
  openMobileMenu: () => void;
}

export function DashboardLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { student } = useAuth();
  const { logout } = useAuthActions();
  const navigate = useNavigate();

  const handleExitDemo = async () => {
    await logout(false);
    navigate('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        {student?.isDemo && (
          <div className="bg-amber-50/90 border-b border-amber-200/80 px-4 py-1.5 flex items-center justify-between gap-2 text-xs text-amber-900">
            <div className="flex items-center gap-2 min-w-0">
              <FlaskConical className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              <span className="truncate font-medium">
                Demo Mode Active — Displaying sample data, not your live university records.
              </span>
            </div>
            <button
              type="button"
              onClick={handleExitDemo}
              className="shrink-0 font-semibold text-amber-800 hover:text-amber-950 underline"
            >
              Sign in with LMS
            </button>
          </div>
        )}
        <ErrorBoundary>
          <Outlet context={{ openMobileMenu: () => setMobileNavOpen(true) } satisfies DashboardOutletContext} />
        </ErrorBoundary>
      </div>
    </div>
  );
}
