import { CALL_ENDED, hedgeWords, stricterSpeaker } from "./report";
import type {
  CheckInstance,
  CheckVerdict,
  ChoiceDecision,
  ClaudeJudgement,
  Decisions,
  Diner,
  LanePreview,
  LaneResult,
  Outcome,
  ParsedReport,
} from "./types";

// Anand's rule: a check passes only at 0.9 or higher. Yes/no questions use the calibrated cutoffs below.
export const THRESHOLD = 0.9;
// Calibrated on live Jev output (10/18, Anand approved): clean answers score 0.03 to 0.08 on the hedge
// question and 0.06 to 0.16 on the myth question; a real "I think" hedge scored 0.98.
export const HEDGE_MAX = 0.2;
export const MISCONCEPTION_CHEF = 0.3;
export const MISCONCEPTION_FAIL = 0.95;
// ruling a kitchen out is the cautious direction, so a clear unsafe lead is enough when Claude agrees
export const RULE_OUT_WITH_CLAUDE = 0.75;

export type Fidelity = "verified" | "unverified";

// TypeSafe's choice confidence, applied to the three outcome groups instead of single options,
// so two safe answers that split the vote still count as one clear safe answer.
export function groupDecision(check: CheckInstance, d: ChoiceDecision) {
  const g: Record<Outcome, number> = { pass: 0, escalate: 0, fail: 0 };
  for (const o of check.options) g[o.outcome] += d.probabilities[o.key] ?? 0;
  const total = g.pass + g.escalate + g.fail || 1;
  (Object.keys(g) as Outcome[]).forEach((k) => (g[k] /= total));
  const top = (Object.keys(g) as Outcome[]).reduce((a, b) => (g[b] > g[a] ? b : a));
  const confidence = Math.max(0, (g[top] - 1 / 3) / (2 / 3));
  const choiceOutcome = check.options.find((o) => o.key === d.choice)?.outcome ?? "escalate";
  return { groups: g, top, confidence, choiceOutcome };
}

const okAt = (d: ChoiceDecision | undefined, key: string) => !!d && d.choice === key && d.confidence >= THRESHOLD;

export function parseDishes(raw: string, diners: Diner[]): { diner: string; dishes: string[] }[] {
  return diners.map((d) => {
    const m = raw.match(new RegExp(`${d.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*([^|]*)`, "i"));
    const list = (m?.[1] ?? "")
      .split(/,|;| and /)
      .map((s) => s.trim().replace(/^["“]|["”]$/g, ""))
      .filter((s) => s && !/^(none|not asked|no answer|n\/a|unknown|tbd|-|not (mentioned|discussed|named|given|stated)|<.*>)\.?$/i.test(s));
    return { diner: d.label, dishes: list };
  });
}

