import type { ReactNode } from "react";
import type { Tone } from "@/lib/labels";

export type RingTone = Tone | "work" | "wait";

export const TONE: Record<RingTone, { fg: string; tint: string }> = {
  matched: { fg: "var(--matched)", tint: "var(--matched-tint)" },
  nomatch: { fg: "var(--nomatch)", tint: "var(--nomatch-tint)" },
  chef: { fg: "var(--chef)", tint: "var(--chef-tint)" },
  you: { fg: "var(--you)", tint: "var(--you-tint)" },
  quiet: { fg: "var(--quiet)", tint: "var(--quiet-tint)" },
  review: { fg: "var(--review)", tint: "var(--review-tint)" },
  work: { fg: "var(--ink-3)", tint: "var(--quiet-tint)" },
  wait: { fg: "var(--ink-3)", tint: "var(--quiet-tint)" },
};

// a small filled dot; pulse while a call is live
export function StateDot({ tone, pulse = false, size = 8, className = "" }: { tone: RingTone; pulse?: boolean; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 rounded-full ${pulse ? "live-dot" : ""} ${className}`}
      style={{ width: size, height: size, background: TONE[tone].fg }}
    />
  );
}

// state is always a dot plus a word, never color alone
export function StateLabel({
  tone,
  children,
  pulse,
  className = "",
  strong = true,
}: {
  tone: RingTone;
  children: ReactNode;
  pulse?: boolean;
  className?: string;
  strong?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${strong ? "font-semibold text-ink" : "text-ink-2"} ${className}`}>
      <StateDot tone={tone} pulse={pulse} />
      <span>{children}</span>
    </span>
  );
}
