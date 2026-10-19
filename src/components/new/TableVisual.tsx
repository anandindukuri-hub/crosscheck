"use client";

import { FlaskConical, Phone, Plus, Store } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { initials, plural } from "@/lib/labels";
import { callCuisine, callOrder, riskCount } from "@/lib/risk";
import type { Diner, Restaurant, RunMode } from "@/lib/types";
import { whenText } from "../kit/typo";
import { guestNeeds, sortNeeds } from "../run/plain";
import { aliasKitchen } from "../run/alias";
import { Avatar, customKey } from "./GuestEditor";
import { cuisineLabel } from "./hours";

const SPRING = { type: "spring", stiffness: 380, damping: 32 } as const;
const TABLE_R = 100; // a 200px table
const SEAT = 40;
const RING_R = TABLE_R + 16 + SEAT / 2; // seats pulled in around the table, 16px off its edge
const LABEL = 36; // a name and an allergy under or over a seat
const CY = RING_R + SEAT / 2 + LABEL + 8;
const H = CY * 2;

export const MODE_LINE: Record<RunMode, { text: string; short: string; icon: typeof Phone }> = {
  test: { text: "Test calls to your phone", short: "Test calls", icon: Phone },
  live: { text: "Real calls to the restaurants", short: "Real calls", icon: Store },
  replay: { text: "Sample. Scripted kitchens. Nothing is called", short: "Sample", icon: FlaskConical },
};

// every seat at an even angle from 12 o'clock, as many as the party; guests spread out so two face each other
function seatPlan(guests: number, party: number) {
  const seats = Math.min(8, Math.max(party, guests, 1));
  const at = (i: number) => {
    const a = -Math.PI / 2 + (i / seats) * Math.PI * 2;
    return { dx: RING_R * Math.cos(a), dy: RING_R * Math.sin(a), up: Math.sin(a) < -0.5 };
  };
  const guestSeats = Array.from({ length: guests }, (_, g) => Math.round((g * seats) / guests));
  const empty = Array.from({ length: seats }, (_, i) => i).filter((i) => !guestSeats.includes(i));
  return { guest: guestSeats.map(at), empty: empty.map(at) };
}

const SEV = [
  { key: "anaphylaxis", label: "Life threatening", color: "var(--nomatch)" },
  { key: "severe", label: "Severe", color: "var(--chef)" },
  { key: "intolerance", label: "Mild", color: "var(--ink-3)" },
] as const;

// the most serious allergy a guest has, as a dot color; a diet alone gets no dot, and an allergy waiting for its
// severity counts for nothing until one is chosen
function worst(d: Diner, unset: Set<string>) {
  const chosen = d.restrictions.filter((r) => r.kind !== "diet" && !unset.has(r.kind === "custom" ? customKey(r.name) : r.allergen));
  for (const s of SEV) if (chosen.some((r) => r.kind !== "diet" && r.severity === s.key)) return s;
  return null;
}

// the one need a seat names: the most serious allergy, else the diet
function mainNeed(d: Diner): string | null {
  const n = sortNeeds(guestNeeds(d))[0];
  if (!n) return null;
  if (n.diet) return n.text;
  const what = n.what.split(",")[0];
  return what.charAt(0).toUpperCase() + what.slice(1);
}

type Props = {
  diners: Diner[];
  party: number;
  when: string;
  picked: Restaurant[];
  mode: RunMode;
  editing: string | null;
  unset?: Record<string, Set<string>>; // allergies added with no severity chosen yet, by guest
  onPickGuest: (id: string) => void;
  onAddGuest?: () => void;
};

