"use client";

import { CalendarCheck, Check, ChefHat, ChevronLeft, ChevronRight, Ellipsis, PhoneMissed, X } from "lucide-react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Ring } from "./Ring";
import { styles } from "./styles";

type Verdict = "matched" | "chef" | "nomatch" | "none";
type RowState = "waiting" | "calling" | "done";

// The same four kitchens, outcomes and words as the scripted replay in the app, so a cut from here to the app tells
// one story: the replay's script is a Thai kitchen's, so every kitchen here is Thai too. Rows carry a mark
const KITCHENS: { name: string; detail: string; verdict: Verdict; word: string; start: number; ask: string | null; heard: string | null }[] = [
  { name: "Tamarind Table", detail: "Up next", verdict: "matched", word: "Matched", start: 39, ask: "What oil is in the fryer for your fries? Is it ever peanut oil?", heard: "Fries only, in soybean oil. There is no peanut oil in this kitchen." },
  { name: "Jasmine Row", detail: "Up next", verdict: "chef", word: "Needs the chef", start: 17, ask: "Is there any peanut in your pad see ew or its sauce?", heard: "I think there’s no peanut in the sauce." },
  { name: "Chili Lane", detail: "Up next", verdict: "nomatch", word: "Did not match", start: 23, ask: "Does the fryer for your fries ever cook shellfish?", heard: "Yeah the shrimp tempura goes in the same fryer as everything." },
  { name: "Pandan House", detail: "Up next", verdict: "none", word: "No answer yet", start: 0, ask: null, heard: null },
];
const SCORE = 97;

const RING: Record<Verdict, string> = { matched: "#248a3d", chef: "#b25000", nomatch: "#d70015", none: "#86868b" };
const WORD: Record<Verdict, string> = { matched: styles.word_matched, chef: styles.word_chef, nomatch: styles.word_nomatch, none: styles.word_none };

/**
 * One loop of the scene, indexed by phase:
 * 0 idle, 1 call Tamarind Table, 2 verdict, 3 call Jasmine Row, 4 verdict, 5 call Chili Lane, 6 verdict,
 * 7 call Pandan House, 8 verdict, 9 book, then back to 0.
 */
const PHASE_MS = [1200, 3300, 1000, 3000, 1000, 3000, 1000, 2000, 900, 4400];
const CALLS = KITCHENS.length;
const LAST = PHASE_MS.length - 1;

const UI = { type: "spring", stiffness: 380, damping: 32 } as const;
const HERO = { type: "spring", stiffness: 140, damping: 22 } as const;
const FADE = { duration: 0.2, ease: "easeOut" } as const;
const VEIL_MS = 250;

const SUMMARY =
  "Example of a CrossCheck run on iPhone. Fo calls four kitchens one after another. " +
  "Tamarind Table matched, Jasmine Row needs the chef, Chili Lane did not match and Pandan House has no answer yet. Only Tamarind Table is offered to book.";

