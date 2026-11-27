import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession, type Session } from "@/lib/session";

const PUBLIC_PATHS = ["/welcome", "/login", "/register", "/forgot", "/reset", "/api/auth/login", "/api/auth/register", "/api/auth/forgot", "/api/auth/reset", "/api/health", "/api/payments/sepay"];
const RANK = { student: 0, editor: 1, admin: 2 } as const;

const under = (path: string, list: string[]) => list.some((p) => path === p || path.startsWith(p + "/"));

/** The least role a request needs: admin pages and AI set-up; editors change the shared IELTS books and listening bank. */
export function needs(path: string, method: string): Session["role"] {
  if (under(path, ["/admin", "/api/admin"])) return "admin";
  const write = method !== "GET" && method !== "HEAD";
  if (write && under(path, ["/api/ai/providers", "/api/ai/routing", "/api/ai/images", "/api/jobs"]) && !/^\/api\/jobs\/\d+$/.test(path)) return "admin";
  if (under(path, ["/ielts/import", "/ielts/books"]) || /^\/(ielts\/sections|listen)\/\d+\/edit$/.test(path)) return "editor";
  if (write && under(path, ["/api/ielts/books", "/api/ielts/sections", "/api/ielts/audio", "/api/ielts/tests", "/api/ielts/read-picture", "/api/listen/ielts", "/api/listen/clean-ai"])) return "editor";
  if (write && (path === "/api/listen/sources" || /^\/api\/listen\/sources\/\d+\/items$/.test(path) || (method === "DELETE" && /^\/api\/listen\/sources\/\d+$/.test(path)))) return "editor";
  return "student";
}

/**
 * A redirect to a page of this site. Behind Nginx, req.url / req.nextUrl carry the internal origin (and Next even
 * takes X-Forwarded-Proto for it: https://localhost:PORT), so the address is built from the proxy headers.
 * No rewrites here for the same reason: Next would proxy them over TLS to the plain-HTTP port and fail (500).
 */
function redirectTo(req: NextRequest, target: string) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  return NextResponse.redirect(host ? `${proto}://${host}${target}` : new URL(target, req.url));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // who is asking goes to the server code only from here: a client's own x-user-* headers are dropped
  const headers = new Headers(req.headers);
  for (const h of ["x-user-id", "x-user-role", "x-user-sv"]) headers.delete(h);
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next({ request: { headers } });

  const s = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (s) {
    if (RANK[s.role] < RANK[needs(pathname, req.method)]) {
      if (pathname.startsWith("/api/")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      return redirectTo(req, "/forbidden");
    }
    headers.set("x-user-id", String(s.uid));
    headers.set("x-user-role", s.role);
    headers.set("x-user-sv", String(s.sv));
    return NextResponse.next({ request: { headers } });
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (pathname === "/") return NextResponse.next({ request: { headers } }); // the home page shows visitors the landing page
  return redirectTo(req, `/login?next=${encodeURIComponent(pathname)}`);
}

export const config = {
  // Static/PWA files must stay public: browsers fetch the manifest, icons and service worker without cookies.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|icons/|manifest.webmanifest|sw.js|offline.html).*)"],
};
