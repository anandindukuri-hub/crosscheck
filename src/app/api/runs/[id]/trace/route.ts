import { aliasName, aliasReplay } from "@/components/run/alias";
import { phoneMasker } from "@/lib/engine";
import { env } from "@/lib/env";
import { fail } from "@/lib/http";
import { loadLanes, loadRun, safeId } from "@/lib/store";
import { exportLane, leaks, readTrace, redact, staffNames } from "@/lib/trace";

// the redacted run trace for the hackathon form, with a leak scan. Raw events never leave the server
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const run = await loadRun(safeId(id));
    if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
    const events = await readTrace(run.id);
    const lanes = await loadLanes(run);
    // a sample exports what its page showed: the display names and no DEV REPLAY tags
    const replay = run.mode === "replay";
    const hide = lanes.filter((l) => !l.booking || l.booking.status !== "done").map((l) => (replay ? aliasName(l.restaurant.name) : l.restaurant.name));
    const exported = aliasReplay(run.mode, {
      run: { id: run.id, mode: run.mode, createdAt: run.createdAt, diners: run.diners.map((d) => d.label) },
      lanes: lanes.map((l) => exportLane(l, !!run.approvedAt)),
      events: replay ? (JSON.parse(JSON.stringify(events).replace(/DEV REPLAY:? ?/g, "")) as typeof events) : events,
    });
    // the test phone in any format goes first, whatever country it is in
    const masked: unknown = JSON.parse(phoneMasker(env.testPhone())(JSON.stringify(exported)));
    // every staff name in what the kitchen or Fo said: the lanes' reports and all of Fo's replies, never CrossCheck's own messages
    const foSaid = stringsIn(events.filter((e) => e.actor === "fo").map((e) => e.output));
    const said = [...lanes.flatMap((l) => l.reports.map((r) => r.text)), ...foSaid];
    const staff = staffNames(said, [...run.diners.map((d) => d.label), ...lanes.map((l) => l.restaurant.name)]);
    const red = redact(masked, hide, staff);
    const text = JSON.stringify(red, null, 2);
    const found = leaks(red, hide, staff, env.testPhone());
    if (found.length) return Response.json({ error: `Export blocked, still contains: ${found.join(", ")}` }, { status: 500 });
    return new Response(text, { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="crosscheck-trace-${run.id}.json"` } });
  } catch (e) {
    return fail(e);
  }
}

function stringsIn(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => stringsIn(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => stringsIn(x, out));
  return out;
}
