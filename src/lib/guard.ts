// CrossCheck has no sign in, so only this machine may use it. The Host check stops a DNS rebinding page,
// the Origin check stops another site from posting (approve, book, Talk to Fo) and Sec-Fetch-Site stops
// another page from reaching the API with a plain GET such as an img tag on the dev checks that cost money.
// Any port works, so the app runs wherever you start it
const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/;
const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);
const OTHER_SITE = "Requests from other sites are refused";
export const NOT_LOCAL = "CrossCheck only answers on this computer (localhost)";

export type GuardInput = { host: string | null; origin: string | null; method: string; path: string; site: string | null };

export function refusal(r: GuardInput): string | null {
  const host = r.host?.toLowerCase() ?? "";
  if (!LOOPBACK.test(host)) return NOT_LOCAL;
  // browsers always send Origin on a POST, so a missing one is refused too. It must be this same loopback address and port
  const origin = r.origin?.toLowerCase() ?? "";
  if (!SAFE.has(r.method.toUpperCase()) && origin !== `http://${host}` && origin !== `https://${host}`) return OTHER_SITE;
  // "none" is a typed address or a bookmark, a missing header is curl on this machine
  if (r.path.startsWith("/api/") && r.site && r.site !== "same-origin" && r.site !== "none") return OTHER_SITE;
  return null;
}
