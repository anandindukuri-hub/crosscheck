import { NextResponse, type NextRequest } from "next/server";
import { refusal } from "@/lib/guard";

// Runs before every page and API route: only this machine's browser, never another site or a rebinding page
export function proxy(req: NextRequest) {
  const why = refusal({
    host: req.headers.get("host"),
    origin: req.headers.get("origin"),
    method: req.method,
    path: req.nextUrl.pathname,
    site: req.headers.get("sec-fetch-site"),
  });
  const res = why ? NextResponse.json({ error: why }, { status: 403 }) : NextResponse.next();
  // no other site may frame the app (clickjacking on Approve, Book or Talk to Fo)
  res.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  res.headers.set("X-Frame-Options", "DENY");
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
