"use client";

import { motion, type Variants } from "motion/react";
import { useRef, useState, type ReactNode } from "react";
import { EASE } from "./Reveal";
import { styles } from "./styles";

const VIEW = { once: true, amount: 0.15, margin: "0px 0px -6% 0px" } as const;
// the row reveals as one, panel after panel, so a panel peeking in from the side of a phone is never left blank
const ROW: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };
const PANEL: Variants = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } } };

/** Three promises in one row of panels, each with the piece of the app that keeps it on top. On phones the row
 * becomes a swipe, one panel at a time with the next one peeking in. */
export function Promises() {
  const ref = useRef<HTMLUListElement>(null);
  const [at, setAt] = useState(0);
  // the panel that fills most of the swipe row lights its dot
  function onScroll() {
    const el = ref.current;
    const first = el?.firstElementChild as HTMLElement | null;
    if (!el || !first) return;
    setAt(Math.min(2, Math.max(0, Math.round(el.scrollLeft / (first.offsetWidth + 12)))));
  }
  return (
    <>
      <motion.ul ref={ref} onScroll={onScroll} className={styles.promises} variants={ROW} initial="hidden" whileInView="show" viewport={VIEW}>
        <Promise
          title="You approve every call."
          line="Fo shows you what it will say to each kitchen, then asks once more before it dials. For now Fo only calls restaurants that said yes to AI calls."
        >
          <div className={styles.frag}>
            <p className={styles.fragTitle}>Review the calls</p>
            <ul className={styles.fragRows}>
              {["Tamarind Table", "Jasmine Row", "Chili Lane", "Pandan House"].map((n) => (
                <li key={n}>
                  <span>{n}</span>
                  <span className={styles.fragLink}>What Fo will say</span>
                </li>
              ))}
            </ul>
            <span className={styles.fragBtn} aria-hidden="true">
              Send to Fo
            </span>
          </div>
        </Promise>
        <Promise title="Exact words, never paraphrased." line="You read what the kitchen said, word for word, with who said it and when.">
          <div className={styles.frag}>
            <p className={styles.fragMeta}>Shellfish never goes in this fryer</p>
            <p className={styles.fragQuote}>“We have a separate fryer just for fries. Shellfish never goes in that oil.”</p>
            <p className={styles.fragMeta}>Chef Mai, head chef · 2:14&nbsp;PM</p>
          </div>
        </Promise>
        <Promise title="Reconfirmed on the day." line="On the day, one tap has Fo call back in case the menu or the cook changed.">
          <div className={styles.frag}>
            <p className={styles.fragState}>Reconfirmed today</p>
            <p className={styles.fragBody}>Same answers today. The allergy note is on the booking.</p>
            <p className={styles.fragMeta}>Today, 4:12&nbsp;PM</p>
          </div>
        </Promise>
      </motion.ul>
      <div className={styles.promiseDots} aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`${styles.promiseDot} ${i === at ? styles.promiseDotOn : ""}`} />
        ))}
      </div>
    </>
  );
}

function Promise({ title, line, children }: { title: string; line: string; children: ReactNode }) {
  return (
    <motion.li className={styles.promise} variants={PANEL}>
      {/* a picture of the app: nothing in it can be focused or tapped */}
      <div className={styles.promiseShot} aria-hidden="true" inert>
        {children}
      </div>
      <div className={styles.promiseCopy}>
        <h3 className={styles.promiseTitle}>{title}</h3>
        <p className={styles.promiseLine}>{line}</p>
      </div>
    </motion.li>
  );
}
