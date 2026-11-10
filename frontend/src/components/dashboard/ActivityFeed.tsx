import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  RefreshCw,
  FileText,
  Clock,
  Zap,
  CheckCircle,
  XCircle,
  Download,
  Mail,
  MailX,
  Link,
  Link2Off,
} from 'lucide-react';
import type { ActivityLog } from '@/types';

const activityConfig: Record<
  ActivityLog['type'],
  { icon: React.ReactNode; color: string }
> = {
  lms_sync: { icon: <RefreshCw className="h-3.5 w-3.5" />, color: 'bg-blue-100 text-blue-600' },
  assignment_fetched: { icon: <FileText className="h-3.5 w-3.5" />, color: 'bg-gray-100 text-gray-600' },
  quiz_fetched: { icon: <Clock className="h-3.5 w-3.5" />, color: 'bg-gray-100 text-gray-600' },
  ai_analysis_started: { icon: <Zap className="h-3.5 w-3.5" />, color: 'bg-yellow-100 text-yellow-600' },
  ai_analysis_completed: { icon: <CheckCircle className="h-3.5 w-3.5" />, color: 'bg-green-100 text-green-600' },
  ai_analysis_failed: { icon: <XCircle className="h-3.5 w-3.5" />, color: 'bg-red-100 text-red-600' },
  document_generated: { icon: <Download className="h-3.5 w-3.5" />, color: 'bg-indigo-100 text-indigo-600' },
  email_sent: { icon: <Mail className="h-3.5 w-3.5" />, color: 'bg-green-100 text-green-600' },
  email_failed: { icon: <MailX className="h-3.5 w-3.5" />, color: 'bg-red-100 text-red-600' },
  lms_connected: { icon: <Link className="h-3.5 w-3.5" />, color: 'bg-green-100 text-green-600' },
  lms_disconnected: { icon: <Link2Off className="h-3.5 w-3.5" />, color: 'bg-gray-100 text-gray-500' },
};

interface ActivityFeedProps {
  activities?: ActivityLog[];
}

function safeFormatActivityTime(activity: ActivityLog): string {
  const raw = activity.createdAt || (activity as unknown as { created_at?: string })?.created_at;
  if (!raw) return 'Recently';
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return 'Recently';
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return 'Recently';
  }
}

export function ActivityFeed({ activities = [] }: ActivityFeedProps) {
  const safeList = Array.isArray(activities) ? activities : [];

  if (safeList.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-gray-400">No recent activity</p>
    );
  }

  return (
    <div className="space-y-3">
      {safeList.map((activity, idx) => {
        const config = activityConfig[activity.type] ?? {
          icon: <FileText className="h-3.5 w-3.5" />,
          color: 'bg-gray-100 text-gray-600',
        };

        return (
          <div key={activity._id || activity.id || idx} className="flex items-start gap-3">
            <div
              className={`flex-shrink-0 rounded-full p-1.5 ${config.color} mt-0.5`}
            >
              {config.icon}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-700">{activity.description}</p>
              <p className="mt-0.5 text-xs text-gray-400">
                {safeFormatActivityTime(activity)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
