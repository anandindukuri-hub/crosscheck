import { agreedBoxShown, bookingConfirmShown, bookShown, canStartReconfirm, sendAgainShown, tableCard } from "@/lib/lanes";
import { CircleAlert } from "lucide-react";
import { RESULT_META, STATUS_LABEL, type Tone } from "@/lib/labels";
import type { Lane, LaneResult, Run, RunMode } from "@/lib/types";
import { DECLINED_GLYPH, NO_ANSWER_GLYPH, type RingGlyph } from "../kit/ConfidenceRing";
import { engineText, sentence } from "../kit/typo";
import { rowReason } from "./plain";

export type LaneView = Lane & { active: boolean; inQueue: boolean };

export const WORKING = new Set<Lane["status"]>(["queued", "calling", "waiting_report", "deciding"]);
export const SETTLED = new Set<Lane["status"]>(["done", "error", "fo_still_working"]);

// What the row and the evidence sheet may offer. Same rules as the server, via src/lib/lanes.
// table: every kitchen in the run. Book hides once another kitchen is booked for this table
export function laneFlags(lane: LaneView, mode: RunMode, approved: boolean, table: Lane[] = []) {
  const r = lane.result;
  const replay = mode === "replay";
  const idle = !lane.active && !lane.inQueue;
  const running = approved && WORKING.has(lane.status) && (lane.active || lane.inQueue);
  const stuck = !replay && approved && idle && (lane.status === "fo_still_working" || lane.status === "error" || WORKING.has(lane.status));
  // a replay that no job holds any more (the server restarted mid run) cannot resume: it stopped, start a new one
  const replayStopped = replay && approved && idle && (lane.status === "error" || WORKING.has(lane.status));
  const good = !!r && (r.state === "matched" || r.state === "needs_review");
  const rc = lane.reconfirm ?? null;
  const canReconfirm = approved && good && lane.status === "done" && lane.booking?.status === "done" && canStartReconfirm(rc) && idle;
  const canBook = bookShown(lane, approved, idle, table);
  const card = tableCard(lane);
  const canCallAgain = !!lane.fromMemory && !replay && approved && idle && (!lane.booking || lane.booking.status === "failed");
  const chefStep = r?.state === "needs_chef" && lane.status === "done" && idle;
  // stop at first match skipped this kitchen: it can still be called, under the same rules as any call
  const canCallAnyway = !!lane.skipped && !r && lane.status === "done" && approved && idle;
  return {
    replay,
    test: mode === "test",
    idle,
    running,
    stuck,
    replayStopped,
    good,
    rc,
    canReconfirm,
    canStartReconfirm: canReconfirm && !rc,
    canBook,
    card,
    canCallAgain,
    canCallAnyway,
    // Jev answered and Claude is still reading: a preview to look at, never anything to act on
    previewing: !!lane.preview && lane.status === "deciding",
    canAskChef: chefStep && lane.callbacks < 1,
    chefCalledOnce: chefStep && lane.callbacks >= 1,
    showAgreed: agreedBoxShown(mode, approved, lane.agreed),
    sendAgain: sendAgainShown(lane),
    bookedAsk: bookingConfirmShown(lane),
    reviewing: r?.state === "needs_review" && canBook,
  };
}
export type LaneFlags = ReturnType<typeof laneFlags>;

// A booked table: Fo was asked to send the allergy note. Nothing checks that it did. Say only that
export const bookedNote = (mode: RunMode) =>
  mode === "replay"
    ? "Sample. In a real booking Fo is asked to send the allergy note."
    : mode === "test"
      ? "Test run. Fo was asked to email the allergy note to you, not the kitchen."
      : "Fo was asked to send the allergy note. Read Fo’s reply to see if it did.";

// the name the table is booked under, when there is one
export const bookedUnder = (run: Pick<Run, "bookingName" | "diners">) => run.bookingName?.trim() || run.diners[0]?.label.trim() || "";

// the lowest gating confidence Jev gave: how sure CrossCheck is that it heard every answer right
export function lowestConfidence(r: LaneResult | null | undefined): number | null {
  const xs = (r?.checks ?? []).map((c) => c.jev?.confidence).filter((x): x is number => typeof x === "number");
  return xs.length ? Math.min(...xs) : null;
}

// dot: before a verdict a kitchen is a small dot in the ring's slot (hollow while it waits its turn, blue while it
// waits on you). The dot grows into a ring only at the call and the verdict
export type RingState = { tone: Tone | "work" | "wait"; word: string; value: number | null; working: boolean; pulse: boolean; booked: boolean; glyph?: RingGlyph; dot?: "hollow" | "you" };

// the line under "Checking the answers", on the row and in the summary
export const DECIDING_LINE = "Claude and Jev are reading each answer";

// One vocabulary for a kitchen Fo is on, shared by its row and the Live Activity pill. timer: none before anyone picks
// up, run while the kitchen is on the line, freeze once the call is over and Fo writes the report. replay: a sample
// never dials, so it says it plays the script instead
export type LiveStep = { line: string; timer: "none" | "run" | "freeze" };
export function liveStep(lane: Pick<Lane, "status" | "phase" | "progress" | "reports" | "preview">, replay = false): LiveStep {
  if (lane.status === "needs_you") return { line: "Fo needs your OK", timer: "none" };
  if (lane.phase === "booking") return { line: "Booking", timer: "none" };
  if (lane.status === "deciding") return { line: STATUS_LABEL.deciding, timer: "freeze" };
  if (lane.phase === "reconfirm") return { line: "Reconfirming", timer: "run" };
  if (lane.phase === "callback") return { line: replay ? "Playing the chef’s answer" : "Calling the chef", timer: "run" };
  const p = engineText(lane.progress).toLowerCase();
  if (/writing|report/.test(p)) return { line: "Writing the report", timer: "freeze" };
  if (lane.status === "waiting_report" || /talking|on the call|speaking|asking the|picked up|connected/.test(p)) return { line: replay ? "Playing the sample" : "On the call", timer: "run" };
  if (!lane.reports.length && /reading|request|queued|getting ready/.test(p)) return { line: "Getting ready", timer: "none" };
  return { line: replay ? "Starting the sample" : "Dialing", timer: "none" };
}

