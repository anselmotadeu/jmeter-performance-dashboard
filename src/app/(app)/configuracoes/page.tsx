import { headers } from "next/headers";
import { LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import PageHeader from "@/components/app/PageHeader";
import PasswordChangeForm from "@/components/app/PasswordChangeForm";
import { auth } from "@/lib/auth";
import { requireProductPageAccess } from "@/lib/page-access";
export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  await requireProductPageAccess(session.user.id);
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Conta"
        title="Configurações"
        description="Gerencie identidade, segurança e sessões."
      />
      <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
        <section className="rounded-2xl border bg-white p-6 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <UserRound className="h-6 w-6 text-indigo-600" />
            <h2 className="text-xl font-black">Perfil</h2>
          </div>
          <dl className="mt-6 space-y-4">
            <div>
              <dt className="text-xs uppercase text-slate-500">Nome</dt>
              <dd className="font-bold">{session.user.name}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-500">E-mail</dt>
              <dd className="font-bold">{session.user.email}</dd>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-black text-emerald-700">
              <ShieldCheck className="h-5 w-5" />
              E-mail confirmado
            </div>
          </dl>
        </section>
        <section className="rounded-2xl border bg-white p-6 dark:bg-slate-900">
          <div className="mb-6 flex items-center gap-3">
            <LockKeyhole className="h-6 w-6 text-indigo-600" />
            <h2 className="text-xl font-black">Alterar senha</h2>
          </div>
          <PasswordChangeForm />
        </section>
      </div>
    </div>
  );
}
