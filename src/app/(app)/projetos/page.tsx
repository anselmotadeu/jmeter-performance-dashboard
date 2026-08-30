import Link from "next/link";
import { headers } from "next/headers";
import { FolderKanban } from "lucide-react";
import PageHeader from "@/components/app/PageHeader";
import { auth } from "@/lib/auth";
import { getOverview } from "@/lib/run-data";
import { requireProductPageAccess } from "@/lib/page-access";
export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  await requireProductPageAccess(session.user.id);
  const data = await getOverview(session.user.id);
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Organização"
        title="Projetos"
        description="Agrupe execuções, defina baselines e acompanhe regressões por contexto."
      />
      <section className="rounded-2xl border bg-white p-6 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <FolderKanban className="h-7 w-7 text-indigo-600" />
          <div>
            <h2 className="text-xl font-black">
              {data.workspace?.projectName || "Meu primeiro projeto"}
            </h2>
            <p className="text-sm text-slate-500">
              {data.metrics.runs} análise(s) · workspace{" "}
              {data.workspace?.workspaceName}
            </p>
          </div>
        </div>
        <div className="mt-6 flex gap-3">
          <Link
            href="/analisar"
            className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-black text-white"
          >
            Nova análise
          </Link>
          <Link
            href="/resultados"
            className="rounded-xl border px-5 py-3 text-sm font-black"
          >
            Abrir histórico
          </Link>
        </div>
      </section>
    </div>
  );
}
