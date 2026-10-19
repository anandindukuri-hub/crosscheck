import { ChevronRight } from "lucide-react";
import type { ReactNode, SyntheticEvent } from "react";

// a quiet disclosure row with a turning chevron. flush: the content runs the full width under the summary
export function Disclosure({
  summary,
  children,
  onToggle,
  className = "",
  meta,
  flush = false,
}: {
  summary: ReactNode;
  children: ReactNode;
  onToggle?: (e: SyntheticEvent<HTMLDetailsElement>) => void;
  className?: string;
  meta?: ReactNode;
  flush?: boolean;
}) {
  return (
    <details onToggle={onToggle} className={`group ${className}`}>
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 rounded-control text-[15px] font-medium text-ink select-none hover:text-ink-2">
        {/* keyed to this details only, so a closed disclosure inside an open one never shows a turned chevron */}
        <ChevronRight size={18} strokeWidth={1.75} aria-hidden className="shrink-0 text-ink-3 transition-transform duration-200 motion-reduce:transition-none [[open]>summary>&]:rotate-90" />
        {typeof summary === "string" && /^Show /.test(summary) ? (
          <span className="min-w-0 flex-1">
            <span className="[[open]>summary_&]:hidden">{summary}</span>
            <span className="hidden [[open]>summary_&]:inline">{summary.replace(/^Show /, "Hide ")}</span>
          </span>
        ) : (
          <span className="min-w-0 flex-1">{summary}</span>
        )}
        {meta && <span className="type-footnote shrink-0 font-normal text-ink-2">{meta}</span>}
      </summary>
      <div className={`pt-1 pb-2 ${flush ? "" : "pl-[26px]"}`}>{children}</div>
    </details>
  );
}
