"use client";

import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { approvalPlan } from "@/lib/lanes";
import { callerName } from "@/lib/script";
import type { CheckInstance, Run } from "@/lib/types";
import { Sheet } from "../kit/Sheet";
import { StateLabel } from "../kit/State";
import { Button, plural, RESULT_META } from "../ui";
import type { LaneView } from "./laneState";
import { ScriptView } from "./ScriptView";
import { useLaneAct } from "./useLaneAct";

// Step 1 of 2, before anything is called: each kitchen, what Fo will say and one Send to Fo
export function ApproveCard({
  run,
  lanes,
  scripts,
  calibration,
  busy,
  onApprove,
  onChange,
  onOpen,
}: {
  run: Run;
  lanes: LaneView[];
  scripts: Record<string, string>;
  calibration: boolean;
  busy: boolean;
  onApprove: () => void;
  onChange: () => void;
  onOpen: (id: string) => void;
}) {
  const [script, setScript] = useState<string | null>(null);
  // the same plan the server uses: with stop at first match on, a kitchen matched from memory means no calls at all
  const plan = approvalPlan(run, lanes);
  const toCall = plan.call;
  const n = toCall.length;
  const canApprove = run.mode !== "live" || toCall.every((l) => l.agreed);
  const stops = run.stopAtFirstMatch && n > 1 ? " Fo stops once one matches." : "";
  const text =
    n === 0
      ? plan.winner
        ? `${plan.winner.restaurant.name} matched on answers from an earlier call. Fo calls no one else. Approve to book it. You can still call the others after.`
        : "Every kitchen here matched on answers from an earlier call. No calls are needed. Approve to book and reconfirm."
      : run.mode === "live"
        ? `Fo will call ${n === 1 ? "1 real restaurant" : `${n} real restaurants, one at a time, the most likely match first`}, say it is an AI calling for ${callerName(run)} and ask for the chef.${stops}`
        : run.mode === "test"
          ? `Fo will call your own phone ${n === 1 ? "once" : `${n} times, one at a time`}. ${calibration ? "Answer with your lines below." : "Answer as each kitchen."}${stops}`
          : `Scripted kitchens. Nothing is called and nothing is sent.${stops}`;
  const open = lanes.find((l) => l.id === script);

  return (
    <section aria-labelledby="approve-h" className="card overflow-hidden">
      <div className="px-6 pt-6 pb-2 md:px-8 md:pt-7">
        {n > 0 && <p className="type-footnote font-medium text-ink-2">Step 1 of 2</p>}
        <h2 id="approve-h" className="type-title mt-1">
          Review the calls
        </h2>
        <p className="type-body mt-2 max-w-2xl text-ink-2">{text}</p>
      </div>
      <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
        {lanes.map((l) => (
          <ApproveRow key={l.id} runId={run.id} lane={l} live={run.mode === "live"} checks={run.checks[l.id]} onScript={() => setScript(l.id)} onOpen={() => onOpen(l.id)} onChange={onChange} />
        ))}
      </ul>
      <div className="flex flex-col-reverse items-stretch gap-3 border-t border-hairline px-6 py-5 sm:flex-row sm:items-center sm:justify-between md:px-8">
        <p className="type-footnote text-ink-2">
          {!canApprove ? (
            <span className="font-medium text-nomatch">Tick each restaurant that said yes first.</span>
          ) : run.mode === "replay" ? (
            "Sample. Nothing is called."
          ) : n > 0 ? (
            "Nothing is called yet. Fo asks you once more before it dials."
          ) : (
            "Nothing is called."
          )}
        </p>
        <Button size="lg" onClick={onApprove} disabled={busy || !canApprove} className="shrink-0">
          {busy ? "Sending…" : n > 0 ? "Send to Fo" : "Approve"}
        </Button>
      </div>
      <Sheet open={!!open} onClose={() => setScript(null)} title="What Fo will say" subtitle={open ? `${open.restaurant.name} · ${plural(run.checks[open.id]?.length ?? 0, "question")}` : null}>
        {open && <ScriptView run={run} lane={open} script={scripts[open.id] ?? ""} />}
      </Sheet>
    </section>
  );
}

function ApproveRow({
  runId,
  lane,
  live,
  checks,
  onScript,
  onOpen,
  onChange,
}: {
  runId: string;
  lane: LaneView;
  live: boolean;
  checks: CheckInstance[] | undefined;
  onScript: () => void;
  onOpen: () => void;
  onChange: () => void;
}) {
  const { act, busy, err } = useLaneAct(runId, lane.id, onChange);
  const r = lane.result;
  return (
    <li>
      {lane.fromMemory && r ? (
        <button type="button" onClick={onOpen} className="flex min-h-[64px] w-full items-center gap-4 px-6 py-3 text-left hover:bg-fill/40 md:px-8">
          <span className="min-w-0 flex-1">
            <span className="block text-[17px] leading-[1.3] font-semibold [overflow-wrap:anywhere]">{lane.restaurant.name}</span>
            <span className="type-callout mt-0.5 block">
              <StateLabel tone={RESULT_META[r.state].tone}>Answered before: {RESULT_META[r.state].label}</StateLabel>
            </span>
          </span>
          <ChevronRight size={18} strokeWidth={1.75} aria-hidden className="shrink-0 text-ink-3" />
        </button>
      ) : (
        // the whole row opens what Fo will say, so a long name never gets cut for a link beside it
        <button type="button" onClick={onScript} aria-haspopup="dialog" className="flex min-h-[64px] w-full items-center gap-4 px-6 py-3 text-left hover:bg-fill/40 md:px-8">
          <span className="min-w-0 flex-1">
            <span className="block text-[17px] leading-[1.3] font-semibold [overflow-wrap:anywhere]">{lane.restaurant.name}</span>
            <span className="type-callout mt-0.5 block text-ink-2">
              {plural(checks?.length ?? 0, "question")} · <span className="text-link">What Fo will say</span>
            </span>
          </span>
          <ChevronRight size={18} strokeWidth={1.75} aria-hidden className="shrink-0 text-ink-3" />
        </button>
      )}
      {live && (
        <label className="type-callout mb-3 flex cursor-pointer items-start gap-3 px-6 text-ink md:px-8">
          <input type="checkbox" checked={lane.agreed} disabled={busy} onChange={(e) => act({ action: "agree", agreed: e.target.checked })} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]" />
          <span>{lane.restaurant.name} has said yes to a short AI call about allergies.</span>
        </label>
      )}
      {err && <p className="type-footnote mb-2 px-6 text-nomatch md:px-8">{err}</p>}
    </li>
  );
}
