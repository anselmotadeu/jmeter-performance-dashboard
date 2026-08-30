import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { waitUntil } from "@vercel/functions";
import { db } from "@/lib/db";
import {
  normalizePhone,
  passwordSchema,
  signUpSchema,
} from "@/lib/auth-validation";
import { hashAuthIdentifier } from "@/lib/auth-security";
import { sendAuthEmail } from "@/lib/email";
import { ensureWorkspace } from "@/lib/workspace";
import { getOrCreateTrial } from "@/lib/subscription";

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
if (process.env.NODE_ENV === "production") {
  if (
    !process.env.DATABASE_URL ||
    !process.env.BETTER_AUTH_SECRET ||
    !process.env.BETTER_AUTH_URL
  )
    throw new Error("Variáveis de autenticação obrigatórias ausentes.");
  const url = new URL(baseURL);
  if (url.protocol !== "https:" && url.hostname !== "localhost")
    throw new Error("BETTER_AUTH_URL deve usar HTTPS.");
}

export const auth = betterAuth({
  appName: "Performance Dashboard",
  database: db,
  baseURL,
  trustedOrigins: [
    "http://localhost:3000",
    "https://jmeter-performance-dashboard.vercel.app",
    "https://jmeter-performance-dashboard-*.vercel.app",
  ],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 3600,
    sendResetPassword: async ({ user, url }) =>
      sendAuthEmail({
        to: user.email,
        subject: "Redefina sua senha",
        title: "Redefinição de senha",
        description: "Recebemos uma solicitação para criar uma nova senha.",
        action: "Criar nova senha",
        url,
      }),
    onPasswordReset: async ({ user }) => {
      await db.query('DELETE FROM "loginAttempt" WHERE key = $1', [
        hashAuthIdentifier(user.email),
      ]);
    },
    onExistingUserSignUp: async ({ user }) =>
      sendAuthEmail({
        to: user.email,
        subject: "Tentativa de cadastro",
        title: "Você já possui uma conta",
        description:
          "Recebemos uma tentativa de cadastro com este e-mail. Nenhuma nova conta foi criada.",
        action: "Entrar na minha conta",
        url: `${baseURL}/login`,
        secondaryAction: "Esqueci minha senha",
        secondaryUrl: `${baseURL}/esqueci-senha`,
        footer: "Se não foi você, nenhuma ação é necessária.",
      }),
    customSyntheticUser: ({ coreFields, additionalFields, id }) => ({
      ...coreFields,
      ...additionalFields,
      id,
    }),
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: false,
    expiresIn: 3600,
    sendVerificationEmail: async ({ user, url }) =>
      sendAuthEmail({
        to: user.email,
        subject: "Confirme seu e-mail",
        title: "Confirme seu endereço de e-mail",
        description:
          "Confirme que este endereço pertence a você para liberar o acesso.",
        action: "Confirmar meu e-mail",
        url,
      }),
  },
  user: {
    additionalFields: {
      firstName: { type: "string", required: true },
      lastName: { type: "string", required: true },
      phone: { type: "string", required: true, returned: false },
    },
  },
  session: { expiresIn: 7 * 24 * 3600, updateAge: 24 * 3600 },
  verification: { storeIdentifier: "hashed" },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 60,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 600, max: 5 },
      "/request-password-reset": { window: 300, max: 3 },
      "/send-verification-email": { window: 300, max: 3 },
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await ensureWorkspace(user.id, user.name);
          await getOrCreateTrial(user.id);
        },
      },
    },
  },
  advanced: {
    cookiePrefix: "performance-dashboard",
    useSecureCookies: process.env.NODE_ENV === "production",
    database: { joins: true },
    backgroundTasks: {
      handler: (promise) => {
        if (process.env.VERCEL) waitUntil(promise);
        else void promise.catch(console.error);
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/reset-password" || ctx.path === "/change-password") {
        if (!passwordSchema.safeParse(ctx.body?.newPassword).success)
          throw new APIError("BAD_REQUEST", {
            code: "INVALID_PASSWORD_POLICY",
            message: "A nova senha não atende aos requisitos.",
          });
        return;
      }
      if (ctx.path !== "/sign-up/email") return;
      const parsed = signUpSchema.safeParse({
        firstName: ctx.body?.firstName,
        lastName: ctx.body?.lastName,
        email: ctx.body?.email,
        phone: normalizePhone(String(ctx.body?.phone ?? "")),
        password: ctx.body?.password,
      });
      if (!parsed.success)
        throw new APIError("BAD_REQUEST", {
          code: "INVALID_SIGN_UP_DATA",
          message: "Revise os dados informados.",
        });
      return {
        context: {
          ...ctx,
          body: {
            ...ctx.body,
            ...parsed.data,
            name: `${parsed.data.firstName} ${parsed.data.lastName}`,
          },
        },
      };
    }),
  },
});
