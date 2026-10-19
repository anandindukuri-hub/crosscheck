import { normalizeCustomName } from "./allergens";
import type { Diner, LaneResultState, LaneStatus, Outcome, RunMode, Speaker } from "./types";

// plain labels shared by server pages and client components, presentation only

export type Tone = "matched" | "nomatch" | "chef" | "you" | "quiet" | "review";

export const RESULT_META: Record<LaneResultState, { label: string; tone: Tone; hint: string }> = {
  matched: { label: "Matched", tone: "matched", hint: "Every check matched for the dishes the kitchen suggested" },
  needs_review: { label: "Ready for your review", tone: "review", hint: "Answers look clear. Read each quote before booking" },
  needs_chef: { label: "Needs the chef", tone: "chef", hint: "Some answers were unsure, unclear or passed on by other staff" },
  not_matched: { label: "Did not match", tone: "nomatch", hint: "At least one answer ruled this kitchen out" },
  no_answer: { label: "No answer yet", tone: "quiet", hint: "Nobody from the kitchen answered the questions" },
  declined: { label: "Declined", tone: "quiet", hint: "They said no to the AI call. We will not call again" },
};

export const OUTCOME_META: Record<Outcome, { label: string; tone: Tone }> = {
  pass: { label: "Matched", tone: "matched" },
  escalate: { label: "Unclear", tone: "chef" },
  fail: { label: "Did not match", tone: "nomatch" },
};

export const STATUS_LABEL: Record<LaneStatus, string> = {
  queued: "Queued",
  calling: "Fo is working",
  needs_you: "Needs you",
  waiting_report: "On the call",
  deciding: "Checking the answers",
  done: "Done",
  fo_still_working: "Fo still working",
  error: "Stopped",
};

export const MODE_LABEL: Record<RunMode, string> = {
  test: "Test calls to your phone",
  live: "Real calls",
  replay: "Sample with no calls",
};

export const SPEAKER_LABEL: Record<Speaker, string> = {
  chef_or_manager: "chef or manager",
  other_staff: "other staff",
  relayed: "passed on by staff",
  automated: "automated system",
  unknown: "speaker not clear",
};

export const listJoin = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

export const speakerLabel = (s: string) => SPEAKER_LABEL[s as Speaker] ?? s.replace(/_/g, " ");

export const capFirst = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// "latin_american;mexican" -> "Latin american, mexican"
export const cuisineText = (r: { cuisine: string; cuisineRaw?: string; source?: string }) =>
  r.source === "test" ? "Test kitchen" : capFirst((r.cuisineRaw ?? r.cuisine).replace(/_/g, " ").split(/\s*;\s*/).filter(Boolean).join(", "));

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// the engine tags dev replay progress lines; the page already says it is a replay
export const cleanProgress = (s: string) => s.replace(/^DEV REPLAY:?\s*/i, "");

const SHORT: Record<string, string> = {
  crustacean: "crustacean shellfish",
  mollusk: "mollusks",
  peanut: "peanut",
  tree_nut: "tree nuts",
  fish: "fish",
  milk: "milk",
  egg: "egg",
  soy: "soy",
  sesame: "sesame",
  gluten: "gluten",
};

// a guest's needs in a few words, e.g. "shellfish, no beef contact"
export function needTags(d: Pick<Diner, "restrictions">): string[] {
  const keys = new Set(d.restrictions.flatMap((r) => (r.kind === "allergy" ? [r.allergen] : [])));
  const both = keys.has("crustacean") && keys.has("mollusk");
  const out: string[] = [];
  for (const r of d.restrictions) {
    if (r.kind === "diet") out.push(r.strictness === "contact" ? "no beef contact" : r.strictness === "ingredient" ? "no beef" : "vegetarian");
    else if (r.kind === "custom") out.push(normalizeCustomName(r.name));
    else if (both && (r.allergen === "crustacean" || r.allergen === "mollusk")) {
      if (!out.includes("shellfish")) out.push("shellfish");
    } else out.push(SHORT[r.allergen] ?? r.allergen);
  }
  return out;
}

export const shortNeeds = (d: Pick<Diner, "restrictions">) => needTags(d).join(", ");

// "Anand" -> "A", "Guest 2" -> "G2", "Mary Ann" -> "MA"
export function initials(label: string) {
  const t = label.trim();
  const g = /^guest\s*(\d+)$/i.exec(t);
  if (g) return `G${g[1]}`;
  const words = t.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 1)).toUpperCase();
}

export const fmtDate = (s: string) => new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
export const fmtDateTime = (s: string) => new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
export const fmtTime = (s: string) => new Date(s).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

// the next "Guest n" nobody at the table has yet, so removing then adding a guest never repeats a label
export function nextGuestLabel(diners: Pick<Diner, "label">[]) {
  const taken = new Set(diners.map((d) => d.label.trim().toLowerCase()));
  let n = diners.length + 1;
  while (taken.has(`guest ${n}`)) n++;
  return `Guest ${n}`;
}

export const sameLabels = (diners: Pick<Diner, "label">[]) => new Set(diners.map((d) => d.label.trim().toLowerCase())).size !== diners.length;
