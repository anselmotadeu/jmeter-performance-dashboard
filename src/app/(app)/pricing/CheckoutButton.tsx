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

    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planSlug }),
        credentials: 'include',
      });

      // Sempre tentar ler como JSON, mesmo se !res.ok
      let data: { url?: string; error?: string };
      try {
        data = await res.json();
      } catch {
        // Se não for JSON, é erro do servidor (HTML de erro)
        throw new Error(
          res.status === 401
            ? 'Você precisa estar logado para assinar um plano.'
            : res.status === 400
            ? 'Plano inválido ou você já possui uma assinatura ativa.'
            : `Erro ao criar checkout (código ${res.status}). Tente novamente.`
        );
      }

      if (!res.ok) {
        throw new Error(data.error || 'Falha ao criar checkout');
      }

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('URL de checkout não recebida.');
      }
    } catch (err) {
      console.error('Erro no checkout:', err);
      setError(err instanceof Error ? err.message : 'Erro ao processar checkout');
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
        className="w-full rounded-xl bg-indigo-600 px-5 py-3 text-sm font-black text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Carregando...' : hasCurrentPlan ? 'Fazer Upgrade' : 'Assinar Agora'}
      </button>
    </div>
  );
}
