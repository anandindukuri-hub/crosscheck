"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { styles } from "./styles";

// severity: "Life threatening", "Severe" or "Mild"; null for a diet. diet: a diet's own label and line
export type PassNeed = { severity: string | null; text: string; diet?: { label: string; line: string } };
export type PassGuest = { name: string; needs: PassNeed[]; dish: string | null };

export type PassProps = {
  state: string; // "Booked", "Reconfirmed today"
  restaurant: string;
  time: string;
  party: string;
  guests: PassGuest[]; // most serious first
  sample?: boolean;
  animate?: boolean; // the launch page lets it rise into place
  children?: ReactNode; // the kitchen's words, under the guests
  footer?: ReactNode;
};

const SAMPLE: PassProps = {
  state: "Booked",
  restaurant: "Tamarind Table",
  time: "Tonight at 7 PM",
  party: "Table for 2",
  guests: [
    { name: "Guest 2", needs: [{ severity: "Life threatening", text: "Peanut allergy" }], dish: "chicken pad see ew" },
    {
      name: "Anand",
      needs: [
        { severity: "Severe", text: "Shellfish allergy" },
        { severity: null, text: "No beef, no contact", diet: { label: "Diet", line: "No beef. Nothing cooked with or next to beef." } },
      ],
      dish: "tofu pad see ew, no oyster sauce",
    },
  ],
};

const SEV: Record<string, string> = { "Life threatening": styles.sevLife, Severe: styles.sevSevere, Mild: styles.sevMild };

/** The booked table as a Wallet style pass, written for the server who reads it: the life threatening guest first, on
 * its own tinted row, each allergy at title size, a diet in its own quieter group and the dishes to order. */
export function WalletPass(props: Partial<PassProps>) {
  const p = { ...SAMPLE, ...props } as PassProps;
  const reduce = useReducedMotion();
  const live = !!p.animate && !reduce;
  const body = (
    <>
      <div className={styles.passBand}>
        {/* the launch reveal: the green fills the band left to right, then the state's dot lands */}
        {live && (
          <motion.span
            aria-hidden="true"
            className={styles.passBandFill}
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1], delay: 0.35 }}
          />
        )}
        <span className={styles.passBrand}>
          CrossCheck
          {/* a scripted pass says so on screen, as the saved image does */}
          {p.sample && <span className={styles.passSample}>Sample</span>}
        </span>
        {live ? (
          <motion.span
            className={styles.passState}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.3, delay: 0.8 }}
          >
            {p.state}
          </motion.span>
        ) : (
          <span className={styles.passState}>{p.state}</span>
        )}
      </div>
      <div className={styles.passBody}>
        <div className={styles.passFields}>
          <div className={styles.passWide}>
            <span className={styles.fieldLabel}>Restaurant</span>
            <span className={`${styles.fieldValue} ${styles.passPrimary}`}>{p.restaurant}</span>
          </div>
          <div>
            <span className={styles.fieldLabel}>Time</span>
            <span className={styles.fieldValue}>{p.time}</span>
          </div>
          <div>
            <span className={styles.fieldLabel}>Party</span>
            <span className={styles.fieldValue}>{p.party}</span>
          </div>
        </div>
        <ul className={styles.passGuests}>
          {p.guests.map((g) => {
            const allergies = g.needs.filter((n) => !n.diet);
            const diets = g.needs.filter((n) => n.diet);
            const life = allergies.some((n) => n.severity === "Life threatening");
            return (
              <li key={g.name} className={`${styles.passGuest} ${life ? styles.passGuestLife : ""}`}>
                <span className={styles.fieldLabel}>{g.name}</span>
                {allergies.map((n) => (
                  <span key={n.text} className={styles.passNeed}>
                    {n.severity && <span className={`${styles.passSeverity} ${SEV[n.severity] ?? ""}`}>{n.severity}</span>}
                    <span className={styles.passNeedText}>{n.text}</span>
                  </span>
                ))}
                {diets.map((n) => (
                  <span key={n.text} className={`${styles.passNeed} ${styles.passDiet}`}>
                    <span className={`${styles.passSeverity} ${styles.sevDiet}`}>{n.diet!.label}</span>
                    <span className={styles.passDietText}>{n.diet!.line}</span>
                  </span>
                ))}
                {g.dish ? (
                  <span className={styles.passDish}>
                    <span className={styles.fieldLabel}>Will order only</span>
                    <span className={styles.passDishName}>{g.dish.charAt(0).toUpperCase() + g.dish.slice(1)}</span>
                  </span>
                ) : (
                  <span className={styles.passDish}>No dish named yet. Ask your server.</span>
                )}
              </li>
            );
          })}
        </ul>
        {p.guests.some((g) => g.dish) && <p className={styles.passOnly}>Matched for these dishes only. Nothing else on the menu was checked.</p>}
        {p.children}
        <p className={styles.passNote}>Show this to your server.</p>
        {p.footer}
      </div>
    </>
  );

  if (!p.animate)
    return (
      <article className={styles.pass} aria-label={`Table pass for ${p.restaurant}`}>
        {body}
      </article>
    );

  return (
    <div className={styles.passStage}>
      <motion.figure
        className={`${styles.pass} ${live ? styles.passReveal : ""}`}
        aria-label="Sample table pass"
        style={{ margin: 0 }}
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.35 }}
        transition={{ type: "spring", stiffness: 140, damping: 22, opacity: { duration: 0.5 } }}
      >
        {body}
      </motion.figure>
    </div>
  );
}
