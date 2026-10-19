import { passResponse } from "@/lib/passImage";
import { loadLane, loadRun, safeId } from "@/lib/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ runId: string; laneId: string }> };

async function load(ctx: Ctx) {
  const { runId, laneId } = await ctx.params;
  try {
    const [run, lane] = await Promise.all([loadRun(safeId(runId)), loadLane(safeId(runId), safeId(laneId))]);
    return run && lane ? { run, lane } : null;
  } catch {
    return null;
  }
}

const missing = () => new Response("No table pass here. This table or kitchen does not exist on this computer.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

// GET /card/<run>/<lane>/image: the table pass as a PNG. ?download=1 saves it with a sensible filename
export async function GET(req: Request, ctx: Ctx) {
  const found = await load(ctx);
  if (!found) return missing();
  return passResponse(found.run, found.lane, { download: new URL(req.url).searchParams.has("download") });
}

// POST { who: { "Guest 2": "Sam" } }: the same PNG with the names typed on the pass page, so the saved image matches
// the pass on screen. The names stay in the request body, never in a URL or on disk
export async function POST(req: Request, ctx: Ctx) {
  const found = await load(ctx);
  if (!found) return missing();
  const body = (await req.json().catch(() => null)) as { who?: unknown } | null;
  const who: Record<string, string> = {};
  if (body?.who && typeof body.who === "object")
    for (const [k, v] of Object.entries(body.who as Record<string, unknown>).slice(0, 8)) if (typeof v === "string") who[k.slice(0, 40)] = v.slice(0, 40);
  return passResponse(found.run, found.lane, { download: true, who });
}
