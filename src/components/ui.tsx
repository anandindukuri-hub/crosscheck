"use client";

import { CircleAlert } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { buttonClass, type Size, type Variant } from "./kit/button";

export {
  MODE_LABEL,
  OUTCOME_META,
  RESULT_META,
  STATUS_LABEL,
  SPEAKER_LABEL,
  capFirst,
  cleanProgress,
  fmtDate,
  fmtDateTime,
  fmtTime,
  plural,
} from "@/lib/labels";
export { buttonClass };
export { ConfidenceRing } from "./kit/ConfidenceRing";
export { Segmented } from "./kit/Segmented";
export { Sheet } from "./kit/Sheet";
export { StateDot, StateLabel, TONE } from "./kit/State";

export async function api<T>(url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(
      url,
      body === undefined
        ? { cache: "no-store" }
        : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );
  } catch {
    throw new Error("Could not reach CrossCheck. Check that it is still running on this computer, then try again.");
  }
  const json = (await res.json().catch(() => ({}))) as { data?: T; error?: string };
  if (!res.ok || json.error) throw new Error(json.error ?? `CrossCheck hit an error (${res.status}). Try again in a moment.`);
  return json.data as T;
}

export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size };

export function Button({ variant = "primary", size = "md", className = "", type = "button", ...props }: ButtonProps) {
  return <button type={type} {...props} className={`${buttonClass(variant, size)} ${className}`} />;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`skeleton rounded-control ${className}`} />;
}

export function ErrorNote({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div role="alert" className="type-callout flex flex-wrap items-center gap-x-3 gap-y-1 text-nomatch">
      <span className="inline-flex items-start gap-1.5">
        <CircleAlert size={18} strokeWidth={1.75} aria-hidden className="mt-px shrink-0" />
        <span>{children}</span>
      </span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="min-h-11 font-semibold text-link hover:underline">
          Try again
        </button>
      )}
    </div>
  );
}

// a quiet grouped section heading, iOS style
export function GroupLabel({ children, id, className = "" }: { children: ReactNode; id?: string; className?: string }) {
  return (
    <h2 id={id} className={`type-footnote mb-2 px-4 font-medium text-ink-2 ${className}`}>
      {children}
    </h2>
  );
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;
