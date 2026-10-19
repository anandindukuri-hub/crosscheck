"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { EASE } from "./Reveal";
import { styles } from "./styles";

// the app's own opening line, word for word, then the replay's Tamarind Table fryer answer, so a viewer who opens the app
// hears the same call
const LINES = [
  { who: "Fo", words: "Hi, this is an AI assistant calling for Anand, who would like to eat at your restaurant. May I ask the chef or manager a few quick allergy questions? Is it OK if I take notes?" },
  { who: "Kitchen", words: "Sure, this is the chef. Go ahead." },
  { who: "Fo", words: "Anand has a severe shellfish allergy. Does the fryer for your fries ever cook shellfish?" },
  { who: "Kitchen", words: "We have a separate fryer just for fries. Shellfish never goes in that oil." },
] as const;

const CPS = 28; // Fo types at about 28 characters a second
const PAUSE = 400; // a breath before the kitchen answers
const AFTER = 900; // and after it, before Fo speaks again

function clock(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The call, one line at a time, with the live call bar on top. A line is not on the page until it is spoken: Fo's
 * lines type in with a caret, the kitchen's arrive whole in the serif so its words read as human. Every line keeps
 * its place from the start, so nothing below it jumps. */
export function Transcript() {
  const ref = useRef<HTMLDivElement>(null);
  const live = useInView(ref, { amount: 0.4 });
  const started = useInView(ref, { amount: 0.4, once: true });
  const reduce = useReducedMotion();
  const [secs, setSecs] = useState(0);
  // the line being spoken and how much of it is out; line 4 means the call is over
  const [at, setAt] = useState({ line: reduce ? LINES.length : 0, chars: 0 });

  useEffect(() => {
    if (!live || reduce || at.line >= LINES.length) return;
    const t = window.setInterval(() => setSecs((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [live, reduce, at.line]);

  useEffect(() => {
    if (!started || reduce || at.line >= LINES.length) return;
    const l = LINES[at.line];
    let t = 0;
    if (l.who === "Fo" && at.chars < l.words.length) t = window.setTimeout(() => setAt({ line: at.line, chars: at.chars + 1 }), 1000 / CPS);
    else if (l.who === "Fo") t = window.setTimeout(() => setAt({ line: at.line + 1, chars: 0 }), PAUSE);
    // the kitchen's line lands whole: it is "speaking" for 1.2s (chars 0), then a beat before Fo goes on
    else if (at.chars === 0) t = window.setTimeout(() => setAt({ line: at.line, chars: 1 }), 1200);
    else t = window.setTimeout(() => setAt({ line: at.line + 1, chars: 0 }), AFTER);
    return () => window.clearTimeout(t);
  }, [started, reduce, at]);

  // the bars move only while someone is talking: Fo while a line types, the kitchen as its line lands
  const cur = LINES[at.line];
  const speaking = started && !reduce && !!cur && (cur.who === "Fo" ? at.chars > 0 && at.chars < cur.words.length : at.chars === 0);

  return (
    <div ref={ref} className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.panelTitle}>
          <span className={styles.wave} aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} style={{ animationDelay: `${i * 0.12}s`, animationPlayState: speaking && live ? "running" : "paused" }} />
            ))}
          </span>
          <span>
            Fo <span className={styles.panelMeta}>·</span> Tamarind Table
          </span>
        </span>
        <span className={styles.panelMeta}>{clock(secs)}</span>
      </div>
      <ol className={styles.lines} aria-label="Call transcript">
        {LINES.map((l, i) => {
          const done = i < at.line;
          const now = i === at.line && started;
          const fo = l.who === "Fo";
          const shown = done || (now && (!fo || at.chars > 0));
          const typed = fo && now ? at.chars : l.words.length;
          return (
            <motion.li
              key={i}
              className={styles.line}
              initial={false}
              animate={{ opacity: shown ? 1 : 0, y: shown ? 0 : 8 }}
              transition={{ duration: 0.35, ease: EASE }}
              aria-hidden={!shown || undefined}
            >
              <span className={styles.who}>{l.who}</span>
              <p className={fo ? styles.foWords : styles.kitchenWords}>
                {l.words.slice(0, typed)}
                {fo && now && typed < l.words.length && (
                  <span className={styles.caretAt} aria-hidden="true">
                    <span className={styles.caret} />
                  </span>
                )}
                {/* the rest of the line holds its room, unseen, so the text never reflows as it types */}
                <span className={styles.unsaid}>{l.words.slice(typed)}</span>
              </p>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}
