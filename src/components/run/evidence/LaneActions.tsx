"use client";

import { CalendarCheck, ChefHat, ChevronsUpDown, Phone, RotateCcw, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { agreedBoxShown } from "@/lib/lanes";
import { callerName } from "@/lib/script";
import type { Run } from "@/lib/types";
import { buttonClass } from "../../kit/button";
import { Spinner } from "../../kit/Spinner";
import { whenPhrase } from "../../kit/typo";
import { clockText, reconfirmWindow } from "../plain";
import { api, Button } from "../../ui";
import { isBooked, type LaneFlags, type LaneView } from "../laneState";
import type { Act } from "../useLaneAct";
import { NoteCard } from "./NoteCard";
import { TalkToFo } from "./TalkToFo";

const CAPS = [0, 25, 50, 100] as const;
const capText = (n: number) => (n === 0 ? "Ask me first" : `Up to $${n}`);
const dialable = (phone: string) => /\d{3}/.test(phone);

// Fo is calling the chef back for this kitchen: from the tap (an optimistic lane) until the new answer lands
export const chefCalling = (lane: LaneView, f: LaneFlags) => lane.phase === "callback" && f.running;

export const hasActions = (lane: LaneView, f: LaneFlags, approved: boolean) =>
  f.canAskChef ||
  chefCalling(lane, f) ||
  (f.good && !approved && !lane.booking) ||
  f.canBook ||
  f.stuck ||
  f.replayStopped ||
  (f.card.kind === "ok" && isBooked(lane)) ||
  f.canStartReconfirm ||
  f.canCallAgain ||
  f.canCallAnyway ||
  (approved && !f.replay) ||
  lane.result?.state === "no_answer" ||
  lane.result?.state === "not_matched";

const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

// One full width primary and at most one secondary. Book opens a confirm step that the sheet draws in its body
export function LaneActions({
  run,
  lane,
  f,
  act,
  busy,
  calling,
  otherMatched,
  read,
  onBook,
  onAskChef,
  onClose,
}: {
  run: Run;
  lane: LaneView;
  f: LaneFlags;
  act: Act;
  busy: boolean;
  calling?: boolean;
  otherMatched?: string | null;
  read: { all: boolean; count: number; of: number };
  onBook: () => void;
  onAskChef: () => void;
  onClose: () => void;
}) {
  const approved = !!run.approvedAt;
  const booked = isBooked(lane);
  const passOk = f.card.kind === "ok" && booked;
  const needsTicks = lane.result?.state === "needs_review" && !read.all;
  const test = run.mode === "test";
  const href = `/card/${run.id}/${lane.id}`;
  const state = lane.result?.state;
  const name = lane.restaurant.name;

  let primary: ReactNode = null;
  let secondary: ReactNode = null;
  let helper: string | null = null;
  let caption: string | null = null;

  const pass = (filled: boolean) =>
    filled ? (
      <Link href={href} className={`${buttonClass("primary", "lg")} w-full`}>
        <Wallet size={18} strokeWidth={1.75} aria-hidden />
        Open table pass
      </Link>
    ) : (
      <Link href={href} className={buttonClass("plain")}>
        Open table pass
      </Link>
    );

  if (calling || chefCalling(lane, f)) {
    primary = (
      <Button size="lg" className="w-full" disabled aria-busy="true">
        <Spinner />
        {f.replay ? "Playing the chef’s answer" : "Calling the chef back"}
      </Button>
    );
    caption = f.replay ? "Sample. The chef’s scripted answer shows here." : "Fo asks only the questions that were not clear. The answer shows here.";
  } else if (f.canAskChef) {
    const open = lane.result?.checks.filter((c) => c.outcome !== "pass").length ?? 1;
    primary = (
      <Button size="lg" className="w-full" onClick={onAskChef} disabled={busy}>
        <ChefHat size={18} strokeWidth={1.75} aria-hidden />
        Ask the chef again
      </Button>
    );
    caption = f.replay
      ? `The sample plays the chef’s answer to only ${open > 1 ? "these questions" : "this question"}.`
      : open > 1
        ? "Fo calls back and asks only these questions."
        : "Fo calls back and asks only this question.";
  } else if (f.canBook) {
    if (needsTicks) helper = `Tick each quote you have read first (${read.count} of ${read.of})`;
    primary = (
      <Button size="lg" className="w-full" onClick={onBook} disabled={busy || needsTicks}>
        {test ? "Test booking" : `Book ${name}`}
      </Button>
    );
  } else if (f.stuck) {
    primary = (
      <Button size="lg" className="w-full" onClick={() => act({ action: "resume" })} disabled={busy}>
        <RotateCcw size={18} strokeWidth={1.75} aria-hidden />
        Resume
      </Button>
    );
  } else if (f.replayStopped) {
    primary = (
      <Link href={`/new?from=${run.id}`} className={`${buttonClass("primary", "lg")} w-full`}>
        Start a new table
      </Link>
    );
    caption = "This sample cannot pick up where it stopped. Nothing was called. Start a new table and pick Sample to see it again.";
  } else if (f.canStartReconfirm) {
    const w = reconfirmWindow(run.when, run.createdAt);
    if (w.open || !passOk) {
      primary = (
        <Button size="lg" className="w-full" onClick={() => act({ action: "reconfirm" })} disabled={busy}>
          <CalendarCheck size={18} strokeWidth={1.75} aria-hidden />
          Reconfirm now
        </Button>
      );
      caption = "Fo calls back in case the menu or the cook changed.";
      if (passOk) secondary = pass(false);
    } else {
      primary = pass(true);
      secondary = (
        <p className="type-footnote text-center text-ink-2">
          {w.opens ? `Reconfirm after ${clockText(w.opens).replace(":00", "")}, when the cook for your table is in.` : "Reconfirm on the day, when the cook for your table is in."}{" "}
          <button type="button" onClick={() => act({ action: "reconfirm" })} disabled={busy} className="inline-flex min-h-11 items-center font-medium text-link hover:underline disabled:text-ink-3">
            Reconfirm now
          </button>
        </p>
      );
    }
  } else if (passOk) {
    primary = pass(true);
  } else if (f.canCallAnyway) {
    const needsTick = run.mode === "live" && !lane.agreed;
    if (needsTick) helper = `Tick that ${name} said yes to the call first.`;
    primary = (
      <Button size="lg" variant="tinted" className="w-full" onClick={() => act({ action: "call_anyway" })} disabled={busy || needsTick}>
        <Phone size={18} strokeWidth={1.75} aria-hidden />
        Call anyway
      </Button>
    );
    caption = f.replay ? "Sample. The scripted Fo asks once more before it dials." : "Fo asks you once more before it dials.";
  } else if (state === "no_answer" && !f.running) {
    // nobody picked up and Fo does not call back on its own. When another kitchen already matched, going back to it
    // leads, so a good result is never thrown away; otherwise calling the kitchen yourself leads, with its number
    if (otherMatched) {
      primary = (
        <Button size="lg" className="w-full" onClick={onClose}>
          Back to your kitchens
        </Button>
      );
      secondary = (
        <Link href={`/new?from=${run.id}`} className={buttonClass("plain")}>
          Start a new table
        </Link>
      );
    } else if (dialable(lane.restaurant.phone)) {
      primary = (
        <a href={telHref(lane.restaurant.phone)} className={`${buttonClass("primary", "lg")} w-full`}>
          <Phone size={20} strokeWidth={1.75} aria-hidden />
          Call {name}
        </a>
      );
      secondary = (
        <Link href={`/new?from=${run.id}`} className={buttonClass("plain", "lg")}>
          Start a new table with other kitchens
        </Link>
      );
    } else {
      primary = (
        <Link href={`/new?from=${run.id}`} className={`${buttonClass("primary", "lg")} w-full`}>
          Start a new table with other kitchens
        </Link>
      );
      secondary = (
        <Button variant="plain" size="lg" onClick={onClose}>
          Back to your kitchens
        </Button>
      );
    }
  } else if (state === "not_matched" && !f.running) {
    primary = (
      <Button size="lg" variant="tinted" className="w-full" onClick={onClose}>
        Back to your kitchens
      </Button>
    );
  }

  if (f.chefCalledOnce) helper = "Fo already called the chef back once. CrossCheck will not keep calling this kitchen.";
  if (f.good && !approved && !lane.booking) helper = "Send the calls to Fo first, then you can book this table.";
  if (!secondary && f.canCallAgain)
    secondary = (
      <Button variant="plain" onClick={() => act({ action: "call_again" })} disabled={busy}>
        Call again
      </Button>
    );
  if (!secondary && approved && !f.replay) secondary = <TalkToFo />;
  if (!primary && !secondary && !helper) return null;

  return (
    <div className="space-y-2">
      {helper && <p className="type-footnote text-ink-2">{helper}</p>}
      {primary}
      {caption && <p className="type-callout text-center text-ink-2">{caption}</p>}
      {secondary && <div className={`flex flex-wrap items-center ${primary ? "justify-center" : ""}`}>{secondary}</div>}
    </div>
  );
}

// The agree tick sits in the confirm body and Book in the footer: Book waits until the tick is on and saved
type AgreeGate = { name: string; blocked: boolean; saving: Promise<unknown> | null };
let agreeGate: AgreeGate | null = null;
const gateSubs = new Set<() => void>();
const setAgreeGate = (g: AgreeGate | null) => {
  agreeGate = g;
  gateSubs.forEach((f) => f());
};
const subscribeGate = (f: () => void) => {
  gateSubs.add(f);
  return () => void gateSubs.delete(f);
};
const gateFor = (name: string) => (agreeGate?.name === name ? agreeGate : null);

// The confirm step, drawn in the sheet's scrolling body: what Fo will do, the deposit Fo may agree to and the note itself
export function BookConfirm({ run, lane, cap, setCap, locked = false }: { run: Run; lane: LaneView; cap: number; setCap: (n: number) => void; locked?: boolean }) {
  const test = run.mode === "test";
  const who = callerName(run);
  const name = lane.restaurant.name;
  // a live booking phones the kitchen: a kitchen from memory still needs the restaurant's yes, ticked here
  const [askAgreed] = useState(() => agreedBoxShown(run.mode, true, lane.agreed));
  const [agreed, setAgreed] = useState(lane.agreed);
  const [startAgreed] = useState(lane.agreed);
  const [agreeErr, setAgreeErr] = useState<string | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    if (!askAgreed) return;
    setAgreeGate({ name, blocked: !startAgreed, saving: null });
    return () => {
      if (agreeGate?.name === name) setAgreeGate(null);
    };
  }, [askAgreed, name, startAgreed]);
  async function tickAgreed(v: boolean) {
    const n = ++seq.current;
    setAgreed(v);
    setAgreeErr(null);
    const save = api(`/api/runs/${run.id}/lanes/${lane.id}`, { action: "agree", agreed: v });
    setAgreeGate({ name, blocked: !v, saving: save });
    try {
      await save;
      if (n === seq.current) setAgreeGate({ name, blocked: !v, saving: null });
    } catch {
      if (n !== seq.current) return;
      setAgreed(!v);
      setAgreeGate({ name, blocked: v, saving: null });
      setAgreeErr("Could not save the tick. Try again.");
    }
  }
  return (
    <div className="space-y-6">
      {askAgreed && (
        <div>
          <label className="flex cursor-pointer items-start gap-3 rounded-card bg-surface px-4 py-3.5 text-[15px]">
            <input type="checkbox" checked={agreed} disabled={locked} onChange={(e) => void tickAgreed(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]" />
            <span>{lane.restaurant.name} has said yes to a short AI call. Fo phones them to book.</span>
          </label>
          {agreeErr && (
            <p role="alert" className="type-footnote mt-2 px-4 text-nomatch">
              {agreeErr}
            </p>
          )}
        </div>
      )}
      <p className="type-body text-ink">
        {test
          ? `Fo emails you the allergy note and says what it would have booked: ${lane.restaurant.name}, table for ${run.partySize}, ${whenPhrase(run.when)}.`
          : `${run.mode === "replay" ? "Sample. In a real booking, " : ""}Fo books ${lane.restaurant.name} for ${run.partySize} ${whenPhrase(run.when)}${who ? ` under ${who}` : ""} and sends the allergy note to the kitchen.`}
      </p>
      <div>
        {/* an iOS list row: the native menu opens over it, so the value is always one of the four */}
        <label className={`relative flex min-h-[52px] items-center gap-3 rounded-input bg-surface px-4 ${locked ? "" : "hover:bg-[#fbfbfd]"}`}>
          <span className="flex-1 text-[17px] text-ink">Deposit</span>
          <span className="text-[17px] text-ink-2 tabular-nums">{capText(cap)}</span>
          <ChevronsUpDown size={16} strokeWidth={1.75} aria-hidden className="-mr-1 shrink-0 text-ink-3" />
          <select
            value={cap}
            disabled={locked}
            onChange={(e) => setCap(Number(e.target.value))}
            aria-label="Deposit Fo may agree to"
            className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0 disabled:cursor-default"
          >
            {CAPS.map((n) => (
              <option key={n} value={n}>
                {capText(n)}
              </option>
            ))}
          </select>
        </label>
        <p className="type-footnote mt-2 px-4 text-ink-2">
          {cap === 0 ? "If the kitchen asks for a deposit, Fo checks with you first." : `Fo agrees to a deposit up to $${cap} only if the kitchen asks for one.`}
        </p>
      </div>
      <section aria-labelledby="note-h">
        <h3 id="note-h" className="type-footnote mb-2 px-4 font-medium text-ink-2">
          The allergy note Fo sends
        </h3>
        <NoteCard run={run} lane={lane} />
      </section>
    </div>
  );
}

