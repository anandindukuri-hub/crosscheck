import { buildChecks } from "@/lib/checks";
import { buildCase, buildCleanCallback, CASES, HERO, runCase } from "@/lib/dev/cases";
import { asyncFeatureTests, customAsyncTests, customTests, launchTests, openerTests, practiceCallTests, scoreTests, featureTests, reviewAsyncTests, reviewTests, roundAsyncTests, roundTests, tonightAsyncTests, tonightTests } from "@/lib/dev/features";
import { CALL_ENDED, classifyFoReply, mapSpeaker, parseReport } from "@/lib/report";
import { decideLane } from "@/lib/rules";
import { leaks, redact } from "@/lib/trace";
import { buildScript } from "@/lib/script";
import { bumpStats } from "@/lib/trace";
import { CUISINES } from "@/lib/types";

// Dev only: the rules eval (S3a) and the script coverage check (S2a). curl localhost:3000/api/dev/eval
export async function GET() {
  if (process.env.NODE_ENV === "production") return Response.json({ error: "dev only" }, { status: 404 });
  const results = CASES.map(runCase);
  const coverage = CUISINES.map((cuisine) => {
    const checks = buildChecks(HERO, cuisine);
    const s = buildScript(HERO, checks);
    return { cuisine, gating: s.gating.count, warn: s.gating.warn, tooMany: s.gating.tooMany, missing: s.missing };
  });
  const T = (name: string, got: unknown, want: unknown) => ({ name, pass: JSON.stringify(got) === JSON.stringify(want), got, want });
  const echo = 'CALL OUTCOME: answered / declined / busy\nC1 (ingredients: shellfish): "<their exact words>" (<who said it>)\nShall I go ahead?';
  const p1 = parseReport("C1 (ingredients: shellfish): No shellfish at all (Chef Mai)").answers.C1;
  const p2 = parseReport('**C2 (fryer oil: beef)**: "We never use tallow" (sous chef)').answers.C2;
  // callback that names a different dish must not reuse the first call's answers
  const first = runCase(CASES.find((c) => c.id === "hedge")!).result;
  const cb = buildCleanCallback(HERO, "thai", new Set(first.checks.filter((v) => v.outcome !== "pass").map((v) => v.key)));
  cb.parsed.dishes = "Anand: tofu pad see ew with no oyster sauce, vegetable fried rice | Guest 2: pad thai";
  const cbNew = decideLane({ checks: buildChecks(HERO, "thai"), diners: HERO, parsed: cb.parsed, decisions: cb.decisions, judgement: { ...cb.judgement, dishes: [] }, fidelity: "verified", prior: first });
  const firstMyth = { ...first, misconception: 0.4 };
  const cb2 = buildCleanCallback(HERO, "thai", new Set(first.checks.filter((v) => v.outcome !== "pass").map((v) => v.key)));
  const cbMyth = decideLane({ checks: buildChecks(HERO, "thai"), diners: HERO, parsed: cb2.parsed, decisions: cb2.decisions, judgement: { ...cb2.judgement, dishes: [] }, fidelity: "verified", prior: firstMyth });
  const cbClean = decideLane({ checks: buildChecks(HERO, "thai"), diners: HERO, parsed: cb2.parsed, decisions: cb2.decisions, judgement: { ...cb2.judgement, dishes: [] }, fidelity: "verified", prior: first });
  const good = buildCase(CASES[0]);
  const unit = [
    T("template echo is a question", classifyFoReply(echo), "question"),
    T("calling now to confirm is underway", classifyFoReply("Calling Test Kitchen Thai now to confirm their allergy procedures."), "underway"),
    T("finished booking with 'let you know' is not underway", classifyFoReply("Done! I emailed you the allergy note. I'll let you know if they reply."), "other"),
    T("booked plus 'will report back' is not underway", classifyFoReply("Booked! Table for 2 at 7pm. Will report back if they respond."), "other"),
    T("bulleted report is a report", classifyFoReply('- CALL OUTCOME: answered\n- C1 (ingredients: shellfish): "No shellfish" (chef)'), "report"),
    T("generated report is a report", classifyFoReply(good.report), "report"),
    T("voicemail prose is a call ending", [classifyFoReply("I called but nobody picked up, it went to voicemail."), CALL_ENDED.test("I called but nobody picked up, it went to voicemail.")], ["other", true]),
    T("plain question", classifyFoReply("Should I call Tamarind Table now?"), "question"),
    T("label with colon parses words", [p1?.words, p1?.speaker], ["No shellfish at all", "chef_or_manager"]),
    T("bold label parses words", [p2?.words, p2?.speaker], ["We never use tallow", "chef_or_manager"]),
    T("host after checking is relayed", mapSpeaker("host, after checking with the chef", "Separate fryer"), "relayed"),
    T("'through a separate fryer' stays first hand", mapSpeaker("chef", "we run it through a separate fryer"), "chef_or_manager"),
    T("long decimals are not phones", leaks({ confidence: 0.9733333333333334, s: "0.9733333333333334" }), []),
    T("phone in text is caught", leaks({ s: "call 608-251-1700 now" }), ["phone"]),
    T("names redact case insensitive", redact("ian’s pizza said no", ["Ian's Pizza"]), "[kitchen A] said no"),
    T("callback with a new dish needs the chef", cbNew.state, "needs_chef"),
    T("myth on first call blocks a clean callback", cbMyth.state, "needs_chef"),
    T("clean callback resolves the hedge", cbClean.state, "matched"),
    ...featureTests(),
    ...(await asyncFeatureTests()),
    ...tonightTests(),
    ...(await tonightAsyncTests()),
    ...reviewTests(),
    ...(await reviewAsyncTests()),
    ...roundTests(),
    ...(await roundAsyncTests()),
    ...customTests(),
    ...(await customAsyncTests()),
    ...(await practiceCallTests()),
    ...(await launchTests()),
    ...(await scoreTests()),
    ...(await openerTests()),
  ];
  const unitPassed = unit.filter((u) => u.pass).length;
  const passed = results.filter((r) => r.pass).length;
  const coverageOk = coverage.every((c) => !c.tooMany && c.missing.length === 0);
  await bumpStats("eval", passed === results.length && coverageOk && unitPassed === unit.length);
  return Response.json({
    passed,
    total: results.length,
    unitPassed,
    unitTotal: unit.length,
    unitFailures: unit.filter((u) => !u.pass),
    coverageOk,
    coverage,
    results: results.map((r) => ({ id: r.id, title: r.title, expect: r.expect, got: r.got, pass: r.pass, reasons: r.reasons, checks: r.checks })),
  });
}
