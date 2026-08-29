'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, X } from 'lucide-react';

interface CheckoutButtonProps {
  planSlug: string;
  isLoggedIn: boolean;
  hasCurrentPlan: boolean;
}

export default function CheckoutButton({
  planSlug,
  isLoggedIn,
  hasCurrentPlan,
}: CheckoutButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    if (!isLoggedIn) {
      router.push(`/login?next=/pricing`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planSlug }),
      });

      // Tratar resposta mesmo quando corpo está vazio (evita "Unexpected end of JSON input")
      let data: { url?: string; error?: string } = {};
      const text = await res.text();
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          // corpo não é JSON válido — erro de servidor
          data = { error: 'Erro interno do servidor. Tente novamente.' };
        }
      }

      if (!res.ok) {
        throw new Error(data.error || `Erro ${res.status} ao criar checkout`);
      }

      if (!data.url) {
        throw new Error('URL de checkout não retornada. Tente novamente.');
      }

      window.location.href = data.url;
    } catch (err) {
      console.error('Erro no checkout:', err);
      setError(err instanceof Error ? err.message : 'Erro ao processar checkout. Tente novamente.');
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
        className="w-full rounded-xl bg-indigo-600 px-5 py-3 text-sm font-black text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Carregando...' : hasCurrentPlan ? 'Fazer Upgrade' : 'Assinar Agora'}
      </button>
    </div>
  );
}
