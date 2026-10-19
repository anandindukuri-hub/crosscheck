import { buildCase, CASES, HERO } from "@/lib/dev/cases";
import { buildJevQuestions, buildJevState, classifyBookingReply, jevDecide } from "@/lib/jev";
import { findRestaurant } from "@/lib/restaurants";
import { decideLane, previewLane } from "@/lib/rules";

// Dev only: real Jev calls on scripted kitchen reports (no Fo, no phone calls). curl localhost:3000/api/dev/jevcheck
export async function GET() {
  if (process.env.NODE_ENV === "production") return Response.json({ error: "dev only" }, { status: 404 });
  const r = await findRestaurant("test-thai");
  if (!r) return Response.json({ error: "no test kitchen" }, { status: 500 });
  const where = { runId: "devjevcheck", laneId: "dev" };
  const out: unknown[] = [];
  for (const id of ["good_thai", "hedge", "shared_fryer"]) {
    const c = CASES.find((x) => x.id === id)!;
    const b = buildCase(c, HERO, "thai");
    const t0 = Date.now();
    try {
      const d = await jevDecide({ ...where, state: buildJevState(r, HERO, b.checks, b.parsed, b.report), questions: buildJevQuestions(b.checks), checks: b.checks });
      const result = decideLane({ checks: b.checks, diners: HERO, parsed: b.parsed, decisions: d, judgement: b.judgement, fidelity: "verified" });
      out.push({
        case: id,
        ms: Date.now() - t0,
        model: d.model,
        expect: c.expect,
        got: result.state,
        // the instant preview the same Jev answers would show before Claude confirms
        preview: previewLane({ checks: b.checks, diners: HERO, parsed: b.parsed, decisions: d, fidelity: "verified" }).state,
        reasons: result.reasons,
        verdicts: result.checks.map((v) => ({ key: v.key, outcome: v.outcome, groupConf: v.jev?.confidence, reasons: v.reasons })),
        probs: Object.fromEntries(b.checks.filter((k) => k.templateId === "fryer").map((k) => [k.key, d.checks[k.key]?.probabilities])),
        globals: { outcome: d.outcome.choice, respondent: d.respondent.choice, accommodate: d.accommodate.choice, readback: d.readback.choice, misconception: Number(d.misconception.toFixed(3)) },
        checks: b.checks.map((k) => ({ key: k.key, choice: d.checks[k.key]?.choice, conf: Number((d.checks[k.key]?.confidence ?? 0).toFixed(3)), hedge: Number((d.hedge[k.key] ?? 1).toFixed(3)) })),
      });
    } catch (e) {
      out.push({ case: id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  const replies = [
    "Booked! Table for 2 at 7pm, confirmation 4821.",
    "Unfortunately they are fully booked tonight. Let me know if you want another time.",
    "On it, I will call them now and let you know once it's booked.",
  ];
  const booking: unknown[] = [];
  for (const text of replies) {
    try {
      const d = await classifyBookingReply(text, where);
      booking.push({ text, choice: d.choice, conf: Number(d.confidence.toFixed(3)) });
    } catch (e) {
      booking.push({ text, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return Response.json({ cases: out, booking });
}
