import { ZodError } from "zod";
import { UserError } from "./engine";
import { BusyError } from "./queue";

// One response shape everywhere: { data } or { error }
export const ok = (data: unknown) => Response.json({ data });

// a body that is not JSON is the sender's mistake: a plain 400, never the parser's own words
class BadBody extends Error {}
export const jsonBody = (req: Request, message = "CrossCheck could not read that. Send it again.") =>
  req.json().catch(() => {
    throw new BadBody(message);
  }) as Promise<unknown>;

export function fail(e: unknown) {
  if (e instanceof UserError || e instanceof BusyError || e instanceof BadBody) return Response.json({ error: e.message }, { status: 400 });
  // a custom check carries a message meant for Anand, so show it instead of "Invalid input"
  if (e instanceof ZodError) return Response.json({ error: e.issues.find((i) => i.code === "custom")?.message ?? "Invalid input", issues: e.issues.slice(0, 5) }, { status: 400 });
  console.error(e);
  return Response.json({ error: e instanceof Error ? e.message : "Something went wrong" }, { status: 500 });
}
