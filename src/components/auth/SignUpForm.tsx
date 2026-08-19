"use client";
import { useState } from "react";
import Link from "next/link";
import PasswordInput from "./PasswordInput";
import FormMessage from "./FormMessage";
import { authClient } from "@/lib/auth-client";
import { normalizePhone, passwordSchema } from "@/lib/auth-validation";
export default function SignUpForm() {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const data = new FormData(e.currentTarget);
    const password = String(data.get("password"));
    if (password !== String(data.get("confirmPassword"))) {
      setError("A senha e a confirmação precisam ser iguais.");
      return;
    }
    const validation = passwordSchema.safeParse(password);
    if (!validation.success) {
      setError(validation.error.issues[0]?.message || "Senha inválida.");
      return;
    }
    setLoading(true);
    const firstName = String(data.get("firstName")).trim();
    const lastName = String(data.get("lastName")).trim();
    const result = await authClient.signUp.email({
      name: `${firstName} ${lastName}`,
      firstName,
      lastName,
      phone: normalizePhone(String(data.get("phone"))),
      email: String(data.get("email")).trim().toLowerCase(),
      password,
      callbackURL: "/login?verified=true",
    });
    setLoading(false);
    if (result.error) {
      setError(
        "Não foi possível criar a conta. Revise os dados e tente novamente.",
      );
      return;
    }
    setSuccess(true);
  }
  if (success)
    return (
      <div className="space-y-5">
        <FormMessage type="success">
          Verifique seu e-mail para continuar. Se você já possui conta, entre ou
          recupere sua senha.
        </FormMessage>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/login"
            className="flex h-12 items-center justify-center rounded-xl bg-indigo-600 px-4 font-bold text-white"
          >
            Entrar
          </Link>
          <Link
            href="/esqueci-senha"
            className="flex h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 font-bold text-slate-700"
          >
            Recuperar senha
          </Link>
        </div>
      </div>
    );
  return (
    <form onSubmit={submit} className="space-y-5">
      {error && <FormMessage type="error">{error}</FormMessage>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="firstName" label="Nome" autoComplete="given-name" />
        <Field id="lastName" label="Sobrenome" autoComplete="family-name" />
      </div>
      <Field id="email" label="E-mail" type="email" autoComplete="email" />
      <Field id="phone" label="Telefone" type="tel" autoComplete="tel" />
      <div className="grid gap-4 sm:grid-cols-2">
        <PasswordInput
          id="password"
          name="password"
          label="Senha"
          autoComplete="new-password"
        />
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          label="Confirmar senha"
          autoComplete="new-password"
        />
      </div>
      <p className="text-xs leading-5 text-slate-500">
        Use maiúscula, minúscula, número e caractere especial.
      </p>
      <button
        disabled={loading}
        className="h-12 w-full rounded-xl bg-indigo-600 font-bold text-white disabled:opacity-50"
      >
        {loading ? "Criando conta..." : "Criar minha conta"}
      </button>
      <p className="text-center text-sm text-slate-600">
        Já tem conta?{" "}
        <Link href="/login" className="font-bold text-indigo-600">
          Entrar
        </Link>
      </p>
    </form>
  );
}
function Field({
  id,
  label,
  type = "text",
  autoComplete,
}: {
  id: string;
  label: string;
  type?: string;
  autoComplete: string;
}) {
  return (
    <label htmlFor={id} className="block text-sm font-bold text-slate-700">
      {label}
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        required
        className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-slate-950 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
      />
    </label>
  );
}
