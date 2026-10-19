"use client";

import { motion, type Variants } from "motion/react";
import type { ReactNode } from "react";

export const EASE = [0.25, 0.1, 0.25, 1] as const;
// fires early, so a scene is never a screen of black waiting for its reveal
const VIEW = { once: true, amount: 0.15, margin: "0px 0px -6% 0px" } as const;

const rise: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

type Props = { children: ReactNode; className?: string; delay?: number };

/** Fades a block up into place the first time it scrolls into view. */
export function Reveal({ children, className, delay = 0 }: Props) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEW}
      transition={{ duration: 0.5, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

/** A list whose items arrive one after another. */
export function RevealList({ children, className, stagger = 0.08 }: Props & { stagger?: number }) {
  return (
    <motion.ul
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={VIEW}
      variants={{ hidden: {}, show: { transition: { staggerChildren: stagger } } }}
    >
      {children}
    </motion.ul>
  );
}

export function RevealItem({ children, className }: Props) {
  return (
    <motion.li className={className} variants={rise}>
      {children}
    </motion.li>
  );
}
