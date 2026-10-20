"use client";

import { useState } from "react";
import type { LaneUsage } from "@/lib/usage";
import { Disclosure } from "../kit/Disclosure";
import { api, Button, errText } from "../ui";

type Check = { since: number; ours: number; other: number; kitchens: number };

const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
const checkLine = (c: Check) =>
  c.other === 0
    ? `Since this run started, Fo has had ${n(c.since, "conversation", "conversations")}. ${c.since === 1 ? "It is" : "All of them are"} for this run's kitchens.`
    : `Since this run started, Fo has had ${n(c.since, "conversation", "conversations")}. ${n(c.ours, "is", "are")} for this run's kitchens. ${n(c.other, "is your own other chat", "are your own other chats")} with Fo, which CrossCheck does not read.`;

// How this run used Fo: every Fo tool per kitchen and why, from the run's own trace. Check Fo's conversations lists
// Fo's conversations since the run began and sorts them, counts only. Neither one sends Fo anything
export function FoUsage({ runId, usage }: { runId: string; usage: LaneUsage[] }) {
  const [check, setCheck] = useState<Check | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!usage.length) return null;

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setCheck((await api<{ check: Check }>(`/api/runs/${runId}/fo?check=1`)).check);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card px-5 py-2 md:px-6">
      <Disclosure summary="How this run used Fo" meta={<span className="hidden sm:inline">Every Fo tool per kitchen and why</span>}>
        <ul className="space-y-4 pb-3">
          {usage.map((u) => (
            <li key={u.laneId ?? "run"}>
              <p className="type-callout font-medium text-ink">{u.restaurant ?? "This run"}</p>
              <ul className="mt-1 space-y-0.5">
                {u.tools.map((t) => (
                  <li key={t.tool} className="type-footnote text-ink-2">
                    <code className="text-ink">{t.tool}</code> × {t.count}: {t.why.join(", ")}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <div className="border-t border-hairline py-3">
          <Button variant="secondary" size="sm" onClick={run} disabled={busy}>
            {busy ? "Checking…" : "Check Fo's conversations"}
          </Button>
          {check && <p className="type-footnote mt-2 text-ink">{checkLine(check)}</p>}
          {error && <p role="alert" className="type-footnote mt-2 text-nomatch">{error}</p>}
        </div>
      </Disclosure>
    </section>
  );
}
