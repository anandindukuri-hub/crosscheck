"use client";

import { motion } from "motion/react";
import { styles } from "./styles";

/** A big figure that comes into focus once, from a 12px blur to sharp over 600ms. */
export function StatNumber({ pre, num }: { pre: string; num: string }) {
  return (
    <motion.span
      className={styles.statNum}
      initial={{ opacity: 0, filter: "blur(12px)" }}
      whileInView={{ opacity: 1, filter: "blur(0px)" }}
      viewport={{ once: true, amount: 0.6 }}
      transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {pre && <span className={styles.statPre}>{pre} </span>}
      {/* the optical pull for a bare numeral; a word like "Nearly" sits on the gutter as it is */}
      <span className={pre ? undefined : styles.statNumTight}>{num}</span>
    </motion.span>
  );
}
