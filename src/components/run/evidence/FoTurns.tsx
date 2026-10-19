"use client";

import { useState } from "react";
import type { Lane } from "@/lib/types";
import { Disclosure } from "../../kit/Disclosure";
import { engineText, sentence } from "../../kit/typo";
import { api, errText, fmtTime, Skeleton } from "../../ui";
import { useDevMode } from "../../useDevMode";
import { reportRows } from "../plain";

type Turn = { role: string; text: string; at: string | null };
type State = { kind: "idle" } | { kind: "loading" } | { kind: "ok"; turns: Turn[] } | { kind: "error"; msg: string };

const who = (role: string) => (role === "assistant" || role === "fo" ? "Fo" : role === "user" ? "CrossCheck" : sentence(role.replace(/_/g, " ")));

// the lane's own Fo thread, fetched when opened. The sheet is the only scroller
export function FoTurns({ runId, laneId }: { runId: string; laneId: string }) {
  const [s, setS] = useState<State>({ kind: "idle" });

  function load() {
    setS({ kind: "loading" });
    api<{ turns: Turn[] }>(`/api/runs/${runId}/lanes/${laneId}/fo`)
      .then((d) => setS({ kind: "ok", turns: d.turns }))
      .catch((e) => setS({ kind: "error", msg: errText(e) }));
  }

  return (
    <Disclosure
      summary="Fo conversation"
      onToggle={(e) => {
        if (e.currentTarget.open && (s.kind === "idle" || s.kind === "error")) load();
      }}
    >
      <div aria-live="polite" aria-busy={s.kind === "loading"}>
        {s.kind === "loading" && (
          <div className="space-y-2 py-1">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="ml-auto h-10 w-1/2" />
          </div>
        )}
        {s.kind === "error" && (
          <p className="type-callout text-ink-2">
            {/dev replay|sample/i.test(s.msg) ? "This is a sample. There is no Fo conversation to show." : engineText(s.msg)}{" "}
            {!/dev replay|sample/i.test(s.msg) && (
              <button type="button" onClick={load} className="min-h-11 font-semibold text-link hover:underline">
                Try again
              </button>
            )}
          </p>
        )}
        {s.kind === "ok" &&
          (s.turns.length === 0 ? (
            <p className="type-callout text-ink-2">No messages yet. They show up here once Fo starts.</p>
          ) : (
            <ol className="space-y-2 py-1">
              {s.turns.map((t, i) => {
                const fo = who(t.role) === "Fo";
                return (
                  <li key={i} className={`flex flex-col ${fo ? "items-start" : "items-end"}`}>
                    <p className="type-caption mb-0.5 px-1 text-ink-2">
                      {who(t.role)}
                      {t.at ? ` · ${fmtTime(t.at)}` : ""}
                    </p>
                    <p className={`type-callout max-w-[88%] rounded-[18px] px-3.5 py-2 whitespace-pre-wrap [overflow-wrap:anywhere] ${fo ? "bg-surface text-ink" : "bg-ink text-white"}`}>{engineText(t.text)}</p>
                  </li>
                );
              })}
            </ol>
          ))}
      </div>
    </Disclosure>
  );
}

const REPORT_TITLE = { call: "Call report", callback: "Chef callback report", reconfirm: "Reconfirm report" } as const;

// the call log as a timeline and each report as label and value rows, with the raw text one tap further. The answers
// are already on the sheet, so a report lists who answered, the dishes, the read back and the length, and points up.
// order: guest names, most serious allergy first, so the dishes read in that order
export function CallLog({ lane, order }: { lane: Pick<Lane, "events" | "reports">; order: string[] }) {
  const dev = useDevMode();
  if (!lane.reports.length && !lane.events.length) return null;
  return (
    <Disclosure summary="Call log and reports" meta={lane.events.length ? `${lane.events.length} events` : undefined} flush>
      {lane.events.length > 0 && (
        <ol className="space-y-1.5">
          {lane.events.slice(-30).map((e, i) => (
            <li key={`${e.at}-${i}`} className="grid grid-cols-[72px_minmax(0,1fr)] items-baseline gap-3">
              <span className="type-footnote whitespace-nowrap text-ink-3 tabular-nums">{fmtTime(e.at)}</span>
              <span className="type-callout text-ink [overflow-wrap:anywhere]">{sentence(engineText(e.text.slice(0, 280)))}</span>
            </li>
          ))}
        </ol>
      )}
      {lane.reports.map((rep, i) => {
        const { rows, answers } = reportRows(rep.text, order);
        return (
          <section key={i} className="mt-5">
            <h4 className="type-footnote font-semibold text-ink-2">
              {REPORT_TITLE[rep.kind]} · {fmtTime(rep.at)}
            </h4>
            {rows.length > 0 && (
              <dl className="mt-2 divide-y divide-hairline rounded-input bg-surface px-3.5">
                {rows.map((row, j) => (
                  <div key={j} className="grid grid-cols-1 gap-0.5 py-3 min-[600px]:grid-cols-[112px_minmax(0,1fr)] min-[600px]:gap-3 min-[600px]:py-2.5">
                    <dt className="type-footnote text-ink-2">{row.label}</dt>
                    <dd className="type-callout text-ink [overflow-wrap:anywhere]">{row.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {answers > 0 && <p className="type-footnote mt-2 px-1 text-ink-2">{answers === 1 ? "The answer is" : `All ${answers} answers are`} listed above, word for word.</p>}
            {dev && (
              <Disclosure summary="Show raw report">
                <pre className="font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-ink-2 [overflow-wrap:anywhere]">{engineText(rep.text)}</pre>
              </Disclosure>
            )}
          </section>
        );
      })}
    </Disclosure>
  );
}
