"use client";

import { Check, ChefHat, Eye, PhoneMissed, PhoneOff, X, type LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { TONE, type RingTone } from "./State";

export type RingGlyph = LucideIcon | "dot" | null;

type Props = {
  tone: RingTone;
  value?: number | null; // 0..1, how sure CrossCheck is that it heard the answer right. Shown only when matched
  working?: boolean;
  booked?: boolean;
  glyph?: RingGlyph; // center mark for every state that is not matched
  size?: number;
  label: string; // what a screen reader hears
  animate?: boolean; // play the verdict moment; false renders the final ring at once
  hideValue?: boolean; // rows show a check for matched; the number stays in the sheet, where it is explained
  celebrate?: boolean; // booked just now: the ring springs in and the calendar's check draws itself
};

const EASE = [0.2, 0.8, 0.2, 1] as const;

// the center mark for each state: never a number unless every check matched
export const GLYPH: Partial<Record<RingTone, RingGlyph>> = { nomatch: X, chef: ChefHat, review: Eye, you: "dot", quiet: "dot" };
export const NO_ANSWER_GLYPH = PhoneMissed;
export const DECLINED_GLYPH = PhoneOff;

// The verdict moment: the dot grows into a ring, the ring fills, then the mark fades in. 600ms, only when it is new.
export function ConfidenceRing({ tone, value = null, working = false, booked = false, glyph, size = 40, label, animate = false, hideValue = false, celebrate = false }: Props) {
  const reduce = useReducedMotion();
  const play = animate && !reduce;
  const stroke = size >= 64 ? 5 : size >= 36 ? 3.5 : 3;
  const r = (size - stroke) / 2;
  const c = size / 2;
  const t = TONE[tone];
  const matched = tone === "matched";
  const num = matched && value != null && !hideValue && !booked ? Math.round(value * 100) : null;
  const mark = glyph === undefined ? (matched && hideValue ? Check : (GLYPH[tone] ?? "dot")) : glyph;
  const icon = Math.round(size * 0.46);

  if (working) {
    return (
      <span role="img" aria-label={label} className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
          <circle cx={c} cy={c} r={r} fill="none" stroke="var(--fill-2)" strokeWidth={stroke} />
          <circle
            className="ring-spin"
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke="var(--ink-3)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * r * 0.22} ${2 * Math.PI * r}`}
          />
        </svg>
      </span>
    );
  }

  // booked: the same ring as every other verdict, in green, with a calendar whose check draws in
  if (booked) {
    const t2 = TONE.matched;
    const live = celebrate && !reduce;
    return (
      <motion.span
        role="img"
        aria-label={label}
        className="relative inline-grid shrink-0 place-items-center"
        style={{ width: size, height: size }}
        initial={live ? { scale: 0.6, opacity: 0 } : false}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 22 }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="absolute inset-0">
          <circle cx={c} cy={c} r={r} fill="none" stroke={t2.fg} strokeWidth={stroke} />
        </svg>
        <CalendarMark size={Math.round(size * 0.46)} draw={live} />
      </motion.span>
    );
  }

  const Mark = mark && mark !== "dot" ? mark : null;
  return (
    <span role="img" aria-label={label} className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <motion.svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
        initial={play ? { scale: 0.22, opacity: 0.6 } : false}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.16, ease: EASE }}
      >
        <circle cx={c} cy={c} r={r} fill="none" stroke={t.tint} strokeWidth={stroke} />
        <motion.circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={t.fg}
          strokeWidth={stroke}
          strokeLinecap="round"
          transform={`rotate(-90 ${c} ${c})`}
          initial={play ? { pathLength: 0 } : false}
          animate={{ pathLength: matched ? (value ?? 1) : tone === "quiet" && !Mark ? 0 : 1 }}
          transition={{ delay: 0.16, duration: 0.32, ease: EASE }}
        />
      </motion.svg>
      <motion.span
        aria-hidden
        className="absolute inset-0 grid place-items-center font-semibold tabular-nums text-ink"
        style={{ fontSize: Math.round(size * 0.3), letterSpacing: "-0.02em", color: num == null ? t.fg : undefined }}
        initial={play ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.46, duration: 0.14 }}
      >
        {num != null ? (
          num
        ) : Mark ? (
          <Mark size={Mark === Check ? Math.max(icon, 20) : icon} strokeWidth={Mark === Check ? 2.25 : 1.75} aria-hidden />
        ) : (
          <span className={`block rounded-full ${tone === "you" ? "live-dot" : ""}`} style={{ width: Math.max(6, size * 0.15), height: Math.max(6, size * 0.15), background: t.fg }} />
        )}
      </motion.span>
    </span>
  );
}

// lucide's calendar check, drawn by hand so its check can stroke in over 300ms
function CalendarMark({ size, draw }: { size: number; draw: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--matched)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="relative">
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
      <motion.path d="m9 16 2 2 4-4" initial={draw ? { pathLength: 0 } : false} animate={{ pathLength: 1 }} transition={{ duration: 0.3, delay: 0.18, ease: EASE }} />
    </svg>
  );
}