// The table as it will sit tonight: every chair the party needs, each guest in a seat with their most serious allergy
// under their name, open chairs ready for another guest. Then the calls Fo will make, in order.
export function TableVisual({ diners, party, when, picked, mode, editing, unset = {}, onPickGuest, onAddGuest }: Props) {
  const plan = seatPlan(diners.length, party);
  const M = MODE_LINE[mode];
  // the order Fo will call in: the most likely match first (fewest risk overlaps for this table), then the order picked
  const calls = callOrder(picked.map((r) => ({ memory: false, risk: riskCount(callCuisine(mode, r), diners) }))).map((i) => picked[i]);
  return (
    <div className="space-y-4">
      <section aria-label="Your table" className="card overflow-hidden px-8 py-8">
        <div className="relative mx-auto w-full" style={{ height: H }}>
          {/* the table: a raised disc with a hairline edge, the time in its middle */}
          <div
            aria-hidden
            className="absolute left-1/2 rounded-full"
            style={{ width: TABLE_R * 2, height: TABLE_R * 2, top: CY - TABLE_R, marginLeft: -TABLE_R, background: "var(--raised)", boxShadow: "inset 0 0 0 1px var(--line), 0 6px 18px rgba(0,0,0,0.05)" }}
          />
          <div className="pointer-events-none absolute left-1/2 grid place-items-center text-center" style={{ width: 160, height: TABLE_R * 2, top: CY - TABLE_R, marginLeft: -80 }}>
            <div>
              <p className="text-[21px] leading-[1.2] font-semibold tracking-[-0.01em] [text-wrap:balance]">{whenText(when) || "When?"}</p>
              <p className="type-footnote mt-1 text-ink-2">Table for {party}</p>
            </div>
          </div>

          {/* open chairs: a hairline ring with a plus, one tap from a new guest */}
          {plan.empty.map((p, i) => {
            const can = !!onAddGuest && diners.length < 4;
            return (
              <motion.button
                key={`e${i}`}
                type="button"
                onClick={can ? onAddGuest : undefined}
                disabled={!can}
                aria-label={can ? "Add a guest" : "Open seat"}
                className="absolute grid place-items-center rounded-full bg-surface text-ink-3 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.14)] transition-colors enabled:hover:text-accent disabled:cursor-default"
                initial={false}
                animate={{ left: `calc(50% + ${p.dx - SEAT / 2}px)`, top: CY + p.dy - SEAT / 2 }}
                transition={SPRING}
                style={{ width: SEAT, height: SEAT }}
              >
                <Plus size={18} strokeWidth={1.75} aria-hidden />
              </motion.button>
            );
          })}

          <AnimatePresence initial={false}>
            {diners.map((d, i) => {
              const p = plan.guest[i];
              const on = editing === d.id;
              const sev = worst(d, unset[d.id] ?? new Set());
              const name = d.label || (i === 0 ? "You" : "Unnamed");
              const need = mainNeed(d);
              return (
                <motion.div
                  key={d.id}
                  className="absolute"
                  initial={{ opacity: 0, scale: 0.6, left: `calc(50% + ${p.dx}px)`, top: CY + p.dy }}
                  animate={{ opacity: 1, scale: 1, left: `calc(50% + ${p.dx}px)`, top: CY + p.dy }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={SPRING}
                  style={{ x: "-50%", y: "-50%" }}
                >
                  <button
                    type="button"
                    onClick={() => onPickGuest(d.id)}
                    aria-label={`Edit ${name}${sev ? `, ${sev.label.toLowerCase()} allergy` : ""}`}
                    aria-pressed={on}
                    className="relative grid h-11 w-11 place-items-center rounded-full"
                  >
                    <span
                      aria-hidden
                      className={`grid place-items-center rounded-full bg-[#f0f0f2] text-[15px] font-semibold text-ink ${on ? "ring-2 ring-accent ring-offset-2 ring-offset-surface" : ""}`}
                      style={{ width: SEAT, height: SEAT }}
                    >
                      {initials(name)}
                    </span>
                    {/* the severity dot at 2 o'clock, ringed in white so it reads on the seat's edge */}
                    {sev && <span aria-hidden className="absolute top-[1px] right-[1px] h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ background: sev.color }} />}
                  </button>
                  <span className={`absolute left-1/2 w-[120px] -translate-x-1/2 text-center ${p.up ? "bottom-full mb-1" : "top-full mt-1"}`}>
                    <span className={`block truncate text-[13px] leading-[16px] font-semibold ${d.label ? "text-ink" : "text-ink-2"}`}>{name}</span>
                    <span className={`block truncate text-[12px] leading-[16px] ${need ? "text-ink-2" : "text-ink-3"}`}>{need ?? "No allergies yet"}</span>
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </section>

      <section aria-labelledby="calls-order-h" className="card px-5 pt-4 pb-4">
        <div className="flex items-center justify-between gap-3 px-1">
          <h2 id="calls-order-h" className="type-footnote font-medium text-ink-2">
            Calls, in order
          </h2>
          <span className="type-footnote inline-flex items-center gap-1.5 text-ink-2">
            <M.icon size={14} strokeWidth={1.75} aria-hidden />
            {M.short}
          </span>
        </div>
        {picked.length > 0 ? (
          <ol className="mt-2 divide-y divide-hairline">
            <AnimatePresence initial={false}>
              {calls.map((raw, i) => {
                const r = aliasKitchen(mode, raw);
                return (
                  <motion.li
                    key={r.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    transition={SPRING}
                    className="flex min-h-11 items-center gap-3 px-1"
                  >
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#f0f0f2] text-[12px] font-semibold text-ink tabular-nums">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{r.name}</span>
                    <span className="shrink-0 text-[13px] text-ink-2">{raw.source === "test" && mode !== "replay" ? "Your phone" : cuisineLabel({ ...r, source: undefined })}</span>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ol>
        ) : (
          <p className="type-callout mt-2 px-1 pb-1 text-ink-2">
            {mode === "replay" ? "Pick up to 4 sample kitchens. They answer one at a time, the most likely match first." : "Pick up to 5 kitchens. Fo calls them one at a time, the most likely match first."}
          </p>
        )}
      </section>
    </div>
  );
}

// phones: the table shrinks to a header line
export function TableHeader({ diners, party, picked, mode }: Pick<Props, "diners" | "party" | "picked" | "mode">) {
  return (
    <section aria-label="Your table" className="card flex items-center gap-4 px-4 py-3.5">
      <div className="flex -space-x-2" aria-hidden>
        {diners.slice(0, 4).map((d, i) => (
          <span key={d.id} className="rounded-full ring-2 ring-surface">
            <Avatar label={d.label || (i === 0 ? "You" : `Guest ${i + 1}`)} size={36} />
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">
          {plural(diners.length, "guest")} · table for {party}
        </p>
        <p className="truncate text-[13px] text-ink-2">
          {plural(picked.length, "kitchen")} · {MODE_LINE[mode].short}
        </p>
      </div>
    </section>
  );
}
