import { fail, ok } from "@/lib/http";
import { fidelityStatus } from "@/lib/settings";

export async function GET() {
  try {
    return ok(await fidelityStatus());
  } catch (e) {
    return fail(e);
  }
}
