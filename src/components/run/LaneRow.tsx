"use client";

import { ChevronRight } from "lucide-react";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { useState } from "react";
import { followUpLost } from "@/lib/lanes";
import type { RunMode } from "@/lib/types";
import { ConfidenceRing } from "../kit/ConfidenceRing";
import { TONE } from "../kit/State";
import { engineText } from "../kit/typo";
import { AskYou } from "./AskYou";
import { laneFlags, laneLine, ringState, type LaneView } from "./laneState";
import { useLaneAct } from "./useLaneAct";

// the state word: the old one lifts away over 160ms, the new one rises over 200ms from 80ms in, both after the
// ring's delay. Reduced motion keeps only the fade (MotionConfig in the shell)
const WORD: Variants = {
  enter: { opacity: 0, y: 6 },
  show: (d: number) => ({ opacity: 1, y: 0, transition: { duration: 0.2, ease: "easeOut" as const, delay: d + 0.08 } }),
  leave: (d: number) => ({ opacity: 0, y: -6, transition: { duration: 0.16, ease: "easeIn" as const, delay: d } }),
};

// what a lane looked like when the page first saw it; the verdict moment plays only when this changes
export const verdictKey = (l: LaneView) => `${l.result?.decidedAt ?? ""}|${l.booking?.status ?? ""}|${l.reconfirm?.status ?? ""}|${l.status === "needs_you" ? "you" : ""}`;

// the state word's own color, with quiet states in secondary ink so the word stays readable
export const wordColor = (tone: string) => (tone === "quiet" || tone === "work" || tone === "wait" ? "var(--ink-2)" : TONE[tone as keyof typeof TONE].fg);

// how Fo's question shows on this row: inline (the one ask on the page with a filled button), as a Review link
// (one by one, waiting its turn) or not at all (the grouped card above asks for it)
export type AskMode = "inline" | "review" | "none";

// One kitchen, as a row in an inset grouped list: ring, name, state word, one reason. Tap for the evidence.
export function LaneRow({
  runId,
  lane,
  mode,
  approved,
  first,
  ask,
  current,
  flash,
  onChange,
  onOpen,
}: {
  runId: string;
  lane: LaneView;
  mode: RunMode;
  approved: boolean;
  first: boolean;
  ask: AskMode;
  current: boolean;
  flash: number; // bumps when the sheet for this row closes: the row fades from a light gray, like iOS deselecting
  onChange: () => void;
  onOpen: () => void;
}) {
  const f = laneFlags(lane, mode, approved);
  const ring = ringState(lane, f, approved, { current, waiting: ask !== "inline" });
  const { act, busy, err } = useLaneAct(runId, lane.id, onChange);
  const line = laneLine(lane, f);
  const [seen] = useState(() => verdictKey(lane));
  const fresh = verdictKey(lane) !== seen;
  // the number lives in the sheet's header ring, where it is explained; a row says the state
  const ringLabel = ring.word;
  const quietWord = ring.tone === "work" || ring.tone === "wait";

  return (
    <li id={`lane-${lane.id}`} aria-labelledby={`name-${lane.id}`} className="relative scroll-mt-32">
      {!first && <span aria-hidden className="absolute top-0 right-0 left-[72px] h-px bg-hairline" />}
      {flash > 0 && (
        <motion.span
          key={flash}
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-black/[0.06]"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      )}
      <div className="relative flex min-h-[76px] items-center gap-4 py-3 pr-3 pl-4 transition-colors hover:bg-fill/40 md:pr-4">
        {ring.dot ? (
          <SlotDot kind={ring.dot} pulse={ring.pulse} label={ring.word} />
        ) : (
          <ConfidenceRing
            key={lane.result?.decidedAt ?? ring.word}
            tone={ring.tone}
            // a final match draws a closed ring: the number lives only in the evidence sheet
            value={ring.tone === "matched" && ring.value != null ? 1 : ring.value}
            working={ring.working}
            booked={ring.booked}
            glyph={ring.glyph}
            size={40}
            label={ringLabel}
            animate={fresh}
            hideValue
          />
        )}
        <div className="min-w-0 flex-1">
          <h3 id={`name-${lane.id}`} className="text-[17px] leading-[1.3] font-semibold tracking-[-0.01em]">
            <button
              id={`open-${lane.id}`}
              type="button"
              onClick={onOpen}
              aria-haspopup="dialog"
              aria-describedby={`state-${lane.id} line-${lane.id}`}
              className="block max-w-full truncate text-left outline-none after:absolute after:inset-1 after:z-[1] after:rounded-[14px] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-accent"
            >
              {lane.restaurant.name}
            </button>
          </h3>
          {/* one fixed 20px box: the old word is popped out of the layout as it leaves, so the two never draw over each other */}
          <p id={`state-${lane.id}`} className={`relative h-[20px] overflow-hidden text-[15px] leading-[20px] ${quietWord ? "font-normal" : "font-semibold"}`}>
            <AnimatePresence initial={false} mode="popLayout" custom={fresh && lane.result ? 0.42 : 0}>
              <motion.span
                key={ring.word}
                className="absolute inset-0 truncate"
                style={{ color: wordColor(ring.tone) }}
                custom={fresh && lane.result ? 0.42 : 0}
                variants={WORD}
                initial="enter"
                animate="show"
                exit="leave"
              >
                {ring.word}
              </motion.span>
            </AnimatePresence>
          </p>
          {line && (
            <p id={`line-${lane.id}`} className="type-footnote mt-0.5 line-clamp-2 text-ink-2 [overflow-wrap:anywhere]">
              {line}
            </p>
          )}
          {lane.error && <p className="type-footnote mt-0.5 text-nomatch">{engineText(lane.error)}</p>}
        </div>
        {lane.status === "needs_you" && ask === "review" ? (
          <span className="type-callout pointer-events-none shrink-0 font-medium text-link" aria-hidden>
            Review
          </span>
        ) : (
          <ChevronRight size={18} strokeWidth={1.75} aria-hidden className="shrink-0 text-ink-3" />
        )}
      </div>
      {lane.status === "needs_you" && ask === "inline" && (
        <div className="relative z-[2] pr-4 pb-4 pl-4 sm:pl-[72px]">
          <AskYou question={lane.foQuestion} busy={busy} act={act} laneId={lane.id} sendAgain={f.sendAgain} lost={!!lane.pending && followUpLost(lane.pending, mode)} booked={f.bookedAsk} working={!f.idle} />
        </div>
      )}
      {err && (
        <p role="alert" className="type-callout relative z-[2] pr-4 pb-4 pl-4 text-nomatch sm:pl-[72px]">
          {err}
        </p>
      )}
    </li>
  );
}

// a kitchen before its call: a 10px dot in the 40px slot, never a ring that reads as a radio button
export function SlotDot({ kind, pulse = false, label }: { kind: "hollow" | "you"; pulse?: boolean; label: string }) {
  return (
    <span role="img" aria-label={label} className="grid h-10 w-10 shrink-0 place-items-center">
      <span
        className={`block h-2.5 w-2.5 rounded-full ${kind === "you" ? `bg-you ${pulse ? "live-dot" : ""}` : "shadow-[inset_0_0_0_1.5px_var(--ink-3)]"}`}
      />
    </span>
  );
}
