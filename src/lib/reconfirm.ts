import { checkTopic } from "./checks";
import { RESULT_META } from "./labels";
import { hedgeWords } from "./report";
import type { LaneResult, ParsedReport } from "./types";

const YES = /\b(yes|yeah|yep|yup|got it|we have it|have the note|it'?s (on|in|there|attached)|on the (booking|reservation|ticket)|received it|we received|saw it)\b/i;
const NO = /\b(no(?! problem)|not|never|didn'?t|haven'?t|hasn'?t|isn'?t|wasn'?t|can'?t find|don'?t (see|have))\b/i;

// line: the whole NOTE ON BOOKING line, so a hedge in the speaker note ("(manager, I think)") still counts
export function noteProblem(words: string | null, line: string | null = null): string | null {
  if (!words) return "The kitchen did not say the allergy note is on the booking";
  const hw = hedgeWords(words) ?? hedgeWords(line);
  if (hw) return `The kitchen was not sure the note is on the booking ("${hw}"): "${words}"`;
  if (NO.test(words)) return `The kitchen said the note is not on the booking: "${words}"`;
  if (!YES.test(words)) return `Not clear the allergy note is on the booking: "${words}"`;
  return null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").replace(/^the /, "").trim();
const sameDish = (a: string, b: string) => {
  const x = norm(a);
  const y = norm(b);
  return !!x && !!y && (x.includes(y) || y.includes(x));
};

// Reconfirmed only when today's answers match outright, nothing that passed has slipped, the dishes are
// the ones on the note and the kitchen clearly says the note is on the booking. A reviewed lane whose
// answers are again clear but unverified waits at needs_review until Anand reads today's quotes.
// Anything an earlier reconfirm in this lane found keeps it from ever counting as reconfirmed.
export function compareReconfirm(
  before: LaneResult,
  today: LaneResult,
  parsed: ParsedReport,
  earlier: string[] = [],
): { status: "reconfirmed" | "not_reconfirmed" | "needs_review"; reasons: string[] } {
  const reasons: string[] = [];
  const review = before.state === "needs_review" && today.state === "needs_review";
  if (!(today.state === "matched" || review)) {
    reasons.push(`Today's answers came out as "${RESULT_META[today.state].label}"`);
    reasons.push(...today.reasons.slice(0, 3));
  }
  for (const v of before.checks) {
    if (v.outcome !== "pass") continue;
    const now = today.checks.find((x) => x.key === v.key);
    if (!now) reasons.push(`No answer today about ${checkTopic(v)}`);
    else if (now.outcome !== "pass")
      reasons.push(`The answer about ${checkTopic(v)} passed before. Today it ${now.outcome === "fail" ? "rules this kitchen out" : "is not clear"}${now.quote ? ` ("${now.quote}")` : ""}`);
  }
  for (const d of today.dishes) {
    const was = before.dishes.find((x) => x.diner === d.diner)?.dishes ?? [];
    const added = d.dishes.filter((x) => !was.some((y) => sameDish(x, y)));
    if (was.length && added.length) reasons.push(`Different dishes for ${d.diner} today (${added.join(", ")})`);
  }
  const np = noteProblem(parsed.noteOnBooking, parsed.noteOnBookingLine ?? null);
  if (np) reasons.push(np);
  if (earlier.length) reasons.push("An earlier reconfirm here did not pass", ...earlier);
  const status = reasons.length ? "not_reconfirmed" : today.state === "matched" ? "reconfirmed" : "needs_review";
  return { status, reasons: [...new Set(reasons)] };
}

// Nobody answered or they declined: today's call tested nothing, so it is saved as failed and can be tried
// again. A Jev failure only voids a reconfirm where every answer passed. Any slip, even one only Claude
// heard, goes on to compareReconfirm so it shows as Not reconfirmed and reaches the ledger.
export function reconfirmFailure(today: LaneResult, jevFailed: boolean): string[] | null {
  if (today.state === "no_answer" || today.state === "declined") return today.reasons.length ? today.reasons : [today.headline];
  const slipped = today.state === "not_matched" || today.state === "needs_chef" || today.checks.some((v) => v.outcome !== "pass");
  if (jevFailed && !slipped) return ["Jev could not weigh today's answers. This reconfirm does not count. Try it again.", ...today.reasons.slice(0, 3)];
  return null;
}

// labels of today's quoted checks Anand has not ticked yet; nothing to read never counts as read
export function missingTicks(today: LaneResult, keys: string[]): string[] {
  const quoted = today.checks.filter((c) => c.quote);
  if (!quoted.length) return ["no quotes from today"];
  const got = new Set(keys);
  return quoted.filter((c) => !got.has(c.key)).map((c) => c.label);
}
