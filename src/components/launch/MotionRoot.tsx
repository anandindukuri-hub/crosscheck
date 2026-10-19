"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/** Honors prefers-reduced-motion for every animation on the page: transforms are dropped, fades stay. */
export function MotionRoot({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
