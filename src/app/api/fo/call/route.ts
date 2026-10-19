import { startFoCall } from "@/lib/fo/history";
import { fail, ok } from "@/lib/http";

// A one use link to a live voice call with Fo, valid for about 10 minutes
export async function POST() {
  try {
    return ok(await startFoCall());
  } catch (e) {
    return fail(e);
  }
}
