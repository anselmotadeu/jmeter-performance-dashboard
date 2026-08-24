'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';

interface UsageBarProps {
  currentUsage: number;
  maxMonthlyAnalyses: number;
  planName: string;
}

export default function UsageBar({ currentUsage, maxMonthlyAnalyses, planName }: UsageBarProps) {
  const pathname = usePathname();
  const [usage, setUsage] = useState(currentUsage);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchUsage() {
      setLoading(true);
      try {
        const res = await fetch('/api/analyses/usage');
        if (res.ok) {
          const data = await res.json();
          setUsage(data.count);
        }
      } catch (err) {
        console.error('Erro ao buscar usage:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchUsage();
  }, [pathname]);

  const percentage = Math.min(100, (usage / maxMonthlyAnalyses) * 100);
  const isNearLimit = percentage >= 80;
  const isAtLimit = percentage >= 100;

  return (
    <div className="rounded-xl bg-white/5 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-cyan-300" />
          <span className="text-xs font-bold text-slate-300">Uso Mensal</span>
        </div>
        <span className="text-xs text-slate-400">{planName}</span>
      </div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-lg font-black text-white">
          {loading ? '...' : usage}
          <span className="text-sm font-normal text-slate-400">/{maxMonthlyAnalyses}</span>
        </span>
        <span className="text-xs text-slate-400">análises</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full transition-all duration-300 ${
            isAtLimit
              ? 'bg-red-500'
              : isNearLimit
              ? 'bg-amber-500'
              : 'bg-cyan-400'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {isAtLimit && (
        <p className="mt-2 text-xs text-red-400">
          Limite atingido. <a href="/pricing" className="underline">Upgrade</a>
        </p>
      )}
      {isNearLimit && !isAtLimit && (
        <p className="mt-2 text-xs text-amber-400">
          Você está perto do limite mensal
        </p>
      )}
    </div>
  );
}
