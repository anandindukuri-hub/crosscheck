import { checkTopic } from "./checks";
import type { TurnOutcome } from "./fo/turn";
import { UNDERWAY } from "./report";
import { THRESHOLD } from "./rules";
import type { ChoiceDecision, Lane, LanePreview, LaneResult, Reconfirm, Run, RunMode } from "./types";

// Lane rules shared by the engine and the ticket, so a button never offers what the server refuses

// a new reconfirm only when there is none yet or the last one did not finish
export const canStartReconfirm = (rc: Reconfirm | null | undefined) => !rc || rc.status === "failed";

// what earlier reconfirms in this lane said that still stands
export function reconfirmDoubts(lane: Pick<Lane, "reconfirmHistory">): string[] {
  const out: string[] = [];
  for (const h of lane.reconfirmHistory ?? []) {
    if (h.status === "not_reconfirmed") out.push(...h.reasons);
    for (const v of h.result?.checks ?? []) {
      if (v.outcome !== "pass") out.push(`The answer about ${checkTopic(v)} did not pass on an earlier reconfirm${v.quote ? ` ("${v.quote}")` : ""}`);
    }
  }
  return [...new Set(out)];
}

export type TableCard = { kind: "ok" } | { kind: "none"; why: string } | { kind: "blocked"; reasons: string[] };

// A card only for answers that still hold: matched or reviewed quote by quote (book() checks the ticks)
export function tableCard(lane: Pick<Lane, "result" | "booking" | "reconfirm" | "reconfirmHistory">): TableCard {
  const r = lane.result;
  if (!r || !(r.state === "matched" || r.state === "needs_review")) {
    return { kind: "none", why: "A table pass is made only for a kitchen that matched every check or one you read quote by quote." };
  }
  if (r.state === "needs_review" && !lane.booking) return { kind: "none", why: "Read every quote and book first. The table pass comes after that." };
  const rc = lane.reconfirm;
  const reasons = [...new Set([...(rc?.status === "not_reconfirmed" ? rc.reasons : []), ...reconfirmDoubts(lane)])];
  if (rc?.status === "not_reconfirmed" || reasons.length) return { kind: "blocked", reasons: reasons.length ? reasons : ["Today's answers changed from before"] };
  return { kind: "ok" };
}

// live only: shown until the restaurant's yes is ticked, also after approval for kitchens from memory
export const agreedBoxShown = (mode: RunMode, approved: boolean, agreed: boolean) => mode === "live" && (!approved || !agreed);

// live only: Fo phones the kitchen for a call or a booking, so it waits until the restaurant's yes is ticked
export function agreedMissing(mode: RunMode, lanes: Pick<Lane, "id" | "restaurant">[], agreedIds: string[]): string | null {
  if (mode !== "live") return null;
  const missing = lanes.filter((l) => !agreedIds.includes(l.id)).map((l) => l.restaurant.name);
  return missing.length ? `Tick "restaurant agreed" for: ${missing.join(", ")}` : null;
}

// a live booking phones the kitchen, so a kitchen from memory still needs its "restaurant agreed" tick
export const bookAgreedBlocked = (run: Pick<Run, "mode">, lane: Pick<Lane, "id" | "restaurant" | "agreed">) =>
  agreedMissing(run.mode, [lane], lane.agreed ? [lane.id] : []);

// ---- a Fo conversation CrossCheck never learned ----

// ask_fo with no conversationId and no newConversation continues Fo's latest conversation, which may be
// another kitchen's. So a follow up (an answer, a resend of one) needs this lane's own conversation
export const followUpLost = (opts: { conversationId?: string | null; newConversation?: boolean }, mode: RunMode) =>
  mode !== "replay" && !opts.conversationId && !opts.newConversation;

export const LOST_CONVERSATION =
  "CrossCheck lost track of this Fo conversation and did not send your answer. Sent now, it could land in another kitchen's conversation. Answer Fo in your Fo app, then tap Fo has it.";