function judgeCheck(
  c: CheckInstance,
  parsed: ParsedReport,
  decisions: Decisions,
  judgement: ClaudeJudgement | null,
): CheckVerdict {
  const ans = parsed.answers[c.code];
  const words = ans?.words ?? judgement?.checks[c.key]?.quote ?? null;
  // the stricter of the parsed speaker and Claude's reading, so a relayed answer can never look first hand
  const speaker = stricterSpeaker(ans?.speaker ?? "unknown", judgement?.checks[c.key]?.speaker);
  const base = { key: c.key, code: c.code, label: c.label, quote: words, speaker, dinerIds: c.dinerIds };
  const d = decisions.checks[c.key];
  const cj = judgement?.checks[c.key];
  const claudeOutcome = cj ? (c.options.find((o) => o.key === cj.option)?.outcome ?? "escalate") : null;

  if (!d) return { ...base, outcome: "escalate", reasons: ["No decision for this answer"] };
  const gd = groupDecision(c, d);
  const jev = { choice: d.choice, confidence: Number(gd.confidence.toFixed(3)) };
  const claude = cj ? { choice: cj.option } : undefined;

  if (gd.top === "fail" && (gd.confidence >= THRESHOLD || (gd.confidence >= RULE_OUT_WITH_CLAUDE && claudeOutcome === "fail"))) {
    return { ...base, jev, claude, outcome: "fail", reasons: [`Kitchen answer means: ${optionDesc(c, d.choice)}`] };
  }
  const reasons: string[] = [];
  if (!(gd.top === "pass" && gd.choiceOutcome === "pass" && gd.confidence >= THRESHOLD)) {
    reasons.push(
      gd.top === "fail"
        ? "Not clear enough to rule out, though it leans that way"
        : gd.top === "escalate"
          ? `Answer is unclear (Jev is ${pct(gd.confidence)} sure of that)`
          : gd.confidence < THRESHOLD
            ? `Not clear enough to pass (Jev is ${pct(gd.confidence)} sure, ${pct(THRESHOLD)} needed)`
            : `Jev's top pick "${d.choice}" is not a passing answer`,
    );
  }
  if (!cj) reasons.push("Claude did not weigh in");
  else if (claudeOutcome !== "pass")
    reasons.push(`Claude read it as "${cj.option}", Jev as "${d.choice}"`);
  if (!words) reasons.push("No exact words from the kitchen");
  // Anand's rule for every check: the chef or manager said it first hand. A cook's answer goes to the chef, it never fails
  if (speaker !== "chef_or_manager") reasons.push(`Not first hand from the chef or manager (${speaker.replace(/_/g, " ")})`);
  const ph = decisions.hedge[c.key];
  if (ph === undefined || ph >= HEDGE_MAX) reasons.push(ph === undefined ? "Hedge not checked" : `Sounds hedged (${pct(ph)})`);
  // the whole C line too, so a hedge outside the quoted words still counts
  const hw = hedgeWords(words) ?? hedgeWords(ans?.line ?? null);
  if (hw) reasons.push(`Hedge word: "${hw}"`);

  return { ...base, jev, claude, outcome: reasons.length ? "escalate" : "pass", reasons };
}

