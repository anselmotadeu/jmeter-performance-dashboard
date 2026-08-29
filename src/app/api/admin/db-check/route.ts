import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * GET /api/admin/db-check — diagnóstico de banco e grant de super_admin.
 * ROTA TEMPORÁRIA — remover após confirmação do grant.
 * Protegida por secret token.
 */
export async function GET(request: Request) {
  // Proteção por secret token (não exposto via auth para evitar chicken-and-egg)
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const secret = process.env.ADMIN_BOOTSTRAP_TOKEN || 'anstech-bootstrap-2026';
  
  if (token !== secret) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    // 1. Verificar migrations aplicadas
    const migs = await db.query<{ version: string }>('SELECT version FROM schema_migration ORDER BY applied_at');
    
    // 2. Verificar usuário do Anselmo
    const userBefore = await db.query<{ email: string; role: string }>(
      'SELECT email, role FROM "user" WHERE email = $1',
      ['anselmotadeu@outlook.com']
    );

    // 3. Verificar constraint de role
    const constr = await db.query<{ def: string }>(
      "SELECT pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conname = 'user_role_check' LIMIT 1"
    );

    // 4. Verificar planos
    const plans = await db.query<{ slug: string; name: string; price_cents: number }>(
      'SELECT slug, name, price_cents FROM plan ORDER BY price_cents'
    );

    // 5. Corrigir role se necessário
    let grantResult = 'not needed';
    const currentRole = userBefore.rows[0]?.role;
    if (currentRole && currentRole !== 'super_admin') {
      // Atualizar constraint primeiro para aceitar super_admin
      await db.query('ALTER TABLE "user" DROP CONSTRAINT IF EXISTS user_role_check');
      await db.query(`ALTER TABLE "user" ADD CONSTRAINT user_role_check CHECK (role IN ('user', 'admin', 'super_admin'))`);
      // Fazer o UPDATE
      const updateResult = await db.query<{ email: string; role: string }>(
        'UPDATE "user" SET role = $1 WHERE email = $2 RETURNING email, role',
        ['super_admin', 'anselmotadeu@outlook.com']
      );
      grantResult = `updated from '${currentRole}' to '${updateResult.rows[0]?.role}'`;
    } else if (currentRole === 'super_admin') {
      // Garantir que constraint está correta
      await db.query('ALTER TABLE "user" DROP CONSTRAINT IF EXISTS user_role_check');
      await db.query(`ALTER TABLE "user" ADD CONSTRAINT user_role_check CHECK (role IN ('user', 'admin', 'super_admin'))`);
      grantResult = 'already super_admin — constraint updated';
    }

    const userAfter = await db.query<{ email: string; role: string }>(
      'SELECT email, role FROM "user" WHERE email = $1',
      ['anselmotadeu@outlook.com']
    );

    return Response.json({
      migrations: migs.rows.map(r => r.version),
      plans: plans.rows,
      constraint: constr.rows[0]?.def || 'not found',
      user_before: userBefore.rows[0] || 'not found',
      user_after: userAfter.rows[0] || 'not found',
      grant_result: grantResult,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
