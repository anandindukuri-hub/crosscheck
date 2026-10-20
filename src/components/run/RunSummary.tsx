"use client";

import { CalendarCheck, ChevronRight, Info, Wallet } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useId, useState } from "react";
import { tableCard } from "@/lib/lanes";
import type { LaneResultState, Run, RunMode } from "@/lib/types";
import { buttonClass } from "../kit/button";
import { ConfidenceRing } from "../kit/ConfidenceRing";
import { Spinner } from "../kit/Spinner";
import { whenPhrase, whenText } from "../kit/typo";
import { useMedia } from "../kit/useMedia";
import { OrderOnly } from "./evidence/OrderOnly";
import { Button } from "../ui";
import { bookedNote, bookedUnder, DECIDING_LINE, isBooked, laneFlags, lowestConfidence, onCallId, SETTLED, type LaneView } from "./laneState";
import { clockText, pctText, readBackBy, reconfirmWindow } from "./plain";
import { useLaneAct } from "./useLaneAct";

const ORDER: (LaneResultState | "booked")[] = ["booked", "matched", "needs_review", "needs_chef", "not_matched", "no_answer", "declined"];
const COUNT: Record<string, (n: number) => string> = {
  booked: (n) => `${n} booked`,
  matched: (n) => `${n} matched`,
  needs_review: (n) => `${n} ready for review`,
  needs_chef: (n) => `${n} ${n === 1 ? "needs" : "need"} the chef`,
  not_matched: (n) => `${n} did not match`,
  no_answer: (n) => `${n} with no answer yet`,
  declined: (n) => `${n} declined`,
};

