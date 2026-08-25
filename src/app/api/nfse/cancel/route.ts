import { auth } from '@/lib/auth';
import { cancelarNFSe } from '@/lib/nfse';
import { db } from '@/lib/db';

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const { invoiceId } = await request.json();

    if (!invoiceId) {
      return Response.json({ error: 'ID da invoice não fornecido.' }, { status: 400 });
    }

    // Verificar se a NFS-e pertence ao usuário
    const emission = await db.query(
      `SELECT id, stripe_invoice_id FROM nfse_emission 
       WHERE stripe_invoice_id = $1`,
      [invoiceId]
    );

    if (emission.rows.length === 0) {
      return Response.json({ error: 'NFS-e não encontrada.' }, { status: 404 });
    }

    // Cancelar NFS-e
    const result = await cancelarNFSe(invoiceId);

    if (!result.success) {
      return Response.json({ error: result.error || 'Falha ao cancelar NFS-e.' }, { status: 500 });
    }

    return Response.json({ success: true, message: 'NFS-e cancelada com sucesso.' });
  } catch (error) {
    console.error('Erro ao cancelar NFS-e:', error);
    return Response.json({ error: 'Erro interno ao cancelar NFS-e.' }, { status: 500 });
  }
}