// the answer stays unsent. Fo has it then ends the lane on the Fo app (or the booking card), No, stop ends it here
export function lostConversationStep(l: Lane, message: string) {
  const asked = l.foQuestion?.trim();
  l.status = "needs_you";
  l.error = null;
  l.pending = { message, conversationId: null, newConversation: false, uncertain: true };
  l.foQuestion = asked?.startsWith(LOST_CONVERSATION) ? asked : `${LOST_CONVERSATION}${asked ? `\n\nFo asked: ${asked}` : ""}`;
  l.progress = "Answer Fo in your Fo app";
}

export const NO_CONVERSATION =
  "Fo took this request but gave back no conversation. CrossCheck cannot follow it or read what Fo reports. Follow it in your Fo app, then tap Fo has it. Tap No, stop to end it here.";

// ask_fo took a new request with no conversationId while Fo works on it. Nothing is read or decided from
// another conversation: the lane waits on the Fo app with Fo has it and No, stop, like a lost follow up
export function noConversationStep(l: Lane, message: string, progress: string) {
  l.status = "needs_you";
  l.error = null;
  l.pending = { message, conversationId: null, newConversation: false, uncertain: true };
  l.foQuestion = `${NO_CONVERSATION}${progress.trim() ? `\n\nFo said: ${progress.trim()}` : ""}`;
  l.progress = "Follow this in your Fo app";
}

type TableLane = Pick<Lane, "id" | "restaurant" | "booking">;

// One kitchen per table: another lane's booking that is requested, waiting on Anand or done blocks this one
export function tableBooked(lane: { id?: string }, table: TableLane[]): string | null {
  const other = table.find((o) => o.id !== lane.id && o.booking && o.booking.status !== "failed");
  if (!other?.booking) return null;
  const name = other.restaurant.name;
  return other.booking.status === "done"
    ? `${name} is already booked for this table. CrossCheck books one kitchen per table.`
    : `${name} is being booked for this table. CrossCheck books one kitchen per table.`;
}

// Book only after approval, also for kitchens from memory. The server refuses and the ticket hides Book for the same reasons.
// table: every lane in the run. A second kitchen is never booked for the same party and time
export function bookBlocked(lane: Pick<Lane, "result" | "booking"> & { id?: string }, approved: boolean, reviewed: boolean, table: TableLane[] = []): string | null {
  const st = lane.result?.state;
  if (!approved) return "Approve the run first. Booking comes after you approve the calls.";
  if (!(st === "matched" || (st === "needs_review" && reviewed))) return st === "needs_review" ? "Tick that you read every quote first" : "Only a restaurant that matched your checks can be booked";
  if (lane.booking && lane.booking.status !== "failed") return "Booking already requested";
  return tableBooked(lane, table);
}

// Book on the ticket: what the server allows, on an idle lane that finished
export const bookShown = (lane: Pick<Lane, "result" | "booking" | "status"> & { id?: string }, approved: boolean, idle: boolean, table: TableLane[] = []) =>
  !bookBlocked(lane, approved, true, table) && idle && (lane.status === "done" || (lane.status === "error" && lane.booking?.status === "failed"));

// a booking wait is short so one slow booking never holds the queue; calls keep the long limit
export const LANE_CEILING_MS = 20 * 60_000;
export const waitCeiling = (phase: Lane["phase"], mode: RunMode) => (phase !== "booking" ? LANE_CEILING_MS : mode === "live" ? 5 * 60_000 : 3 * 60_000);
// waiting on a report after "calling now" holds the queue too. It stops near 8 minutes and Resume takes over
export const REPORT_WAIT_MS = 8 * 60_000;
export const reportWait = (ceilingMs: number | undefined) => Math.min(ceilingMs ?? LANE_CEILING_MS, REPORT_WAIT_MS);

