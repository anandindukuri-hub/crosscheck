// shared by server and client components, so no "use client" here
export type Variant = "primary" | "tinted" | "secondary" | "plain" | "quiet" | "destructive";
export type Size = "sm" | "md" | "lg";

// one disabled look for every filled control: light gray fill, tertiary ink, no shadow
const DISABLED =
  "disabled:cursor-default disabled:bg-[#e8e8ed] disabled:text-ink-3 disabled:shadow-none disabled:hover:bg-[#e8e8ed] aria-disabled:cursor-default aria-disabled:bg-[#e8e8ed] aria-disabled:text-ink-3 aria-disabled:hover:bg-[#e8e8ed]";

// primary: the one filled pill per view. tinted: the same shape, quiet, for a second action that waits its turn.
// secondary: quiet gray control. plain: accent text. quiet: secondary ink text. destructive: red text
export function buttonClass(variant: Variant = "primary", size: Size = "md") {
  const base =
    "inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap font-semibold transition-[background-color,color,opacity,transform] duration-150 active:scale-[0.98] motion-reduce:active:scale-100 disabled:active:scale-100";
  if (variant === "plain" || variant === "quiet" || variant === "destructive") {
    const tone = variant === "plain" ? "text-link" : variant === "quiet" ? "text-ink-2 hover:text-ink" : "text-nomatch";
    const s = size === "lg" ? "text-[17px]" : size === "sm" ? "text-[14px]" : "text-[15px]";
    return `${base} min-h-11 rounded-control px-2 ${tone} ${s} hover:underline underline-offset-4 disabled:cursor-default disabled:text-ink-3 disabled:no-underline aria-disabled:text-ink-3`;
  }
  const v =
    variant === "primary"
      ? `rounded-full bg-accent text-white hover:bg-accent-hover ${DISABLED}`
      : variant === "tinted"
        ? `rounded-full bg-you-tint text-accent hover:bg-[#dce9fb] ${DISABLED}`
        : `rounded-control bg-fill text-ink hover:bg-fill-2 ${DISABLED}`;
  const s = size === "lg" ? "min-h-[50px] px-7 text-[17px]" : size === "sm" ? "min-h-11 px-4 text-[14px] md:min-h-9" : "min-h-11 px-5 text-[15px]";
  return `${base} ${v} ${s}`;
}
