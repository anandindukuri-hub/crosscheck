"use client";

import { useState } from "react";
import { bookingConfirmShown } from "@/lib/lanes";
import { smart } from "../kit/typo";
import { api, Button, errText } from "../ui";
import type { LaneView } from "./laneState";

// Fo still working (the long report wait, or a lane after a restart) may still be on the phone, so Stop stays
const FINAL = new Set(["done", "error"]);

// Stop all calls for the run, and a warning when Fo said it will call a kitchen again on its own
export function StopControls({ runId, lanes, onChange }: { runId: string; lanes: LaneView[]; onChange: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // a cancelled one stays as a record that Fo was told
  const callbacks = lanes.filter((l) => l.foCallback);
  // after a stop every lane is done or skipped, so a call you start again gets the button back
  // a lane on the "Did Fo book it?" card waits for your answer there, not for a stop
  const open = lanes.some((l) => !l.skipped && !FINAL.has(l.status) && !bookingConfirmShown(l));
  if (!open && !callbacks.length) return null;

  async function go(key: string, url: string, body: unknown) {
    setBusy(key);
    setError(null);
    try {
      await api(url, body);
      setAsking(false);
      onChange();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-label="Stop calls" className="mt-6 space-y-3">
      {callbacks.map((l) =>
        l.foCallback!.cancelled ? (
          <p key={l.id} className="type-footnote rounded-card bg-surface px-4 py-3 text-ink-2 md:px-5">
            Fo was told to cancel the call to {l.restaurant.name}.
          </p>
        ) : (
          <div key={l.id} role="alert" className="rounded-card bg-surface px-4 py-4 md:px-5">
            <p className="type-callout font-medium text-ink">Fo plans to call {l.restaurant.name} again on its own</p>
            <p className="type-footnote mt-1 text-ink-2">{smart(`Fo wrote: "${l.foCallback!.text}" You did not ask for this call. Tap below to tell Fo to cancel it.`)}</p>
            <Button variant="secondary" size="sm" className="mt-3" disabled={!!busy} onClick={() => go(l.id, `/api/runs/${runId}/lanes/${l.id}`, { action: "cancel_callback" })}>
              {busy === l.id ? "Telling Fo…" : "Tell Fo to cancel"}
            </Button>
          </div>
        ),
      )}
      {open &&
        (asking ? (
          <div role="group" aria-label="Stop every call" className="rounded-card bg-surface px-4 py-4 md:px-5">
            <p className="type-callout font-medium text-ink">Stop every call in this run?</p>
            <p className="type-footnote mt-1 text-ink-2">Kitchens Fo has not called yet will not be called. Fo is told to stop and cancel any callback it set.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="destructive" size="sm" disabled={!!busy} onClick={() => go("all", `/api/runs/${runId}/stop`, {})}>
                {busy === "all" ? "Stopping…" : "Stop all calls"}
              </Button>
              <Button variant="plain" size="sm" disabled={!!busy} onClick={() => setAsking(false)}>
                Keep calling
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => setAsking(true)}>
            Stop all calls
          </Button>
        ))}
      {error && <p role="alert" className="type-footnote text-nomatch">{error}</p>}
    </section>
  );
}