// the one word for a kitchen Fo is on right now
export const liveWord = (lane: Pick<Lane, "progress" | "phase" | "status" | "reports" | "preview">, replay = false): string => liveStep(lane, replay).line;

// Fo calls one kitchen at a time: the first running kitchen is on the call, the others wait in line
export function onCallId(lanes: LaneView[], mode: RunMode, approved: boolean): string | null {
  const running = lanes.filter((l) => laneFlags(l, mode, approved).running);
  return (running.find((l) => l.status !== "queued" && l.active) ?? running.find((l) => l.status !== "queued") ?? null)?.id ?? null;
}

export const isBooked = (lane: Pick<Lane, "booking">) => lane.booking?.status === "done";

// one state word per kitchen, in the order a person cares about: booked beats matched
// current: this kitchen is the one Fo is on (false puts a running kitchen in line as Up next)
// waiting: Fo's question for this kitchen is answered elsewhere on the page, so the row stays neutral
export function ringState(lane: LaneView, f: LaneFlags, approved: boolean, opts: { current?: boolean; waiting?: boolean } = {}): RingState {
  const r = lane.result;
  const base = { value: null, working: false, pulse: false, booked: false };
  if (lane.status === "needs_you" && opts.waiting) return { ...base, tone: "wait", word: "Waiting for your OK", dot: "you" };
  if (lane.status === "needs_you") return { ...base, tone: "you", word: "Needs you", pulse: true, dot: "you" };
  if (r && isBooked(lane) && (r.state === "matched" || r.state === "needs_review") && lane.reconfirm?.status !== "not_reconfirmed")
    return { ...base, tone: "matched", word: lane.reconfirm?.status === "reconfirmed" ? "Booked and reconfirmed" : "Booked", booked: true };
  if (r && lane.reconfirm?.status === "not_reconfirmed") return { ...base, tone: "nomatch", word: "Not reconfirmed" };
  // no verdict word until the rule decides: Jev's first read stays in the working ring
  if (f.previewing) return { ...base, tone: "work", word: STATUS_LABEL.deciding, working: true };
  if (r) {
    const glyph = r.state === "no_answer" ? NO_ANSWER_GLYPH : r.state === "declined" ? DECLINED_GLYPH : undefined;
    return { ...base, tone: RESULT_META[r.state].tone, word: RESULT_META[r.state].label, value: r.state === "matched" ? lowestConfidence(r) : null, glyph };
  }
  if (!approved) return { ...base, tone: "quiet", word: "Not called yet", dot: "hollow" };
  if (lane.skipped && lane.status === "done") return { ...base, tone: "quiet", word: "Not called", dot: "hollow" };
  if (f.running && opts.current === false) return { ...base, tone: "wait", word: "Up next", dot: "hollow" };
  if (f.running) return { ...base, tone: "work", word: liveWord(lane, f.replay), working: true, pulse: true };
  if (lane.status === "error" || f.replayStopped) return { ...base, tone: "nomatch", word: "Stopped", glyph: CircleAlert };
  if (lane.status === "fo_still_working") return { ...base, tone: "chef", word: "Fo still working", glyph: "dot" };
  if (lane.status === "done") return { ...base, tone: "quiet", word: "No call made", glyph: NO_ANSWER_GLYPH };
  return { ...base, tone: "work", word: STATUS_LABEL[lane.status], working: true };
}

// one plain line under the state word: why, or what is happening now. Null when it would repeat the state word
export function laneLine(lane: LaneView, f: LaneFlags): string | null {
  if (f.running) {
    if (lane.status === "deciding") return DECIDING_LINE;
    if (!lane.result) return null; // the state word already says what Fo is doing
    if (lane.reconfirm?.status === "requested") return "Reconfirming with the kitchen";
    if (lane.booking?.status === "requested") return "Booking and sending the allergy note";
    return liveWord(lane, f.replay);
  }
  if (lane.status === "fo_still_working") return sentence(engineText(lane.progress)) || null;
  if (lane.status === "needs_you") return null;
  if (f.replayStopped && !lane.error) return "This sample stopped when CrossCheck restarted";
  const rc = lane.reconfirm;
  if (rc) {
    if (rc.status === "requested") return "Reconfirming with the kitchen";
    if (rc.status === "reconfirmed") return rc.at ? `Same answers today, ${new Date(rc.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : "Same answers today";
    if (rc.status === "not_reconfirmed") return "Not reconfirmed today. Read why before you go";
    if (rc.status === "needs_review") return "Same answers today. Read each quote to finish";
    return "The reconfirm call did not finish";
  }
  const b = lane.booking;
  if (b) {
    if (b.status === "done") return f.replay ? "Sample. No note was sent" : f.test ? "Fo was asked to email you the note" : "Fo was asked to send the allergy note";
    if (b.status === "needs_you") return "Did Fo book it? Fo needs your answer";
    if (b.status === "failed") return "Not booked. You can book again";
    return "Booking requested";
  }
  if (lane.result) return rowReason(lane.result);
  // the list says once why the rest were not called
  if (lane.skipped && lane.status === "done") return null;
  if (lane.error) return null;
  const p = sentence(engineText(lane.progress));
  return p || null;
}
