'use client';

import { useEffect, useState } from 'react';
import { X, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';

interface Notification {
  id: number;
  title: string;
  body: string;
  type: 'info' | 'warning' | 'success';
  expires_at: string | null;
  created_at: string;
}

/**
 * NotificationBanner — notificações da plataforma para o usuário.
 * Padrão TestDiff/EstilOS: info=azul, warning=âmbar, success=verde.
 * Mensagem exibida por completo (sem truncar); expiradas são filtradas no servidor.
 * Dismiss persiste via /api/notifications.
 */
export function NotificationBanner() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set());

  async function fetchNotifications() {
    // Re-checa a cada minuto para remover notificações que acabaram de expirar
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch { /* mantém o estado atual */ }
  }

  useEffect(() => {
    const id = window.setInterval(fetchNotifications, 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    async function initial() {
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
    initial();
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

  const TYPE_STYLE: Record<Notification['type'], { box: string; icon: React.ReactNode; title: string; meta: string }> = {
    warning: {
      box: 'border-amber-500/30 bg-amber-500/10',
      icon: <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />,
      title: 'text-amber-800 dark:text-amber-200',
      meta: 'text-amber-600 dark:text-amber-300/80',
    },
    success: {
      box: 'border-emerald-500/30 bg-emerald-500/10',
      icon: <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />,
      title: 'text-emerald-800 dark:text-emerald-200',
      meta: 'text-emerald-600 dark:text-emerald-300/80',
    },
    info: {
      box: 'border-blue-500/30 bg-blue-500/10',
      icon: <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />,
      title: 'text-blue-800 dark:text-blue-200',
      meta: 'text-blue-600 dark:text-blue-300/80',
    },
  };

  const visibleNotifications = notifications.filter(n => !dismissedIds.has(n.id));

  if (visibleNotifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 w-[min(26rem,calc(100vw-2rem))]">
      {visibleNotifications.slice(0, 5).map(notification => {
        const style = TYPE_STYLE[notification.type] ?? TYPE_STYLE.info;
        return (
          <div
            key={notification.id}
            className={`rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm ${style.box}`}
          >
            <div className="flex items-start gap-3">
              {style.icon}
              <div className="flex-1 min-w-0">
                <h3 className={`font-bold text-sm leading-snug ${style.title}`}>{notification.title}</h3>
                <p className={`text-sm mt-0.5 leading-snug break-words whitespace-normal ${style.title}`}>
                  {notification.body}
                </p>
                {notification.expires_at && (
                  <p className={`text-[10px] mt-1.5 font-semibold ${style.meta}`}>
                    Expira em {new Date(notification.expires_at).toLocaleDateString('pt-BR')}
                  </p>
                )}
              </div>
              <button
                onClick={() => dismissNotification(notification.id)}
                aria-label="Dispensar notificação"
                className="shrink-0 rounded-md p-1 opacity-60 hover:opacity-100 transition-opacity text-current"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}