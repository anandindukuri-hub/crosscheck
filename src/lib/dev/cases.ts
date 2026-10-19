import { buildChecks } from "../checks";
import { parseReport } from "../report";
import { decideLane, type Fidelity } from "../rules";
import type { CheckInstance, ChoiceDecision, ClaudeJudgement, Cuisine, Decisions, Diner, LaneResultState, Speaker } from "../types";

// Scripted kitchens for the rules eval and the labeled DEV REPLAY mode. Never shown as real calls.
export const HERO: Diner[] = [
  {
    id: "g1",
    label: "Anand",
    restrictions: [
      { kind: "allergy", allergen: "crustacean", severity: "severe" },
      { kind: "allergy", allergen: "mollusk", severity: "severe" },
      { kind: "diet", diet: "no_beef", strictness: "contact" },
    ],
  },
  { id: "g2", label: "Guest 2", restrictions: [{ kind: "allergy", allergen: "peanut", severity: "anaphylaxis" }] },
];

type Override = { option: string; words?: string | null; who?: string; conf?: number; hedge?: number; claude?: string };
type Globals = { outcome: string; respondent: string; accommodate: string; readback: string; misconception: number };

export type Case = {
  id: string;
  title: string;
  cuisine: Cuisine;
  expect: LaneResultState;
  fidelity?: Fidelity;
  decider?: Decisions["decider"];
  globals?: Partial<Globals>;
  over?: Record<string, Override>; // by check key, e.g. "fryer:shellfish"
  dishes?: string;
  claudeDishes?: { diner: string; dishes: string[] }[];
  outcomeRaw?: string;
  note?: string; // reconfirm only: NOTE ON BOOKING words
  voice?: keyof typeof VOICES; // replay speaker and wording, Chef Mai when unset
};

// each scripted kitchen has its own speaker and its own way of saying things, so replay never shows one chef
// saying the same sentence at two restaurants
type Voice = { respondent: string; words: Record<string, (t: string) => string> };
const VOICES: Record<string, Voice> = {
  mai: {
    respondent: "Chef Mai (head chef)",
    words: {
      hidden: (t) => `I checked the recipes, none of those dishes have any ${t} in them or in the sauces`,
      fryer: (t) => (t === "peanut" ? "Fries only, in soybean oil. There is no peanut oil in this kitchen" : "Only fries go in that fryer, in soybean oil. Nothing else ever touches that oil"),
      surfaces: () => "For allergy orders I use a wok washed with soap and hot water and clean utensils, every time",
    },
  },
  nok: {
    respondent: "Nok (kitchen manager)",
    words: {
      hidden: (t) => `None of those plates use ${t}. I went through each sauce with the cook`,
      fryer: (t) => (t === "peanut" ? "That fryer is canola oil, just fries and vegetable spring rolls. We never use peanut oil" : "Our fryer is canola oil, for fries and vegetable spring rolls. Nothing else goes in that oil"),
      surfaces: () => "Allergy orders get a wok scrubbed with soap first and fresh spoons and boards",
    },
  },
  // the head chef at Nok's kitchen, who answers when Fo calls back for the chef
  lek: {
    respondent: "Chef Lek (head chef)",
    words: {
      hidden: (t) => `I went through every recipe for those dishes. There is no ${t} in them, their sauces or anything we buy in`,
      fryer: (t) => (t === "peanut" ? "Those dishes have their own fryer with rice bran oil. No peanut oil and nothing with peanut goes in it" : `Those dishes have their own fryer and nothing with ${t} ever goes in it`),
      surfaces: () => "For an allergy order I wash the wok and tools with soap and hot water right before I cook it",
    },
  },
  ploy: {
    respondent: "Chef Ploy",
    words: {
      hidden: (t) => `There is no ${t} in any of those dishes or their sauces`,
      fryer: (t) => (t === "peanut" ? "We fry in rice bran oil, never peanut oil. Nothing with peanut goes in that fryer" : `We never fry anything with ${t} in it`),
      surfaces: () => "I wash the wok and the tools with soap before every allergy order",
    },
  },
};
const GOOD_WORDS = VOICES.mai.words;
// the shellfish guest's pad see ew leaves out the oyster sauce it is usually made with
const DEMO_DISHES = ["tofu pad see ew with no oyster sauce, vegetable fried rice", "chicken pad see ew", "steamed jasmine rice with stir fried greens"];

