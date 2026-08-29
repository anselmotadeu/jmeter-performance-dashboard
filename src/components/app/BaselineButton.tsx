'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Flag, AlertCircle } from 'lucide-react';

/**
 * BaselineButton — marca um run como baseline para comparações.
 * Governance V3/V6: zero window.alert — usa banner inline com role="alert".
 */
export default function BaselineButton({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function set() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/runs/${id}/baseline`, { method: 'PUT' });
      if (!response.ok) throw new Error('Não foi possível definir a baseline. Tente novamente.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao definir baseline.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      {/* Banner de erro inline — zero window.alert (Governance V3/V6) */}
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <button
        onClick={set}
        disabled={loading || active}
        className="inline-flex h-11 items-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 text-sm font-black text-indigo-700 disabled:opacity-60 dark:bg-slate-900"
      >
        <Flag className="h-4 w-4" />
        {active ? 'Baseline atual' : loading ? 'Atualizando...' : 'Definir baseline'}
      </button>
    </div>
  );
}
