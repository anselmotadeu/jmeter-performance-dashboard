import { auth } from "@/lib/auth";
import { listProjects } from "@/lib/run-data";
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session)
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  return Response.json({ projects: await listProjects(session.user.id) });
}
