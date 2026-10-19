import { runView } from "@/lib/engine";
import { fail, ok } from "@/lib/http";
import { safeId } from "@/lib/store";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const view = await runView(safeId(id));
    if (!view) return Response.json({ error: "Run not found" }, { status: 404 });
    return ok(view);
  } catch (e) {
    return fail(e);
  }
}
