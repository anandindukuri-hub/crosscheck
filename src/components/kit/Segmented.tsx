"use client";

import { motion } from "motion/react";
import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from "react";

type Option<T extends string> = { value: T; label: ReactNode; aria?: string; disabled?: boolean };

const SPRING = { type: "spring", stiffness: 380, damping: 32 } as const;

// iOS segmented control: a radio group with equal segments and one white thumb that can only slide sideways, so a
// layout shift above it can never carry the thumb off its track
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className = "",
  full = false,
  fit = false,
}: {
  value: T | null; // null: nothing chosen yet, so no thumb shows
  onChange: (v: T) => void;
  options: Option<T>[];
  label: string;
  className?: string;
  full?: boolean;
  // phones: a label too long for a third of the row ("Life threatening") keeps one row, each segment as wide as its
  // label plus an even share of the rest, and the thumb follows the segment it is on. Equal segments again from 520px
  fit?: boolean;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const chosen = options.findIndex((o) => o.value === value);
  const at = Math.max(0, chosen);

  function onKey(e: KeyboardEvent) {
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    // arrows skip a segment that cannot be chosen
    let n = at;
    for (let i = 0; i < options.length; i++) {
      n = (n + d + options.length) % options.length;
      if (!options[n].disabled) break;
    }
    if (options[n].disabled) return;
    onChange(options[n].value);
    refs.current[n]?.focus();
  }

  if (fit) return <FitSegmented value={value} onChange={onChange} options={options} label={label} className={className} chosen={chosen} at={at} refs={refs} onKey={onKey} />;

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKey}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` } as CSSProperties}
      className={`${full ? "grid w-full" : "inline-grid"} relative overflow-hidden rounded-full bg-fill-2/70 p-0.5 ${className}`}
    >
      {chosen >= 0 && (
        <motion.span
          aria-hidden
          initial={false}
          animate={{ x: `${at * 100}%` }}
          transition={SPRING}
          style={{ width: `calc((100% - 4px) / ${options.length})` }}
          className="pointer-events-none absolute inset-y-0.5 left-0.5 rounded-full bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.12),0_0_0_0.5px_rgba(0,0,0,0.04)]"
        />
      )}
      {options.map((o, i) => {
        const on = i === chosen;
        return (
          <button
            key={o.value}
            ref={(el) => void (refs.current[i] = el)}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.aria}
            aria-disabled={o.disabled || undefined}
            tabIndex={i === at ? 0 : -1}
            onClick={() => !o.disabled && onChange(o.value)}
            className={`relative min-h-11 min-w-0 rounded-full px-3.5 text-[14px] font-medium transition-colors md:min-h-9 ${on ? "text-ink" : o.disabled ? "cursor-default text-ink-3" : "text-ink-2 hover:text-ink"}`}
          >
            <span className="relative whitespace-nowrap">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function FitSegmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
  chosen,
  at,
  refs,
  onKey,
}: {
  value: T | null;
  onChange: (v: T) => void;
  options: Option<T>[];
  label: string;
  className: string;
  chosen: number;
  at: number;
  refs: RefObject<(HTMLButtonElement | null)[]>;
  onKey: (e: KeyboardEvent) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);
  // the thumb is measured from the chosen segment, again whenever the row changes width
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const b = refs.current[chosen];
      setThumb(b && chosen >= 0 ? { x: b.offsetLeft, w: b.offsetWidth } : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [chosen, value, refs]);

  return (
    <div ref={box} role="radiogroup" aria-label={label} onKeyDown={onKey} className={`relative flex w-full overflow-hidden rounded-full bg-fill-2/70 p-0.5 ${className}`}>
      {thumb && (
        <motion.span
          aria-hidden
          initial={false}
          animate={{ x: thumb.x, width: thumb.w }}
          transition={SPRING}
          className="pointer-events-none absolute inset-y-0.5 left-0 rounded-full bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.12),0_0_0_0.5px_rgba(0,0,0,0.04)]"
        />
      )}
      {options.map((o, i) => {
        const on = i === chosen;
        return (
          <button
            key={o.value}
            ref={(el) => void (refs.current[i] = el)}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.aria}
            aria-disabled={o.disabled || undefined}
            tabIndex={i === at ? 0 : -1}
            onClick={() => !o.disabled && onChange(o.value)}
            className={`relative min-h-11 min-w-0 flex-auto rounded-full px-2.5 text-[13px] font-medium transition-colors min-[520px]:flex-1 min-[520px]:basis-0 min-[520px]:px-3.5 min-[520px]:text-[14px] md:min-h-9 ${on ? "text-ink" : o.disabled ? "cursor-default text-ink-3" : "text-ink-2 hover:text-ink"}`}
          >
            <span className="relative whitespace-nowrap">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