// A first call that clearly ended with no allergy answers (they said no, voicemail, busy, a phone menu) is decided at
// once, without waiting on Claude and Jev, so the next kitchen is called right away. It can only end as Declined or
// No answer, never as a match, so skipping the readers can never book a kitchen
const ALLERGY_TALK = /\b(peanut|shellfish|shrimp|beef|gluten|wheat|fryer|oil|allerg|ingredient|sauce|dish|wok|nut|milk|egg|soy|sesame|fish)/i;
const SAID_NO = /\b(declin|refus|not interested|hung up|did ?n['’]?t want|don['’]?t (take|do|want) (ai|robot|automated)|no ai)\w*/i;
// "we can't accommodate a severe shellfish allergy" is an answer about the food, not a no to the call
export const CANT_ACCOMMODATE = /\b(can['’]?t|cannot|can not|not able to|unable to) (accommodate|guarantee)\b/i;
// a declined call goes on the do not call list only when the no was to the call itself, never a "can't accommodate"
export const refusedTheCall = (report: string) => !CANT_ACCOMMODATE.test(report);
export function quickOutcome(parsed: ParsedReport, text: string, decidedAt: string): LaneResult | null {
  if (Object.values(parsed.answers).some((a) => a.words)) return null;
  // a CALL OUTCOME line decides when there is one (a short report with no answer lines still has it). Anything said
  // about the food in the outcome or OTHER line goes to Claude and Jev instead
  const structured = !!parsed.outcomeRaw.trim();
  const freeform = !structured && text.length < 600 && CALL_ENDED.test(text) && !ALLERGY_TALK.test(text);
  if (!structured && !freeform) return null;
  const oc = (structured ? parsed.outcomeRaw : text).trim();
  const said = structured ? oc : text;
  const base = { checks: [], dishes: [], decider: "rule" as const, decidedAt, misconception: 0 };
  // a call nobody really answered stays No answer, whatever words follow ("voicemail: sorry, we can't make it")
  const unanswered = /^\W*(voicemail|no answer|busy|automated)\b/i.test(oc);
  if (!unanswered && CANT_ACCOMMODATE.test(said))
    return { ...base, state: "not_matched", headline: "Said they cannot accommodate", reasons: [`They said they cannot accommodate the table's needs${structured ? `: ${oc}` : "."}`] };
  if (structured && (ALLERGY_TALK.test(oc.replace(/^\W*\w+/, "")) || ALLERGY_TALK.test(parsed.misc))) return null;
  if (/^\W*declined\b/i.test(oc) || (!structured && SAID_NO.test(said))) {
    // their words decide the label, never Fo's own "I'm an AI assistant"
    const ai = /\b(ai|robot|automated|machine)\b/i.test(said.replace(/\bAI assistant\b/gi, ""));
    return { ...base, state: "declined", headline: ai ? "Said no to an AI call" : "Said no to the call", reasons: [ai ? "They did not want to talk with an AI." : "They said no to the call.", "Nothing was asked and nothing will be booked."] };
  }
  if (/^\W*(voicemail|no answer)\b/i.test(oc) || (!structured && /voicemail|no answer|nobody (picked up|answered)|no one (picked up|answered)|did ?n['’]?t (pick up|answer)/i.test(said)))
    return { ...base, state: "no_answer", headline: "No answer yet", reasons: ["No one answered"] };
  if (/^\W*busy\b/i.test(oc) || (!structured && /\bbusy\b/i.test(said)))
    return { ...base, state: "no_answer", headline: "No answer yet", reasons: [`Busy, asked to call back${structured ? `: ${oc}` : ""}`] };
  if (/^\W*automated\b/i.test(oc) || (!structured && /automated (system|menu)|phone menu/i.test(said)))
    return { ...base, state: "no_answer", headline: "No answer yet", reasons: ["Reached an automated system, not a person"] };
  return null;
}

export function decideLane(opts: {
  checks: CheckInstance[];
  diners: Diner[];
  parsed: ParsedReport;
  decisions: Decisions;
  judgement: ClaudeJudgement | null;
  fidelity: Fidelity;
  prior?: LaneResult | null; // set when this is a chef callback
  now?: string;
}): LaneResult {
  const { checks, diners, parsed, decisions, judgement, fidelity, prior } = opts;
  const decidedAt = opts.now ?? new Date().toISOString();
  const reasons: string[] = [];
  const out = (state: LaneResult["state"], headline: string, verdicts: CheckVerdict[] = [], dishes = prior?.dishes ?? []): LaneResult => ({
    state,
    headline,
    reasons,
    checks: verdicts,
    dishes,
    decider: decisions.decider,
    decidedAt,
    misconception: Math.max(decisions.misconception, prior?.misconception ?? 0),
  });

  // 1. Did a real conversation happen at all
  const oc = decisions.outcome;
  if (oc.choice === "declined" && oc.confidence >= 0.5) {
    reasons.push("Staff declined the AI call or note taking. CrossCheck will not call them again.");
    return out("declined", "They declined the call", prior?.checks ?? []);
  }
  if (["voicemail_or_no_answer", "busy_or_call_back", "automated_only"].includes(oc.choice) && oc.confidence >= 0.5) {
    reasons.push(
      oc.choice === "automated_only"
        ? "Reached an automated system, not a person"
        : oc.choice === "busy_or_call_back"
          ? `Busy, asked to call back${parsed.outcomeRaw ? `: ${parsed.outcomeRaw}` : ""}`
          : "No one answered",
    );
    return out("no_answer", "No answer yet", prior?.checks ?? []);
  }

  // 2. Each check (on a callback, only the checks it re-asked)
  const reasked = new Set(Object.keys(parsed.answers));
  const verdicts = checks.map((c) => {
    if (prior && !reasked.has(c.code)) return prior.checks.find((v) => v.key === c.key) ?? judgeCheck(c, parsed, decisions, judgement);
    return judgeCheck(c, parsed, decisions, judgement);
  });

  // 3. Dishes named per diner. Every diner is gated, whatever list Claude or Fo returned.
  const parsedDishes = parseDishes(parsed.dishes, diners);
  let dishes = diners.map((d) => {
    const fromClaude = judgement?.dishes?.find((x) => x.diner.toLowerCase() === d.label.toLowerCase());
    const fromFo = parsedDishes.find((x) => x.diner === d.label);
    return { diner: d.label, dishes: fromClaude?.dishes.length ? fromClaude.dishes : (fromFo?.dishes ?? []) };
  });
  if (prior) {
    // a callback keeps the dishes the first call's answers were about; new dishes need their own answers
    dishes = dishes.map((d) => {
      const before = prior.dishes.find((p) => p.diner === d.diner);
      if (!before?.dishes.length) return d;
      const changed = d.dishes.length && d.dishes.some((x) => !before.dishes.some((y) => y.toLowerCase() === x.toLowerCase()));
      if (changed) reasons.push(`The callback named different dishes for ${d.diner} (${d.dishes.join(", ")})`);
      return before;
    });
  }

  // 4. Call wide gates
  if (oc.choice !== "answered" || oc.confidence < THRESHOLD) reasons.push("It is not clear how the call ended");
  if (!okAt(decisions.respondent, "chef_or_manager")) reasons.push("The chef or manager did not clearly answer");
  const acc = decisions.accommodate;
  const cannot = acc.choice === "cannot" && acc.confidence >= THRESHOLD;
  if (!cannot && !okAt(acc, "can")) reasons.push("Not clear the kitchen can make food for this table");
  if (!okAt(decisions.readback, "confirmed")) reasons.push("When Fo repeated the answers back, the kitchen did not clearly say they were right");
  // a possible myth on the first call still counts after a clean callback
  const mis = Math.max(decisions.misconception, prior?.misconception ?? 0);
  if (mis >= MISCONCEPTION_CHEF && mis < MISCONCEPTION_FAIL) reasons.push(`Staff may believe a common allergy myth, like frying kills allergens (${pct(mis)})`);
  for (const d of dishes) if (!d.dishes.length) reasons.push(`No dishes named for ${d.diner}`);

  const fails = verdicts.filter((v) => v.outcome === "fail");
  if (fails.length || cannot || mis >= MISCONCEPTION_FAIL) {
    if (cannot) reasons.unshift("The kitchen said it cannot accommodate");
    if (mis >= MISCONCEPTION_FAIL) reasons.unshift(`Staff said a common allergy myth${judgement?.misconception ? `: "${judgement.misconception}"` : ""}`);
    for (const f of fails) reasons.unshift(`${f.label}: ${f.reasons[0]}`);
    return out("not_matched", "Did not match your checks", verdicts, dishes);
  }
  const open = verdicts.filter((v) => v.outcome !== "pass");
  if (open.length || reasons.length) {
    return out("needs_chef", open.length ? `${open.length} answer${open.length > 1 ? "s need" : " needs"} the chef` : "Needs the chef", verdicts, dishes);
  }
  if (decisions.decider !== "jev") {
    reasons.push("Decided without Jev. Confidence is not calibrated. Read each quote before booking.");
    return out("needs_review", "Needs your review", verdicts, dishes);
  }
  if (fidelity !== "verified") {
    reasons.push("Quotes come from Fo's written report, which has not been checked against a real call yet. Read each quote before booking.");
    return out("needs_review", "Needs your review", verdicts, dishes);
  }
  return out("matched", "Matched your checks", verdicts, dishes);
}

// Claude reading every answer exactly the way Jev did, with the report's own quotes and speakers
export function mirrorJudgement(checks: CheckInstance[], parsed: ParsedReport, decisions: Decisions): ClaudeJudgement {
  const out: ClaudeJudgement = { checks: {}, dishes: [], misconception: null, summary: "Preview from Jev alone" };
  for (const c of checks) {
    const d = decisions.checks[c.key];
    if (!d) continue;
    const a = parsed.answers[c.code];
    out.checks[c.key] = { option: d.choice, quote: a?.words ?? null, speaker: a?.speaker ?? "unknown", reason: "" };
  }
  return out;
}

// What the lane would come out as if Claude agrees with Jev on every check. A preview for the screen only: the
// real result still needs Claude's own reading. Nothing can be booked from this
export function previewLane(opts: Omit<Parameters<typeof decideLane>[0], "judgement"> & { relevant?: CheckInstance[] }): LanePreview {
  const r = decideLane({ ...opts, judgement: mirrorJudgement(opts.relevant ?? opts.checks, opts.parsed, opts.decisions) });
  return { state: r.state, headline: r.headline, at: r.decidedAt };
}

function optionDesc(c: CheckInstance, key: string) {
  return c.options.find((o) => o.key === key)?.desc ?? key;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
