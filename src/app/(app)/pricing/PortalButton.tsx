'use client';

import { useState } from 'react';
import { AlertCircle, X } from 'lucide-react';

export default function PortalButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/portal', {
        method: 'POST',
        credentials: 'include',
      });

      let data: { url?: string; error?: string };
      try {
        data = await res.json();
      } catch {
        throw new Error(
          res.status === 401
            ? 'Você precisa estar logado.'
            : res.status === 400
            ? 'Nenhuma assinatura encontrada.'
            : `Erro ao abrir portal (código ${res.status}). Tente novamente.`
        );
      }

      if (!res.ok) {
        throw new Error(data.error || 'Falha ao abrir portal');
      }

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('URL do portal não recebida.');
      }
    } catch (err) {
      console.error('Erro no portal:', err);
      setError(err instanceof Error ? err.message : 'Erro ao abrir portal de assinatura');
      setLoading(false);
    }
  };

  return (
    <div>
      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30">
          <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-500 mt-0.5" />
          <p className="flex-1 text-sm text-red-700 dark:text-red-300">{error}</p>
          <button
            onClick={() => setError(null)}
            className="flex-shrink-0 text-red-400 hover:text-red-600"
            aria-label="Fechar erro"
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
