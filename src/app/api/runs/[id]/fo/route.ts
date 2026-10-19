import { runConversations } from "@/lib/fo/history";
import { fail, ok } from "@/lib/http";
import { loadLanes, loadRun, safeId } from "@/lib/store";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const run = await loadRun(safeId(id));
    if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
    return ok({ conversations: await runConversations(run, await loadLanes(run)) });
  } catch (e) {
    return fail(e);
  }
}
