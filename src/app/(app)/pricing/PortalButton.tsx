'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function PortalButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/portal', { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Falha ao abrir portal');
      }
      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      console.error('Erro no portal:', err);
      alert(err instanceof Error ? err.message : 'Erro ao abrir portal de assinatura');
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-black hover:border-indigo-300 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900 disabled:opacity-50"
    >
      {loading ? 'Carregando...' : 'Gerenciar Assinatura'}
    </button>
  );
}
