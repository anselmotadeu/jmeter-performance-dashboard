"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import FormMessage from "./FormMessage";
import { authClient } from "@/lib/auth-client";
export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!remaining) return;
    const timer = setInterval(
      () => setRemaining((v) => Math.max(0, v - 1)),
      1000,
    );
    return () => clearInterval(timer);
  }, [remaining]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const result = await authClient.requestPasswordReset({
      email: email.trim().toLowerCase(),
      redirectTo: "/redefinir-senha",
    });
    setLoading(false);
    if (result.error) {
      setError("Não foi possível processar a solicitação.");
      return;
    }
    setMessage(
      "Se o e-mail estiver cadastrado, enviaremos um link válido por uma hora.",
    );
    setRemaining(300);
  }
  return (
    <form onSubmit={submit} className="space-y-5">
      {message && <FormMessage type="success">{message}</FormMessage>}
      {error && <FormMessage type="error">{error}</FormMessage>}
      <label htmlFor="email" className="block text-sm font-bold text-slate-700">
        E-mail da conta
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-slate-950"
        />
      </label>
      <button
        disabled={loading || remaining > 0}
        className="h-12 w-full rounded-xl bg-indigo-600 font-bold text-white disabled:opacity-50"
      >
        {loading
          ? "Enviando..."
          : remaining
            ? `Reenviar em ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`
            : "Enviar recuperação"}
      </button>
      <Link
        href="/login"
        className="block text-center text-sm font-bold text-indigo-600"
      >
        Voltar ao login
      </Link>
    </form>
  );
}
