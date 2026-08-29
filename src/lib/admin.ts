/**
 * admin.ts — Super Admin helpers
 * Governance V6: role='super_admin' (não 'admin')
 * @project JMeter Performance Dashboard
 */
import { db } from '@/lib/db';

/**
 * Verifica se um usuário é super_admin
 */
export async function isAdmin(userId: string): Promise<boolean> {
  const result = await db.query(
    `select role from "user" where id = $1`,
    [userId]
  );
  return result.rows[0]?.role === 'super_admin';
}

/**
 * Define um usuário como super_admin (ou reverte para user)
 */
export async function setAdmin(userId: string, admin: boolean): Promise<void> {
  await db.query(
    `update "user" set role = $1 where id = $2`,
    [admin ? 'super_admin' : 'user', userId]
  );
}
