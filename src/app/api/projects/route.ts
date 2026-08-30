import { auth } from "@/lib/auth";
import { listProjects } from "@/lib/run-data";
import { requireProductAccess } from "@/lib/billing-access";
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session)
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  const accessError = await requireProductAccess(session.user.id);
  if (accessError) return accessError;
  return Response.json({ projects: await listProjects(session.user.id) });
}
