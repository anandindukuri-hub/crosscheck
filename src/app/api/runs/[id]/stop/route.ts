import { stopAll } from "@/lib/engine";
import { fail, ok } from "@/lib/http";
import { safeId } from "@/lib/store";

// Stop all calls: kitchens Fo never got are not called and Fo is told to stop the rest
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    await stopAll(safeId(id));
    return ok({ stopped: true });
  } catch (e) {
    return fail(e);
  }
}
