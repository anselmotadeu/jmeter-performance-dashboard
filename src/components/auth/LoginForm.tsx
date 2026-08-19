"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import PasswordInput from "./PasswordInput";
import FormMessage from "./FormMessage";
import { authClient } from "@/lib/auth-client";
export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const data = new FormData(e.currentTarget);
    const result = await authClient.signIn.email({
      email: String(data.get("email")).trim().toLowerCase(),
      password: String(data.get("password")),
      rememberMe: true,
    });
    if (result.error) {
      setError(
        result.error.code === "ACCOUNT_LOCKED"
          ? "Conta bloqueada por 15 minutos após três tentativas incorretas."
          : result.error.code === "EMAIL_NOT_VERIFIED"
            ? "Confirme seu e-mail antes de entrar."
            : "E-mail ou senha inválidos.",
      );
      setLoading(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }
  return (
    <form onSubmit={submit} className="space-y-5">
      {params.get("verified") === "true" && (
        <FormMessage type="success">
          E-mail confirmado. Você já pode entrar.
        </FormMessage>
      )}
      {error && <FormMessage type="error">{error}</FormMessage>}
      <label htmlFor="email" className="block text-sm font-bold text-slate-700">
        E-mail
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-slate-950 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
          placeholder="voce@empresa.com"
        />
      </label>
      <PasswordInput
        id="password"
        name="password"
        label="Senha"
        autoComplete="current-password"
      />
      <div className="text-right">
        <Link
          href="/esqueci-senha"
          className="text-sm font-bold text-indigo-600"
        >
          Esqueci minha senha
        </Link>
      </div>
      <button
        disabled={loading}
        className="h-12 w-full rounded-xl bg-indigo-600 font-bold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 disabled:opacity-50"
      >
        {loading ? "Entrando..." : "Entrar"}
      </button>
      <p className="text-center text-sm text-slate-600">
        Ainda não tem conta?{" "}
        <Link href="/cadastro" className="font-bold text-indigo-600">
          Criar conta
        </Link>
      </p>
    </form>
  );
}
