import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session)
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success)
    return Response.json({ error: "ID inválido." }, { status: 400 });
  const run = await db.query<{ projectId: string }>(
    `SELECT r.project_id AS "projectId" FROM analysis_run r JOIN project p ON p.id=r.project_id JOIN workspace_member m ON m.workspace_id=p.workspace_id WHERE r.id=$1 AND m.user_id=$2 AND m.role IN ('owner','admin','member')`,
    [id, session.user.id],
  );
  if (!run.rows[0])
    return Response.json({ error: "Análise não encontrada." }, { status: 404 });
  await db.query(
    `INSERT INTO baseline (project_id,run_id,updated_by) VALUES ($1,$2,$3) ON CONFLICT (project_id) DO UPDATE SET run_id=excluded.run_id,updated_by=excluded.updated_by,updated_at=now()`,
    [run.rows[0].projectId, id, session.user.id],
  );
  return Response.json({ ok: true });
}
