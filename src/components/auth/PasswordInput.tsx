"use client";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
export default function PasswordInput({
  id,
  name,
  label,
  autoComplete,
  placeholder = "Digite sua senha",
}: {
  id: string;
  name: string;
  label: string;
  autoComplete: string;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label htmlFor={id} className="block text-sm font-bold text-slate-700">
      <span>{label}</span>
      <span className="relative mt-2 block">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required
          minLength={8}
          maxLength={128}
          className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 pr-12 text-slate-950 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-500"
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        >
          {visible ? (
            <EyeOff className="h-5 w-5" />
          ) : (
            <Eye className="h-5 w-5" />
          )}
        </button>
      </span>
    </label>
  );
}