export function bestMatch(lanes: LaneView[]) {
  const score = (l: LaneView) => {
    const s = l.result?.state;
    if (s !== "matched" && s !== "needs_review") return -1;
    if (tableCard(l).kind === "blocked") return -1;
    // the kitchen booked (or being booked) for this table always leads: the table gets one booking
    return (s === "matched" ? 10 : 0) + (l.reconfirm?.status === "reconfirmed" ? 3 : 0) + (l.booking && l.booking.status !== "failed" ? 20 : 0);
  };
  return lanes.map((l) => ({ l, s: score(l) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s)[0]?.l ?? null;
}

// Fo has the request but has not dialed: it reads the request, then asks you once before the call
const reading = (l: LaneView | null) => !!l && l.phase === "call" && !l.reports.length && !l.events.some((e) => e.kind === "you");

// The whole run as an outcome first ("Tamarind Table is booked."), then a quiet line with the rest
export function summaryLine(lanes: LaneView[], mode: RunMode, approved: boolean): { head: string; rest: string | null; running: boolean; progress: number } {
  const best = bestMatch(lanes);
  const onCall = lanes.find((l) => l.id === onCallId(lanes, mode, approved)) ?? null;
  const running = lanes.filter((l) => laneFlags(l, mode, approved).running);
  const waiting = running.filter((l) => l.id !== onCall?.id).length;
  const you = lanes.filter((l) => l.status === "needs_you").length;
  const kitchens = (n: number) => `${n} ${n === 1 ? "kitchen" : "kitchens"}`;
  // a sample never calls anyone: it plays each kitchen's script
  const replay = mode === "replay";
  const callingAt = (l: LaneView) =>
    l.phase === "callback"
      ? replay
        ? `Playing the chef’s answer from ${l.restaurant.name}`
        : `Calling the chef at ${l.restaurant.name}`
      : replay
        ? `Playing the ${l.restaurant.name} sample`
        : `Calling ${l.restaurant.name}`;

  let head: string;
  let subject: LaneView | null = null;
  let lineUp = false;
  if (best && isBooked(best)) {
    subject = best;
    head = best.reconfirm?.status === "reconfirmed" ? `${best.restaurant.name} is booked and reconfirmed.` : `${best.restaurant.name} is booked.`;
  } else if (best && best.result?.state === "matched") {
    subject = best;
    head = `${best.restaurant.name} matched every check.`;
  } else if (best) {
    subject = best;
    head = `${best.restaurant.name} is ready for your review.`;
  } else if (onCall && reading(onCall)) {
    // the promise on Step 1 was that Fo asks once more before it dials, so this never says "Calling" yet
    head = replay ? "Getting the sample ready." : "Fo is reading your request.";
    lineUp = true;
  } else if (onCall?.status === "deciding") head = `Checking ${onCall.restaurant.name}’s answers.`;
  else if (onCall) head = replay ? `${callingAt(onCall)}.` : `${callingAt(onCall)}${onCall.phase === "callback" ? "" : " now"}.`;
  else if (you) head = `Fo needs your OK for ${kitchens(you)}.`;
  else if (lanes.length && lanes.every((l) => l.result || SETTLED.has(l.status))) head = "No kitchen matched yet.";
  else head = replay ? "Getting the sample ready." : "Getting ready to call.";

  const counts = new Map<string, number>();
  for (const l of lanes) {
    if (l === subject || l === onCall || l.status === "needs_you" || !l.result) continue;
    const k = isBooked(l) ? "booked" : l.result.state;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const parts: string[] = [];
  if (onCall?.status === "deciding" && onCall !== subject) {
    // the answers are in and being checked: never a verdict word before the rule decides, never "Calling"
    parts.push(head.includes(onCall.restaurant.name) ? DECIDING_LINE : `Checking ${onCall.restaurant.name}’s answers`);
  } else if (lineUp) parts.push(`${kitchens(running.length)} in line`);
  else if (onCall && onCall === subject) parts.push(onCall.phase === "reconfirm" ? "Reconfirming now" : onCall.phase === "booking" ? "Booking now" : "Fo is on it now");
  else if (onCall && !head.startsWith(callingAt(onCall))) parts.push(callingAt(onCall));
  if (waiting && !lineUp) parts.push(`${waiting} waiting in line`);
  if (you && !head.startsWith("Fo needs")) parts.push(`Fo needs your OK for ${you} more ${you === 1 ? "kitchen" : "kitchens"}`);
  for (const k of ORDER) {
    const n = counts.get(k);
    if (!n) continue;
    parts.push(k === "matched" && subject?.result?.state === "matched" ? `${n} more matched` : COUNT[k](n));
  }
  const notCalled = lanes.filter((l) => l.skipped && !l.result && l.status === "done").length;
  if (notCalled) parts.push(`${notCalled} not called`);
  const settled = lanes.filter((l) => l.result || SETTLED.has(l.status)).length;
  return { head, rest: parts.length ? parts.join(" · ") : null, running: running.length > 0, progress: lanes.length ? settled / lanes.length : 0 };
}

export function RunSummary({ lanes, mode, approved, hidden }: { lanes: LaneView[]; mode: RunMode; approved: boolean; hidden: boolean }) {
  const s = summaryLine(lanes, mode, approved);
  return (
    <div className={hidden ? "sr-only" : ""}>
      <p className="text-[21px] leading-[1.2] font-semibold tracking-[-0.01em] [text-wrap:balance] md:text-[24px] md:tracking-[-0.02em] lg:text-[28px]" aria-live="polite">
        {s.head}
      </p>
      {s.rest && (
        <p className="type-callout mt-1.5 text-ink-2">
          <Facts items={s.rest.split(" · ")} />
        </p>
      )}
      {s.running && (
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-fill-2 lg:hidden" role="progressbar" aria-label="Calls finished" aria-valuenow={Math.round(s.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <motion.div className="h-full rounded-full bg-ink-3" initial={false} animate={{ width: `${Math.max(4, s.progress * 100)}%` }} transition={{ type: "spring", stiffness: 140, damping: 22 }} />
        </div>
      )}
    </div>
  );
}

// Counts that wrap as whole items. Every item carries its dot in front, and the row sits 16px to the left inside a
// clipping box, so the dot of whichever item starts a line falls outside it: a line never starts or ends on a dot
export function Facts({ items }: { items: string[] }) {
  return (
    <span className="block overflow-hidden">
      <span className="-ml-4 flex flex-wrap">
        {items.map((x) => (
          <span key={x} className="relative pl-4 whitespace-nowrap before:absolute before:left-[5px] before:content-['·']">
            {x}
          </span>
        ))}
      </span>
    </span>
  );
}

// The best kitchen as its own card. quiet: while Fo still waits on a question, the card's filled button steps back to tinted
// quiet: another filled button is on the page (Fo waits on an OK), so Book steps back to tinted.
// early: other kitchens are still being called, so Book says it can happen now or later
export function BestMatch({
  run,
  lane,
  alsoMatched = [],
  table,
  quiet,
  early,
  onOpen,
  onBook,
  onChange,
}: {
  run: Run;
  lane: LaneView;
  alsoMatched?: string[]; // other kitchens that matched too, so the card says why this one leads
  table: LaneView[]; // every kitchen in the run: Book hides once another one is booked for this table
  quiet: boolean;
  early: boolean;
  onOpen: () => void;
  onBook: () => void;
  onChange: () => void;
}) {
  const { act, busy, err } = useLaneAct(run.id, lane.id, onChange);
  const f = laneFlags(lane, run.mode, !!run.approvedAt, table);
  const matched = lane.result?.state === "matched";
  const booked = isBooked(lane);
  const rc = lane.reconfirm;
  const conf = lowestConfidence(lane.result);
  const canBook = f.canBook;
  const canReconfirm = booked && f.canStartReconfirm;
  const passOk = booked && f.card.kind === "ok";
  const when = whenText(run.when);
  const [why, setWhy] = useState(false);
  const whyId = useId();
  const wide = useMedia("(min-width: 1024px)");

  if (booked) {
    const reconfirmed = rc?.status === "reconfirmed";
    // reconfirm leads only from three hours before the table; until then the pass is the one filled button
    const { opens, open: inWindow } = reconfirmWindow(run.when, run.createdAt);
    const reconfirmFirst = canReconfirm && (inWindow || !passOk);
    return (
      <motion.section layout aria-labelledby="best-h" className="card overflow-hidden" initial={false}>
        <div className="flex min-h-11 items-center gap-2 bg-matched-tint px-5 py-2.5 text-[15px] leading-[1.3] font-semibold text-matched md:px-6">
          <CalendarCheck size={18} strokeWidth={2} aria-hidden className="shrink-0" />
          <span className="[text-wrap:balance]">
            {reconfirmed ? "Reconfirmed today" : "Booked"} · <span className="whitespace-nowrap">{when}</span>
          </span>
        </div>
        <div className="px-5 pt-4 pb-5 md:px-6">
          <button type="button" onClick={onOpen} className="group flex w-full items-center gap-3 rounded-control text-left">
            <span className="min-w-0 flex-1">
              <span id="best-h" className="type-title block [overflow-wrap:anywhere]">
                {lane.restaurant.name}
              </span>
              <span className="type-callout mt-1 block text-ink-2">
                Table for {run.partySize} {whenPhrase(run.when)}{bookedUnder(run) ? ` under ${bookedUnder(run)}` : ""}. {bookedNote(run.mode)}
                {reconfirmed && rc ? ` Same answers at ${clockText(new Date(rc.at))}.` : ""}
              </span>
            </span>
            <ChevronRight size={18} strokeWidth={1.75} aria-hidden className="shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" />
          </button>
          {reconfirmFirst ? (
            <div className="mt-4">
              <Button size="lg" variant={quiet ? "tinted" : "primary"} onClick={() => act({ action: "reconfirm" })} disabled={busy} className="w-full">
                Reconfirm now
              </Button>
              <div className="type-footnote mt-2 text-center text-ink-2">
                <p className="[text-wrap:balance]">Fo calls back in case the menu or the cook changed.</p>
                {passOk && (
                  <Link href={`/card/${run.id}/${lane.id}`} className="mx-auto flex min-h-11 w-fit items-center px-2 font-medium text-link hover:underline">
                    Open table pass
                  </Link>
                )}
              </div>
            </div>
          ) : (
            passOk && (
              <div className="mt-4">
                <Link href={`/card/${run.id}/${lane.id}`} className={`${buttonClass(quiet ? "tinted" : "primary", "lg")} w-full`}>
                  <Wallet size={18} strokeWidth={1.75} aria-hidden />
                  Open table pass
                </Link>
                {canReconfirm && (
                  <div className="type-footnote mt-2 text-center text-ink-2">
                    <p className="[text-wrap:balance]">{opens ? `Reconfirm after ${clockText(opens).replace(":00", "")}, when the cook for your table is in.` : "Reconfirm on the day, when the cook for your table is in."}</p>
                    <button type="button" onClick={() => act({ action: "reconfirm" })} disabled={busy} className="mx-auto flex min-h-11 w-fit items-center px-2 font-medium text-link hover:underline disabled:text-ink-3">
                      Reconfirm now
                    </button>
                  </div>
                )}
              </div>
            )
          )}
          {err && (
            <p role="alert" className="type-callout mt-2 text-nomatch">
              {err}
            </p>
          )}
        </div>
      </motion.section>
    );
  }

  const pending = lane.booking?.status === "requested";
  return (
    <motion.section layout aria-labelledby="best-h" className="card px-5 pt-5 pb-5 md:px-6" initial={false}>
      <div className="flex items-start gap-4">
        <ConfidenceRing tone={matched ? "matched" : "review"} value={conf} size={wide ? 64 : 56} hideValue label={matched ? "Best match" : "Ready for your review"} />
        <div className="min-w-0 flex-1">
          <p className="type-footnote font-medium text-ink-2">{matched ? "Best match" : "Ready for your review"}</p>
          <button type="button" onClick={onOpen} className="group flex w-full items-center gap-2 rounded-control text-left">
            <span id="best-h" className="type-title min-w-0 flex-1 [overflow-wrap:anywhere]">
              {lane.restaurant.name}
            </span>
            <ChevronRight size={18} strokeWidth={1.75} aria-hidden className="shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" />
          </button>
          {matched && alsoMatched.length > 0 && (
            <p className="type-footnote mt-0.5 text-ink-2">
              {isBooked(lane) ? "Booked." : "First in line."} {alsoMatched.join(" and ")} also matched.
            </p>
          )}
          <p className="type-callout mt-1 text-ink-2">
            {lane.booking?.status === "needs_you"
              ? "Fo needs your answer about the booking."
              : lane.booking?.status === "failed"
                ? "The booking did not finish. You can book again."
                : pending
                  ? "Fo is booking the table and sending the allergy note."
                  : matched
                    ? `All ${lane.result?.checks.length ?? 0} checks passed for the dishes the kitchen suggested.`
                    : "Answers look clear. Read each quote, then book."}
          </p>
          {matched && (
            <p className="type-footnote mt-1 text-ink-2">
              Claude and Jev read every answer the same way. {readBackBy(lane)} heard Fo repeat the answers and said they were right.
              <button
                type="button"
                onClick={() => setWhy((w) => !w)}
                aria-expanded={why}
                aria-controls={whyId}
                aria-label="What this means"
                className="-my-3 ml-0.5 inline-grid h-8 w-7 place-items-center rounded-full align-middle text-ink-3 hover:text-ink"
              >
                <Info size={15} strokeWidth={1.75} aria-hidden />
              </button>
            </p>
          )}
        </div>
      </div>
      <AnimatePresence initial={false}>
        {why && (
          <motion.p
            id={whyId}
            className="type-footnote overflow-hidden text-ink-2"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
          >
            <span className="mt-3 block rounded-input bg-page px-3.5 py-2.5">
              {conf != null && <span className="block font-semibold text-ink">{pctText(conf)} sure it heard right</span>}
              This is how sure CrossCheck is that it heard each answer right. It is not a promise about the food. Anything unsure goes back to the chef.
            </span>
          </motion.p>
        )}
      </AnimatePresence>
      {matched && lane.result && (
        <div className="mt-4 border-t border-hairline pt-4">
          <OrderOnly diners={run.diners} r={lane.result} bare />
        </div>
      )}
      {pending ? (
        <Button size="lg" variant={quiet ? "tinted" : "primary"} disabled aria-busy="true" className="mt-4 w-full">
          <Spinner />
          Booking
        </Button>
      ) : (
        canBook && (
          <>
            <Button size="lg" variant={quiet ? "tinted" : "primary"} onClick={matched ? onBook : onOpen} className="mt-4 w-full">
              {matched ? `Book ${lane.restaurant.name}${early ? " now" : ""}` : "Review the answers"}
            </Button>
            {early && matched && (
              <p className="type-footnote mt-2 text-center text-ink-2">
                {run.stopAtFirstMatch ? "Calls already under way finish. You can book now or wait." : "Fo keeps calling the others. You can book now or wait."}
              </p>
            )}
          </>
        )
      )}
    </motion.section>
  );
}