// the confirm step's footer: only the two buttons, so Book never moves however long the note is. Once Book is
// pressed it stays here, busy, until the lane reports the booking: Cancel goes away and nothing can be pressed twice
export function BookFooter({ test, name, busy, onBook, onCancel }: { test: boolean; name: string; busy: boolean; onBook: () => void; onCancel: () => void }) {
  const gate = useSyncExternalStore(subscribeGate, () => gateFor(name), () => null);
  async function press() {
    const saving = gateFor(name)?.saving;
    if (saving) await saving.catch(() => undefined);
    if (gateFor(name)?.blocked) return;
    onBook();
  }
  return (
    <div className="space-y-1">
      <Button size="lg" className="w-full" onClick={() => void press()} disabled={busy || !!gate?.blocked || !!gate?.saving} aria-busy={busy || undefined}>
        {busy && <Spinner />}
        {busy ? "Booking" : test ? "Send the test booking" : `Book ${name}`}
      </Button>
      <div className={`flex justify-center transition-opacity duration-200 ${busy ? "pointer-events-none opacity-0" : ""}`} aria-hidden={busy || undefined}>
        <button
          type="button"
          onClick={onCancel}
          tabIndex={busy ? -1 : undefined}
          className="inline-flex min-h-11 items-center justify-center rounded-control px-3 text-[17px] font-semibold text-link transition-opacity hover:opacity-80 active:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
