"use client";

import { motion, useReducedMotion } from "motion/react";

type Props = {
  size: number;
  stroke: number;
  value: number;
  color: string;
  track: string;
  play: boolean;
  delay?: number;
  duration?: number;
};

/** A confidence ring that fills from the top. With reduced motion it fades in already filled. */
export function Ring({ size, stroke, value, color, track, play, delay = 0, duration = 0.5 }: Props) {
  const reduce = useReducedMotion();
  const c = size / 2;
  const r = (size - stroke) / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }} aria-hidden="true">
      <circle cx={c} cy={c} r={r} fill="none" stroke={track} strokeWidth={stroke} />
      <motion.circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={play ? { pathLength: value / 100, opacity: 1 } : { pathLength: 0, opacity: 0 }}
        transition={
          reduce
            ? { pathLength: { duration: 0 }, opacity: { duration: 0.3, delay } }
            : { pathLength: { duration, delay, ease: [0.22, 1, 0.36, 1] }, opacity: { duration: 0.08, delay } }
        }
      />
    </svg>
  );
}
