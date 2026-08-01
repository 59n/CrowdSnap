import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware() {
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname;
        // Protect admin UI + admin APIs (except NextAuth itself)
        if (path.startsWith("/api/admin") || path.startsWith("/admin")) {
          if (path.startsWith("/admin/login")) return true;
          return token?.role === "ADMIN" || !!token;
        }
        return true;
      },
    },
    pages: {
      signIn: "/admin/login",
    },
  }
);

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
