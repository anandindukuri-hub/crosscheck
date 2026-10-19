import { targetLabel } from "./checks";
import { parseReport } from "./report";
import type { CalibrationSignals } from "./settings";
import type { CheckInstance, Run, Station } from "./types";

// The practice call: Anand plays the kitchen and reads these lines. Three of them carry a trap
// (a hedge, a relay, a shared fryer). Fo's report must keep all three word for word. Until it does, every match
// waits for his review.
export const HEDGE_KEY = "hidden:peanut";
export const SHARED_KEY = "fryer:shellfish";
export const RELAY_KEY = "surfaces:peanut";

const TRAPS: Record<string, { say: string; tests: CalibrationAnswer["tests"] }> = {
  [HEDGE_KEY]: { say: "I think there's no peanut in the fried rice sauce.", tests: "hedge" },
  [SHARED_KEY]: { say: "The shrimp goes in the same fryer as everything else.", tests: "shared_fryer" },
  [RELAY_KEY]: { say: "Hold on, let me ask the cook... she says they wash the wok first.", tests: "relay" },
};

const CLEAR: Record<Station, (t: string) => string> = {
  hidden: (t) => `I checked the recipes myself. There's no ${t} in those dishes or in their sauces, stocks or anything we buy in.`,
  fryer: (t) => `We have a separate fryer for those dishes and ${t} never goes in that oil.`,
  surfaces: (t) => `I wash the wok and utensils with soap and hot water right before your order and nothing with ${t} touches them after that.`,
};

export type CalibrationAnswer = { code: string; label: string; say: string; tests: "hedge" | "shared_fryer" | "relay" | "first_hand" };

export type CalibrationGroup = { station: Station; topic: string; say: string; tests: CalibrationAnswer["tests"][] };

export type CalibrationLines = {
  opener: string;
  dishes: string;
  answers: Record<string, CalibrationAnswer>; // by check key, in call order
  groups: CalibrationGroup[]; // one spoken line per station, the way Fo now asks: once for the whole table
  readback: string;
};

const TOPIC: Record<Station, string> = { hidden: "ingredients", fryer: "the fryer", surfaces: "cooking gear" };
const orJoin = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} or ${xs.at(-1)}`);

// the clear answers for one station said once for every target, then each trap line as written
const CLEAR_GROUP: Record<Station, (t: string) => string> = {
  hidden: (t) => `I checked the recipes myself. There's no ${t} in those dishes or in their sauces, stocks or anything we buy in.`,
  fryer: (t) => `I checked the fryer myself. We fry in canola oil and nothing with ${t} ever goes in it.`,
  surfaces: (t) => `I wash the wok and utensils with soap and hot water right before your order and nothing with ${t} touches them after that.`,
};
const TRAP_LEAD: Record<CalibrationAnswer["tests"], string> = { hedge: "And ", relay: "For the peanut, ", shared_fryer: "But ", first_hand: "" };

function groupLines(checks: CheckInstance[], answers: Record<string, CalibrationAnswer>): CalibrationGroup[] {
  const out: CalibrationGroup[] = [];
  for (const station of ["hidden", "fryer", "surfaces"] as Station[]) {
    const group = checks.filter((c) => c.templateId === station);
    if (!group.length) continue;
    const clear = group.filter((c) => !TRAPS[c.key]);
    const traps = group.filter((c) => TRAPS[c.key]);
    const lead = (s: string, l: string) => (!l ? s : /^I\b/.test(s) ? `${l}${s}` : `${l}${s.charAt(0).toLowerCase()}${s.slice(1)}`);
    const say = [
      clear.length ? CLEAR_GROUP[station](orJoin(clear.map((c) => targetLabel(c.target)))) : "",
      ...traps.map((c) => (clear.length ? lead(TRAPS[c.key].say, TRAP_LEAD[TRAPS[c.key].tests]) : TRAPS[c.key].say)),
    ]
      .filter(Boolean)
      .join(" ");
    out.push({ station, topic: TOPIC[station], say, tests: group.map((c) => answers[c.key].tests) });
  }
  return out;
}

export function calibrationLines(checks: CheckInstance[]): CalibrationLines {
  const answers: Record<string, CalibrationAnswer> = {};
  for (const c of checks) {
    const trap = TRAPS[c.key];
    answers[c.key] = {
      code: c.code,
      label: c.label,
      say: trap?.say ?? CLEAR[c.templateId](targetLabel(c.target)),
      tests: trap?.tests ?? "first_hand",
    };
  }
  return {
    opener: "Sure, this is the chef. Go ahead and take notes.",
    dishes: "Anand can have the tofu pad see ew with no oyster sauce. Guest 2 can have the chicken fried rice.",
    answers,
    groups: groupLines(checks, answers),
    readback: "Yes, that's right.",
  };
}

const SHARED_FRYER = /\b(same|shared)\b[^.]*\bfryer|\bfryer\b[^.]*\b(same|shared)\b/i;

export function evaluateCalibration(text: string, checks: CheckInstance[]): { status: "verified" | "failed"; signals: CalibrationSignals; missing: (keyof CalibrationSignals)[] } {
  const p = parseReport(text);
  const ans = (key: string) => {
    const c = checks.find((x) => x.key === key);
    return c ? p.answers[c.code] : undefined;
  };
  const words = (key: string) => ans(key)?.words ?? "";
  const relay = ans(RELAY_KEY);
  const others = checks.filter((c) => !TRAPS[c.key]);
  const signals: CalibrationSignals = {
    format: p.format === "structured" && checks.every((c) => !!p.answers[c.code]?.words),
    hedge: /\bi think\b/i.test(words(HEDGE_KEY)),
    relay: relay?.speaker === "relayed" || /let me ask|they say/i.test(relay?.words ?? ""),
    sharedFryer: SHARED_FRYER.test(words(SHARED_KEY)),
    firstHand: others.filter((c) => p.answers[c.code]?.speaker === "chef_or_manager").length >= 3,
  };
  const missing = (Object.keys(signals) as (keyof CalibrationSignals)[]).filter((k) => !signals[k]);
  return { status: missing.length ? "failed" : "verified", signals, missing };
}

export const SIGNAL_TEXT: Record<keyof CalibrationSignals, string> = {
  format: "every answer in the reply format",
  hedge: 'the unsure words "I think"',
  relay: "the answer passed on by staff",
  sharedFryer: "the shared fryer",
  firstHand: "who said each answer",
};

const NOT_ANSWERED = /declin|voicemail|busy|automated|no answer|unanswered|not answered|n['’]?t answered|never answered/i;

// A real call happened only if Fo says it was answered ("Answered by the chef" too) and wrote the answers in the reply format
export function calibrationCallHappened(text: string) {
  const p = parseReport(text);
  const outcome = p.outcomeRaw.trim();
  return p.format === "structured" && /\banswered\b/i.test(outcome) && !NOT_ANSWERED.test(outcome) && !outcome.includes("/");
}

// Only the newest calibration run may change report fidelity, just once and only from a real call
export function calibrationAction(
  run: Pick<Run, "id" | "createdAt" | "calibratedAt">,
  runs: Pick<Run, "id" | "createdAt" | "purpose">[],
  text: string,
): "skip" | "superseded" | "no_call" | "save" {
  if (run.calibratedAt) return "skip";
  if (runs.some((r) => r.purpose === "calibration" && r.id !== run.id && r.createdAt > run.createdAt)) return "superseded";
  return calibrationCallHappened(text) ? "save" : "no_call";
}
