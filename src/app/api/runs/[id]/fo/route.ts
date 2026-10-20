import { callCheck, runConversations } from "@/lib/fo/history";
import { fail, ok } from "@/lib/http";
import { loadLanes, loadRun, safeId } from "@/lib/store";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const run = await loadRun(safeId(id));
    if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
    // ?check=1: Check Fo's conversations, counts only
    if (new URL(req.url).searchParams.get("check")) return ok({ check: await callCheck(run, await loadLanes(run)) });
    return ok({ conversations: await runConversations(run, await loadLanes(run)) });
  } catch (e) {
    return fail(e);
  }
}
