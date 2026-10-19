"use client";

import { Check, ChevronDown } from "lucide-react";
import { motion, useReducedMotion, useScroll, useTransform, type MotionStyle, type Variants } from "motion/react";
import Link from "next/link";
import type { MouseEvent } from "react";
import { LivePhone } from "./LivePhone";
import { EASE } from "./Reveal";
import { styles } from "./styles";

const stack: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } } };
const rise: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

const COVERS = ["All 9 major food allergens", "Any other allergen you type in", "Any US restaurant that says yes to an AI call"];

export function Hero() {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const drift = useTransform(scrollY, [0, 900], ["0px", "72px"]);

  function seeHow(e: MouseEvent<HTMLAnchorElement>) {
    const target = document.getElementById("problem");
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    target.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  }

  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={`${styles.container} ${styles.grid} ${styles.heroGrid}`}>
        <motion.div className={styles.heroCopy} variants={stack} initial="hidden" animate="show">
          <motion.p className={`${styles.eyebrow} ${styles.heroEyebrow}`} variants={rise}>
            For food allergies, celiac and a no beef diet
          </motion.p>
          <motion.h1 id="hero-title" className={styles.heroTitle} variants={rise}>
            <span>We call the kitchen.</span> <span className={styles.heroTitleSoft}>Before you eat there.</span>
          </motion.h1>
          <motion.p className={styles.lead} variants={rise}>
            Tell us who is eating and what each person can’t have. Fo, Wajo’s AI caller, phones each restaurant and asks the chef about
            hidden ingredients and shared fryers. Only a kitchen that clears every check can be booked.
          </motion.p>
          <motion.div className={styles.ctaRow} variants={rise}>
            <Link href="/new" className={styles.btn}>
              Start a table
            </Link>
            <a href="#problem" className={styles.link} onClick={seeHow}>
              See how it works
              <ChevronDown size={18} strokeWidth={1.75} aria-hidden="true" />
            </a>
          </motion.div>
          {/* what it covers, so nobody reads the shellfish example as the whole product */}
          <motion.ul className={styles.covers} variants={rise} aria-label="What CrossCheck covers">
            {COVERS.map((c) => (
              <li key={c}>
                <Check size={16} strokeWidth={2.25} aria-hidden="true" />
                {c}
              </li>
            ))}
          </motion.ul>
        </motion.div>
        <motion.div
          className={`${styles.heroPhone} ${styles.heroDrift}`}
          style={{ "--drift": reduce ? "0px" : drift } as MotionStyle}
        >
          <LivePhone />
          <p className="mt-4 text-center text-[13px] text-dark-ink-3">Example. Kitchen names and their words on this page are made up.</p>
        </motion.div>
      </div>
    </section>
  );
}
