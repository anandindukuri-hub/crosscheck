import { createRun } from "@/lib/engine";
import { fail, jsonBody, ok } from "@/lib/http";
import { listRuns } from "@/lib/store";
import { NewRunInput } from "@/lib/types";

export async function GET() {
  try {
    const runs = await listRuns();
    return ok({ runs: runs.slice(0, 30).map((r) => ({ id: r.id, createdAt: r.createdAt, mode: r.mode, when: r.when, lanes: r.laneIds.length, approvedAt: r.approvedAt })) });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  try {
    const input = NewRunInput.parse(await jsonBody(req));
    const run = await createRun(input);
    return ok({ id: run.id });
  } catch (e) {
    return fail(e);
  }
}
