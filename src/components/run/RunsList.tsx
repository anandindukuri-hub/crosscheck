"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { buttonClass } from "../kit/button";
import { StateDot, type RingTone } from "../kit/State";
import { useDevMode } from "../useDevMode";
import { Facts } from "./RunSummary";

// title: the kitchen the table came out at, or how many kitchens are still in play. at: the table's own time.
// hidden: a replay, or an old practice call never sent, shown only with the toggle
export type RunRow = { id: string; title: string; at: number; upcoming: boolean; tone: RingTone; word: string; meta: string[]; replay: boolean; draft: boolean; hidden: boolean };

// replays are a developer's tool: hidden unless developer modes are on and this toggle asks for them
const KEY = "cc-show-replays";
const subs = new Set<() => void>();
const read = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};
function setShow(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {}
  subs.forEach((f) => f());
}

// Each table as an iOS list row: the kitchen it came out at, how it came out (a dot and the words), then its time and
// quiet facts that never break mid phrase. Upcoming tables first, soonest first; then past tables, latest first.
export function RunsList({ rows }: { rows: RunRow[] }) {
  const dev = useDevMode();
  const show = useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => void subs.delete(f);
    },
    read,
    () => false,
  );
  const hidden = rows.filter((r) => r.hidden);
  const visible = rows.filter((r) => !r.hidden || (dev && show));
  // with no real tables yet, the latest sample tables show on their own, so a first sample table is never lost. They
  // sort like any table: coming up soonest first, then past ones newest first
  const samples = visible.length === 0 ? rows.filter((r) => r.replay).sort((a, b) => b.at - a.at).slice(0, 3) : [];
  const shown = visible.length ? visible : samples;
  const groups = [
    { id: "upcoming", label: "Coming up", list: shown.filter((r) => r.upcoming).sort((a, b) => a.at - b.at) },
    { id: "past", label: "Past", list: shown.filter((r) => !r.upcoming).sort((a, b) => b.at - a.at) },
  ].filter((g) => g.list.length);
  const label = hidden.every((r) => r.replay) ? "Show samples" : hidden.some((r) => r.replay) ? "Show samples and drafts" : "Show drafts";

  return (
    <>
      {dev && hidden.length > 0 && (
        <label className="card mt-8 flex min-h-[52px] cursor-pointer items-center justify-between gap-4 px-4 md:px-5">
          <span className="text-[17px] text-ink">
            {label} ({hidden.length})
          </span>
          <span className="relative inline-flex shrink-0">
            <input type="checkbox" role="switch" checked={show} onChange={(e) => setShow(e.target.checked)} className="peer sr-only" />
            <span aria-hidden className="h-[31px] w-[51px] rounded-full bg-fill-2 transition-colors peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent" />
            <span aria-hidden className="absolute top-[2px] left-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.15),0_1px_1px_rgba(0,0,0,0.16)] transition-transform peer-checked:translate-x-5" />
          </span>
        </label>
      )}
      {visible.length === 0 && samples.length === 0 ? (
        <div className="card mt-10 flex flex-col items-center px-6 py-14 text-center">
          <p className="type-headline">No tables yet</p>
          <p className="type-callout mt-2 max-w-sm text-ink-2">Add who is eating and Fo calls the kitchens for you.</p>
          <Link href="/new" className={`${buttonClass("primary")} mt-6`}>
            Start a table
          </Link>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.id} aria-labelledby={`group-${g.id}`} className="mt-10">
            <h2 id={`group-${g.id}`} className="mb-2 px-4 text-[13px] font-semibold text-ink-2">
              {g.label}
            </h2>
            <ul className="card overflow-hidden">
              {g.list.map((r, i) => (
                <li key={r.id} className="relative">
                  {i > 0 && <span aria-hidden className="absolute top-0 right-0 left-4 h-px bg-hairline md:left-5" />}
                  <Link href={`/run/${r.id}`} className="flex min-h-[72px] items-center gap-3 px-4 py-3 transition-colors hover:bg-fill/50 md:px-5">
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="truncate text-[17px] leading-[1.3] font-semibold">{r.title}</span>
                        {r.replay && <span className="shrink-0 text-[12px] font-medium text-ink-2">Sample</span>}
                      </span>
                      <span className="type-callout mt-0.5 flex items-baseline gap-2 text-ink">
                        <StateDot tone={r.tone} size={8} className="relative top-[-1px] shrink-0" />
                        <span className="line-clamp-2 min-w-0">{r.word}</span>
                      </span>
                      <span className="type-footnote mt-0.5 block text-ink-2">
                        <Facts items={r.meta} />
                      </span>
                    </span>
                    <ChevronRight size={18} strokeWidth={1.75} aria-hidden className="shrink-0 text-ink-3" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
