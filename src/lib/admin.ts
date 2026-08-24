import { db } from '@/lib/db';

/**
 * Verifica se um usuário é admin
 */
export async function isAdmin(userId: string): Promise<boolean> {
  const result = await db.query(
    `select role from "user" where id = $1`,
    [userId]
  );
  return result.rows[0]?.role === 'admin';
}

/**
 * Define um usuário como admin
 */
export async function setAdmin(userId: string, admin: boolean): Promise<void> {
  await db.query(
    `update "user" set role = $1 where id = $2`,
    [admin ? 'admin' : 'user', userId]
  );
}
