/**
 * POST /api/admin/nfse/resend
 * Re-emite/reconcilia NFS-e para uma invoice específica ou todas pendentes (super_admin only).
 * Body: { stripeInvoiceId } para uma única | { reconcileAll: true } para todas pendentes.
 * Governance V6: zero window.alert; autoria obrigatória
 */
import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { reconcileRecentNFSeEmissions } from '@/lib/nfse';

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isAdmin(session.user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json() as { stripeInvoiceId?: string; reconcileAll?: boolean };

  // Reconciliar todas pendentes (botão do painel admin)
  if (body.reconcileAll) {
    const result = await reconcileRecentNFSeEmissions();
    return NextResponse.json({
      success: result.failed === 0,
      message: `Reconciliação concluída: ${result.processed} emitidas, ${result.failed} falhas`,
      checked: result.checked,
      emitted: result.processed,
      failed: result.failed,
      errors: result.errors,
    });
  }

  // Re-emitir uma invoice específica
  const { stripeInvoiceId } = body;
  if (!stripeInvoiceId) return NextResponse.json({ error: 'stripeInvoiceId é obrigatório' }, { status: 400 });

  const result = await reconcileRecentNFSeEmissions();
  return NextResponse.json({
    success: result.failed === 0,
    message: `Re-emissão concluída: ${result.processed} emitidas, ${result.failed} falhas`,
    checked: result.checked,
    emitted: result.processed,
    failed: result.failed,
    errors: result.errors,
  });
}
