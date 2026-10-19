"use client";

import { Skeleton } from "../ui";
import { setDevMode, useDevMode } from "../useDevMode";
import { useStatus } from "../useStatus";
import { KeysList } from "./StepKeys";
import { StepFo } from "./StepFo";

export function DevStatus() {
  const { data: s, error } = useStatus(5_000);
  if (!s) return error ? <p className="type-callout py-4 text-nomatch">{error}</p> : <Skeleton className="my-4 h-24 w-full" />;
  return (
    <div>
      <KeysList keys={s.keys} />
      <div className="border-t border-hairline">
        <StepFo fo={s.fo} />
      </div>
    </div>
  );
}

// test calls to your own phone on New table, replays in Your tables and setup status in the bar, only when this is on
export function DevToggle() {
  const on = useDevMode();
  return (
    <label className="flex min-h-[64px] cursor-pointer items-center gap-4 py-3">
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-semibold">Show developer modes</span>
        <span className="type-callout block text-ink-2">Adds test calls to your own phone to New table. Shows samples and setup status. Real calls stay the default.</span>
      </span>
      <span className="relative inline-flex shrink-0">
        <input type="checkbox" role="switch" checked={on} onChange={(e) => setDevMode(e.target.checked)} className="peer sr-only" />
        <span aria-hidden className="h-[31px] w-[51px] rounded-full bg-fill-2 transition-colors peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent" />
        <span aria-hidden className="absolute top-[2px] left-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.15),0_1px_1px_rgba(0,0,0,0.16)] transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}
