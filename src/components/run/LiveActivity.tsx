"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useIsClient, usePhone } from "../kit/useMedia";
import { liveStep, type LaneView } from "./laneState";
import { setLiveActive } from "./liveStore";

const SPRING = { type: "spring", stiffness: 380, damping: 32 } as const;
const LIVE = new Set(["calling", "waiting_report", "deciding"]);
const GLASS = { borderRadius: 999, background: "rgba(22,22,23,0.88)", backdropFilter: "saturate(180%) blur(20px)", WebkitBackdropFilter: "saturate(180%) blur(20px)" } as const;
// the old words fade out before the new ones fade in, so two lines never draw over each other
const SWAP = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.18, ease: "easeOut" } },
  exit: { opacity: 0, transition: { duration: 0.15, ease: "easeIn" } },
} as const;

function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function liveLane(lanes: LaneView[]) {
  const live = lanes.find((l) => LIVE.has(l.status) && (l.active || l.inQueue));
  return { live, lane: live ?? lanes.find((l) => l.status === "needs_you") ?? null };
}

const noop = () => () => {};
// the nav is in the page before any run renders, so its slot is there once this runs in the browser
const useSlot = () => useSyncExternalStore(noop, () => document.getElementById("nav-live"), () => null);

// A Dynamic Island style pill while any kitchen is live. It docks in the center of the nav bar at every width, so it
// never sits on the page (on phones the wordmark steps aside for it). Compact: "Fo · on the call · 1:42". Expanded: the
// kitchen and the same line. The timer starts at 0:00 when the kitchen picks up and stops when the call ends.
export function LiveActivity({ lanes, replay = false, onOpen }: { lanes: LaneView[]; replay?: boolean; onOpen: (id: string) => void }) {
  const phone = usePhone();
  const { lane } = liveLane(lanes);
  const asking = !!lane && lane.status === "needs_you";
  const askingN = lanes.filter((l) => l.status === "needs_you").length;
  const [pinned, setPinned] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const client = useIsClient();
  const slot = useSlot();
  const has = !!lane;
  const step = lane ? liveStep(lane, replay) : { line: "", timer: "none" as const };
  // a grouped ask covers several kitchens, so the pill names them all
  const title = lane ? (asking && askingN > 1 ? `${askingN} kitchens` : lane.restaurant.name) : "";

  useEffect(() => {
    setLiveActive(has);
  }, [has]);
  useEffect(() => () => setLiveActive(false), []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // the call clock: one per kitchen and step, so a callback or a reconfirm starts again at 0:00
  const key = lane ? `${lane.id}:${lane.phase}` : "";
  const [run, setRun] = useState<{ key: string; start: number | null; frozen: number | null }>({ key: "", start: null, frozen: null });
  if (lane && run.key !== key) setRun({ key, start: step.timer === "run" ? now : null, frozen: null });
  else if (lane && step.timer === "run" && run.start === null) setRun({ ...run, start: now, frozen: null });
  else if (lane && step.timer === "freeze" && run.start !== null && run.frozen === null) setRun({ ...run, frozen: Math.max(0, now - run.start) });
  const timer =
    step.timer === "none" || run.key !== key || run.start === null ? null : clock(step.timer === "freeze" ? (run.frozen ?? now - run.start) : now - run.start);

  // a new line peeks open for 3s
  const [peek, setPeek] = useState<{ line: string; until: number }>({ line: "", until: 0 });
  if (step.line && step.line !== peek.line) setPeek({ line: step.line, until: now + 3200 });

  const open = pinned || now < peek.until;
  // a sample says so on the pill too, for as long as it plays
  const compact = asking ? "Fo needs your OK" : `${replay ? "Sample" : "Fo"} · ${step.line.toLowerCase().replace(/^playing the sample$/, "playing")}${timer ? ` · ${timer}` : ""}`;
  const contentKey = open ? `x:${title}:${step.line}` : `c:${asking ? "ask" : step.line}`;

  const pill = (
    <AnimatePresence>
      {lane && (
        <motion.button
          key="pill"
          type="button"
          layout
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1, transition: { ...SPRING, delay: phone ? 0.15 : 0 } }}
          exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.12 } }}
          transition={SPRING}
          onClick={() => (open || phone ? onOpen(lane.id) : setPinned(true))}
          onMouseEnter={() => setPinned(true)}
          onMouseLeave={() => setPinned(false)}
          onFocus={() => setPinned(true)}
          onBlur={() => setPinned(false)}
          aria-label={`${title}: ${step.line}${timer ? `, ${timer}` : ""}. Open details`}
          style={GLASS}
          className={`pointer-events-auto flex min-w-0 items-center gap-2.5 overflow-hidden pr-2 pl-3.5 text-left text-white shadow-[0_8px_30px_rgba(0,0,0,0.22)] ${
            phone ? `max-w-[calc(100vw-152px)] ${open ? "h-[44px]" : "h-8"}` : `max-w-[var(--pill-max,360px)] ${open ? "h-[44px]" : "h-8"}`
          }`}
        >
          <motion.span layout="position" aria-hidden className={`h-2 w-2 shrink-0 rounded-full live-dot ${asking ? "bg-[#2997ff]" : "bg-[#30d158]"}`} />
          {/* the last 12px is a soft edge over padding: at rest it covers nothing, while the width springs it hides the cut */}
          <motion.span layout="position" className="grid min-w-0 pr-3 [mask-image:linear-gradient(to_right,#000_calc(100%-12px),transparent)] [&>*]:[grid-area:1/1]">
            <AnimatePresence initial={false} mode="wait">
              {open ? (
                <motion.span key={contentKey} className="block min-w-0 self-center" {...SWAP}>
                  <span className="block truncate text-[12px] leading-[16px] text-white/60">
                    {title}
                    {timer ? <span className="tabular-nums"> · {timer}</span> : null}
                  </span>
                  <span className="block truncate text-[13px] leading-[18px] font-medium md:text-[14px]">{step.line}</span>
                </motion.span>
              ) : (
                <motion.span key={contentKey} className="block self-center truncate text-[13px] font-medium whitespace-nowrap tabular-nums" {...SWAP}>
                  {compact}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.span>
        </motion.button>
      )}
    </AnimatePresence>
  );

  return (
    <>
      {client && slot && createPortal(pill, slot)}
      <span className="sr-only" aria-live="polite">
        {lane ? `${title}: ${step.line}` : ""}
      </span>
    </>
  );
}