function clock(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function rowState(i: number, phase: number): RowState {
  const call = i * 2 + 1;
  if (phase === 0 || phase < call) return "waiting";
  return phase === call ? "calling" : "done";
}

const isCall = (phase: number) => phase % 2 === 1 && phase < CALLS * 2;

/** still: a frozen frame (the end card shows the booked table) instead of the live loop */
export function LivePhone({ still }: { still?: "booked" } = {}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  // the phone sits in the hero, so the loop starts on mount and only pauses once it scrolls away
  const inView = useInView(ref, { amount: 0.3, initial: true });
  // the first frame is the poster: Fo already on the call to Tamarind Table, island settled, nothing mid motion
  const [phase, setPhase] = useState(still ? LAST : 1);
  const [secs, setSecs] = useState(KITCHENS[0].start);
  const [settled, setSettled] = useState(true);
  // the reset is its own beat: the screen content fades out, the rows go back to waiting, then it fades in
  const [veil, setVeil] = useState(false);

  useEffect(() => {
    if (!inView || still) return;
    let step = 1;
    let timer = 0;
    let tick = 0;
    const go = () => {
      const p = step % PHASE_MS.length;
      window.clearInterval(tick);
      setPhase(p);
      setVeil(false);
      if (isCall(p)) {
        setSecs(KITCHENS[(p - 1) / 2].start);
        tick = window.setInterval(() => setSecs((s) => s + 1), 1000);
      }
      const next = () => {
        step += 1;
        go();
      };
      // the last beat veils the screen first, and only once the veil is down do the rows go back to waiting
      timer =
        p === LAST
          ? window.setTimeout(() => {
              setVeil(true);
              timer = window.setTimeout(next, VEIL_MS);
            }, PHASE_MS[p] - VEIL_MS)
          : window.setTimeout(next, PHASE_MS[p]);
    };
    timer = window.setTimeout(go, 0);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(tick);
    };
  }, [inView, still]);

  const live = phase >= 1 && phase < LAST;
  const [wasLive, setWasLive] = useState(live);
  if (wasLive !== live) {
    setWasLive(live);
    setSettled(false);
  }
  const active = live ? Math.min(CALLS - 1, Math.floor((phase - 1) / 2)) : 0;
  const calling = isCall(phase);
  const booked = phase === LAST;
  const meta = booked ? "1 matched" : live ? "Calling" : `${CALLS} to call`;
  const best = KITCHENS[0];
  const k = KITCHENS[active];

  return (
    <div ref={ref} className={`${styles.phoneBox} ${still ? styles.phoneStill : ""}`} role="img" aria-label={still ? "CrossCheck on iPhone: Tamarind Table is booked for tonight at 7 PM with the allergy note sent." : SUMMARY}>
      <motion.div
        className={styles.phoneRise}
        aria-hidden="true"
        initial={still ? false : { opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...HERO, delay: 0.25, opacity: { duration: 0.6, delay: 0.25 } }}
      >
       <div className={styles.device}>
        <span className={`${styles.sideKey} ${styles.keyAction}`} />
        <span className={`${styles.sideKey} ${styles.keyUp}`} />
        <span className={`${styles.sideKey} ${styles.keyDown}`} />
        <span className={`${styles.sideKey} ${styles.keyPower}`} />
        <div className={styles.bezel}>
          <div className={styles.screen}>
            <motion.div className={styles.statusBar} animate={{ opacity: live ? 0 : 1 }} transition={FADE}>
              <span className={styles.sbTime}>9:41</span>
              <span className={styles.sbIcons}>
                <Signal />
                <Wifi />
                <Battery />
              </span>
            </motion.div>

            <motion.div
              className={styles.island}
              initial={false}
              animate={live ? { width: 361, height: 44, top: 9 } : { width: 126, height: 37, top: 11 }}
              transition={reduce ? { duration: 0 } : UI}
              onAnimationComplete={() => setSettled(true)}
            >
              <motion.div
                className={styles.islandRow}
                initial={false}
                animate={{ opacity: live && (settled || reduce) ? 1 : 0 }}
                transition={{ duration: live ? 0.2 : 0.08 }}
              >
                <span className={styles.liveDot} />
                <span className={`${styles.islandText} ${styles.stack}`}>
                  <AnimatePresence initial={false}>
                    {/* one timeline drives the island and the rows: the moment a row lands its verdict, so does the island */}
                    <motion.span
                      key={`${active}:${calling}`}
                      className={styles.islandLabel}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.18 }}
                    >
                      <b>Fo</b> · {calling ? (k.ask ? k.name : `dialing ${k.name}`) : `${k.name} · ${k.word.toLowerCase()}`}
                    </motion.span>
                  </AnimatePresence>
                </span>
                {/* the clock runs from the first ring, so the island never shows an empty right side */}
                {calling && <span className={styles.islandTime}>{clock(secs)}</span>}
              </motion.div>
            </motion.div>

            <div className={styles.navBar}>
              <span className={styles.glassBtn}>
                <ChevronLeft size={24} strokeWidth={2.25} />
              </span>
              <span className={styles.glassBtn}>
                <Ellipsis size={22} strokeWidth={2.25} />
              </span>
            </div>

            <motion.div
              className={styles.screenBody}
              initial={false}
              animate={{ opacity: veil ? 0 : 1 }}
              transition={{ duration: veil ? VEIL_MS / 1000 : 0.35, ease: "easeOut" }}
            >
              <p className={styles.largeTitle}>Tonight at 7&nbsp;PM</p>
              <p className={styles.screenSub}>
                Table for 2
                <span className={styles.subGuests}>
                  <br />
                  Guest 2: peanut · Anand: shellfish, no beef
                </span>
              </p>

              <motion.div
                className={styles.bestSlot}
                initial={false}
                animate={{ height: booked ? "auto" : 0, opacity: booked ? 1 : 0 }}
                transition={booked && !still ? { ...HERO, opacity: { duration: 0.35, delay: 0.1 } } : { duration: 0 }}
              >
                {still ? (
                  <div className={`${styles.best} ${styles.bestBooked}`}>
                    <div className={styles.bookedBand}>
                      <CalendarCheck size={18} strokeWidth={2.25} />
                      Booked · Tonight at 7&nbsp;PM
                    </div>
                    <div className={styles.bookedBody}>
                      <span className={styles.bestName}>{best.name}</span>
                      <span className={styles.bestLine}>Booked for 2. Allergy note sent to the kitchen.</span>
                      <div className={styles.bookBtn}>Open table pass</div>
                    </div>
                  </div>
                ) : (
                  <div className={styles.best}>
                    <div className={styles.bestTop}>
                      <span className={styles.bestRing}>
                        <Ring size={52} stroke={4.5} value={SCORE} color={RING.matched} track="#e5e5ea" play={booked} delay={0.2} duration={0.5} />
                        <span className={styles.bestNum}>
                          <Check size={22} strokeWidth={2.5} color={RING.matched} />
                        </span>
                      </span>
                      <span className={styles.bestText}>
                        <span className={styles.bestLabel}>Best match</span>
                        <span className={styles.bestName}>{best.name}</span>
                        <span className={styles.bestLine}>All 9 checks passed for the dishes the kitchen suggested.</span>
                        <span className={styles.bestSure}>Claude and Jev read every answer the same way.</span>
                      </span>
                    </div>
                    <div className={styles.bookBtn}>Book {best.name}</div>
                  </div>
                )}
              </motion.div>

              {/* the end card is the booked table alone: the list below it stays off the frame */}
              {!still && (
              <>
              <div className={styles.groupHead}>
                <span>Kitchens</span>
                <span className={styles.groupMeta}>
                  <AnimatePresence initial={false}>
                    <motion.span key={meta} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={FADE}>
                      {meta}
                    </motion.span>
                  </AnimatePresence>
                </span>
              </div>
              <div className={styles.group}>
                {KITCHENS.map((kk, i) => (
                  <KitchenRow key={kk.name} kitchen={kk} state={rowState(i, phase)} />
                ))}
              </div>

              <div className={styles.heardSlot}>
                <AnimatePresence initial={false}>
                  {calling && (
                    <motion.div
                      key={`call:${active}`}
                      className={styles.callStack}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0, transition: { duration: 0.3 } }}
                      exit={{ opacity: 0, transition: { duration: 0.15 } }}
                    >
                      <div className={styles.callRow}>
                        <Wave />
                        <span className={styles.callText}>
                          <span className={styles.callWho}>{k.ask ? "Fo is asking" : "Ringing the kitchen"}</span>
                          {k.ask && <span className={styles.callAsk}>“{k.ask}”</span>}
                        </span>
                        {k.ask && <span className={styles.callTime}>{clock(secs)}</span>}
                      </div>
                      {/* while it only rings, nothing is heard yet: the result waits for the row to flip */}
                      {k.heard && (
                        <motion.div className={styles.heard} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 1.1 }}>
                          <span className={styles.heardWho}>Heard on the call · {k.name}</span>
                          <span className={styles.heardWords}>“{k.heard}”</span>
                        </motion.div>
                      )}
                    </motion.div>
                  )}
                  {phase === CALLS * 2 && !k.heard && (
                    <motion.div
                      key={`result:${active}`}
                      className={styles.callStack}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0, transition: { duration: 0.3 } }}
                      exit={{ opacity: 0, transition: { duration: 0.15 } }}
                    >
                      <div className={styles.heard}>
                        <span className={styles.heardWho}>{k.name}</span>
                        <span className={styles.heardPlain}>Reached an automated system, not a person.</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              </>
              )}
            </motion.div>

            <span className={styles.homeBar} />
          </div>
        </div>
       </div>
      </motion.div>
    </div>
  );
}

