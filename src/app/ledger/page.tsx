import type { Metadata } from "next";
import { Quote } from "lucide-react";
import Link from "next/link";
import { buttonClass } from "@/components/kit/button";
import { StateLabel } from "@/components/kit/State";
import { smart } from "@/components/kit/typo";
import { topicTitle } from "@/components/run/plain";
import { capFirst, fmtDate, fmtDateTime, speakerLabel } from "@/lib/labels";
import { isFresh, readLedger, type LedgerRecord } from "@/lib/ledger";
import { listDoNotCall } from "@/lib/donotcall";
import { DoNotCallList } from "@/components/DoNotCallList";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Kitchen answers" };

// the same three words the rest of the app uses for one answer
const ANSWER = { pass: { label: "Matched", tone: "matched" }, escalate: { label: "Needs the chef", tone: "chef" }, fail: { label: "Did not match", tone: "nomatch" } } as const;

export default async function Ledger() {
  const [records, doNotCall] = await Promise.all([readLedger(), listDoNotCall()]);
  const byPlace = new Map<string, LedgerRecord[]>();
  for (const r of records) byPlace.set(r.restaurantId, [...(byPlace.get(r.restaurantId) ?? []), r]);
  const places = [...byPlace.values()].sort((a, b) => b[0].verifiedAt.localeCompare(a[0].verifiedAt));

  return (
    <div className="wrap pt-10 pb-20 md:pt-14">
      <div className="mx-auto max-w-[720px]">
        <h1 className="type-large">Kitchen answers</h1>
        <p className="type-body mt-2 max-w-2xl text-ink-2">
          Every answer a kitchen gave, with who said it and when. Answers about life threatening and severe allergies expire after 7 days. Answers about mild allergies and diets expire after 30. An expired answer gets asked again instead of trusted.
        </p>

        {places.length === 0 ? (
          <div className="card mt-10 flex flex-col items-center px-6 py-14 text-center">
            <Quote size={44} strokeWidth={1.5} aria-hidden className="mb-3 text-ink-3" />
            <p className="type-headline">No kitchen answers yet</p>
            <p className="type-callout mt-2 max-w-sm text-ink-2">Answers from real calls are kept here, with who said them and when. Sample tables are not.</p>
            <Link href="/new" className={`${buttonClass("primary")} mt-6`}>
              Start a table
            </Link>
          </div>
        ) : (
          places.map((recs) => {
            const head = recs[0];
            return (
              <section key={head.restaurantId} aria-labelledby={`k-${head.restaurantId}`} className="mt-10">
                <div className="mb-2 flex items-baseline justify-between gap-3 px-4">
                  <h2 id={`k-${head.restaurantId}`} className="type-headline min-w-0 truncate">
                    {head.restaurantName}
                  </h2>
                  <span className="type-footnote shrink-0 text-ink-2">
                    {head.mode === "live" ? "Real call" : head.mode === "test" ? "Test call" : "Sample"} · {fmtDate(head.verifiedAt)}
                  </span>
                </div>
                <ul className="card divide-y divide-hairline overflow-hidden">
                  {recs.map((r) => {
                    const meta = ANSWER[r.outcome];
                    const fresh = isFresh(r);
                    return (
                      <li key={r.checkKey} className="px-4 py-4 md:px-5">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <p className="text-[15px] font-semibold">{topicTitle({ key: r.checkKey, label: r.label })}</p>
                          <span className="type-footnote">
                            <StateLabel tone={meta.tone}>{meta.label}</StateLabel>
                          </span>
                        </div>
                        {r.quote && <blockquote className="quote mt-1.5 [overflow-wrap:anywhere]">“{smart(r.quote)}”</blockquote>}
                        <p className="type-footnote mt-1.5 text-ink-2">
                          {capFirst(speakerLabel(r.speaker))} · {fmtDateTime(r.verifiedAt)} ·{" "}
                          <span className={fresh ? "" : "font-medium text-chef"}>{fresh ? `Fresh until ${fmtDate(r.expiresAt)}` : "Stale, ask again"}</span>
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })
        )}
        <DoNotCallList initial={doNotCall} />
      </div>
    </div>
  );
}
