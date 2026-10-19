"use client";

import Link from "next/link";
import { StateDot } from "./kit/State";
import { setupGaps, useStatus } from "./useStatus";

// a quiet link on the right of the nav, only while something on this computer still needs setting up
export function StatusBar({ dark = false }: { dark?: boolean }) {
  const { data: s } = useStatus();
  if (!s) return null;
  const gaps = setupGaps(s);
  if (!gaps.length) return null;
  return (
    <Link
      href="/setup"
      aria-label={`Setup status: ${gaps.length === 1 ? "1 thing" : `${gaps.length} things`} left`}
      className={`inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-[13px] ${dark ? "text-dark-ink-2 hover:text-dark-ink" : "text-ink-2 hover:text-ink"}`}
    >
      <StateDot tone="quiet" size={7} />
      Setup status
    </Link>
  );
}
