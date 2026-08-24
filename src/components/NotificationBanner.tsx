'use client';

import { useEffect, useState } from 'react';
import { X, AlertCircle, Info, CheckCircle } from 'lucide-react';

interface Notification {
  id: number;
  title: string;
  body: string;
  type: 'info' | 'warning' | 'success';
  created_at: string;
}

export function NotificationBanner() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    async function fetchNotifications() {
      try {
        const res = await fetch('/api/notifications');
        if (res.ok) {
          const data = await res.json();
          setNotifications(data.notifications || []);
        }
      } catch (err) {
        console.error('Failed to fetch notifications:', err);
      }
    }
    fetchNotifications();
  }, []);

  async function dismissNotification(id: number) {
    setDismissedIds(prev => new Set(prev).add(id));
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId: id }),
      });
    } catch (err) {
      console.error('Failed to dismiss notification:', err);
    }
  }

  const visibleNotifications = notifications.filter(n => !dismissedIds.has(n.id));

  if (visibleNotifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-md">
      {visibleNotifications.map(notification => (
        <div
          key={notification.id}
          className={`rounded-lg border p-4 shadow-lg animate-in slide-in-from-right ${
            notification.type === 'warning'
              ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-900'
              : notification.type === 'success'
              ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-900'
              : 'bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900'
          }`}
        >
          <div className="flex items-start gap-3">
            {notification.type === 'warning' && (
              <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
            )}
            {notification.type === 'success' && (
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            )}
            {notification.type === 'info' && (
              <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <h3 className={`font-semibold text-sm ${
                notification.type === 'warning'
                  ? 'text-yellow-900 dark:text-yellow-100'
                  : notification.type === 'success'
                  ? 'text-green-900 dark:text-green-100'
                  : 'text-blue-900 dark:text-blue-100'
              }`}>
                {notification.title}
              </h3>
              <p className={`text-sm mt-1 ${
                notification.type === 'warning'
                  ? 'text-yellow-800 dark:text-yellow-200'
                  : notification.type === 'success'
                  ? 'text-green-800 dark:text-green-200'
                  : 'text-blue-800 dark:text-blue-200'
              }`}>
                {notification.body}
              </p>
            </div>
            <button
              onClick={() => dismissNotification(notification.id)}
              className={`flex-shrink-0 rounded-md p-1 transition-colors ${
                notification.type === 'warning'
                  ? 'hover:bg-yellow-100 dark:hover:bg-yellow-900/30'
                  : notification.type === 'success'
                  ? 'hover:bg-green-100 dark:hover:bg-green-900/30'
                  : 'hover:bg-blue-100 dark:hover:bg-blue-900/30'
              }`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
