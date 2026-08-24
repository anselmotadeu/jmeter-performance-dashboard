'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

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

  const handleClick = async () => {
    if (!isLoggedIn) {
      router.push(`/login?next=/pricing`);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planSlug }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Falha ao criar checkout');
      }

      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      console.error('Erro no checkout:', err);
      alert(err instanceof Error ? err.message : 'Erro ao processar checkout');
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="w-full rounded-xl bg-indigo-600 px-5 py-3 text-sm font-black text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading ? 'Carregando...' : hasCurrentPlan ? 'Fazer Upgrade' : 'Assinar Agora'}
    </button>
  );
}
