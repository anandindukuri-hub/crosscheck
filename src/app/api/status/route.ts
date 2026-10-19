import { keyStatus } from "@/lib/env";
import { foStatus } from "@/lib/fo/client";
import { fail, ok } from "@/lib/http";
import { currentFidelity } from "@/lib/settings";
import { readStats } from "@/lib/trace";

export async function GET() {
  try {
    return ok({ fo: await foStatus(), keys: { ...keyStatus(), fidelity: await currentFidelity() }, stats: await readStats() });
  } catch (e) {
    return fail(e);
  }
}
