import { z } from "zod";
import { listDoNotCall, removeDoNotCall } from "@/lib/donotcall";
import { fail, jsonBody, ok } from "@/lib/http";

export async function GET() {
  try {
    return ok({ list: await listDoNotCall() });
  } catch (e) {
    return fail(e);
  }
}

// only you can take a kitchen off the list, for example after they tell you calls are fine again
const Body = z.object({ phone: z.string().min(7).max(40) });
export async function POST(req: Request) {
  try {
    const { phone } = Body.parse(await jsonBody(req));
    await removeDoNotCall(phone);
    return ok({ removed: true });
  } catch (e) {
    return fail(e);
  }
}
