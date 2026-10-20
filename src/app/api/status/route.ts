import { keyStatus } from "@/lib/env";
import { foStatus } from "@/lib/fo/client";
import { fail, ok } from "@/lib/http";
import { currentFidelity } from "@/lib/settings";
import { readStats } from "@/lib/trace";
import { listDoNotCall } from "@/lib/donotcall";
import { openLiveRun } from "@/lib/engine";

export async function GET() {
  try {
    const live = { openRun: await openLiveRun(), production: process.env.NODE_ENV === "production", doNotCall: (await listDoNotCall()).length };
    return ok({ fo: await foStatus(), keys: { ...keyStatus(), fidelity: await currentFidelity() }, stats: await readStats(), live });
  } catch (e) {
    return fail(e);
  }
}
