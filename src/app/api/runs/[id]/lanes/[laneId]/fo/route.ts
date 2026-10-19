import { laneConversation } from "@/lib/fo/history";
import { fail, ok } from "@/lib/http";
import { loadLane, loadRun, safeId } from "@/lib/store";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string; laneId: string }> }) {
  try {
    const p = await ctx.params;
    const run = await loadRun(safeId(p.id));
    const lane = run ? await loadLane(run.id, safeId(p.laneId)) : null;
    if (!run || !lane) return Response.json({ error: "Not found" }, { status: 404 });
    return ok({ turns: await laneConversation(run, lane) });
  } catch (e) {
    return fail(e);
  }
}
