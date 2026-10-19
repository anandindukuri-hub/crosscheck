import { z } from "zod";
import { approveRun } from "@/lib/engine";
import { fail, ok } from "@/lib/http";
import { safeId } from "@/lib/store";

const Body = z.object({ agreed: z.array(z.string()).max(10).default([]) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = Body.parse(await req.json().catch(() => ({})));
    await approveRun(safeId(id), body.agreed);
    return ok({ approved: true });
  } catch (e) {
    return fail(e);
  }
}
