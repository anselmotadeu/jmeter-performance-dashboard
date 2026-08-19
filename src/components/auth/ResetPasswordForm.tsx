"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PasswordInput from "./PasswordInput";
import FormMessage from "./FormMessage";
import { authClient } from "@/lib/auth-client";
import { passwordSchema } from "@/lib/auth-validation";
export default function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token) return;
    const data = new FormData(e.currentTarget);
    const password = String(data.get("password"));
    if (password !== String(data.get("confirmPassword"))) {
      setError("As senhas precisam ser iguais.");
      return;
    }
    const validation = passwordSchema.safeParse(password);
    if (!validation.success) {
      setError(validation.error.issues[0]?.message || "Senha inválida.");
      return;
    }
    setLoading(true);
    const result = await authClient.resetPassword({
      newPassword: password,
      token,
    });
    setLoading(false);
    if (result.error) {
      setError("Link inválido ou expirado.");
      return;
    }
    setSuccess(true);
  }
  if (!token || params.has("error"))
    return (
      <div className="space-y-5">
        <FormMessage type="error">Link inválido ou expirado.</FormMessage>
        <Link
          href="/esqueci-senha"
          className="flex h-12 items-center justify-center rounded-xl bg-indigo-600 font-bold text-white"
        >
          Solicitar novo link
        </Link>
      </div>
    );
  if (success)
    return (
      <div className="space-y-5">
        <FormMessage type="success">
          Senha atualizada e sessões anteriores encerradas.
        </FormMessage>
        <Link
          href="/login"
          className="flex h-12 items-center justify-center rounded-xl bg-indigo-600 font-bold text-white"
        >
          Entrar
        </Link>
      </div>
    );
  return (
    <form onSubmit={submit} className="space-y-5">
      {error && <FormMessage type="error">{error}</FormMessage>}
      <PasswordInput
        id="password"
        name="password"
        label="Nova senha"
        autoComplete="new-password"
      />
      <PasswordInput
        id="confirmPassword"
        name="confirmPassword"
        label="Confirmar senha"
        autoComplete="new-password"
      />
      <button
        disabled={loading}
        className="h-12 w-full rounded-xl bg-indigo-600 font-bold text-white"
      >
        {loading ? "Atualizando..." : "Atualizar senha"}
      </button>
    </form>
  );
}