const GOOD_OPTION: Record<string, string> = { hidden: "free", fryer: "dedicated", surfaces: "separate_or_washed" };

export const CASES: Case[] = [
  { id: "good_thai", title: "Good Thai kitchen, chef answers everything clearly", cuisine: "thai", expect: "matched", fidelity: "verified" },
  { id: "good_unverified", title: "Same kitchen, Fo report fidelity not yet checked", cuisine: "thai", expect: "needs_review" },
  { id: "no_jev", title: "Same kitchen, decided by Claude only (no Jev key)", cuisine: "thai", expect: "needs_review", fidelity: "verified", decider: "claude_only" },
  {
    id: "cant_guarantee", title: "Honest disclaimer followed by a real procedure", cuisine: "thai", expect: "matched", fidelity: "verified",
    over: { "surfaces:peanut": { option: "separate_or_washed", words: "We can't guarantee anything 100 percent, but we use a separate wok we wash with soap first and fresh utensils" } },
  },
  {
    id: "shared_fryer", title: "Shrimp tempura shares the fry oil", cuisine: "japanese", expect: "not_matched", voice: "ploy",
    over: { "fryer:shellfish": { option: "shared", words: "Yeah the shrimp tempura goes in the same fryer as everything", claude: "shared" } },
  },
  {
    id: "oil_changed", title: "Shared fryer but oil changed nightly", cuisine: "american", expect: "not_matched",
    over: { "fryer:shellfish": { option: "shared_oil_changed", words: "It's the same fryer as the shrimp but we change the oil every night", claude: "shared_oil_changed" } },
  },
  {
    id: "tallow", title: "Fries cooked in beef tallow", cuisine: "burgers", expect: "not_matched",
    over: { "fryer:beef": { option: "shared", words: "Our fries are cooked in beef tallow, that's our thing", claude: "shared" } },
  },
  {
    id: "hedge", title: "Hedge that Jev hears", cuisine: "thai", expect: "needs_chef", fidelity: "verified", voice: "nok",
    over: { "hidden:peanut": { option: "free", words: "I think there's no peanut in the sauce", conf: 0.93, hedge: 0.88, claude: "unclear" } },
  },
  {
    id: "hedge_regex", title: "Hedge word that only the word scan catches", cuisine: "thai", expect: "needs_chef", fidelity: "verified",
    over: { "surfaces:shellfish": { option: "separate_or_washed", words: "Usually we grab a clean wok for allergy orders", hedge: 0.02 } },
  },
  {
    id: "relayed", title: "Host passes on what the kitchen said", cuisine: "chinese", expect: "needs_chef", fidelity: "verified",
    over: { "hidden:peanut": { option: "free", words: "Hold on, let me ask... the kitchen says no peanuts in it", who: "host" } },
  },
  {
    id: "rinsed", title: "Wok only rinsed between orders", cuisine: "chinese", expect: "needs_chef",
    over: { "surfaces:shellfish": { option: "rinsed", words: "We rinse the wok out between orders", claude: "rinsed" } },
  },
  {
    id: "disagree", title: "Claude and Jev read the same answer differently", cuisine: "thai", expect: "needs_chef", fidelity: "verified",
    over: { "hidden:shellfish": { option: "free", words: "No shrimp in that one, we make the curry paste ourselves", claude: "unclear" } },
  },
  {
    id: "low_conf", title: "Clear words but Jev only 85 percent sure", cuisine: "indian", expect: "needs_chef", fidelity: "verified",
    over: { "hidden:shellfish": { option: "free", words: "No shellfish in the dal or the paneer", conf: 0.8 } },
  },
  { id: "myth", title: "Staff says frying kills allergens", cuisine: "american", expect: "not_matched", globals: { misconception: 0.98 } },
  { id: "myth_maybe", title: "Possible allergy myth", cuisine: "american", expect: "needs_chef", fidelity: "verified", globals: { misconception: 0.4 } },
  { id: "cannot", title: "Kitchen says it cannot accommodate", cuisine: "thai", expect: "not_matched", globals: { accommodate: "cannot" } },
  { id: "no_dishes", title: "No dishes named for Guest 2", cuisine: "thai", expect: "needs_chef", fidelity: "verified", dishes: "Anand: tofu pad see ew with no oyster sauce | Guest 2: not asked" },
  {
    id: "relay_note", title: "Host says they checked with the chef", cuisine: "thai", expect: "needs_chef", fidelity: "verified",
    over: { "fryer:peanut": { option: "dedicated", words: "Separate fryer, nothing with peanuts goes in it", who: "host, after checking with the chef" } },
  },
  {
    id: "claude_one_guest", title: "Claude and Fo list dishes for Anand only", cuisine: "thai", expect: "needs_chef", fidelity: "verified",
    claudeDishes: [{ diner: "Anand", dishes: ["tofu pad see ew with no oyster sauce"] }], dishes: "Anand: tofu pad see ew with no oyster sauce",
  },
  { id: "dishes_not_discussed", title: "Dishes for Guest 2 'not discussed'", cuisine: "thai", expect: "needs_chef", fidelity: "verified", dishes: "Anand: tofu pad see ew with no oyster sauce | Guest 2: not discussed" },
  { id: "readback_fix", title: "Staff corrected the read back", cuisine: "mexican", expect: "needs_chef", fidelity: "verified", globals: { readback: "corrected_or_contradicted" } },
  { id: "ai_receptionist", title: "AI receptionist answered", cuisine: "italian", expect: "no_answer", globals: { outcome: "automated_only" }, outcomeRaw: "automated system only" },
  { id: "declined", title: "Staff declined the AI call", cuisine: "pizza", expect: "declined", globals: { outcome: "declined" }, outcomeRaw: "declined" },
  { id: "busy", title: "Busy, call back after 3", cuisine: "mexican", expect: "no_answer", globals: { outcome: "busy_or_call_back" }, outcomeRaw: "busy, call back at 3 PM" },
  // calibrated on live Jev output 10/18: clean answers score 0.03 to 0.08 hedged and 0.06 to 0.16 myth
  {
    id: "calib_clean_baseline", title: "Live Jev background levels on a clean kitchen still match", cuisine: "thai", expect: "matched", fidelity: "verified",
    globals: { misconception: 0.16 },
    over: { "fryer:shellfish": { option: "dedicated", hedge: 0.08 }, "surfaces:beef": { option: "separate_or_washed", hedge: 0.07 } },
  },
  {
    id: "calib_hedge_025", title: "Hedge score 0.25 still goes to the chef", cuisine: "thai", expect: "needs_chef", fidelity: "verified",
    over: { "hidden:peanut": { option: "free", hedge: 0.25, words: "None of those dishes have peanut in them" } },
  },
  { id: "calib_myth_031", title: "Myth score 0.31 goes to the chef", cuisine: "thai", expect: "needs_chef", fidelity: "verified", globals: { misconception: 0.31 } },
  {
    id: "calib_rule_out_claude", title: "Clear unsafe lead at 0.82 plus Claude agreeing rules the kitchen out", cuisine: "japanese", expect: "not_matched",
    over: { "fryer:shellfish": { option: "shared", conf: 0.8, words: "Same fryer as the shrimp tempura", claude: "shared" } },
  },
  {
    id: "calib_rule_out_no_claude", title: "Same unsafe lead without Claude agreeing goes to the chef", cuisine: "japanese", expect: "needs_chef", fidelity: "verified",
    over: { "fryer:shellfish": { option: "shared", conf: 0.8, words: "Same fryer as the shrimp tempura", claude: "unclear" } },
  },
];

