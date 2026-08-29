"use client";
import { useContext, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  CreditCard,
  FileSearch,
  FolderKanban,
  History,
  LogOut,
  Menu,
  Moon,
  Settings,
  Shield,
  Sun,
  X,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { ThemeContext } from "@/context/ThemeContext";
import UsageBar from "./UsageBar";
const nav = [
  { href: "/", label: "Visão geral", icon: BarChart3 },
  { href: "/analisar", label: "Nova análise", icon: FileSearch },
  { href: "/resultados", label: "Histórico", icon: History },
  { href: "/projetos", label: "Projetos", icon: FolderKanban },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
  { href: "/minha-conta", label: "Minha Conta", icon: CreditCard },
];
export default function AppShell({
  user,
  workspace,
  children,
  planName,
  maxMonthlyAnalyses,
  isSuperAdmin,
}: {
  user: { name: string; email: string };
  workspace: string;
  children: React.ReactNode;
  planName?: string;
  maxMonthlyAnalyses?: number;
  isSuperAdmin?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useContext(ThemeContext);
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    const triggerElement = trigger.current;
    document.body.style.overflow = "hidden";
    close.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "Tab") {
        const elements=drawer.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled])');
        if(!elements?.length)return;
        const first=elements[0];const last=elements[elements.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", key);
      triggerElement?.focus();
    };
  }, [open]);
  async function logout() {
    setSigningOut(true);
    try {
      await authClient.signOut();
      router.replace("/login");
      router.refresh();
    } catch {
      // Falha silenciosa — redirecionar de qualquer forma
      console.error('Falha ao encerrar sessão');
      router.replace("/login");
    } finally {
      setSigningOut(false);
    }
  }
  const sidebar = (
    <div className="flex h-full flex-col bg-slate-950 text-white">
      <div className="flex h-20 items-center gap-3 border-b border-white/10 px-5">
        <Image src="/brand-mark.svg" alt="" width={42} height={42} />
        <div>
          <div className="text-lg font-black">Performance Dashboard</div>
          <div className="text-[10px] font-bold uppercase tracking-[.18em] text-cyan-300">
            JMeter + k6
          </div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-6">
        {nav.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              onClick={() => setOpen(false)}
              className={
                "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold transition " +
                (active
                  ? "bg-indigo-600 text-white"
                  : "text-slate-300 hover:bg-white/10 hover:text-white")
              }
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
        {isSuperAdmin && (
          <Link
            href="/admin"
            aria-current={pathname === "/admin" ? "page" : undefined}
            onClick={() => setOpen(false)}
            className={
              "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold transition mt-2 " +
              (pathname === "/admin"
                ? "bg-indigo-600 text-white"
                : "text-indigo-300 hover:bg-indigo-600/20 hover:text-indigo-100")
            }
          >
            <Shield className="h-5 w-5" />
            Super Admin
          </Link>
        )}
      </nav>
      <div className="border-t border-white/10 p-4">
        <div className="mb-3 rounded-xl bg-white/5 p-3">
          <div className="truncate text-sm font-black">{user.name}</div>
          <div className="truncate text-xs text-slate-400">{workspace}</div>
        </div>
        {planName && maxMonthlyAnalyses && (
          <div className="mb-3">
            <UsageBar
              currentUsage={0}
              maxMonthlyAnalyses={maxMonthlyAnalyses}
              planName={planName}
            />
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={toggleTheme}
            className="flex h-10 items-center justify-center gap-2 rounded-lg bg-white/5 text-xs font-bold text-slate-300"
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
            Tema
          </button>
          <button
            onClick={logout}
            disabled={signingOut}
            className="flex h-10 items-center justify-center gap-2 rounded-lg bg-white/5 text-xs font-bold text-slate-300"
          >
            <LogOut className="h-4 w-4" />
            {signingOut ? "Saindo" : "Sair"}
          </button>
        </div>
      </div>
    </div>
  );
  return (
    <div className="min-h-screen bg-slate-100 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <a href="#main-content" className="sr-only z-[60] rounded bg-white p-3 text-slate-950 focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Pular para o conteúdo</a>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 lg:block">
        {sidebar}
      </aside>
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90 lg:hidden">
        <Link href="/" className="flex items-center gap-2 font-black">
          <Image src="/brand-mark.svg" alt="" width={34} height={34} />
          Performance Dashboard
        </Link>
        <button
          ref={trigger}
          onClick={() => setOpen(true)}
          className="rounded-lg border p-2"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="absolute inset-0 bg-slate-950/70"
            onClick={() => setOpen(false)}
            aria-label="Fechar menu"
          />
          <aside
            ref={drawer}
            role="dialog"
            aria-modal="true"
            aria-label="Menu principal"
            className="absolute inset-y-0 left-0 w-[min(88vw,320px)]"
          >
            {sidebar}
            <button
              ref={close}
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 p-2 text-slate-300"
              aria-label="Fechar menu"
            >
              <X className="h-5 w-5" />
            </button>
          </aside>
        </div>
      )}
      <div className="lg:pl-72">
        <main id="main-content" className="mx-auto min-h-screen w-full max-w-[1680px] p-4 sm:p-6 xl:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
