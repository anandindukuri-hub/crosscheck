import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { foMayHaveIt } from "./lanes";
import { parseReport } from "./report";
import { dataPath, readJson, writeJson } from "./store";
import type { Lane } from "./types";

export type TraceEvent = {
  at: string;
  runId: string;
  laneId?: string;
  actor: "fo" | "jev" | "claude" | "engine" | "user";
  action: string;
  input?: unknown;
  output?: unknown;
  ms?: number;
  ok: boolean;
};

const traceFile = (runId: string) => dataPath("traces", `${runId}.jsonl`);

export async function trace(e: Omit<TraceEvent, "at"> & { at?: string }) {
  const file = traceFile(e.runId);
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, JSON.stringify({ at: new Date().toISOString(), ...e }) + "\n");
}

export async function readTrace(runId: string): Promise<TraceEvent[]> {
  try {
    const text = await readFile(traceFile(runId), "utf8");
    return text
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as TraceEvent);
  } catch {
    return [];
  }
}

// Export for the hackathon form: no tokens, ids, phones, emails, staff names or names of places that did not match.
// PHONE is letter aware, so a 10 digit run inside a hex id is not a phone. INTL: + and 8 to 15 digits, any country
const PHONE = /(?<![\w.])(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\w)/g;
const INTL = /(?<![\w+])\+[1-9](?:[\s().-]*\d){7,14}(?!\w)/g;
const SEP = "[\\s().-]*";

// one phone number in any format: its last 10 digits with any separators, after its country code, a trunk 0 or neither
export function phonePattern(phone: string | null): RegExp | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  const join = (d: string) => d.split("").join(SEP);
  const code = digits.slice(0, -10) || "1";
  return new RegExp(`(?<!\\d)(?:\\+?${join(code)}${SEP})?(?:0${SEP})?\\(?${join(digits.slice(-10))}(?!\\d)`, "g");
}
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const TOKEN = /\b(?:sk-[A-Za-z0-9_-]{10,}|ts_[A-Za-z0-9_-]{10,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|[A-Za-z0-9_-]{40,})\b/g;
// joinUrl is a one use ticket into a live Fo voice call
const ID_KEYS = new Set(["conversationId", "access_token", "refresh_token", "authorization", "Authorization", "apiKey", "joinUrl"]);
// CrossCheck's own run and lane ids are never phones
const OWN_IDS = new Set(["runId", "laneId", "id"]);

// ---- staff names: found where a report says who spoke, then removed as whole words everywhere ----

const NAME = new RegExp("\\p{Lu}[\\p{L}\\p{M}'-]*", "gu");
// capitalized words in a speaker note that are roles, places or plain English, never a person
const NOT_A_NAME = new Set(
  (
    "a an and or of the to for from with by at in on as but so if then after before via through behalf " +
    "i we he she they it its our my me you your us his her their them this that these those there here who " +
    "yes no not none nobody someone somebody anyone everyone unknown unclear stated asked answer answered said says say told confirmed think thinks sure maybe probably usually also same just only still again today tonight tomorrow usual " +
    "chef chefs sous head executive exec kitchen manager managers general gm owner owners cook cooks line prep staff member team lead shift supervisor " +
    "host hostess server servers waiter waitress bartender front house cashier receptionist employee worker assistant expo dishwasher pastry baker " +
    "automated system ai bot phone menu recording voicemail ivr fo crosscheck claude jev wajo guest guests restaurant " +
    "mr mrs ms dr miss sir madam ma'am guy lady man woman person fryer wok grill oil oven station pan pans board call called ok xo " +
    "is was are be would can could should might did does do has have had cooking working checking checked " +
    // around a call: the report's own field names, booking words, days, months, cuisines, common foods and sentence openers
    "other email note booking duration dishes dish readback respondents respondent outcome test kitchens answers " +
    "table dinner lunch reservation deposit confirmation card payment total party number time name names " +
    "monday tuesday wednesday thursday friday saturday sunday january february march july " +
    "september october november december jan feb mar apr jun jul aug sep sept oct nov dec " +
    "thai chinese japanese italian mexican indian american pizza burgers burger cafe " +
    "rice noodles noodle curry sauce soup salad fries chicken pork tofu shrimp peanut peanuts fish egg milk soy sesame gluten wheat " +
    "thanks thank hi hello hey great perfect okay done booked sorry unfortunately however actually well absolutely certainly " +
    "please good alright fine yeah yep nope right correct exactly first next finally now otherwise instead let hold " +
    "ask asked spoke talked reached emailed sent paid got left added gave read tried found put used made tell check bring " +
    "i'm i'll i've i'd we're we've we'll they're don't can't didn't won't doesn't isn't wasn't nothing everything something " +
    "separate separately only allergy allergies allergic visa mastercard amex resy opentable yelp google gmail"
  ).split(" "),
);

const tidy = (s: string) => s.replace(/[‘’]/g, "'");

function namesIn(text: string | null | undefined, skip: Set<string>, out: Set<string>) {
  for (const m of tidy(text ?? "").matchAll(NAME)) {
    const w = m[0].replace(/'s$/, "").replace(/['-]+$/, "");
    const low = w.toLowerCase();
    // "Sous-Chef" or "Chef-Owner" is a role in every part
    if (w.length >= 2 && !low.split("-").every((x) => NOT_A_NAME.has(x)) && !skip.has(low)) out.add(w);
  }
}