function decision(choice: string, keys: string[], conf = 0.97): ChoiceDecision {
  // build probabilities that give exactly this confidence under TypeSafe's formula
  const n = keys.length;
  const p = conf * (1 - 1 / n) + 1 / n;
  const rest = (1 - p) / (n - 1);
  return { choice, confidence: conf, probabilities: Object.fromEntries(keys.map((k) => [k, k === choice ? p : rest])) };
}

export function buildCase(c: Case, diners: Diner[] = HERO, cuisine: Cuisine = c.cuisine) {
  const checks = buildChecks(diners, cuisine);
  const g: Globals = { outcome: "answered", respondent: "chef_or_manager", accommodate: "can", readback: "confirmed", misconception: 0.01, ...c.globals };
  const lines: string[] = [];
  const answered = g.outcome === "answered";
  lines.push(`CALL OUTCOME: ${c.outcomeRaw ?? "answered"}`);
  const voice = VOICES[c.voice ?? "mai"];
  lines.push(`RESPONDENTS: ${answered ? voice.respondent : "none"}`);
  if (c.note !== undefined) {
    lines.push(`NOTE ON BOOKING: "${c.note}" (Chef Mai)`);
    lines.push(`COOK TONIGHT: "Chef Mai is cooking tonight"`);
  }
  lines.push(`DISHES: ${c.dishes ?? (answered ? diners.map((d, i) => `${d.label}: ${DEMO_DISHES[i % DEMO_DISHES.length]}`).join(" | ") : "not asked")}`);
  const judgement: ClaudeJudgement = { checks: {}, dishes: c.claudeDishes ?? [], misconception: g.misconception > 0.9 ? "frying kills it" : null, summary: c.title };
  const decisions: Decisions = {
    decider: c.decider ?? "jev",
    model: c.decider === "claude_only" ? "claude-opus-5-5" : "jev-1.13.0",
    checks: {},
    hedge: {},
    outcome: decision(g.outcome, ["declined", "voicemail_or_no_answer", "automated_only", "busy_or_call_back", "answered"]),
    respondent: decision(g.respondent, ["automated_system", "host_or_server", "other_staff", "chef_or_manager"]),
    accommodate: decision(g.accommodate, ["cannot", "unclear", "can"]),
    readback: decision(g.readback, ["corrected_or_contradicted", "not_done", "unclear", "confirmed"]),
    misconception: g.misconception,
  };
  for (const ch of checks) {
    const o = c.over?.[ch.key];
    const label = ch.label.split(": ")[1];
    const option = o?.option ?? GOOD_OPTION[ch.templateId];
    const words = answered ? (o?.words !== undefined ? o.words : (voice.words[ch.templateId] ?? GOOD_WORDS[ch.templateId])(label)) : null;
    lines.push(`${ch.code} (${ch.label.toLowerCase()}): ${words ? `"${words}"` : "not asked"} (${o?.who ?? "chef"})`);
    if (!answered) continue;
    decisions.checks[ch.key] = decision(option, ch.options.map((x) => x.key), o?.conf ?? 0.97);
    decisions.hedge[ch.key] = o?.hedge ?? 0.01;
    // Claude reads the speaker as first hand chef here on purpose, so the parser's stricter reading must win
    judgement.checks[ch.key] = { option: o?.claude ?? option, quote: words, speaker: (o?.who && !/after checking/.test(o.who) ? "relayed" : "chef_or_manager") as Speaker, reason: "" };
  }
  lines.push(`READBACK: ${answered ? (g.readback === "confirmed" ? `I read it all back and they said "Yes, that's right."` : `They said "No, the curry paste does have shrimp, sorry."`) : "not done"}`);
  lines.push("EMAIL: none");
  // no DURATION: a scripted call takes seconds, so any length would not fit its call log
  lines.push("OTHER: none");
  const report = lines.join("\n");
  return { checks, report, parsed: parseReport(report), decisions, judgement };
}

