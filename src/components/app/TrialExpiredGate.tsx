'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AlertCircle, CreditCard } from 'lucide-react';

interface TrialExpiredGateProps {
  isTrial: boolean;
  isExpired: boolean;
  trialDaysLeft: number;
  blocked: boolean;
  children: React.ReactNode;
}

const ALLOWED_ROUTES = ['/pricing', '/minha-conta', '/admin', '/api/portal'];

export default function TrialExpiredGate({
  isTrial,
  isExpired,
  trialDaysLeft,
  blocked,
  children,
}: TrialExpiredGateProps) {
  const pathname = usePathname();
  const router = useRouter();

  const isAllowed = ALLOWED_ROUTES.some((route) => pathname.startsWith(route));
  const showBanner = isTrial && !isExpired && trialDaysLeft <= 2 && !isAllowed;

  useEffect(() => {
    if (blocked && !isAllowed) {
      router.push('/pricing?trial=expired');
    }
  }, [blocked, isAllowed, router]);

  if (blocked && !isAllowed) {
    return null;
  }

  return (
    <>
      {showBanner && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-lg dark:border-amber-900 dark:bg-amber-950/50">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="flex-1">
              <h3 className="font-bold text-amber-900 dark:text-amber-100">
                Trial expira em breve
              </h3>
              <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
                Seu período de teste termina em {trialDaysLeft} dia(s). Assine para continuar usando todos os recursos.
              </p>
              <button
                onClick={() => router.push('/pricing')}
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700"
              >
                <CreditCard className="h-4 w-4" />
                Ver Planos
              </button>
            </div>
          </div>
        </div>
      )}
      {children}
    </>
  );
}
