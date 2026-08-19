import { auth } from "@/lib/auth";
import { hashAuthIdentifier } from "@/lib/auth-security";
import { db, securityDb } from "@/lib/db";

const LOCK_SECONDS = 900;
const RESET_SECONDS = 300;
type Attempt = { count: number; lockedUntil: Date | null };

function error(
  status: number,
  code: string,
  message: string,
  retryAfter?: number,
) {
  return Response.json(
    { code, message },
    {
      status,
      headers: retryAfter
        ? {
            "Retry-After": String(retryAfter),
            "X-Retry-After": String(retryAfter),
          }
        : undefined,
    },
  );
}

async function withLock<T>(key: string, operation: () => Promise<T>) {
  const client = await securityDb.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [key],
    );
    const result = await operation();
    await client.query("COMMIT");
    return result;
  } catch (cause) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw cause;
  } finally {
    client.release();
  }
}

async function signIn(request: Request, email: string) {
  const key = hashAuthIdentifier(email);
  return withLock(key, async () => {
    await db.query(
      `DELETE FROM "loginAttempt" WHERE key=$1 AND "lockedUntil" IS NULL AND "windowStartedAt" < now()-interval '15 minutes'`,
      [key],
    );
    const attempt = (
      await db.query<Attempt>(
        'SELECT count, "lockedUntil" FROM "loginAttempt" WHERE key = $1',
        [key],
      )
    ).rows[0];
    if (attempt?.lockedUntil && attempt.lockedUntil.getTime() > Date.now())
      return error(
        423,
        "ACCOUNT_LOCKED",
        "Acesso bloqueado temporariamente após três tentativas incorretas.",
        Math.ceil((attempt.lockedUntil.getTime() - Date.now()) / 1000),
      );
    if (attempt?.lockedUntil)
      await db.query('DELETE FROM "loginAttempt" WHERE key = $1', [key]);
    const response = await auth.handler(request);
    const payload = (await response
      .clone()
      .json()
      .catch(() => null)) as { code?: string } | null;
    if (response.ok || payload?.code === "EMAIL_NOT_VERIFIED") {
      await db.query('DELETE FROM "loginAttempt" WHERE key = $1', [key]);
      return response;
    }
    if (payload?.code !== "INVALID_EMAIL_OR_PASSWORD") return response;
    const updated = await db.query<Attempt>(
      `INSERT INTO "loginAttempt" (key,count,"updatedAt","windowStartedAt") VALUES ($1,1,now(),now()) ON CONFLICT (key) DO UPDATE SET count="loginAttempt".count+1,"lockedUntil"=CASE WHEN "loginAttempt".count+1>=3 THEN now()+($2*interval '1 second') ELSE NULL END,"updatedAt"=now() RETURNING count,"lockedUntil"`,
      [key, LOCK_SECONDS],
    );
    return updated.rows[0]?.lockedUntil
      ? error(
          423,
          "ACCOUNT_LOCKED",
          "Acesso bloqueado temporariamente após três tentativas incorretas.",
          LOCK_SECONDS,
        )
      : response;
  });
}

async function reset(request: Request, email: string) {
  const key = hashAuthIdentifier(email);
  const reserved = await db.query(
    `INSERT INTO "passwordResetAttempt" (key,"lastSentAt") VALUES ($1,now()) ON CONFLICT (key) DO UPDATE SET "lastSentAt"=now() WHERE "passwordResetAttempt"."lastSentAt"<=now()-($2*interval '1 second') RETURNING key`,
    [key, RESET_SECONDS],
  );
  if (reserved.rowCount) {
    const response = await auth.handler(request);
    if (!response.ok) {
      await db.query('DELETE FROM "passwordResetAttempt" WHERE key=$1', [key]);
      return response;
    }
  }
  return Response.json({
    status: true,
    message: "Se o e-mail estiver cadastrado, enviaremos as instruções.",
    retryAfter: RESET_SECONDS,
  });
}

async function handler(request: Request) {
  const path = new URL(request.url).pathname.replace(/^\/api\/auth/, "");
  if (
    request.method === "POST" &&
    (path === "/sign-in/email" || path === "/request-password-reset")
  ) {
    const body = (await request
      .clone()
      .json()
      .catch(() => ({}))) as { email?: unknown };
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email) return auth.handler(request);
    return path === "/sign-in/email"
      ? signIn(request, email)
      : reset(request, email);
  }
  return auth.handler(request);
}
export const GET = handler;
export const POST = handler;