export function runCase(c: Case) {
  const b = buildCase(c);
  const result = decideLane({
    checks: b.checks,
    diners: HERO,
    parsed: b.parsed,
    decisions: b.decisions,
    judgement: b.judgement,
    fidelity: c.fidelity ?? "unverified",
    now: "2026-10-18T12:00:00.000Z",
  });
  return { id: c.id, title: c.title, expect: c.expect, got: result.state, pass: result.state === c.expect, reasons: result.reasons, checks: b.checks.length, result };
}

export const checkCount = (cuisine: Cuisine) => buildChecks(HERO, cuisine).length;
export type { CheckInstance };

// Replay only: a clean chef callback for the checks that were still open
export function buildCleanCallback(diners: Diner[], cuisine: Cuisine, openKeys: Set<string>) {
  const checks = buildChecks(diners, cuisine).filter((c) => openKeys.has(c.key));
  const over: Record<string, Override> = {};
  // in replay only Jasmine Row (Nok's kitchen) is called back, and Fo asks for the chef, so its head chef answers
  const base = buildCase({ id: "callback", title: "Chef callback", cuisine, expect: "matched", over, voice: "lek" }, diners, cuisine);
  const keep = new Set(checks.map((c) => c.code));
  const report = base.report
    .split("\n")
    .filter((l) => !/^C\d+/.test(l) || keep.has(l.match(/^(C\d+)/)![1]))
    .join("\n");
  const decisions = { ...base.decisions, checks: {} as Decisions["checks"], hedge: {} as Decisions["hedge"] };
  for (const c of checks) {
    decisions.checks[c.key] = base.decisions.checks[c.key];
    decisions.hedge[c.key] = base.decisions.hedge[c.key];
  }
  return { report, parsed: parseReport(report), decisions, judgement: base.judgement };
}

