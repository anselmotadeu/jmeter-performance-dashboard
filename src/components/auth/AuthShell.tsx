import Image from "next/image";
import Link from "next/link";
export default function AuthShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-slate-950">
      <div className="grid min-h-screen lg:grid-cols-[.9fr_1.1fr]">
        <section className="relative hidden overflow-hidden bg-[radial-gradient(circle_at_20%_15%,rgba(99,102,241,.5),transparent_34%),radial-gradient(circle_at_80%_85%,rgba(6,182,212,.32),transparent_35%),linear-gradient(145deg,#020617,#172554)] p-12 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:48px_48px]" />
          <Link href="/login" className="relative flex items-center gap-3">
            <Image src="/brand-mark.svg" alt="" width={46} height={46} />
            <span className="text-2xl font-black">Performance Dashboard</span>
          </Link>
          <div className="relative max-w-xl">
            <p className="text-xs font-bold uppercase tracking-[.28em] text-cyan-300">
              Performance intelligence
            </p>
            <h2 className="mt-5 text-5xl font-black leading-tight">
              Transforme testes de carga em decisões de engenharia.
            </h2>
            <p className="mt-6 text-base leading-8 text-slate-300">
              JMeter e k6 com métricas certificadas, histórico, baselines e
              comparação de regressões.
            </p>
          </div>
          <p className="relative text-sm text-slate-400">
            Os arquivos brutos permanecem no seu navegador.
          </p>
        </section>
        <section className="flex items-center justify-center bg-slate-50 px-5 py-10">
          <div className="w-full max-w-[520px]">
            <Link
              href="/login"
              className="mb-9 flex items-center gap-3 lg:hidden"
            >
              <Image src="/brand-mark.svg" alt="" width={42} height={42} />
              <span className="text-xl font-black text-slate-950">
                Performance Dashboard
              </span>
            </Link>
            <p className="text-xs font-black uppercase tracking-[.24em] text-indigo-600">
              {eyebrow}
            </p>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-950">
              {title}
            </h1>
            <p className="mt-3 mb-8 leading-7 text-slate-600">{description}</p>
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
