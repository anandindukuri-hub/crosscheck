"use client";

import { Check, ChefHat, Gauge, ScanText } from "lucide-react";
import { AnimatePresence, animate, motion, useInView, useMotionValue, useReducedMotion, useScroll, useTransform, type MotionStyle } from "motion/react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { EASE } from "./Reveal";
import { Ring } from "./Ring";
import { styles } from "./styles";

const HERO = { type: "spring", stiffness: 140, damping: 22 } as const;
// the bar and its number land together: one 0.9s spring for both
const FILL = { type: "spring", duration: 0.9, bounce: 0 } as const;

// Two beats: a clear answer that matches, then the unsure answer CrossCheck exists to catch. Same two cards, same ring. The
// words are the scripted replay's, so the app tells the same story
const BEATS = [
  {
    id: "clear",
    tab: "A clear answer",
    kitchen: "Tamarind Table",
    quote: ["", "Fries only, in soybean oil. There is no peanut oil in this kitchen."],
    claude: "No peanut oil in the fryer",
    sure: 0.97,
    heard: "right",
    color: "#248a3d",
    lead: "Both heard “no peanut oil.” That fits your table.",
    word: "Matched.",
    explain: "97% is how sure CrossCheck is that it heard the chef right. It is not a promise the food has no peanut.",
  },
  {
    id: "hedge",
    tab: "An unsure answer",
    kitchen: "Jasmine Row",
    quote: ["I think", " there’s no peanut in the sauce."],
    claude: "Not a sure answer",
    sure: 0.93,
    heard: "“I think”",
    color: "#b25000",
    lead: "The answer was “I think.”",
    word: "Needs the chef.",
    explain: "“I think” is not a sure answer. CrossCheck will not book on it. With your OK, Fo calls back and asks the chef only that question.",
  },
] as const;

// the reader gets 8s on each answer, with the time left drawn under the tab, and a tap stops the loop
const BEAT_MS = 8000;
const PATH_H = 60;
const RING_STROKE = 8;
const RING = 124;

// the width of the box the connector lines run across, so they draw in real pixels, never stretched
function useWidth(ref: RefObject<HTMLElement | null>) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/** Two readings slide together as the reader scrolls. Then the lines draw, the ring fills and the verdict lands.
 * After the match, the same cards replay a hedge: the bar drops, the ring turns to the chef. */
export function Decision() {
  const ref = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.9", "center 0.5"] });
  const converge = useTransform(scrollYProgress, [0, 0.45], [0, 1]);
  const fade = useTransform(scrollYProgress, [0, 0.3], [0, 1]);
  // one timed beat once the verdict is on screen: lines 0.6s, ring 0.8s, then the word
  const go = useInView(resultRef, { once: true, amount: 0.6 });
  // the meter fills as soon as its own card is on screen, not when the ring below it is
  const meterGo = useInView(meterRef, { once: true, amount: 0.6 });
  const visible = useInView(ref, { amount: 0.3 });
  const [beat, setBeat] = useState(0);
  const [held, setHeld] = useState(false); // a tap on a tab stops the loop
  const width = useWidth(ref);

  useEffect(() => {
    if (!go || !visible || held || reduce) return;
    const t = window.setTimeout(() => setBeat((b) => (b + 1) % BEATS.length), BEAT_MS);
    return () => window.clearTimeout(t);
  }, [go, visible, held, reduce, beat]);

  const b = BEATS[beat];
  // the number in the value line counts with the bar, so "97% sure" never sits over an empty bar
  const sure = useMotionValue(0);
  const pct = useTransform(sure, (v) => Math.round(v));
  useEffect(() => {
    if (!meterGo && !reduce) return;
    const c = animate(sure, b.sure * 100, reduce ? { duration: 0 } : FILL);
    return () => c.stop();
  }, [meterGo, reduce, b.sure, sure]);

  const cardStyle = { "--converge": reduce ? 1 : converge, opacity: fade } as MotionStyle;
  const swap = { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -6 }, transition: { duration: 0.25, ease: EASE } };
  const filled = meterGo || reduce;

  // both lines leave the middle of each card and end at the ring's 12 o'clock, in the middle of its stroke
  const lx = (width - 24) / 4;
  const rx = width - lx;
  const end = PATH_H + RING_STROKE / 2;
  const paths = width ? [`M${lx} 0 C${lx} 36 ${width / 2} 22 ${width / 2} ${end}`, `M${rx} 0 C${rx} 36 ${width / 2} 22 ${width / 2} ${end}`] : [];

  return (
    <div ref={ref} className={styles.decision}>
      <div className={styles.beatTabs} role="group" aria-label="Show an answer">
        {BEATS.map((x, i) => (
          <button
            key={x.id}
            type="button"
            aria-pressed={i === beat}
            onClick={() => {
              setHeld(true);
              setBeat(i);
            }}
            className={`${styles.beatTab} ${i === beat ? styles.beatTabOn : ""}`}
          >
            {x.tab}
            {i === beat && go && visible && !held && !reduce && (
              <motion.span key={beat} aria-hidden="true" className={styles.beatProgress} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: BEAT_MS / 1000, ease: "linear" }} />
            )}
          </button>
        ))}
      </div>
      <p className={styles.beatKitchen} aria-live="polite">
        {b.kitchen} on the call
      </p>
      <div className={styles.cards}>
        <motion.div className={`${styles.card} ${styles.cardLeft}`} style={cardStyle}>
          <div className={styles.cardHead}>
            <ScanText size={20} strokeWidth={1.75} aria-hidden="true" />
            <span>
              <strong>Claude reads the kitchen’s words</strong>
            </span>
          </div>
          <div className={styles.cardMid}>
            <div className={styles.stack}>
