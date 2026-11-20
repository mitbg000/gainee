import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/health"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();

  if (await verifySession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Behind Nginx, req.nextUrl carries the internal 127.0.0.1:PORT origin, so build the redirect from the proxy headers.
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  const target = `/login?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(host ? `${proto}://${host}${target}` : new URL(target, req.url));
}

export const config = {
  // Static/PWA files must stay public: browsers fetch the manifest, icons and service worker without cookies.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|icons/|manifest.webmanifest|sw.js|offline.html).*)"],
};
