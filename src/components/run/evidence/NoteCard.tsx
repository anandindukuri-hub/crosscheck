"use client";

import { allergyNote } from "@/lib/note";
import type { CheckVerdict, Lane, Run } from "@/lib/types";
import { Disclosure } from "../../kit/Disclosure";
import { engineText, sentence, smart } from "../../kit/typo";
import { fmtDate } from "../../ui";
import { bySeverity, fmtClock, groupAnswers, groupTitle, guestNeeds, heardFor, mergedTitle, sortNeeds, target, type Need } from "../plain";
import { who } from "./CheckItem";

const DOT: Record<string, string> = { "Life threatening": "var(--nomatch)", Severe: "var(--chef)", Mild: "var(--ink-3)" };

// one need as the kitchen reads it: a dot and the severity word, then the allergy. A diet stays neutral
export function NeedLine({ n }: { n: Need }) {
  const color = n.severity ? DOT[n.severity] : "var(--ink-3)";
  return (
    <li className="flex items-baseline gap-2">
      <span aria-hidden className="relative top-[-1px] h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
      <span className="type-callout">
        <span className="font-semibold" style={{ color: n.severity && n.severity !== "Mild" ? color : "var(--ink-2)" }}>
          {n.diet ? n.diet.label : n.severity}
        </span>
        <span className="text-ink"> · {n.diet ? n.diet.line : n.text}</span>
      </span>
    </li>
  );
}

// The allergy note the kitchen gets, as a card the chef would want to read: who it is for, each guest with the
// most serious allergy first, the dishes to order and their own words in serif. Staff read this, so nothing folds:
// every allergen has its own line and its own quote. The exact text is one tap away.
// bare: inside another card, so it drops its own surface and shadow
export function NoteCard({ run, lane, at, bare = false }: { run: Run; lane: Lane; at?: string; bare?: boolean }) {
  const r = lane.result;
  const groups = groupAnswers(r?.checks ?? [], run.diners, { quotedOnly: true, fold: false });
  const date = fmtDate(at ?? new Date().toISOString());
  const text = allergyNote(run, lane);
  // the closing lines exactly as the kitchen gets them: the paragraph before the sign off
  const closing = text.split("\n\n").at(-2)?.replace(/\n/g, " ") ?? "";
  return (
    <div>
      <article aria-label={`Allergy note to ${lane.restaurant.name}`} className={bare ? "pt-1" : "rounded-card bg-surface px-4 py-4 shadow-card md:px-5"}>
        <p className="type-footnote text-ink-2">
          To {lane.restaurant.name} · {date}
        </p>
        <p className="type-callout mt-1 text-ink">
          Allergy note for {run.diners[0]?.label ?? "your"}’s table, {engineText(run.when)}, party of {run.partySize}.
        </p>

        <ul className="mt-3 divide-y divide-hairline border-t border-hairline">
          {bySeverity(run.diners).map((d) => {
            const dishes = r?.dishes.find((x) => x.diner === d.label)?.dishes ?? [];
            return (
              <li key={d.id} className="py-3">
                <p className="text-[17px] leading-[1.3] font-semibold">{d.label}</p>
                <ul className="mt-1 space-y-0.5">
                  {sortNeeds(guestNeeds(d)).map((n) => (
                    <NeedLine key={n.text} n={n} />
                  ))}
                </ul>
                {dishes.length > 0 && (
                  <p className="mt-1.5 text-[15px] leading-[1.35]">
                    <span className="text-ink-2">Will order only: </span>
                    <span className="font-semibold text-ink">{sentence(dishes.map(engineText).join(", "))}</span>
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        {groups.length > 0 && (
          <div className="border-t border-hairline pt-3">
            <p className="type-footnote font-medium text-ink-2">What your kitchen told us</p>
            {(() => {
              // the same words said once cover every allergen they were said for, and who said them shows once on
              // top when one person gave every answer, so a busy kitchen reads three or four short blocks
              const merged: { key: string; title: string; quote: string; tags: string[]; by: string; leads: CheckVerdict[] }[] = [];
              for (const g of groups) {
                const heard = heardFor(lane, g.lead.code);
                const quote = g.lead.quote ?? "";
                const by = `${who(g.lead, heard)}${heard.at ? ` · ${fmtClock(heard.at)}` : ""}`;
                const same = merged.find((m) => m.quote === quote && m.by === by);
                if (same) {
                  same.tags.push(target(g.lead));
                  same.leads.push(g.lead);
                  // one title names every allergen the same words cover: "Shellfish and beef never go in this fryer"
                  same.title = mergedTitle(same.leads, same.tags);
                } else merged.push({ key: g.key, title: groupTitle(g), quote, tags: [target(g.lead)], by, leads: [g.lead] });
              }
              const one = merged.every((m) => m.by === merged[0]?.by) ? merged[0]?.by : null;
              return (
                <>
                  {one && <p className="type-footnote mt-0.5 text-ink-2">{one}</p>}
                  <ul className="mt-2 space-y-3">
                    {merged.map((m) => (
                      <li key={m.key}>
                        <p className="text-[15px] leading-[1.35] font-semibold text-ink">{m.title}</p>
                        <blockquote className="quote mt-0.5 text-ink [overflow-wrap:anywhere]">“{engineText(m.quote)}”</blockquote>
                        {m.tags.length > 1 && <p className="mt-1 text-[12px] leading-[16px] font-medium text-ink-2">{m.tags.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(" · ")}</p>}
                        {!one && <p className="type-footnote mt-0.5 text-ink-2">{m.by}</p>}
                      </li>
                    ))}
                  </ul>
                </>
              );
            })()}
          </div>
        )}
        <p className="type-footnote mt-4 border-t border-hairline pt-3 text-ink-2">{smart(closing)}</p>
      </article>
      <Disclosure summary="Show the exact text" className="mt-1">
        <p className="type-footnote whitespace-pre-wrap text-ink-2 [overflow-wrap:anywhere]">{smart(text)}</p>
      </Disclosure>
    </div>
  );
}
