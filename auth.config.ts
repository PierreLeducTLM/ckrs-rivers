import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js configuration. Used by middleware (which runs on the
 * edge runtime where the @neondatabase/serverless HTTP driver and bcryptjs
 * compare are both available, but we still want to keep the middleware bundle
 * tiny). The Credentials provider with its DB-backed `authorize` lives in
 * `auth.ts`.
 */
export default {
  providers: [],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isLoggedIn = !!auth?.user;
      if (
        pathname.startsWith("/admin") ||
        pathname.startsWith("/api/admin")
      ) {
        return isLoggedIn;
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role ?? "admin";
        token.email = user.email;
        token.name = user.name ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.id && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