// a capitalized word that opens a sentence counts as a name only when what follows reads like one:
// "Jessica at the host stand", "Priya the sous chef", "Dave Kowalski", "(Tom)" or the end of a line
const ROLE_NEXT = /^\s*,?\s+(?:(?:is|was)\s+)?(?:the|our|a|an)?\s*(?:(?:sous|head|executive|pastry)\s+)?(?:chef|(?:kitchen|general)\s+manager|manager|(?:line|prep)\s+cook|cook|owner|host|hostess|server|waiter|waitress|bartender|cashier|receptionist|supervisor|gm)\b/i;
const CUE_NEXT = /^(?:\s*[,()\]–-]|[ \t]*(?:\n|$)|\s+(?:at|from|said|says|told|confirmed|will|who|here|mentioned|asked|explained|handles|cooks|is cooking|was cooking)\b)/i;
const NAME_NEXT = new RegExp("^\\s+(\\p{Lu}[\\p{Ll}\\p{M}'-]+)", "u");
const OPENS = /(?:^|[.!?:;"“(\[*•\n–-])[ \t]*$/;

// every likely name in free text: Fo's own words, the OTHER line, read backs and quotes
function namesInProse(text: string, skip: Set<string>, out: Set<string>) {
  const t = tidy(text);
  const known = (w: string) => NOT_A_NAME.has(w.toLowerCase()) || skip.has(w.toLowerCase());
  for (const m of t.matchAll(NAME)) {
    const w = m[0].replace(/'s$/, "").replace(/['-]+$/, "");
    // capitals only are field names or shouting; a name also written the usual way is caught there and hidden in both
    if (w.length < 2 || w === w.toUpperCase() || w.toLowerCase().split("-").every((x) => known(x))) continue;
    const at = m.index ?? 0;
    const after = t.slice(at + m[0].length, at + m[0].length + 60);
    const next = after.match(NAME_NEXT)?.[1];
    const opens = OPENS.test(t.slice(Math.max(0, at - 40), at)) || at === 0;
    if (!opens || CUE_NEXT.test(after) || ROLE_NEXT.test(after) || (next && !known(next))) out.add(w);
  }
}

// The staff names a run captured: the RESPONDENTS line, the speaker note after each answer (in parentheses or after
// the closing quote), the NOTE ON BOOKING speaker, who is cooking tonight and any name in the rest of Fo's words.
// texts: every Fo reply and report. skip: words that are never staff, such as guest names
export function staffNames(texts: string[], skip: string[] = []): string[] {
  const skipSet = new Set(skip.flatMap((x) => tidy(x).toLowerCase().split(/\s+/)).filter(Boolean));
  // in free text a dish word is never a name, so "Pad See Ew" stays readable. Who answered is always a person
  const proseSkip = new Set(skipSet);
  for (const text of texts) for (const w of tidy(parseReport(text).dishes ?? "").toLowerCase().split(/[^\p{L}\p{M}']+/u)) if (w) proseSkip.add(w);
  const out = new Set<string>();
  for (const text of texts) {
    if (/\s/.test(text)) namesInProse(text, proseSkip, out);
    const p = parseReport(text);
    namesIn(p.respondentsRaw, skipSet, out);
    for (const a of Object.values(p.answers)) {
      namesIn(a.speakerRaw, skipSet, out);
      const line = tidy(a.line ?? "");
      const close = Math.max(line.lastIndexOf('"'), line.lastIndexOf("”"));
      if (close > 0) namesIn(line.slice(close + 1), skipSet, out);
    }
    namesIn(p.noteOnBookingLine?.match(/\(([^()]*)\)\s*\.?\s*$/)?.[1], skipSet, out);
    namesIn(p.cookTonight, skipSet, out);
  }
  return [...out];
}

// a whole word in its own case or in capitals, so "Olive" the cook goes but "olive oil" in a quote stays
const staffPattern = (name: string) => {
  const n = tidy(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{M}\\p{N}_])(?:${n}|${n.toUpperCase()})(?![\\p{L}\\p{M}\\p{N}_])`, "gu");
};

// restaurant names as whole words in any case, all in one pass, so "Bar" leaves "barley" alone and no placeholder is
// ever searched again. The placeholder holds no letters from a name: [kitchen A]
const KITCHEN = /\[kitchen [A-Z]\]/g;
function hidePattern(hideNames: string[]) {
  const names = hideNames.map((n) => tidy(n).trim()).filter(Boolean);
  if (!names.length) return null;
  const alts = [...names].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`(?<![\\p{L}\\p{M}\\p{N}_])(?:${alts.join("|")})(?![\\p{L}\\p{M}\\p{N}_])`, "giu");
}

export function redact(value: unknown, hideNames: string[], staff: string[] = [], key = ""): unknown {
  if (typeof value === "string") {
    let s = value.replace(EMAIL, "[email]");
    if (!OWN_IDS.has(key)) s = s.replace(INTL, "[phone]").replace(PHONE, "[phone]");
    s = s.replace(TOKEN, "[redacted]");
    s = tidy(s);
    const hide = hidePattern(hideNames);
    const index = hideNames.map((n) => tidy(n).trim().toLowerCase());
    if (hide) s = s.replace(hide, (m) => `[kitchen ${String.fromCharCode(65 + Math.max(0, index.indexOf(m.toLowerCase())))}]`);
    for (const name of staff) s = s.replace(staffPattern(name), "[name]");
    return s;
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, hideNames, staff));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, ID_KEYS.has(k) ? "[redacted]" : redact(v, hideNames, staff, k)]),
    );
  }
  return value;
}

// one lane in the export. A finished lane with no result and no report was never dialed by CrossCheck:
// not_called when skipped or declined at Fo's "Should I call?", in_fo_app when Fo took or may have the request
// approved: false for a run never sent to Fo, so its lanes were never called (a kitchen memory match still shows)
export function exportLane(l: Pick<Lane, "id" | "restaurant" | "status" | "result" | "reports" | "skipped" | "callbacks" | "booking" | "goAhead" | "events" | "pending">, approved = true) {
  const ended = l.status === "done" && !l.result && !l.reports.length;
  const untouched = l.status === "queued" && !l.pending && !l.reports.length && !l.events.length;
  const result = l.skipped || (!approved && !l.result) || untouched ? "not_called" : ended ? (foMayHaveIt(l) ? "in_fo_app" : "not_called") : (l.result?.state ?? l.status);
  return { laneId: l.id, restaurant: l.restaurant.name, result, decider: l.result?.decider, callbacks: l.callbacks, booking: l.booking?.status ?? null };
}

// scans only string values (numbers like 0.9733333333 are not phone numbers). testPhone: also caught in any format
export function leaks(value: unknown, hideNames: string[] = [], staff: string[] = [], testPhone: string | null = null): string[] {
  const found = new Set<string>();
  const hide = hidePattern(hideNames);
  const own = phonePattern(testPhone);
  const walk = (v: unknown) => {
    if (typeof v === "string") {
      if (new RegExp(EMAIL.source).test(v)) found.add("email");
      if (new RegExp(PHONE.source).test(v) || new RegExp(INTL.source).test(v) || (own && new RegExp(own.source).test(v))) found.add("phone");
      if (new RegExp(TOKEN.source).test(v)) found.add("token");
      if (hide && new RegExp(hide.source, hide.flags).test(tidy(v).replace(KITCHEN, ""))) found.add("restaurant name");
      if (staff.some((n) => staffPattern(n).test(tidy(v)))) found.add("staff name");
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(value);
  return [...found];
}

// Run count by kind, for the form ("how many runs, how many succeeded")
type Stats = Record<"test" | "live" | "replay" | "eval", { runs: number; ok: number }>;
const statsFile = () => dataPath("stats.json");
const empty: Stats = { test: { runs: 0, ok: 0 }, live: { runs: 0, ok: 0 }, replay: { runs: 0, ok: 0 }, eval: { runs: 0, ok: 0 } };

// a fresh copy each time, so a first bump on a new clone never changes the shared default
export const readStats = () => readJson<Stats>(statsFile(), structuredClone(empty));

export async function bumpStats(kind: keyof Stats, ok: boolean) {
  const s = await readStats();
  s[kind] = { runs: s[kind].runs + 1, ok: s[kind].ok + (ok ? 1 : 0) };
  await writeJson(statsFile(), s);
}
