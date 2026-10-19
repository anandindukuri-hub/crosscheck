"use client";

import { useState } from "react";
import { listJoin } from "@/lib/labels";
import type { RunMode } from "@/lib/types";
import { Disclosure } from "../kit/Disclosure";
import { engineText } from "../kit/typo";
import { api, Button, errText } from "../ui";
import { laneFlags, onCallId, type LaneView } from "./laneState";
import { LaneRow, type AskMode } from "./LaneRow";

// Fo asks before every call. When it asks the very same thing for several kitchens, the asks fold into one card
function openerKey(l: LaneView, mode: RunMode, approved: boolean) {
  if (l.status !== "needs_you" || l.skipped || l.phase !== "call" || l.result || l.reports.length) return null;
  const f = laneFlags(l, mode, approved);
  if (f.sendAgain || f.bookedAsk || !l.foQuestion) return null;
  return engineText(l.foQuestion).split(l.restaurant.name).join("{kitchen}").replace(/\s+/g, " ").toLowerCase();
}

export function sameOpener(lanes: LaneView[], mode: RunMode, approved: boolean): LaneView[] {
  const groups = new Map<string, LaneView[]>();
  for (const l of lanes) {
    const k = openerKey(l, mode, approved);
    if (k) groups.set(k, [...(groups.get(k) ?? []), l]);
  }
  const best = [...groups.values()].sort((a, b) => b.length - a.length)[0] ?? [];
  return best.length >= 2 ? best : [];
}

// One filled button per view: the grouped card asks for every kitchen at once; one by one, only the first
// waiting kitchen asks in its row and the rest wait with a Review link to their own sheet
export function askModes(lanes: LaneView[], mode: RunMode, approved: boolean, oneByOne: boolean): Record<string, AskMode> {
  const grouped = new Set(oneByOne ? [] : sameOpener(lanes, mode, approved).map((l) => l.id));
  const out: Record<string, AskMode> = {};
  let first = true;
  for (const l of lanes) {
    if (l.status !== "needs_you" || l.skipped) out[l.id] = "none";
    else if (grouped.has(l.id)) out[l.id] = "none";
    else if (first) {
      out[l.id] = "inline";
      first = false;
    } else out[l.id] = "review";
  }
  return out;
}

export function LaneList({
  runId,
  lanes,
  mode,
  approved,
  oneByOne,
  flash,
  onChange,
  onOpen,
}: {
  runId: string;
  lanes: LaneView[];
  mode: RunMode;
  approved: boolean;
  oneByOne: boolean;
  flash: { id: string | null; n: number };
  onChange: () => void;
  onOpen: (id: string) => void;
}) {
  const asks = askModes(lanes, mode, approved, oneByOne);
  const live = onCallId(lanes, mode, approved);
  // the kitchens stop at first match skipped say why once, under the list, instead of on every row
  const skipped = lanes.find((l) => l.skipped && !l.result && l.status === "done")?.skipped?.reason ?? null;
  const stoppedAt = skipped ? /^(.+) already matched\.?$/.exec(skipped)?.[1] : null;

  return (
    <section aria-labelledby="kitchens-h">
      <h2 id="kitchens-h" className="type-footnote mb-2 px-4 font-medium text-ink-2">
        Kitchens
      </h2>
      <ul className="card overflow-hidden">
        {lanes.map((l, i) => (
          <LaneRow
            key={l.id}
            runId={runId}
            lane={l}
            mode={mode}
            approved={approved}
            first={i === 0}
            ask={asks[l.id]}
            current={l.id === live}
            flash={flash.id === l.id ? flash.n : 0}
            onChange={onChange}
            onOpen={() => onOpen(l.id)}
          />
        ))}
      </ul>
      {skipped && <p className="type-footnote mt-2 px-4 text-ink-2">{stoppedAt ? `${mode === "replay" ? "The sample" : "Fo"} stopped after ${stoppedAt} matched.` : skipped}</p>}
    </section>
  );
}

// Step 2 of 2: the calls were sent to Fo, and Fo asks once before it dials. later: some kitchens were already called,
// so this is just the rest ("3 more calls"). stops: the run still stops at a match, so off once one matched
export function GroupAsk({
  runId,
  lanes,
  later,
  stops = false,
  replay = false,
  onChange,
  onOneByOne,
}: {
  runId: string;
  lanes: LaneView[];
  later: boolean;
  stops?: boolean;
  replay?: boolean;
  onChange: () => void;
  onOneByOne: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const n = lanes.length;

  async function callAll() {
    setBusy(true);
    setErr(null);
    try {
      for (const l of lanes) await api(`/api/runs/${runId}/lanes/${l.id}`, { action: "answer", text: "Yes, go ahead." });
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
      onChange();
    }
  }

  return (
    <section role="group" aria-labelledby="group-ask-h" className="card px-5 pt-5 pb-4 md:px-6 md:pt-6">
      {!later && <p className="type-footnote mb-1 font-medium text-ink-2">Step 2 of 2</p>}
      <h2 id="group-ask-h" className="text-[24px] leading-[1.15] font-semibold tracking-[-0.02em]">
        {replay ? (later ? `${n} more sample ${n === 1 ? "kitchen" : "kitchens"}` : `Play ${n} sample kitchens?`) : later ? `${n} more ${n === 1 ? "call" : "calls"}` : `Start ${n} calls?`}
      </h2>
      <p className="type-callout mt-2 text-ink-2 [text-wrap:pretty]">
        {listJoin(lanes.map((l) => l.restaurant.name))}.{" "}
        {replay ? "Sample kitchens answer from a script. Nothing is called." : "Fo calls one at a time and says it is an AI calling for you."}
        {stops && n > 1 ? " It stops once a kitchen matches." : ""}
      </p>
      <Disclosure summary="Fo’s question to you" className="mt-1">
        <p className="type-callout text-ink [overflow-wrap:anywhere]">{engineText(lanes[0].foQuestion).split(lanes[0].restaurant.name).join("the kitchen")}</p>
      </Disclosure>
      <div className="mt-3 flex flex-col items-stretch gap-1 sm:flex-row sm:items-center sm:gap-3">
        <Button size="lg" onClick={callAll} disabled={busy} className="w-full sm:w-auto">
          {busy ? "Starting…" : replay ? "Play the sample" : "Start calls"}
        </Button>
        <Button variant="plain" onClick={onOneByOne} disabled={busy}>
          Review one by one
        </Button>
      </div>
      {err && (
        <p role="alert" className="type-callout mt-2 text-nomatch">
          {err}
        </p>
      )}
    </section>
  );
}
