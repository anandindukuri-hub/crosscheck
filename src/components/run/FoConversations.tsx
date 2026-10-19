"use client";

import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { Disclosure } from "../kit/Disclosure";
import { api, errText, fmtDateTime, Skeleton } from "../ui";

type Convo = { laneId: string; restaurant: string; title: string | null; channel: string | null; startedAt: string | null };
type State = { kind: "idle" } | { kind: "loading" } | { kind: "ok"; list: Convo[] } | { kind: "error"; msg: string };

// every Fo thread this run opened, fetched when opened
export function FoConversations({ runId, onOpen }: { runId: string; onOpen: (laneId: string) => void }) {
  const [s, setS] = useState<State>({ kind: "idle" });

  function load() {
    setS({ kind: "loading" });
    api<{ conversations: Convo[] }>(`/api/runs/${runId}/fo`)
      .then((d) => setS({ kind: "ok", list: d.conversations }))
      .catch((e) => setS({ kind: "error", msg: errText(e) }));
  }

  return (
    <section className="card px-5 py-2 md:px-6">
      <Disclosure
        summary="Fo conversations for this run"
        meta={<span className="hidden sm:inline">Every thread Fo opened for these kitchens</span>}
        onToggle={(e) => {
          if (e.currentTarget.open && s.kind !== "loading" && s.kind !== "ok") load();
        }}
      >
        <div aria-live="polite" aria-busy={s.kind === "loading"}>
          {s.kind === "loading" && (
            <div className="space-y-2 py-1">
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
            </div>
          )}
          {s.kind === "error" && (
            <p className="type-callout text-nomatch">
              {s.msg}{" "}
              <button type="button" onClick={load} className="min-h-11 font-semibold text-link hover:underline">
                Try again
              </button>
            </p>
          )}
          {s.kind === "ok" &&
            (s.list.length === 0 ? (
              <p className="type-callout text-ink-2">No Fo conversations yet. They show up here once Fo starts working on a kitchen.</p>
            ) : (
              <ul className="divide-y divide-hairline">
                {s.list.map((c, i) => (
                  <li key={`${c.laneId}-${i}`}>
                    <button type="button" onClick={() => onOpen(c.laneId)} className="flex min-h-12 w-full items-center gap-3 py-2 text-left">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium">{c.restaurant}</span>
                        <span className="type-footnote block truncate text-ink-2">
                          {c.title ?? "Untitled"} · {c.channel ?? "app"}
                          {c.startedAt ? ` · ${fmtDateTime(c.startedAt)}` : ""}
                        </span>
                      </span>
                      <ChevronRight size={16} strokeWidth={1.75} aria-hidden className="shrink-0 text-ink-3" />
                    </button>
                  </li>
                ))}
              </ul>
            ))}
        </div>
      </Disclosure>
    </section>
  );
}
