import { reconcileRecentNFSeEmissions } from '@/lib/nfse';

export const dynamic = 'force-dynamic';

/**
 * POST /api/nfse-reconcile
 * Reconcilia pagamentos recentes (invoices pagas + checkouts de upgrade) e emite
 * automaticamente as NFS-e pendentes. Chamado por cron diário da Vercel.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  const result = await reconcileRecentNFSeEmissions();
  return Response.json(result);
}