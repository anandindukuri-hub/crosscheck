import { claudeJudge } from "@/lib/claude";
import { buildCase, CASES, HERO } from "@/lib/dev/cases";
import { buildJevQuestions, buildJevState, jevDecide } from "@/lib/jev";
import { findRestaurant } from "@/lib/restaurants";
import { decideLane } from "@/lib/rules";

// Dev only: real Claude + Jev on scripted kitchen reports, the same pipeline a call uses (no Fo, no phone calls)
export async function GET() {
  if (process.env.NODE_ENV === "production") return Response.json({ error: "dev only" }, { status: 404 });
  const r = await findRestaurant("test-thai");
  if (!r) return Response.json({ error: "no test kitchen" }, { status: 500 });
  const out = await Promise.all(
    ["good_thai", "hedge", "shared_fryer"].map(async (id) => {
      const c = CASES.find((x) => x.id === id)!;
      const b = buildCase(c, HERO, "thai");
      const where = { runId: "devfullcheck", laneId: id };
      const t0 = Date.now();
      try {
        const [judgement, d] = await Promise.all([
          claudeJudge({ ...where, restaurant: r, diners: HERO, checks: b.checks, parsed: b.parsed, raw: b.report }),
          jevDecide({ ...where, state: buildJevState(r, HERO, b.checks, b.parsed, b.report), questions: buildJevQuestions(b.checks), checks: b.checks }),
        ]);
        const result = decideLane({ checks: b.checks, diners: HERO, parsed: b.parsed, decisions: d, judgement, fidelity: "verified" });
        return {
          case: id,
          ms: Date.now() - t0,
          expect: c.expect,
          got: result.state,
          reasons: result.reasons,
          dishes: judgement.dishes,
          disagree: b.checks
            .filter((k) => judgement.checks[k.key]?.option !== d.checks[k.key]?.choice)
            .map((k) => ({ key: k.key, claude: judgement.checks[k.key]?.option, jev: d.checks[k.key]?.choice })),
          notPass: result.checks.filter((v) => v.outcome !== "pass").map((v) => ({ key: v.key, outcome: v.outcome, reasons: v.reasons })),
        };
      } catch (e) {
        return { case: id, error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );
  return Response.json({ cases: out });
}
