import { z } from "zod";
import { answerFo, askChef, book, callAgain, callAnyway, confirmBooking, confirmReconfirmReview, declineFo, foHasIt, requestReconfirm, resume, sendAgain, setAgreed } from "@/lib/engine";
import { fail, jsonBody, ok } from "@/lib/http";
import { safeId } from "@/lib/store";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("answer"), text: z.string().min(1).max(1000) }),
  z.object({ action: z.literal("decline") }),
  z.object({ action: z.literal("ask_chef") }),
  z.object({ action: z.literal("book"), depositCap: z.number().min(0).max(500), reviewed: z.boolean().default(false) }),
  z.object({ action: z.literal("resume") }),
  z.object({ action: z.literal("send_again") }),
  z.object({ action: z.literal("fo_has_it") }),
  z.object({ action: z.literal("booking_confirmed") }),
  z.object({ action: z.literal("booking_not_booked") }),
  z.object({ action: z.literal("agree"), agreed: z.boolean() }),
  z.object({ action: z.literal("call_again") }),
  z.object({ action: z.literal("call_anyway") }),
  z.object({ action: z.literal("reconfirm") }),
  z.object({ action: z.literal("reconfirm_reviewed"), keys: z.array(z.string().max(80)).max(40) }),
]);

export async function POST(req: Request, ctx: { params: Promise<{ id: string; laneId: string }> }) {
  try {
    const p = await ctx.params;
    const runId = safeId(p.id);
    const laneId = safeId(p.laneId);
    const b = Body.parse(await jsonBody(req));
    if (b.action === "answer") await answerFo(runId, laneId, b.text);
    else if (b.action === "decline") await declineFo(runId, laneId);
    else if (b.action === "ask_chef") await askChef(runId, laneId);
    else if (b.action === "book") await book(runId, laneId, { depositCap: b.depositCap, reviewed: b.reviewed });
    else if (b.action === "resume") await resume(runId, laneId);
    else if (b.action === "send_again") await sendAgain(runId, laneId);
    else if (b.action === "fo_has_it") await foHasIt(runId, laneId);
    else if (b.action === "booking_confirmed") await confirmBooking(runId, laneId, true);
    else if (b.action === "booking_not_booked") await confirmBooking(runId, laneId, false);
    else if (b.action === "call_again") await callAgain(runId, laneId);
    else if (b.action === "call_anyway") await callAnyway(runId, laneId);
    else if (b.action === "reconfirm") await requestReconfirm(runId, laneId);
    else if (b.action === "reconfirm_reviewed") await confirmReconfirmReview(runId, laneId, b.keys);
    else await setAgreed(runId, laneId, b.agreed);
    return ok({ done: true });
  } catch (e) {
    return fail(e);
  }
}
