'use client';

import { useState } from 'react';
import { AlertCircle, X } from 'lucide-react';

export default function PortalButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/portal', { method: 'POST' });

      // Tratar resposta mesmo quando corpo está vazio
      let data: { url?: string; error?: string } = {};
      const text = await res.text();
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = { error: 'Erro interno do servidor. Tente novamente.' };
        }
      }

      if (!res.ok) {
        throw new Error(data.error || `Erro ${res.status} ao abrir portal`);
      }

      if (!data.url) {
        throw new Error('URL do portal não retornada. Tente novamente.');
      }

      window.location.href = data.url;
    } catch (err) {
      console.error('Erro no portal:', err);
      setError(err instanceof Error ? err.message : 'Erro ao abrir portal de assinatura. Tente novamente.');
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Banner de erro inline — zero window.alert (Governance V3/V6) */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            onClick={() => setError(null)}
            aria-label="Fechar"
            className="shrink-0 opacity-60 hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <button
        onClick={handleClick}
        disabled={loading}
        className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-black hover:border-indigo-300 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900 disabled:opacity-50"
      >
        {loading ? 'Carregando...' : 'Gerenciar Assinatura'}
      </button>
    </div>
  );
}