const GLYPH = { matched: Check, chef: ChefHat, nomatch: X, none: PhoneMissed } as const;

// five bars that move while Fo is talking
function Wave() {
  return (
    <span className={styles.wave} aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} style={{ animationDelay: `${i * 0.12}s` }} />
      ))}
    </span>
  );
}

// the same marks as the app's rows: a hollow dot in line, a spinning ring on the call, a ring with a mark at the verdict
function KitchenRow({ kitchen: k, state }: { kitchen: (typeof KITCHENS)[number]; state: RowState }) {
  const done = state === "done";
  const Glyph = GLYPH[k.verdict];
  // one line at a time: the old line leaves (0.12s) before the new one rises in (0.2s), so two never overlap
  const enter = { duration: 0.2, delay: done ? 0.12 : 0, ease: "easeOut" } as const;
  return (
    <div className={styles.row}>
      <div className={styles.status}>
        <AnimatePresence initial={false}>
          {done ? (
            <motion.div
              key="ring"
              className={styles.statusLayer}
              initial={{ opacity: 0, scale: 0.28 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ scale: { type: "spring", stiffness: 420, damping: 30 }, opacity: { duration: 0.12 } }}
            >
              <Ring size={36} stroke={3.5} value={100} color={RING[k.verdict]} track="#e5e5ea" play delay={0.14} duration={0.32} />
              <motion.span className={styles.ringNum} style={{ color: RING[k.verdict] }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, delay: 0.3 }}>
                <Glyph size={16} strokeWidth={k.verdict === "matched" ? 2.5 : 2} />
              </motion.span>
            </motion.div>
          ) : (
            <motion.div key={state} className={styles.statusLayer} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={FADE}>
              {state === "calling" ? <span className={styles.spin} /> : <span className={styles.dot} />}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className={styles.rowText}>
        <div className={styles.rowTitle}>{k.name}</div>
        <div className={`${styles.rowSub} ${styles.stack}`}>
          <AnimatePresence initial={false}>
            <motion.span
              key={state}
              className={done ? WORD[k.verdict] : undefined}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0, transition: enter }}
              exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}
            >
              {done ? k.word : state === "calling" ? (k.ask ? "On the call" : "Ringing") : k.detail}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>
      <ChevronRight size={18} strokeWidth={2.25} className={styles.chev} />
    </div>
  );
}

