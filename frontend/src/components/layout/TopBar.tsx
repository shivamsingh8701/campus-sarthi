import React, { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { RefreshCw, Search, Bell, Menu, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/store/authStore';
import { activityApi } from '@/services/api';
import type { ActivityLog } from '@/types';
import type { DashboardOutletContext } from './DashboardLayout';

interface TopBarProps {
  title: string;
  subtitle?: string;
  onSync?: () => void;
  isSyncing?: boolean;
  actions?: React.ReactNode;
  onOpenMobileMenu?: () => void;
}

export function TopBar({
  title,
  subtitle,
  onSync,
  isSyncing,
  actions,
  onOpenMobileMenu,
}: TopBarProps) {
  const { student } = useAuth();
  const navigate = useNavigate();
  const outletContext = useOutletContext<DashboardOutletContext | null>();
  const openMenu = onOpenMobileMenu || outletContext?.openMobileMenu;
  const [searchQuery, setSearchQuery] = useState('');
  const [showNotif, setShowNotif] = useState(false);
  const [recentActivity, setRecentActivity] = useState<ActivityLog[]>([]);

  useEffect(() => {
    if (!showNotif) return;
    activityApi
      .getRecent({ limit: 5 })
      .then((res) => {
        if (res.success && Array.isArray(res.data)) {
          setRecentActivity(res.data);
        }
      })
      .catch(() => {});
  }, [showNotif]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    navigate(`/dashboard/assignments?q=${encodeURIComponent(q)}`);
  };

  const initials = (student?.name || student?.fullName || student?.admissionNumber || 'S')
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="glass-topbar sticky top-0 z-30 flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
      {/* Left Title + Mobile Toggle */}
      <div className="flex items-center gap-3 min-w-0">
        {openMenu && (
          <button
            type="button"
            onClick={openMenu}
            className="lg:hidden rounded-xl p-1.5 text-slate-600 hover:bg-slate-900/[0.06]"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-slate-900 truncate">{title}</h1>
          {subtitle && <p className="text-[11px] text-slate-500 truncate">{subtitle}</p>}
        </div>
      </div>

      {/* Right Controls: Search, LMS Pill, Actions, Notifications, Profile */}
      <div className="flex items-center gap-2 sm:gap-3">
        <form onSubmit={handleSearchSubmit} className="hidden md:flex items-center relative">
          <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search assignments..."
            className="h-8 w-44 lg:w-56 rounded-full border border-slate-900/10 bg-white/75 pl-8 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
        </form>

        {/* LMS Connection Pill */}
        <button
          type="button"
          onClick={() => navigate('/dashboard/integrations')}
          className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-slate-900/10 bg-white/75 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-white transition-colors"
          title="Manage Galgotias LMS connection"
        >
          {student?.lmsConnected ? (
            <>
              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
              <span>{student?.isDemo ? 'Demo LMS' : 'LMS Live'}</span>
            </>
          ) : (
            <>
              <AlertCircle className="h-3 w-3 text-amber-500" />
              <span>LMS Disconnected</span>
            </>
          )}
        </button>

        {actions}

        {onSync && (
          <Button
            variant="outline"
            size="sm"
            onClick={onSync}
            isLoading={isSyncing}
            className="gap-1.5 rounded-full"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Sync</span>
          </Button>
        )}

        {/* Notifications */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowNotif((v) => !v)}
            className="h-8 w-8 rounded-full border border-slate-900/10 bg-white/75 flex items-center justify-center text-slate-600 hover:bg-white hover:text-slate-900 transition-colors"
            aria-label="Recent notifications"
          >
            <Bell className="h-3.5 w-3.5" />
          </button>

          {showNotif && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowNotif(false)}
                aria-hidden="true"
              />
              <div className="glass-elevated absolute right-0 mt-2 w-72 rounded-2xl p-3 z-50 space-y-2">
                <div className="flex items-center justify-between px-1">
                  <p className="text-xs font-semibold text-slate-900">Recent Activity</p>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNotif(false);
                      navigate('/dashboard/activity');
                    }}
                    className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    View all
                  </button>
                </div>
                {recentActivity.length === 0 ? (
                  <p className="text-xs text-slate-500 px-1 py-3 text-center">
                    No recent activity recorded.
                  </p>
                ) : (
                  <ul className="space-y-1.5 max-h-56 overflow-y-auto">
                    {recentActivity.map((act, idx) => (
                      <li
                        key={act._id || act.id || idx}
                        className="rounded-xl bg-white/60 border border-slate-900/[0.05] px-2.5 py-2 text-[11px] text-slate-700"
                      >
                        <p className="line-clamp-2">{act.description}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>

        {/* Profile Avatar */}
        <button
          type="button"
          onClick={() => navigate('/dashboard/settings')}
          className="h-8 w-8 rounded-full bg-slate-900 text-white text-[11px] font-semibold flex items-center justify-center shadow-xs hover:bg-slate-800 transition-colors"
          title={student?.email || 'Student Settings'}
        >
          {initials}
        </button>
      </div>
    </header>
  );
}
