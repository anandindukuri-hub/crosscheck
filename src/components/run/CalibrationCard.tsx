"use client";

import { ChevronDown, ChevronUp, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { CalibrationAnswer, CalibrationLines } from "@/lib/calibration";
import type { FidelitySetting } from "@/lib/settings";
import { StateLabel } from "../kit/State";
import { scrollBehavior } from "../kit/useMedia";
import { SignalList } from "../setup/SignalList";
import { smart } from "../kit/typo";
import { api } from "../ui";

const TESTS: Record<CalibrationAnswer["tests"], string> = {
  hedge: "Test: unsure words. The report must keep “I think”.",
  relay: "Test: passed on. The report must show staff asked someone else.",
  shared_fryer: "Test: a shared fryer. The report must keep it.",
  first_hand: "A clear first hand answer.",
};

type Line = { cue: string; say: string; note?: string; trap?: boolean };

// The calibration lines as a teleprompter: very large text, the current line lit, the rest dimmed
export function CalibrationCard(props: { runId: string; lines: CalibrationLines; reports: number; status: string; judged: boolean; noCall: boolean }) {
  const { runId, lines, reports, status, judged, noCall } = props;
  const [cal, setCal] = useState<FidelitySetting | null>(null);
  const [held, setHeld] = useState(false);
  const [at, setAt] = useState(0);
  const refs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    let alive = true;
    api<{ calibration: FidelitySetting | null; source: string | null }>("/api/settings")
      .then((s) => {
        if (!alive) return;
        setCal(s.calibration);
        setHeld(s.source === "env");
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [reports, status, judged]);

  const all: Line[] = [
    { cue: "When Fo says hello", say: smart(lines.opener) },
    { cue: "When Fo asks which dishes work", say: smart(lines.dishes) },
    ...lines.groups.map((g) => {
      const traps = g.tests.filter((t) => t !== "first_hand");
      return { cue: `When Fo asks about ${g.topic}`, say: smart(g.say), note: traps.length ? traps.map((t) => TESTS[t]).join(" ") : TESTS.first_hand, trap: traps.length > 0 };
    }),
    { cue: "When Fo repeats the answers", say: smart(lines.readback) },
    { cue: "When Fo asks if it can call you again", say: smart(lines.optOut) },
  ];

  // The lit line comes from state alone. Next, Previous, a tap or a key sets it, then scrolls that line to the middle of
  // the reading area (below the sticky counter, above the phone's bottom bar). The scroll spy only follows a scroll the
  // person makes by hand (wheel, touch, keys), and stands down while any scroll it did not start is still moving
  const quietUntil = useRef(0);
  const byHand = useRef(0);
  const area = () => {
    const top = 52 + 52; // the nav and the sticky counter
    const bottom = window.innerHeight - (window.matchMedia("(max-width: 767px)").matches ? 56 : 0);
    return { top, mid: top + (bottom - top) * 0.45 };
  };
  const go = (n: number) => {
    const i = Math.max(0, Math.min(all.length - 1, n));
    setAt(i);
    byHand.current = 0;
    quietUntil.current = Date.now() + 1100;
    // the lit line grows and the others shrink, so measure after that layout lands, then center it
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = refs.current[i];
        if (!el) return;
        const r = el.getBoundingClientRect();
        const target = window.scrollY + r.top + r.height / 2 - area().mid;
        window.scrollTo({ top: Math.max(0, target), behavior: scrollBehavior() });
      }),
    );
  };

  // a scroll by hand moves the lit line: the one whose middle is nearest the reading line, or the last one at the end
  useEffect(() => {
    let raf = 0;
    const hand = () => void (byHand.current = Date.now());
    const onKeyScroll = (e: globalThis.KeyboardEvent) => {
      if (["PageDown", "PageUp", "Home", "End"].includes(e.key)) hand();
    };
    const pick = () => {
      raf = 0;
      const t = Date.now();
      if (t < quietUntil.current || t - byHand.current > 1200) return;
      const els = refs.current;
      const doc = document.documentElement;
      if (window.scrollY + window.innerHeight >= doc.scrollHeight - 8) {
        const last = els.length - 1;
        const r = els[last]?.getBoundingClientRect();
        if (r && r.top < window.innerHeight) return setAt(last);
      }
      const { mid } = area();
      let best = -1;
      let dist = Infinity;
      els.forEach((el, i) => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        const d = Math.abs(r.top + r.height / 2 - mid);
        if (d < dist) {
          dist = d;
          best = i;
        }
      });
      if (best >= 0) setAt(best);
    };
    const onScroll = () => {
      // a scroll this card started keeps the spy quiet until 300ms after it stops moving
      if (Date.now() < quietUntil.current) {
        quietUntil.current = Math.max(quietUntil.current, Date.now() + 300);
        return;
      }
      if (!raf) raf = requestAnimationFrame(pick);
    };
    window.addEventListener("wheel", hand, { passive: true });
    window.addEventListener("touchmove", hand, { passive: true });
    window.addEventListener("keydown", onKeyScroll);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("wheel", hand);
      window.removeEventListener("touchmove", hand);
      window.removeEventListener("keydown", onKeyScroll);
      window.removeEventListener("scroll", onScroll);
    };
  }, [all.length]);

  function onKey(e: KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "j" || e.key === " ") go(at + 1);
    else if (e.key === "ArrowUp" || e.key === "k") go(at - 1);
    else return;
    e.preventDefault();
  }
  const mine = cal?.runId === runId ? cal : null;

  return (
    <>
      <section aria-labelledby="lines-h" className="card">
        <div className="px-5 pt-6 pb-2 md:px-8 md:pt-8">
          <h2 id="lines-h" className="type-title">
            Your lines
          </h2>
          <p className="type-callout mt-1 max-w-xl text-ink-2">Fo calls your phone and you play the chef. Read each line when Fo asks for it. Three are tests the report must keep word for word.</p>
          <p className="type-callout mt-2 max-w-xl text-ink-2">Open this page on a computer or put the call on speaker.</p>
        </div>
        <div className="glass sticky top-[52px] z-10 flex h-[52px] items-center justify-between gap-3 border-b border-hairline px-5 md:px-8">
          <span className="text-[15px] font-semibold tabular-nums" aria-live="polite">
            Line {at + 1} of {all.length}
          </span>
          <div className="hidden items-center gap-1 md:flex">
            <button type="button" onClick={() => go(at - 1)} disabled={at === 0} aria-label="Previous line" className="grid h-11 w-11 place-items-center rounded-full text-ink hover:bg-fill disabled:opacity-30">
              <ChevronUp size={22} strokeWidth={1.75} aria-hidden />
            </button>
            <button type="button" onClick={() => go(at + 1)} disabled={at === all.length - 1} aria-label="Next line" className="grid h-11 w-11 place-items-center rounded-full text-ink hover:bg-fill disabled:opacity-30">
              <ChevronDown size={22} strokeWidth={1.75} aria-hidden />
            </button>
          </div>
        </div>
        <ol tabIndex={0} onKeyDown={onKey} aria-label="Your lines. Use the arrow keys to move." className="mx-2 mt-3 space-y-1 rounded-card md:mx-5">
          {all.map((l, i) => {
            const on = i === at;
            return (
              <li key={i} ref={(el) => void (refs.current[i] = el)}>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => go(i)}
                  aria-current={on ? "step" : undefined}
                  className="w-full rounded-card px-3 py-3 text-left"
                >
                  <span className="type-footnote block text-ink-2">{l.cue}</span>
                  <span
                    className={`mt-1 block font-serif tracking-[-0.01em] transition-[color,opacity] duration-300 ${on ? "text-[28px] leading-[1.2] font-semibold text-ink md:text-[34px]" : "text-[17px] leading-[1.3] font-normal text-ink-3 opacity-60 md:text-[20px]"}`}
                  >
                    “{l.say}”
                  </span>
                  {l.note && on && (
                    <span className={`type-callout mt-2 flex items-start gap-1.5 ${l.trap ? "font-medium text-chef" : "text-ink-2"}`}>
                      {l.trap && <TriangleAlert size={16} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0" />}
                      {l.note}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
        {/* room under the last line, then the card ends */}
        <div className="px-5 pt-6 pb-12 text-center">
          <p className="type-footnote text-ink-3">That is the last line.</p>
        </div>
      </section>

      {/* phones: Previous and Next where a thumb holding the phone on a call can reach them */}
      <div data-sticky-bar-phone className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[calc(12px+env(safe-area-inset-bottom))] md:hidden">
        <div className="glass pointer-events-auto flex h-11 items-center gap-1 rounded-full px-1 shadow-[0_8px_30px_rgba(0,0,0,0.12)] ring-[0.5px] ring-black/10">
          <button type="button" onClick={() => go(at - 1)} disabled={at === 0} className="flex h-11 items-center gap-1 rounded-full px-3 text-[15px] font-medium text-link disabled:text-ink-3">
            <ChevronUp size={18} strokeWidth={1.75} aria-hidden />
            Previous
          </button>
          <span className="px-1 text-[13px] whitespace-nowrap text-ink-2 tabular-nums">
            Line {at + 1} of {all.length}
          </span>
          <button type="button" onClick={() => go(at + 1)} disabled={at === all.length - 1} className="flex h-11 items-center gap-1 rounded-full px-3 text-[15px] font-semibold text-link disabled:text-ink-3">
            Next
            <ChevronDown size={18} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
      </div>


      {(mine || judged || noCall || reports > 0) && (
        <section aria-live="polite" className="card px-6 py-6 md:px-10 md:py-8">
          {mine ? (
            <>
              <StateLabel tone={mine.status === "verified" ? "matched" : "nomatch"} className="type-title">
                {mine.status === "verified" ? (held ? "Passed" : "Verified") : "Not verified"}
              </StateLabel>
              <SignalList signals={mine.signals} large className="mt-5" />
              <p className="type-callout mt-5 text-ink-2">
                {mine.status === "verified" ? (
                  held ? (
                    "Fo’s reports keep what matters. FO_REPORT_FIDELITY in .env.local still holds every match for your review. Remove it to use this practice call."
                  ) : (
                    "Fo’s reports keep what matters. CrossCheck can now match a kitchen without a quote by quote review."
                  )
                ) : (
                  <>
                    Fo’s report lost something marked above. Matches keep waiting for your review.{" "}
                    <Link href="/setup" className="font-medium text-link hover:underline">
                      Try the practice call again from Setup
                    </Link>
                    .
                  </>
                )}
              </p>
            </>
          ) : judged ? (
            <p className="type-callout text-ink-2">A newer practice call decides how far Fo’s reports are trusted. This one changed nothing.</p>
          ) : noCall ? (
            <>
              <StateLabel tone="nomatch" className="type-headline">
                The call did not happen. Try again.
              </StateLabel>
              <p className="type-callout mt-2 text-ink-2">
                Fo’s report does not show an answered call. Nothing changed.{" "}
                <Link href="/setup" className="font-medium text-link hover:underline">
                  Start a new practice call from Setup
                </Link>
                .
              </p>
            </>
          ) : (
            <p className="type-callout text-ink-2">Checking Fo’s report against your lines…</p>
          )}
        </section>
      )}
    </>
  );
}