const NOT_BOOKED =
  /\b(not|no availability|no tables?|haven['’]?t|hasn['’]?t|can['’]?t|cannot|won['’]?t|couldn['’]?t|could not|unable|booked (up|out|solid)|completely booked|fully booked|wait ?list|declined|sorry|unfortunately|didn['’]?t|did not|wasn['’]?t able|was not able|failed)\b/i;
// "let you know once it's booked": the booked word is still to come
const PENDING = /\b(once|when|after|until|if)\b[^.]{0,40}\b(booked|reserved|confirmed)\b/i;

export type BookingStep = "ask" | "confirm" | "wait" | "not_booked" | "still_working" | "done";

// "calling them now, will report back once reserved" reads as finished but Fo is still at it
const stillAtIt = (kind: TurnOutcome["kind"], text: string) => kind === "underway" || (UNDERWAY.test(text) && PENDING.test(text));
// a confirmation in Fo's words never counts as not booked
// any sign a table may exist ("I reserved 8pm instead") keeps Book hidden and asks the user instead
const CONFIRMATION = /\b(confirm(ed|ation)|reserved|reservation|booked (you|us|it|a table|for)|got (you|us) a table|table for \d+)\b/i;

// What a finished Fo turn means while booking. Jev decides, code never guesses. done only on a sure
// booked_confirmed with no doubt in Fo's words, not_booked (Book again) only on a sure not_booked.
// Fo still at it is waited on, a real question gets the answer box and anything else goes to the card ("confirm")
export function bookingStep(kind: TurnOutcome["kind"], text = "", jev: ChoiceDecision | null = null): BookingStep {
  if (kind === "still_working") return kind;
  if (kind === "failed" || kind === "report") return "confirm";
  const sure = (choice: string) => !!jev && jev.choice === choice && jev.confidence >= THRESHOLD;
  const booked = sure("booked_confirmed") && !NOT_BOOKED.test(text) && !PENDING.test(text) && !UNDERWAY.test(text);
  if (kind === "question") return booked ? "done" : "ask";
  if (sure("asking_user")) return "ask";
  if (stillAtIt(kind, text)) return "wait";
  if (booked) return "done";
  if (sure("not_booked") && !CONFIRMATION.test(text)) return "not_booked";
  if (sure("still_in_progress")) return "wait";
  return "confirm";
}

// Fo's booking reply was not a clear yes, so Anand says whether the table is booked
export const bookingConfirmShown = (lane: Pick<Lane, "status" | "phase" | "booking">) =>
  lane.status === "needs_you" && lane.phase === "booking" && lane.booking?.status === "needs_you";

export const STILL_BOOKING = "Fo is still working on this booking";
const MID_TURN = new Set<Lane["status"]>(["queued", "calling", "waiting_report", "deciding", "fo_still_working"]);

// Not booked frees Book, so the card is answered only while Fo is not mid turn: no queued or running job, no wait
export function bookingAnswerBlocked(lane: Pick<Lane, "status" | "phase" | "booking">, jobBusy: boolean): string | null {
  if (jobBusy || (lane.phase === "booking" && MID_TURN.has(lane.status))) return STILL_BOOKING;
  return bookingConfirmShown(lane) ? null : "No booking is waiting on your answer";
}

export function askStep(l: Lane, text: string) {
  l.status = "needs_you";
  l.foQuestion = text.trim() || l.progress || "Fo is waiting for your answer.";
  l.progress = "Fo is asking you something";
}

// The "Did Fo book it?" card. fo is Fo's exact words, null when there are none to show
export function bookedCard(l: Lane, at: string, lead: string, fo: string | null, note?: string) {
  l.status = "needs_you";
  l.error = null;
  l.booking = { status: "needs_you", text: fo ?? l.booking?.text ?? "", at, ...(note ? { note } : {}) };
  l.foQuestion =
    fo === null
      ? `${lead} Then say whether the table is booked.`
      : `${lead} Read Fo's words and check your Fo app if you need to, then say whether the table is booked.\n\n${fo.trim() || "(Fo sent no words)"}`;
  l.progress = "Did Fo book it?";
}

const CARD_LEAD: Partial<Record<TurnOutcome["kind"], string>> = {
  report: "Fo sent back a call report, not a booking confirmation.",
  failed: "Fo stopped with an error before it confirmed the booking.",
};

// What settle writes for each booking step. Book comes back only on a sure not_booked from Jev
export function bookingSettled(l: Lane, step: BookingStep, out: Pick<TurnOutcome, "kind" | "text">, at: string) {
  if (step === "ask") return askStep(l, out.text);
  if (step === "confirm") return bookedCard(l, at, CARD_LEAD[out.kind] ?? "Fo did not clearly confirm the booking.", out.text);
  if (step === "wait") {
    l.status = "waiting_report";
    l.waitingOn = out.text;
    l.progress = "Fo is booking. Waiting for Fo to confirm.";
  } else if (step === "still_working") {
    l.status = "fo_still_working";
    l.progress = "Fo is still booking. It keeps going even if this page closes. Tap Resume to check again.";
  } else if (step === "not_booked") {
    l.status = "done";
    l.booking = { status: "failed", text: out.text, at, note: "Fo said it did not book. You can tap Book again." };
    l.progress = "Fo did not book it. You can tap Book again.";
  } else {
    l.status = "done";
    l.booking = { status: "done", text: out.text, at, ...(out.kind === "question" ? { note: "Fo also asked you something. Answer it in your Fo app if you want." } : {}) };
    l.progress = "Fo confirmed the booking";
  }
}

// a wait on "booking now" with no conversation to follow
export const NO_FOLLOW = "Fo says it is still booking. CrossCheck cannot follow this conversation. Tap Not booked only once your Fo app shows it did not book.";

export function bookingByYou(l: Lane, booked: boolean, at: string) {
  const fo = l.booking?.text ?? "";
  l.foQuestion = null;
  l.pending = null;
  l.status = "done";
  l.booking = booked ? { status: "done", text: fo, at, note: "Confirmed by you" } : { status: "failed", text: fo, at, note: "Not booked, you said. You can tap Book again." };
  l.progress = booked ? "Booking confirmed by you" : "Not booked. You can tap Book again.";
}

export const FINISH_IN_FO = "Finish this booking in the Fo app";
const MAYBE_WITH_FO = "You stopped here. Fo may already have this booking request. Check your Fo app and stop it there if you need to.";
const TOOK_IT = "You stopped here. Fo already had this booking request and may have booked the table.";
export const NOT_TOLD = "CrossCheck could not tell Fo to stop. Fo may still book this table. Stop it in your Fo app if you need to.";
export const MAYBE_HAS_IT = "You stopped here. Fo may already have this request. Stop it in your Fo app if you need to.";

// Anand saw the lost message in his Fo app: follow its conversation or leave the step to the Fo app when
// CrossCheck never learned the conversation. That ends on the card, so a second booking never goes out by itself
export function foHasItStep(l: Lane, at: string): "check_in" | "ended" {
  const p = l.pending;
  const convo = p && !p.newConversation ? p.conversationId : null;
  l.pending = null;
  l.foQuestion = null;
  l.error = null;
  if (convo) {
    l.conversationId = convo;
    // Fo has a message past the first request, so the call may be live
    l.goAhead ??= at;
    l.status = "queued";
    l.progress = "Queued: checking in with Fo";
    return "check_in";
  }
  if (l.phase === "booking") {
    bookedCard(l, at, "Fo has this booking request in a conversation CrossCheck cannot read. Follow it in your Fo app.", null, FINISH_IN_FO);
    return "ended";
  }
  l.status = "done";
  if (l.phase === "reconfirm") {
    l.reconfirm = { status: "failed", at, reasons: ["Fo has this reconfirm in a conversation CrossCheck cannot read. Follow it in the Fo app."] };
    l.progress = "Follow this reconfirm in the Fo app";
  } else {
    l.progress = "Fo has this request in a conversation CrossCheck cannot read. Follow it in the Fo app.";
  }
  return "ended";
}

// "No, stop" ends the lane. While booking Fo has or may have the request, so the lane ends on the card
// and Anand says whether the table is booked. Returns true when it ends on the card
export function stopLane(l: Lane, at: string): boolean {
  const lost = !!l.pending?.uncertain;
  // read before pending is cleared: Fo took a go ahead, may have a lost send or warned, so a call may be live
  const mayHave = foMayHaveIt(l);
  if (l.phase === "booking") {
    const fo = lost ? null : l.foQuestion;
    l.pending = null;
    if (lost) bookedCard(l, at, MAYBE_WITH_FO, null, MAYBE_WITH_FO);
    else bookedCard(l, at, TOOK_IT, fo, TOOK_IT);
    return true;
  }
  l.foQuestion = null;
  l.pending = null;
  l.status = "done";
  // Fo may have the request already, so the lane never says no call was made
  if (l.phase === "reconfirm") {
    const why = lost ? MAYBE_HAS_IT : "You stopped the reconfirm call.";
    l.reconfirm = { status: "failed", at, reasons: [why] };
    l.progress = why;
  } else {
    l.progress = mayHave ? MAYBE_HAS_IT : l.result ? "You stopped the callback." : "You declined. No call was made.";
  }
  return false;
}

// the stop never reached Fo: the card stays up and says Fo may still book
export function stopNotTold(l: Lane) {
  if (!bookingConfirmShown(l) || !l.booking) return;
  l.booking = { ...l.booking, note: NOT_TOLD };
  l.foQuestion = `${NOT_TOLD}\n\n${l.foQuestion ?? ""}`.trim();
}

const same = (s: string) => s.toLowerCase().replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();

// Resume read back the very reply the lane already waited on: Fo has nothing new, so Anand decides
// instead of the queue being held for another long wait
export const nothingNew = (lane: Pick<Lane, "status" | "waitingOn">, out: Pick<TurnOutcome, "kind" | "text">) =>
  lane.status === "fo_still_working" && !!lane.waitingOn?.trim() && out.kind !== "failed" && out.kind !== "still_working" && same(out.text) === same(lane.waitingOn);

export const UNCERTAIN_SEND: Record<Lane["phase"], string> = {
  call: "Fo may already have this call request. Check your Fo app. Tap Fo has it if it is there. Tap Send again only if it is not.",
  callback: "Fo may already have this chef callback request. Check your Fo app. Tap Fo has it if it is there. Tap Send again only if it is not.",
  booking: "Fo may already have this booking request. Check your Fo app. Tap Fo has it if it is there. Tap Send again only if it is not.",
  reconfirm: "Fo may already have this reconfirm request. Check your Fo app. Tap Fo has it if it is there. Tap Send again only if it is not.",
};

// ask_fo is about to take the message: until it answers Fo may have it, so a restart mid send looks it up
// or asks Anand instead of sending it blind. A returned error proves Fo refused it, so it may go again
export function sendingStep(l: Pick<Lane, "pending">) {
  if (l.pending) l.pending.uncertain = true;
}
export function refusedStep(l: Pick<Lane, "pending">) {
  if (l.pending) delete l.pending.uncertain;
}

// Fo may have the message after ask_fo threw, so only Anand can send it again
export const sendAgainShown = (lane: Pick<Lane, "status" | "pending">) => lane.status === "needs_you" && !!lane.pending?.uncertain;

// A saved message that never reached Fo is sent again, never swapped for whatever Fo said last.
// One that may have reached Fo is looked up in its conversation first or left to Anand when there is none
export function resumePlan(
  lane: Pick<Lane, "pending" | "status" | "reports" | "conversationId" | "phase">,
): "resend" | "check_sent" | "ask_resend" | "decide" | "restart_call" | "no_conversation" | "check_fo" {
  if (lane.pending?.uncertain) return lane.pending.conversationId && !lane.pending.newConversation ? "check_sent" : "ask_resend";
  if (lane.pending) return "resend";
  if (lane.status === "deciding" && lane.reports.length) return "decide";
  if (!lane.conversationId && lane.phase === "call" && !lane.reports.length) return "restart_call";
  if (!lane.conversationId) return "no_conversation";
  return "check_fo";
}

// ---- stop at first match ----

type SkipLane = Pick<Lane, "status" | "pending" | "phase" | "reports" | "result" | "skipped" | "calledAnyway" | "goAhead" | "events">;

// Fo turns that mean it may have begun the call without asking first. Only a plain question (or a failure) does not
const BEGAN = new Set(["underway", "other", "still_working", "report"]);
export const foBegan = (kind: string) => BEGAN.has(kind);

// Fo took your answer or began on its own, so a call may be live. Events cover lanes saved before the flag
const toldGo = (l: Pick<Lane, "goAhead" | "events">) => !!l.goAhead || l.events.some((e) => e.kind.startsWith("fo_") && foBegan(e.kind.slice(3)));

// Fo took the request or may have it (every lost or unanswered send leaves a warning), so it may have called from the Fo app
export const foMayHaveIt = (l: Pick<Lane, "goAhead" | "events" | "pending">) => toldGo(l) || !!l.pending?.uncertain || l.events.some((e) => e.kind === "warning");

// unsent: the first call request (or your yes to it) waits in the queue. firstAsk: Fo's first question waits on you
// and nothing went back to Fo yet, so skipping it sends Fo nothing
const unsent = (l: SkipLane) => l.status === "queued" && !!l.pending && !l.pending.uncertain;
const firstAsk = (l: SkipLane) => l.status === "needs_you" && !l.pending;

// a lane that has not started: unsent or at Fo's first question while its turn has not begun. Anything Fo already
// has or is working on finishes normally, like an answer asked mid call
export const notStarted = (l: SkipLane, active: boolean) =>
  !active && (unsent(l) || firstAsk(l)) && l.phase === "call" && !l.reports.length && !l.result && !l.skipped && !l.calledAnyway && !toldGo(l);

// the run counts once every lane is final and idle. A skipped lane is finished, it never gets a call
const FINAL = new Set(["done", "error", "fo_still_working"]);
export const runFinished = (lanes: Pick<Lane, "id" | "status" | "skipped">[], active: (id: string) => boolean) =>
  lanes.every((l) => (!!l.skipped && l.status === "done") || (FINAL.has(l.status) && !active(l.id)));

export function skipLane(l: Lane, matched: string, at: string) {
  l.status = "done";
  l.pending = null;
  l.foQuestion = null;
  l.error = null;
  l.skipped = { reason: `${matched} already matched.`, at };
  l.progress = `Not called. ${matched} already matched.`;
}

// the lanes a fresh match stops. None when the run calls everyone or the result is not a real match
export function lanesToSkip<L extends SkipLane & { id: string }>(run: Pick<Run, "stopAtFirstMatch">, winner: { id: string; result: LaneResult | null }, lanes: L[], active: (id: string) => boolean): L[] {
  if (!run.stopAtFirstMatch || winner.result?.state !== "matched") return [];
  return lanes.filter((l) => l.id !== winner.id && notStarted(l, active(l.id)));
}

// at approval a kitchen matched from memory means nobody else needs a call, when the run stops at the first match
export function approvalPlan<L extends Pick<Lane, "id" | "fromMemory" | "result">>(run: Pick<Run, "stopAtFirstMatch">, lanes: L[]): { call: L[]; skip: L[]; winner: L | null } {
  const toCall = lanes.filter((l) => !l.fromMemory);
  const winner = run.stopAtFirstMatch ? (lanes.find((l) => l.fromMemory && l.result?.state === "matched") ?? null) : null;
  return winner ? { call: [], skip: toCall, winner } : { call: toCall, skip: [], winner: null };
}

// Call anyway: only a lane that was skipped, after approval, while no job holds it
export function callAnywayBlocked(lane: Pick<Lane, "skipped" | "status">, approved: boolean, jobBusy: boolean): string | null {
  if (!approved) return "Approve the run first. Calls start after you send them to Fo.";
  if (!lane.skipped || lane.status !== "done") return "Only a kitchen that was not called can be called anyway";
  if (jobBusy) return "Fo is still busy with this restaurant";
  return null;
}

export function callAnywayStep(l: Lane, at: string, replay: boolean) {
  l.skipped = null;
  l.calledAnyway = at;
  l.status = "queued";
  l.foQuestion = null;
  l.error = null;
  l.progress = replay ? "DEV REPLAY queued" : "Queued for Fo";
}

// ---- instant Jev preview ----

// a preview only lands while the lane is still being weighed, so a late one never covers the real result
export function showPreview(l: Lane, p: LanePreview): boolean {
  if (l.status !== "deciding") return false;
  l.preview = p;
  l.progress = "Confirming with Claude";
  return true;
}

// the real result replaces any preview
export function landResult(l: Lane, result: LaneResult, email: string | null) {
  l.result = result;
  l.preview = null;
  l.status = "done";
  l.progress = result.headline;
  if (email) l.kitchenEmail = email;
}
