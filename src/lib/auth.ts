import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';

export const authOptions: NextAuthOptions = {
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),

    // Credentials fallback for teams without Google OAuth configured.
    // Set ADMIN_EMAIL and ADMIN_PASSWORD env vars to enable.
    ...(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD
      ? [
          CredentialsProvider({
            name: 'Credenciais',
            credentials: {
              email: { label: 'Email', type: 'email', placeholder: 'admin@empresa.com' },
              password: { label: 'Senha', type: 'password' },
            },
            async authorize(credentials) {
              if (
                credentials?.email === process.env.ADMIN_EMAIL &&
                credentials?.password === process.env.ADMIN_PASSWORD
              ) {
                return {
                  id: '1',
                  email: process.env.ADMIN_EMAIL,
                  name: 'Admin',
                };
              }
              return null;
            },
          }),
        ]
      : []),
  ],

  session: { strategy: 'jwt' },

  pages: {
    signIn: '/login',
  },

  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user) (session.user as { id?: string }).id = token.id as string;
      return session;
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
};

// Returns true when auth should be enforced.
// Auth is skipped when SKIP_AUTH=true OR when no providers are configured,
// so the app is usable out of the box before credentials are set up.
export function isAuthRequired(): boolean {
  if (process.env.SKIP_AUTH === 'true') return false;
  const hasGoogle = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const hasCredentials = !!(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD);
  return hasGoogle || hasCredentials;
}
