import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { getSetting } from "@/lib/settings";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials, req) {
        // Reads live admin settings (panel / .env), not a frozen env snapshot
        const adminPassword = getSetting("ADMIN_PASSWORD") || "admin123";
        
        if (credentials?.password === adminPassword) {
            return { id: "admin", name: "Admin", email: "admin@local.host", role: "ADMIN" };
        }
        
        return null;
      }
    })
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }: any) {
      if (user) {
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }: any) {
      if (session.user) {
        session.user.role = token.role;
      }
      return session;
    }
  },
  pages: {
    signIn: '/admin/login',
  }
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
