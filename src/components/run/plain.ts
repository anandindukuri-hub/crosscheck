import { customTargetKey, normalizeCustomName } from "@/lib/allergens";
import { hedgeWords, parseReport } from "@/lib/report";
import type { CheckVerdict, Diner, Lane, LaneResult } from "@/lib/types";
import { engineText, keepTime, sentence } from "../kit/typo";

// Plain words for what the engine decided. Presentation only: every verdict still comes from src/lib/rules.

export const station = (c: Pick<CheckVerdict, "key">) => c.key.split(":")[0] as "hidden" | "fryer" | "surfaces";
export const target = (c: Pick<CheckVerdict, "label">) => c.label.split(": ").slice(1).join(": ") || c.label;

const STATION_ORDER = { hidden: 0, fryer: 1, surfaces: 2 } as const;

// "peanut, shellfish and beef" or "peanut, shellfish or beef", never with a comma before the last word
export const joinWith = (xs: string[], word: "and" | "or") => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} ${word} ${xs.at(-1)}`);

// the topic of a check as the question it asks, never "Fryer oil: peanut" (which reads as "the oil is peanut")
const TOPIC: Record<string, (t: string) => string> = {
  hidden: (t) => `Any ${t} in these dishes?`,
  fryer: (t) => `Any ${t} in the fryer?`,
  surfaces: (t) => `Any ${t} on shared pans or tools?`,
};
export function topicTitle(c: Pick<CheckVerdict, "key" | "label">, targets?: string[]): string {
  const f = TOPIC[station(c)];
  const t = joinWith(targets ?? [target(c)], "or");
  return f ? f(t) : c.label;
}

// what an answer means, as a conclusion. join: how several allergens read in one sentence
type Reading = { join: "and" | "or"; f: (t: string, many: boolean) => string };
const R = (join: "and" | "or", f: Reading["f"]): Reading => ({ join, f });
const READING: Record<string, Record<string, Reading>> = {
  hidden: {
    free: R("or", (t) => `No ${t} in these dishes`),
    in_dish: R("and", (t, many) => `${sentence(t)} ${many ? "are" : "is"} in a dish or its sauce`),
    remove_after: R("and", (t, many) => `${sentence(t)} ${many ? "are" : "is"} cooked in and only picked off at the end`),
    unclear: R("and", () => "Not a sure answer"),
  },
  fryer: {
    dedicated: R("and", (t, many) => `${sentence(t)} never ${many ? "go" : "goes"} in this fryer`),
    not_fried: R("and", () => "None of these dishes are fried"),
    not_on_site: R("or", (t) => `No ${t} anywhere in this kitchen`),
    shared: R("and", (t, many) => `${sentence(t)} ${many ? "go" : "goes"} in the same fryer`),
    shared_oil_changed: R("and", (t) => `The fryer is shared with ${t}, even with fresh oil`),
    unclear: R("and", () => "Not a sure answer"),
  },
  surfaces: {
    separate_or_washed: R("and", () => "Washed or separate pans and tools"),
    not_on_site: R("or", (t) => `No ${t} anywhere in this kitchen`),
    shared_no_step: R("and", (t) => `Pans and tools shared with ${t} food, with no cleaning step`),
    rinsed: R("and", () => "Shared pans and tools, only rinsed between orders"),
    unclear: R("and", () => "Not a sure answer"),
  },
};

// "No peanut in these dishes", from a reading key such as Jev's or Claude's choice. targets: several allergens in one answer
export function reading(c: Pick<CheckVerdict, "key" | "label">, choice: string | undefined, targets?: string[]): string | null {
  if (!choice) return null;
  const x = READING[station(c)]?.[choice];
  const ts = targets ?? [target(c)];
  return x ? x.f(joinWith(ts, x.join), ts.length > 1) : sentence(choice.replace(/_/g, " "));
}

export const pctText = (x: number) => `${Math.round(x * 100)}%`;

// the one plain sentence under a check that did not match: why, in the kitchen's terms. heard: who answered, from heardFor
export function whyLine(c: CheckVerdict, heard: string | null = null): string {
  const t = target(c);
  const choice = c.jev?.choice;
  if (c.outcome === "fail") {
    const r = reading(c, choice);
    return `${r ?? "The answer rules this kitchen out"}. CrossCheck will not book here.`;
  }
  const hw = hedgeWords(c.quote);
  const who = c.speaker === "chef_or_manager" ? roleLead(heard) : "The kitchen";
  if (hw) return `${who} said “${sentence(hw)}.” CrossCheck only decides on a sure answer.`;
  if (c.speaker === "relayed") return "Someone passed this on from the kitchen. CrossCheck needs it from the chef.";
  if (c.speaker === "unknown") return "It is not clear who answered. CrossCheck needs it from the chef or manager.";
  if (c.speaker === "other_staff") return "A staff member answered, not the chef or manager. CrossCheck needs it from the chef or manager.";
  if (c.speaker === "automated") return "An automated line answered, not a person.";
  if (!c.quote) return `No exact words about ${t} came back from the call.`;
  if (choice === "rinsed") return "The pans and tools are only rinsed between orders. CrossCheck needs them washed or kept separate.";
  if (c.claude && c.jev && c.claude.choice !== c.jev.choice) return "Claude and Jev read this answer differently. It goes back to the chef.";
  if (c.jev && c.jev.confidence < 0.9) return `The answer was not clear enough to rely on. CrossCheck is only ${pctText(c.jev.confidence)} sure it heard it right.`;
  return "This answer needs the chef to say it plainly.";
}

// a short reason for the row, from the check that decided the lane
export function rowReason(r: LaneResult): string {
  if (r.state === "matched") return `All ${r.checks.length} checks passed`;
  if (r.state === "needs_review") return "Read each quote before booking";
  if (r.state === "no_answer") return engineText(r.reasons[0] ?? "No one from the kitchen answered");
  if (r.state === "declined") return "They said no to the AI call";
  const fail = r.checks.find((c) => c.outcome === "fail");
  if (fail) return reading(fail, fail.jev?.choice) ?? "One answer ruled this kitchen out";
  const open = r.checks.filter((c) => c.outcome === "escalate");
  if (open.length) {
    const c = open[0];
    const hw = hedgeWords(c.quote);
    const lead = hw
      ? `The ${c.speaker === "chef_or_manager" ? "chef or manager" : "kitchen"} was not sure about ${target(c)}`
      : c.speaker === "relayed"
        ? `The ${target(c)} answer was passed on`
        : c.speaker !== "chef_or_manager"
          ? `The ${target(c)} answer did not come from the chef`
          : `The ${target(c)} answer was not clear`;
    return open.length > 1 ? `${lead} and ${open.length - 1} more` : lead;
  }
  return engineText(r.reasons[0] ?? r.headline);
}

// lane wide reasons that are not already said by a check card ("Fryer oil: shellfish: Kitchen answer means ...")
export function laneNotes(r: LaneResult): string[] {
  const labels = r.checks.filter((c) => c.outcome !== "pass").map((c) => `${c.label}:`);
  return r.reasons.filter((x) => !labels.some((l) => x.startsWith(l))).map((x) => engineText(x.replace(/\s*\(\d+%\)/, "")));
}

// who answered and when, from Fo's own report: "Chef Mai, head chef · 10:24 AM"
export type Heard = { who: string | null; at: string | null };
// one named respondent as "Nok, kitchen manager", else null
function oneRespondent(raw: string): string | null {
  const t = raw.trim();
  const single = t && !/,|\band\b|\//i.test(t) && !/^none$/i.test(t);
  return single ? t.replace(/\s*\(([^)]+)\)\s*$/, ", $1") : null;
}
export function heardFor(lane: Pick<Lane, "reports">, code: string): Heard {
  for (let i = lane.reports.length - 1; i >= 0; i--) {
    const rep = lane.reports[i];
    if (rep.kind === "reconfirm") continue; // the lane's verdict and quotes come from the call and any chef callback
    const p = parseReport(rep.text);
    const a = p.answers[code];
    if (!a?.words) continue;
    return { who: oneRespondent(p.respondentsRaw), at: rep.at };
  }
  return { who: null, at: null };
}

// the speaker's role for a sentence: "Nok, kitchen manager" or "Nok, the manager" is "The kitchen manager" or
// "The manager", "Chef Ploy" is "The chef", anyone else "The chef or manager"
export function roleLead(who: string | null): string {
  const said = who?.match(/,\s*([^,]+)$/)?.[1].trim().toLowerCase().replace(/^(the|a|an|our)\s+/, "");
  const role = said || (who && /\bchef\b/i.test(who) ? "chef" : null);
  return role ? `The ${role}` : "The chef or manager";
}

// who confirmed the read back: the respondent on the latest call or callback
export function readBackBy(lane: Pick<Lane, "reports">): string {
  const rep = lane.reports.findLast((r) => r.kind !== "reconfirm");
  return roleLead(rep ? oneRespondent(parseReport(rep.text).respondentsRaw) : null);
}

export const fmtClock = (s: string) => keepTime(new Date(s).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));

// a report as label and value rows: the call, who answered, the dishes (most serious guest first), the read back and
// the length. The answers themselves are already on the sheet, so they are not printed a third time. answers: how many
export function reportRows(text: string, order: string[] = []): { rows: { label: string; value: string }[]; answers: number } {
  const p = parseReport(text);
  if (p.format !== "structured") return { rows: [], answers: 0 };
  const rows: { label: string; value: string }[] = [];
  const outcome = p.outcomeRaw.trim();
  if (outcome) rows.push({ label: "Call", value: sentence(engineText(outcome)) });
  if (p.respondentsRaw.trim() && !/^none$/i.test(p.respondentsRaw.trim())) rows.push({ label: "Spoke with", value: engineText(p.respondentsRaw.replace(/\s*\(([^)]+)\)\s*$/, ", $1")) });
  if (p.dishes.trim()) {
    const rank = (part: string) => {
      const i = order.findIndex((o) => part.trim().toLowerCase().startsWith(`${o.toLowerCase()}:`));
      return i < 0 ? order.length : i;
    };
    const parts = p.dishes.split(/\s*\|\s*/).filter(Boolean).sort((a, b) => rank(a) - rank(b));
    rows.push({ label: "Dishes", value: engineText(parts.join(". ")) });
  }
  if (p.readback.trim()) rows.push({ label: "Repeated back", value: engineText(p.readback) });
  if (p.duration.trim()) rows.push({ label: "Length", value: sentence(engineText(p.duration)) });
  return { rows, answers: Object.values(p.answers).filter((a) => a.words).length };
}

// what each guest needs, in plain words for a pass or a seat: "Life threatening peanut allergy"
const ALLERGEN: Record<string, string> = {
  crustacean: "crustacean shellfish",
  mollusk: "mollusk",
  peanut: "peanut",
  tree_nut: "tree nut",
  fish: "fish",
  milk: "milk",
  egg: "egg",
  soy: "soy",
  sesame: "sesame",
  gluten: "celiac (gluten)",
};
// text: the short form ("Peanut allergy"). what: the allergen alone ("peanut"). diet: a diet's own label and line
const sevWord = (s: string): Need["severity"] => (s === "anaphylaxis" ? "Life threatening" : s === "severe" ? "Severe" : "Mild");
export type Need = { severity: "Life threatening" | "Severe" | "Mild" | null; text: string; what: string; diet?: { label: string; line: string } };
export function guestNeeds(d: Pick<Diner, "restrictions">): Need[] {
  const keys = new Set(d.restrictions.flatMap((r) => (r.kind === "allergy" ? [r.allergen] : [])));
  const both = keys.has("crustacean") && keys.has("mollusk");
  const out: Need[] = [];
  for (const r of d.restrictions) {
    if (r.kind === "diet") {
      const text = r.strictness === "contact" ? "No beef, no contact" : r.strictness === "ingredient" ? "No beef" : "Vegetarian";
      const diet =
        r.strictness === "contact"
          ? { label: "Diet", line: "No beef. Nothing cooked with or next to beef." }
          : r.strictness === "ingredient"
            ? { label: "Diet", line: "No beef, beef stock or beef fat." }
            : { label: "Diet", line: "Vegetarian. No meat." };
      out.push({ severity: null, text, what: text.toLowerCase(), diet });
      continue;
    }
    const sev = sevWord(r.severity);
    if (r.kind === "custom") {
      const name = normalizeCustomName(r.name);
      out.push({ severity: sev, text: `${sentence(name)} allergy`, what: name });
      continue;
    }
    if (both && (r.allergen === "crustacean" || r.allergen === "mollusk")) {
      if (out.some((x) => x.what === "shellfish, including mollusks")) continue;
      // one line for both, at the more serious of the two
      const pair = d.restrictions.flatMap((x) => (x.kind === "allergy" && (x.allergen === "crustacean" || x.allergen === "mollusk") ? [x.severity] : []));
      const top = pair.reduce((a, b) => ((RANK[b] ?? 2) < (RANK[a] ?? 2) ? b : a));
      out.push({ severity: sevWord(top), text: "Shellfish allergy, including mollusks", what: "shellfish, including mollusks" });
      continue;
    }
    const what = r.allergen === "gluten" ? "gluten (celiac)" : (ALLERGEN[r.allergen] ?? r.allergen);
    out.push({ severity: sev, text: r.allergen === "gluten" ? "Celiac (gluten)" : `${sentence(ALLERGEN[r.allergen] ?? r.allergen)} allergy`, what });
  }
  return out;
}

// the most serious first: life threatening, then severe, then mild, then diets
const RANK: Record<string, number> = { anaphylaxis: 0, severe: 1, intolerance: 2 };
export const severityRank = (d: Pick<Diner, "restrictions">) => Math.min(...d.restrictions.map((r) => (r.kind !== "diet" ? (RANK[r.severity] ?? 2) : 3)), 4);
export const bySeverity = <T extends Pick<Diner, "restrictions">>(ds: T[]) => ds.map((d, i) => ({ d, i, r: severityRank(d) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.d);
export const sortNeeds = (ns: Need[]) => {
  const rank = (n: Need) => (n.severity === "Life threatening" ? 0 : n.severity === "Severe" ? 1 : n.severity === "Mild" ? 2 : 3);
  return [...ns].sort((a, b) => rank(a) - rank(b));
};

// the life threatening allergies at the table, for the first line a server reads: "Peanut (Guest 2)"
export function lifeThreatening(diners: Pick<Diner, "label" | "restrictions">[]): string[] {
  return bySeverity(diners).flatMap((d) => guestNeeds(d).filter((n) => n.severity === "Life threatening").map((n) => `${n.what} (${d.label})`));
}

// how serious the need behind one check is, for the guests it covers: 0 life threatening, 1 severe, 2 mild, 3 a diet
const SEV_RANK: Record<string, number> = { anaphylaxis: 0, severe: 1, intolerance: 2 };
export function checkRank(c: Pick<CheckVerdict, "key" | "dinerIds">, diners: Pick<Diner, "id" | "restrictions">[]): number {
  const tk = c.key.split(":")[1];
  let best = 4;
  for (const d of diners) {
    if (!c.dinerIds.includes(d.id)) continue;
    for (const r of d.restrictions) {
      if (r.kind === "diet") {
        if (tk === "beef") best = Math.min(best, 3);
      } else if (r.kind === "custom") {
        if (tk === customTargetKey(r.name)) best = Math.min(best, SEV_RANK[r.severity] ?? 2);
      } else if (r.allergen === tk || (tk === "shellfish" && (r.allergen === "crustacean" || r.allergen === "mollusk"))) best = Math.min(best, SEV_RANK[r.severity] ?? 2);
    }
  }
  return best;
}

// Answers that say the same thing about different allergens fold into one row: "We have a separate fryer, peanut
// never goes in that oil" and the same words about beef become one row about peanut and beef. The quote shown is the
// one for the most serious allergy, and rows run most serious first, then ingredients, fryer, shared pans and tools.
// fold: false keeps every allergen on its own row, for anything staff read (the note, the pass)
export type AnswerGroup = { key: string; checks: CheckVerdict[]; targets: string[]; lead: CheckVerdict; rank: number };
export function groupAnswers(checks: CheckVerdict[], diners: Pick<Diner, "id" | "restrictions">[], opts: { quotedOnly?: boolean; fold?: boolean } = {}): AnswerGroup[] {
  const groups = new Map<string, { checks: { c: CheckVerdict; rank: number }[] }>();
  for (const c of checks) {
    if (opts.quotedOnly && !c.quote) continue;
    const t = target(c).toLowerCase();
    const words = c.quote && opts.fold !== false ? c.quote.toLowerCase().split(t).join("{t}").replace(/\s+/g, " ").trim() : null;
    const k = words ? `${station(c)}|${c.outcome}|${c.jev?.choice ?? ""}|${words}` : c.key;
    const g = groups.get(k) ?? { checks: [] };
    g.checks.push({ c, rank: checkRank(c, diners) });
    groups.set(k, g);
  }
  return [...groups.entries()]
    .map(([key, g]) => {
      const sorted = [...g.checks].sort((a, b) => a.rank - b.rank);
      return { key, checks: sorted.map((x) => x.c), targets: [...new Set(sorted.map((x) => target(x.c)))], lead: sorted[0].c, rank: sorted[0].rank };
    })
    .sort((a, b) => a.rank - b.rank || STATION_ORDER[station(a.lead)] - STATION_ORDER[station(b.lead)]);
}

// the title of a row: what the answer means when it was read, else what was asked. Only ever the lead allergen, the one
// the quote under it names; a folded allergen carries its own words on its own line
export function groupTitle(g: AnswerGroup): string {
  return reading(g.lead, g.lead.jev?.choice) ?? topicTitle(g.lead);
}

// the title over the same words said for several allergens: what they mean for all of them when every answer was read
// the same way, else the question they answer
export function mergedTitle(leads: CheckVerdict[], targets: string[]): string {
  const choice = leads[0]?.jev?.choice;
  const same = leads.every((c) => station(c) === station(leads[0]) && c.jev?.choice === choice);
  return (same ? reading(leads[0], choice, targets) : null) ?? topicTitle(leads[0], targets);
}

// one folded allergen's own words, cut to the clause that names it: "…beef never goes in that oil". Never reworded:
// the words are the kitchen's, only shortened from the front. same: the kitchen used the lead's words exactly
export function foldedWords(c: CheckVerdict, lead: CheckVerdict): { target: string; words: string | null; same: boolean } {
  const t = target(c);
  const q = engineText(c.quote).trim();
  if (!q) return { target: t, words: null, same: false };
  if (q === engineText(lead.quote).trim()) return { target: t, words: q, same: true };
  const parts = q.split(/(?<=[,;])\s+/);
  const i = parts.findIndex((p) => p.toLowerCase().includes(t.toLowerCase()));
  return { target: t, words: i > 0 ? `…${parts.slice(i).join(" ")}` : q, same: false };
}

// the table's own date and time from its free text ("tonight at 7 PM", "Sun, Oct 19 at 7:30 PM"), or null
export function tableDate(when: string, createdAt: string): Date | null {
  const t = /\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i.exec(when);
  if (!t) return null;
  let h = Number(t[1]) % 12;
  if (t[3].toUpperCase() === "PM") h += 12;
  const m = Number(t[2] ?? 0);
  const made = new Date(createdAt);
  let day: Date | null = null;
  const weekday = /\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/i.exec(when);
  if (/\b(tonight|today)\b/i.test(when)) day = new Date(made);
  else if (/\btomorrow\b/i.test(when)) day = new Date(made.getTime() + 86_400_000);
  else if (weekday && !/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d/i.test(when)) {
    // "Sunday at 6 PM": the next such day from when the table was made, that same day included
    const want = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(weekday[1].toLowerCase());
    day = new Date(made.getTime() + ((want - made.getDay() + 7) % 7) * 86_400_000);
  } else {
    const md = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+(\d{1,2})\b/i.exec(when);
    if (md) {
      day = new Date(`${md[1]} ${md[2]}, ${made.getFullYear()} 12:00`);
      if (day.getTime() < made.getTime() - 86_400_000 * 30) day.setFullYear(day.getFullYear() + 1);
    }
  }
  if (!day || Number.isNaN(day.getTime())) return null;
  day.setHours(h, m, 0, 0);
  return day;
}

// reconfirm is worth most on the day: it leads from three hours before the table, the pass leads until then
export function reconfirmWindow(when: string, createdAt: string, now = Date.now()) {
  const at = tableDate(when, createdAt);
  const opens = at ? new Date(at.getTime() - 3 * 3_600_000) : null;
  return { opens, open: !!opens && now >= opens.getTime() };
}

export const clockText = (d: Date) => keepTime(d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));

// the table's time with its date, for a pass that may be read or saved on another day: "Mon, Oct 19 at 7 PM"
export function passTime(when: string, createdAt: string): string {
  const at = tableDate(when, createdAt);
  if (!at) return keepTime(sentence(when.trim()));
  return `${at.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at\u00a0${clockText(at).replace(":00", "")}`;
}

// just the time of the table, for a short status: "7 PM"
export function whenTime(when: string): string | null {
  const t = /\b(\d{1,2}(?::\d{2})?)\s*(AM|PM)\b/i.exec(when);
  return t ? `${t[1]}\u00a0${t[2].toUpperCase()}` : null;
}

// how one answer was read, in plain words. dev adds the names of the two checks
export function howChecked(c: CheckVerdict, dev: boolean): string[] {
  const jev = c.jev ? reading(c, c.jev.choice) : null;
  const claude = c.claude ? reading(c, c.claude.choice) : null;
  const low = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
  const hw = hedgeWords(c.quote);
  const out: string[] = [];
  if (!c.jev && !c.claude) return ["No reading for this answer."];
  if (dev) {
    if (c.jev && jev) out.push(`Jev is ${pctText(c.jev.confidence)} sure it heard: ${low(jev)}.`);
    if (c.claude && claude) out.push(c.claude.choice === c.jev?.choice ? "Claude read it the same way." : `Claude read it as: ${low(claude)}.`);
  } else if (c.jev && c.claude && jev && claude) {
    if (c.jev.choice === c.claude.choice) out.push(`Claude and Jev read this answer. Both heard: ${low(jev)}. CrossCheck is ${pctText(c.jev.confidence)} sure it heard it right.`);
    else out.push(`Claude and Jev read this answer differently. Jev heard: ${low(jev)}. Claude heard: ${low(claude)}. When they disagree, the answer goes back to the chef.`);
  } else if (jev && c.jev) out.push(`CrossCheck heard: ${low(jev)}. It is ${pctText(c.jev.confidence)} sure it heard it right.`);
  else if (claude) out.push(`CrossCheck heard: ${low(claude)}.`);
  if (hw) out.push(`Unsure words: “${hw}”.`);
  return out;
}
