import { reconcileRecentNFSeEmissions } from '@/lib/nfse';

export const dynamic = 'force-dynamic';

/**
 * GET/POST /api/nfse-reconcile
 * Reconcilia pagamentos recentes (invoices pagas + checkouts de upgrade) e emite
 * automaticamente as NFS-e pendentes. Chamado por cron diário da Vercel.
 * ATENÇÃO: o cron da Vercel dispara GET (não POST) — por isso ambos são suportados.
 */
async function handler(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  const result = await reconcileRecentNFSeEmissions();
  console.log(`[nfse-reconcile] ${JSON.stringify(result)}`);
  return Response.json(result);
}

export const GET = handler;
export const POST = handler;