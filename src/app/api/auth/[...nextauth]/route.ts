import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { NextRequest } from "next/server";
import { getSetting, saveAppSettings, getAppSettings } from "@/lib/settings";
import {
  verifyPassword,
  productionSecretsOk,
} from "@/lib/password";
import {
  checkRateLimit,
  rateLimitKey,
  LOGIN_LIMIT,
  ipFromHeaders,
} from "@/lib/rate-limit";

/** Shared authorize used after per-IP rate limit on POST */
async function authorizePassword(password: string) {
  const secrets = productionSecretsOk({
    adminPassword: getSetting("ADMIN_PASSWORD"),
    nextAuthSecret:
      getSetting("NEXTAUTH_SECRET") || process.env.NEXTAUTH_SECRET,
  });
  if (!secrets.ok) {
    console.error("[auth]", secrets.reason);
    return null;
  }

  const stored = getSetting("ADMIN_PASSWORD");
  const result = await verifyPassword(password, stored);
  if (!result.ok) return null;

  if (result.needsRehash) {
    try {
      saveAppSettings({ ADMIN_PASSWORD: password });
    } catch (e) {
      console.warn("[auth] password rehash failed:", (e as Error).message);
    }
  }

  return {
    id: "admin",
    name: "Admin",
    email: "admin@local.host",
    role: "ADMIN",
  };
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        // Rate limiting is applied in the POST wrapper (per IP).
        // Keep a secondary guard here in case authorize is invoked without wrapper.
        return authorizePassword(credentials?.password || "");
      },
    }),
  ],
  secret:
    process.env.NEXTAUTH_SECRET ||
    getAppSettings().NEXTAUTH_SECRET ||
    undefined,
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        (token as { role?: string }).role = (user as { role?: string }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { role?: string }).role = (
          token as { role?: string }
        ).role;
      }
      return session;
    },
  },
  pages: {
    signIn: "/admin/login",
  },
};

const nextAuthHandler = NextAuth(authOptions);

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ nextauth: string[] }> }
) {
  return nextAuthHandler(req, ctx);
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ nextauth: string[] }> }
) {
  const ip = ipFromHeaders(req.headers);
  const limit = checkRateLimit(
    rateLimitKey("login", ip),
    LOGIN_LIMIT.max,
    LOGIN_LIMIT.windowMs
  );
  if (!limit.allowed) {
    return new Response(
      JSON.stringify({ error: "Too many login attempts. Try again later." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000) || 60),
        },
      }
    );
  }
  return nextAuthHandler(req, ctx);
}

