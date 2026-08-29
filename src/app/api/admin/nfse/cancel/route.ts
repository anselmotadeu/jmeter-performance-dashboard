/**
 * POST /api/admin/nfse/cancel
 * Cancela uma NFS-e via stripeInvoiceId (super_admin only)
 * Governance V6: zero window.alert; autoria obrigatória
 * @project JMeter Performance Dashboard
 */
import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { cancelarNFSe } from '@/lib/nfse';

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isAdmin(session.user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { stripeInvoiceId } = await req.json() as { stripeInvoiceId: string };
  if (!stripeInvoiceId) return NextResponse.json({ error: 'stripeInvoiceId é obrigatório' }, { status: 400 });

  const result = await cancelarNFSe(stripeInvoiceId);
  return NextResponse.json(result);
}
