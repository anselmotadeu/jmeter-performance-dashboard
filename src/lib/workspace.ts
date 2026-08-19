import { db } from "@/lib/db";

export async function ensureWorkspace(userId: string, userName: string) {
  const existing = await db.query<{ id: string }>(
    "SELECT workspace_id AS id FROM workspace_member WHERE user_id=$1 LIMIT 1",
    [userId],
  );
  if (existing.rows[0]) return existing.rows[0].id;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `workspace:${userId}`,
    ]);
    const again = await client.query<{ id: string }>(
      "SELECT workspace_id AS id FROM workspace_member WHERE user_id=$1 LIMIT 1",
      [userId],
    );
    if (again.rows[0]) {
      await client.query("COMMIT");
      return again.rows[0].id;
    }
    const slug = `workspace-${userId
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 20)}`;
    const workspace = await client.query<{ id: string }>(
      `INSERT INTO workspace(name,slug) VALUES($1,$2) ON CONFLICT(slug) DO UPDATE SET name=excluded.name RETURNING id`,
      [`Workspace de ${userName}`, slug],
    );
    await client.query(
      `INSERT INTO workspace_member(workspace_id,user_id,role) VALUES($1,$2,'owner') ON CONFLICT DO NOTHING`,
      [workspace.rows[0].id, userId],
    );
    await client.query(
      `INSERT INTO project(workspace_id,name,description) VALUES($1,'Meu primeiro projeto','Análises de performance') ON CONFLICT(workspace_id,name) DO NOTHING`,
      [workspace.rows[0].id],
    );
    await client.query("COMMIT");
    return workspace.rows[0].id;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
