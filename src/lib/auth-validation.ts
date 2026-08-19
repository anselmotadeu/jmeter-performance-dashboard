import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(8, "A senha deve ter pelo menos 8 caracteres.")
  .max(128)
  .regex(/[a-z]/, "Inclua pelo menos uma letra minúscula.")
  .regex(/[A-Z]/, "Inclua pelo menos uma letra maiúscula.")
  .regex(/[0-9]/, "Inclua pelo menos um número.")
  .regex(/[^A-Za-z0-9]/, "Inclua pelo menos um caractere especial.");

export const signUpSchema = z.object({
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().min(2).max(120),
  email: z.email().trim().toLowerCase().max(254),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{10,15}$/),
  password: passwordSchema,
});

export function normalizePhone(phone: string) {
  return `${phone.trim().startsWith("+") ? "+" : ""}${phone.replace(/\D/g, "")}`;
}
