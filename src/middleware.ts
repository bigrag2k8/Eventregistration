import { NextResponse, type NextRequest } from "next/server";
import { verifySession } from "@/lib/auth";

const PROTECTED = [/^\/dashboard/, /^\/checkin/, /^\/api\/admin/, /^\/admin/];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // /api/admin/seed has its own secret-based auth
  if (pathname.startsWith("/api/admin/seed")) return NextResponse.next();
  const needsAuth = PROTECTED.some((re) => re.test(pathname));
  if (!needsAuth) return NextResponse.next();

  const token = req.cookies.get(process.env.SESSION_COOKIE_NAME ?? "eventflow_session")?.value;
  if (!token) return NextResponse.redirect(new URL("/signin", req.url));
  const session = await verifySession(token);
  if (!session) return NextResponse.redirect(new URL("/signin", req.url));

  // RBAC for /checkin: ORGANIZER, STAFF, ADMIN, SUPERADMIN
  if (pathname.startsWith("/checkin") && !["ORGANIZER", "STAFF", "ADMIN", "SUPERADMIN"].includes(session.role)) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  // RBAC for /admin: SUPERADMIN only
  if (pathname.startsWith("/admin") && session.role !== "SUPERADMIN") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/checkin/:path*", "/api/admin/:path*", "/admin/:path*"],
};