function Signal() {
  return (
    <svg width="19" height="12" viewBox="0 0 19 12">
      <rect x="0" y="7.5" width="3.2" height="4.5" rx="1" fill="#000" />
      <rect x="5" y="5" width="3.2" height="7" rx="1" fill="#000" />
      <rect x="10" y="2.5" width="3.2" height="9.5" rx="1" fill="#000" />
      <rect x="15" y="0" width="3.2" height="12" rx="1" fill="#000" />
    </svg>
  );
}

function Wifi() {
  return (
    <svg width="17" height="12" viewBox="0 0 17 12" fill="none">
      <path d="M1.3 4.3a10.2 10.2 0 0 1 14.4 0" stroke="#000" strokeWidth="2" strokeLinecap="round" />
      <path d="M4.1 7.1a6.2 6.2 0 0 1 8.8 0" stroke="#000" strokeWidth="2" strokeLinecap="round" />
      <circle cx="8.5" cy="10.2" r="1.7" fill="#000" />
    </svg>
  );
}

function Battery() {
  return (
    <svg width="27" height="13" viewBox="0 0 27 13">
      <rect x="0.5" y="0.5" width="23" height="12" rx="3.8" fill="none" stroke="#000" strokeOpacity="0.35" />
      <rect x="2" y="2" width="18" height="9" rx="2.4" fill="#000" />
      <path d="M25 4.5v4c.8-.3 1.4-1.1 1.4-2s-.6-1.7-1.4-2z" fill="#000" fillOpacity="0.4" />
    </svg>
  );
}
