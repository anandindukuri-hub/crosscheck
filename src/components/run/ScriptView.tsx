"use client";

import type { CheckInstance, Run } from "@/lib/types";
import { definitions } from "@/lib/checks";
import { callerName, opener } from "@/lib/script";
import { Disclosure } from "../kit/Disclosure";
import { useDevMode } from "../useDevMode";
import { smart } from "../kit/typo";
import { bySeverity, guestNeeds, sortNeeds } from "./plain";
import type { LaneView } from "./laneState";

// the very words Fo says for each check
const question = (c: CheckInstance) => smart(c.spoken);

function H({ children }: { children: string }) {
  return <h3 className="type-footnote mb-2 font-medium text-ink-3">{children}</h3>;
}

// What Fo will say, as a script you can approve: the opening line, your table, the questions and the limits.
// The exact request Fo gets stays one tap away
export function ScriptView({ run, lane, script }: { run: Run; lane: LaneView; script: string }) {
  const checks = run.checks[lane.id] ?? [];
  const forWhom = (c: CheckInstance) =>
    run.diners
      .filter((d) => c.dinerIds.includes(d.id))
      .map((d) => d.label)
      .join(" and ");
  const exact = smart(script.replace(/<FO_TEST_PHONE>/g, "your test phone"));
  const dev = useDevMode();

  return (
    <div className="space-y-7 text-[17px] leading-[1.47]">
      <section>
        <H>Fo opens with</H>
        <p className="text-ink">“{smart(opener(callerName(run)))}”</p>
      </section>

      <section>
        <H>Your table</H>
        <ul className="divide-y divide-hairline rounded-input bg-surface">
          {bySeverity(run.diners).map((d) => (
            <li key={d.id} className="px-4 py-3">
              <p className="font-semibold">{d.label}</p>
              <p className="type-callout text-ink-2">{sortNeeds(guestNeeds(d)).map((n) => (n.severity ? `${n.severity}: ${n.text.toLowerCase()}` : n.text)).join(" · ")}</p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <H>Fo asks</H>
        <p className="type-footnote -mt-1 mb-3 text-ink-2">
          First, which dishes could work for each guest. Then one question at a time. At the end Fo repeats the answers so the kitchen can fix
          anything wrong.
        </p>
        {/* the same definitions line the real call uses: "peanut" here includes peanut oil of any kind */}
        <p className="type-footnote mb-3 text-ink-2">In the questions, {smart(definitions(run.diners).join("; "))}.</p>
        <ol className="space-y-3">
          {checks.map((c, i) => (
            <li key={c.key} className="grid grid-cols-[24px_minmax(0,1fr)] gap-2">
              <span className="text-ink-3 tabular-nums">{i + 1}.</span>
              <span>
                <span className="block text-ink">{question(c)}</span>
                <span className="type-footnote block text-ink-2">
                  For {forWhom(c)}
                  {dev && <span className="ml-1.5 font-mono text-[11px] text-ink-3">{c.code}</span>}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <H>Fo will not</H>
        <ul className="space-y-1 text-ink">
          <li>Book anything on this call.</li>
          <li>Push if the kitchen says no.</li>
          <li>Take more than five minutes.</li>
        </ul>
        <p className="type-footnote mt-2 text-ink-2">If the kitchen says no, Fo thanks them and ends the call.</p>
      </section>

      {dev && (
        <Disclosure summary="Show the exact request">
          <pre className="font-mono text-[13px] leading-relaxed whitespace-pre-wrap text-ink-2 [overflow-wrap:anywhere]">{exact}</pre>
        </Disclosure>
      )}
    </div>
  );
}
