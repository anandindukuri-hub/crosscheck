import { Check, X } from "lucide-react";
import type { CalibrationSignals } from "@/lib/settings";

const SIGNALS: { key: keyof CalibrationSignals; label: string }[] = [
  { key: "hedge", label: "Kept the unsure words “I think”" },
  { key: "relay", label: "Marked the answer passed on by staff" },
  { key: "sharedFryer", label: "Kept the shared fryer" },
  { key: "firstHand", label: "Said who gave each answer" },
  { key: "format", label: "Put every answer in the report format" },
];

export function SignalList({ signals, className = "", large = false }: { signals: CalibrationSignals; className?: string; large?: boolean }) {
  return (
    <ul className={`space-y-2 ${large ? "type-body" : "type-callout"} ${className}`}>
      {SIGNALS.map((x) => {
        const ok = signals[x.key];
        return (
          <li key={x.key} className="flex items-start gap-3">
            <span
              aria-hidden
              className={`mt-0.5 grid shrink-0 place-items-center rounded-full text-white ${large ? "h-6 w-6" : "h-5 w-5"}`}
              style={{ background: ok ? "var(--matched)" : "var(--nomatch)" }}
            >
              {ok ? <Check size={large ? 14 : 12} strokeWidth={3} /> : <X size={large ? 14 : 12} strokeWidth={3} />}
            </span>
            <span>
              {x.label}
              <span className="sr-only">{ok ? ": yes" : ": no"}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
