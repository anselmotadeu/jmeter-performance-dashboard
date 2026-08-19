import { createHmac } from "node:crypto";

export function hashAuthIdentifier(value: string) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET não configurado.");
  return createHmac("sha256", secret)
    .update(value.trim().toLowerCase())
    .digest("hex");
}
