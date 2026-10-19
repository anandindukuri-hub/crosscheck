import Link from "next/link";
import { Decision } from "./Decision";
import { Hero } from "./Hero";
import { LivePhone } from "./LivePhone";
import { StatNumber } from "./StatNumber";
import { MotionRoot } from "./MotionRoot";
import { Reveal, RevealItem, RevealList } from "./Reveal";
import { Promises } from "./Promises";
import { Transcript } from "./Transcript";
import { WalletPass } from "./WalletPass";
import { SampleNote } from "./SampleNote";
import { styles } from "./styles";

// each figure checked against its paper; the source line links to it
const MMWR = "https://www.cdc.gov/mmwr/volumes/66/wr/mm6615a2.htm";
const STATS = [
  {
    pre: "Nearly",
    num: "1 in 2",
    label: "reported fatal food allergy reactions over 13 years were caused by food from a restaurant.",
    source: "Radke et al., CDC MMWR, 2017",
    href: MMWR,
  },
  {
    pre: "Only",
    num: "1 in 10",
    label: "restaurant managers with a fryer said they keep one just for allergen free cooking.",
    source: "Radke et al., CDC MMWR, 2017. Six US sites",
    href: MMWR,
  },
  {
    pre: "",
    num: "54%",
    label: "of restaurant reactions in the FARE registry happened even after staff were told.",
    source: "Oriel et al., J Allergy Clin Immunol Pract, 2021",
    href: "https://doi.org/10.1016/j.jaip.2020.12.018",
  },
];



export function LaunchPage() {
  return (
    <MotionRoot>
      <div className={styles.page}>
        <Hero />

        <div className={styles.band}>
          <section id="problem" className={styles.scene} aria-labelledby="problem-title">
            <div className={`${styles.container} ${styles.grid}`}>
              <Reveal className={styles.problemHead}>
                <p className={styles.eyebrow}>The problem</p>
                <h2 id="problem-title" className={`${styles.h2} ${styles.lines2}`} tabIndex={-1}>
                  <span>Menus list ingredients.</span> <span>Kitchens know the rest.</span>
                </h2>
              </Reveal>
              <Reveal className={styles.problemBody} delay={0.06}>
                <p className={styles.lead}>
                  Some kitchens keep a separate fryer just for allergy orders. Others cook the fries in the same oil as the shrimp. For
                  someone with a shellfish allergy, that shared oil can be enough for a reaction. The menu will not tell you which kitchen
                  you are in. The person cooking will.
                </p>
              </Reveal>
              <RevealList className={styles.stats}>
                {STATS.map((s) => (
                  <RevealItem key={s.num} className={styles.stat}>
                    <StatNumber pre={s.pre} num={s.num} />
                    <span className={styles.statText}>
                      <span className={styles.statLabel}>{s.label}</span>
                      <a href={s.href} target="_blank" rel="noreferrer" className={styles.statSource}>
                        Source: {s.source}
                      </a>
                    </span>
                  </RevealItem>
                ))}
              </RevealList>
            </div>
          </section>
        </div>

        <div className={`${styles.band} ${styles.bandLight}`} data-theme="light">
          <section className={styles.scene} aria-labelledby="call-title">
            <div className={`${styles.container} ${styles.grid}`}>
              <Reveal className={styles.callHead}>
                <p className={styles.eyebrow}>The call</p>
                <h2 id="call-title" className={`${styles.h2} ${styles.lines2}`}>
                  <span>Fo makes the call.</span> <span>You approve it first.</span>
                </h2>
                <p className={styles.aside}>
                  <strong>Hidden ingredients. Shared fryers. Shared pans.</strong> Fo asks the chef about each one. Then it repeats the answers
                  back so the kitchen can fix anything wrong.
                </p>
              </Reveal>
              <div className={styles.callPanel}>
                <Transcript />
              </div>
            </div>
          </section>

          <section className={`${styles.scene} ${styles.decisionScene}`} aria-labelledby="decision-title">
            <div className={`${styles.container} ${styles.grid}`}>
              <Reveal className={styles.decisionHead}>
                <p className={styles.eyebrow}>The decision</p>
                <h2 id="decision-title" className={styles.h2}>
                  Claude and Jev read every answer.
                </h2>
                <p className={styles.aside}>Claude, Anthropic’s AI, reads what the kitchen said. Jev, TypeSafe AI’s scoring model, checks how sure it heard right. Both must agree.</p>
              </Reveal>
              <div>
                <Decision />
              </div>
            </div>
          </section>
        </div>

        <div className={styles.band}>
          <section className={styles.scene} aria-labelledby="trust-title">
            <div className={styles.container}>
              <Reveal>
                <p className={styles.eyebrow}>Trust</p>
                <h2 id="trust-title" className={`${styles.h2} ${styles.lines2}`}>
                  <span>You approve every step.</span> <span>You read every word.</span>
                </h2>
              </Reveal>
              <Promises />
            </div>
          </section>

          <section className={styles.scene} aria-labelledby="pass-title">
            <div className={`${styles.container} ${styles.grid} ${styles.passGrid}`}>
              <Reveal className={styles.passCopy}>
                <p className={styles.eyebrow}>The table</p>
                <h2 id="pass-title" className={`${styles.h2} ${styles.lines2}`}>
                  <span>Booked.</span> <span>With a note to the chef.</span>
                </h2>
                <p className={styles.lead}>
                  Fo books the table and sends the kitchen a note with each guest’s allergies and what its staff told Fo. You get a table pass
                  to show your server, with the most serious allergy at the top.
                </p>
              </Reveal>
              <WalletPass animate />
            </div>
          </section>

          <section className={`${styles.scene} ${styles.finalScene}`} aria-labelledby="final-title">
            <div className={`${styles.container} ${styles.final}`}>
              <Reveal>
                <h2 id="final-title" className={styles.finalTitle}>
                  Who is eating tonight?
                </h2>
              </Reveal>
              <Reveal className={styles.ctaRow} delay={0.08}>
                <Link href="/new" className={styles.btn}>
                  Start a table
                </Link>
              </Reveal>
              <SampleNote />
              <Reveal className={styles.endPhone} delay={0.12}>
                <LivePhone still="booked" />
              </Reveal>
              <p className={styles.disclaimer}>
                CrossCheck relays what staff said. Not a guarantee. Tell your server again and follow your allergist’s plan. Kitchens and quotes on this page are made up examples.
              </p>
            </div>
          </section>
        </div>
      </div>
    </MotionRoot>
  );
}