<AnimatePresence initial={false}>
              <motion.p key={b.id} className={styles.cardQuote} {...swap}>
                “{b.quote[0] && <mark className={styles.hedge}>{b.quote[0]}</mark>}
                {b.quote[1]}”
              </motion.p>
            </AnimatePresence>
</div>
          </div>
          <div className={styles.stack}>
<AnimatePresence initial={false}>
            <motion.p key={b.id} className={styles.cardValue} {...swap}>
              {b.claude}
            </motion.p>
          </AnimatePresence>
</div>
        </motion.div>
        <motion.div ref={meterRef} className={`${styles.card} ${styles.cardRight}`} style={cardStyle}>
          <div className={styles.cardHead}>
            <Gauge size={20} strokeWidth={1.75} aria-hidden="true" />
            <span>
              <strong>Jev checks it heard right</strong>
            </span>
          </div>
          <div className={styles.cardMid}>
            <p className={styles.meterLabel}>How sure it heard right</p>
            <div className={styles.meter} aria-hidden="true">
              <motion.div
                className={styles.meterFill}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: filled ? b.sure : 0, backgroundColor: b.color }}
                transition={reduce ? { duration: 0 } : { scaleX: FILL, backgroundColor: { duration: 0.3 } }}
              />
            </div>
            <div className={styles.meterScale} aria-hidden="true">
              <span>Not sure</span>
              <span>Sure</span>
            </div>
          </div>
          <div className={styles.stack}>
<AnimatePresence initial={false}>
            <motion.p key={b.id} className={styles.cardValue} {...swap}>
              {/* the same words as the app: "97% sure it heard right" */}
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: filled ? 1 : 0 }} transition={{ duration: 0.2 }}>
                <motion.span className={styles.tabular}>{pct}</motion.span>% sure it heard {b.heard}
              </motion.span>
            </motion.p>
          </AnimatePresence>
</div>
        </motion.div>
      </div>

      {/* from 768px: two lines from the two cards meet at the ring */}
      <svg className={styles.connect} width={width || undefined} height={PATH_H} viewBox={`0 0 ${width || 1} ${PATH_H}`} aria-hidden="true">
        {paths.map((d) => (
          <motion.path
            key={d.split(" ")[0]}
            d={d}
            fill="none"
            stroke="rgba(134,134,139,0.5)"
            strokeWidth={1.5}
            strokeLinecap="round"
            initial={{ pathLength: reduce ? 1 : 0 }}
            animate={{ pathLength: go || reduce ? 1 : 0 }}
            transition={{ duration: 0.6, ease: EASE }}
          />
        ))}
      </svg>
      {/* phones: the cards stack, so one short stem runs from the bottom card's middle into the ring */}
      <motion.div
        className={styles.stem}
        aria-hidden="true"
        initial={{ scaleY: reduce ? 1 : 0 }}
        animate={{ scaleY: go || reduce ? 1 : 0 }}
        transition={{ duration: 0.4, ease: EASE }}
      />

      <div ref={resultRef} className={styles.result}>
        <motion.div className={styles.resultRing} aria-hidden="true" initial={{ opacity: 0, scale: 0.9 }} animate={go ? { opacity: 1, scale: 1 } : {}} transition={{ ...HERO, delay: 0.5 }}>
          <Ring key={b.id} size={RING} stroke={RING_STROKE} value={100} color={b.color} track="#e3e3e8" play={go} delay={beat === 0 ? 0.6 : 0.1} duration={0.8} />
          <AnimatePresence initial={false}>
            <motion.span
              key={b.id}
              className={styles.resultNum}
              style={beat === 1 ? { color: b.color } : undefined}
              initial={{ opacity: 0 }}
              animate={go ? { opacity: 1 } : {}}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, delay: beat === 0 ? 1 : 0.4 }}
            >
              {beat === 0 ? <Check size={42} strokeWidth={2.25} color={b.color} /> : <ChefHat size={48} strokeWidth={1.5} />}
            </motion.span>
          </AnimatePresence>
        </motion.div>
        <div className={styles.stack}>
<AnimatePresence initial={false}>
          <motion.p key={b.id} className={styles.resultText} exit={{ opacity: 0, transition: { duration: 0.4 } }}>
            <motion.span initial={{ opacity: 0, y: 8 }} animate={go ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.5, ease: EASE, delay: beat === 0 ? 0.9 : 0.3 }}>
              {b.lead}
            </motion.span>{" "}
            <motion.span
              className={beat === 0 ? styles.matched : styles.chefWord}
              initial={{ opacity: 0 }}
              animate={go ? { opacity: 1 } : {}}
              transition={{ duration: 0.4, delay: beat === 0 ? 1.45 : 0.75 }}
            >
              {b.word}
            </motion.span>
          </motion.p>
        </AnimatePresence>
</div>
        <div className={styles.stack}>
<AnimatePresence initial={false}>
          <motion.p key={b.id} className={styles.explain} {...swap}>
            {b.explain}
          </motion.p>
        </AnimatePresence>
</div>
      </div>
    </div>
  );
}