export const REPLAY_CASES = ["good_thai", "hedge", "shared_fryer", "ai_receptionist", "relayed"];

// Day of reconfirm: the same scripted kitchen on the day, with one answer changed in some cases
export type ReconfirmCase = { id: string; title: string; expect: "reconfirmed" | "not_reconfirmed"; note?: string; over?: Record<string, Override> };

export const CLEAN_NOTE = "Yes, the note is on the booking and I printed it for the line";

export const RECONFIRM_CASES: ReconfirmCase[] = [
  { id: "reconfirm_clean", title: "Same clean answers on the day", expect: "reconfirmed" },
  {
    id: "reconfirm_changed", title: "Fryer answer changed since the first call", expect: "not_reconfirmed",
    over: { "fryer:peanut": { option: "shared", words: "We started frying the satay in that fryer last week", claude: "shared" } },
  },
  {
    id: "reconfirm_hedged", title: "A clear answer turned into a hedge", expect: "not_reconfirmed",
    over: { "hidden:peanut": { option: "free", words: "I think there's still no peanut in it", conf: 0.93, hedge: 0.7, claude: "unclear" } },
  },
  { id: "reconfirm_note_hedged", title: "Kitchen is not sure the note is on the booking", expect: "not_reconfirmed", note: "I think it's on there somewhere" },
];

export function buildReconfirm(rc: Pick<ReconfirmCase, "note" | "over">, diners: Diner[] = HERO, cuisine: Cuisine = "thai") {
  return buildCase({ id: "reconfirm", title: "Day of reconfirm", cuisine, expect: "matched", over: rc.over, note: rc.note ?? CLEAN_NOTE }, diners, cuisine);
}
