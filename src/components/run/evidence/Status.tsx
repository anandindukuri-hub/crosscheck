"use client";

import { useState } from "react";
import type { Lane, LaneResult, Reconfirm, Run } from "@/lib/types";
import { Disclosure } from "../../kit/Disclosure";
import { StateLabel, type RingTone } from "../../kit/State";
import { engineText, sentence, whenPhrase } from "../../kit/typo";
import { Button, fmtDateTime } from "../../ui";
import { fmtClock } from "../plain";
import { bookedNote, bookedUnder } from "../laneState";
import { CheckItem } from "./CheckItem";
import { NoteCard } from "./NoteCard";

function Block({ title, tone, when, children }: { title: string; tone: RingTone; when?: string; children?: React.ReactNode }) {
  return (
    <section className="rounded-card bg-surface px-4 py-4 md:px-5">
      <div className="flex items-baseline justify-between gap-3">
        <StateLabel tone={tone} className="type-headline">
          {title}
        </StateLabel>
        {when && <span className="type-footnote shrink-0 text-ink-2">{when}</span>}
      </div>
      {children}
    </section>
  );
}

// the booking leads the sheet once it exists: booked says so plainly, with what Fo sent one tap away.
// A replay never books, so it says what a live run would have done, in a full sentence
export function BookingStatus({ b, run, lane }: { b: NonNullable<Lane["booking"]>; run: Run; lane: Lane }) {
  const title = b.status === "done" ? "Booked" : b.status === "failed" ? "Booking did not finish" : b.status === "needs_you" ? "Booking needs you" : "Booking requested";
  const tone: RingTone = b.status === "done" ? "matched" : b.status === "failed" ? "nomatch" : b.status === "needs_you" ? "you" : "work";
  const replay = run.mode === "replay";
  // Fo's own reply leads with its first line; the note itself is drawn from the run, never from a sliced string
  const fo = b.status === "requested" || replay ? "" : engineText(b.text);
  const [first, ...rest] = fo.split(/\n+/);
  return (
    <Block title={title} tone={tone} when={fmtClock(b.at)}>
      {b.status === "done" ? (
        <>
          <p className="type-callout mt-2 text-ink">
            Table for {run.partySize} {whenPhrase(run.when)}
            {bookedUnder(run) ? ` under ${bookedUnder(run)}` : ""}. {bookedNote(run.mode)}
          </p>
          <p className="type-footnote mt-1 text-ink-2">
            {/\d{3}/.test(lane.restaurant.phone) ? (
              <>
                To change or cancel,{" "}
                <a href={`tel:${lane.restaurant.phone.replace(/[^\d+]/g, "")}`} className="font-medium text-link hover:underline">
                  call {lane.restaurant.name}
                </a>
                .
              </>
            ) : (
              `To change or cancel, contact ${lane.restaurant.name} directly.`
            )}
          </p>
        </>
      ) : b.status === "requested" ? (
        <p className="type-callout mt-2 text-ink-2">Fo is booking and sending the allergy note.</p>
      ) : null}
      {b.note && <p className="type-callout mt-2 text-ink-2">{engineText(b.note)}</p>}
      {fo && (
        <Disclosure summary="What Fo said" className="mt-1">
          <p className="type-callout whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">
            {sentence(first)}
            {rest.length ? `\n${rest.join("\n")}` : ""}
          </p>
        </Disclosure>
      )}
      {lane.result && (
        <Disclosure summary={b.status === "done" && replay ? "The note" : "The allergy note"} className={fo ? "" : "mt-1"} flush>
          <NoteCard run={run} lane={lane} at={b.at} bare />
        </Disclosure>
      )}
    </Block>
  );
}

const RC_TITLE: Record<Reconfirm["status"], string> = {
  requested: "Reconfirming with the kitchen",
  reconfirmed: "Reconfirmed today",
  not_reconfirmed: "Not reconfirmed",
  needs_review: "Same answers today. Read each quote to finish",
  failed: "The reconfirm call did not finish",
};
const RC_TONE: Record<Reconfirm["status"], RingTone> = { requested: "work", reconfirmed: "matched", not_reconfirmed: "nomatch", needs_review: "review", failed: "quiet" };

export function ReconfirmStatus({
  rc,
  history,
  canRetry,
  busy,
  replay = false,
  onRetry,
  onConfirmReview,
}: {
  rc: Reconfirm;
  history: Reconfirm[];
  canRetry: boolean;
  busy: boolean;
  replay?: boolean; // a sample sent no note, so it never says the note is on the booking
  onRetry: () => void;
  onConfirmReview: (keys: string[]) => void;
}) {
  const earlier = history.filter((h) => h.at !== rc.at);
  return (
    <>
      {rc.status === "needs_review" && rc.result ? (
        <ReviewToday rc={rc} result={rc.result} busy={busy} onConfirm={onConfirmReview} />
      ) : (
        <Block title={RC_TITLE[rc.status]} tone={RC_TONE[rc.status]} when={fmtClock(rc.at)}>
          {rc.status !== "failed" && (
            <p className={`type-callout mt-2 ${rc.status === "not_reconfirmed" ? "font-medium text-nomatch" : "text-ink-2"}`}>
              {rc.status === "requested"
                ? "Fo asks every check again and whether the allergy note is on the booking."
                : rc.status === "reconfirmed"
                  ? `${rc.reviewedAt ? "Same answers today and you read every quote." : "Same answers today."}${replay ? "" : " The note is on the booking."}`
                  : "Do not rely on the earlier answers. Talk to the chef in person or pick another kitchen."}
            </p>
          )}
          {rc.reasons.length > 0 && (
            <ul className="type-callout mt-2 space-y-0.5 text-ink-2">
              {rc.reasons.slice(0, 6).map((x) => (
                <li key={x}>{engineText(x)}</li>
              ))}
            </ul>
          )}
          {rc.status === "failed" && canRetry && (
            <Button className="mt-3" variant="tinted" onClick={onRetry} disabled={busy}>
              Reconfirm now
            </Button>
          )}
        </Block>
      )}
      {earlier.length > 0 && (
        <Disclosure summary="Earlier reconfirms" meta={String(earlier.length)}>
          <ul className="space-y-2">
            {earlier.map((h) => (
              <li key={h.at} className="type-callout">
                <StateLabel tone={RC_TONE[h.status]} strong={false}>
                  {RC_TITLE[h.status]} · {fmtDateTime(h.at)}
                </StateLabel>
                {h.reasons.length > 0 && <p className="type-footnote mt-0.5 pl-4 text-ink-2">{h.reasons.slice(0, 3).map(engineText).join(". ")}</p>}
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
    </>
  );
}

// today's answers are clear but come from Fo's unverified report, so each quote gets read before it counts
function ReviewToday({ rc, result, busy, onConfirm }: { rc: Reconfirm; result: LaneResult; busy: boolean; onConfirm: (keys: string[]) => void }) {
  const [read, setRead] = useState<Set<string>>(new Set());
  const quoted = result.checks.filter((c) => c.quote);
  const readCount = quoted.filter((c) => read.has(c.key)).length;
  const allRead = quoted.length > 0 && readCount === quoted.length;
  return (
    <Block title="Same answers today. Read each quote to finish" tone="review" when={fmtClock(rc.at)}>
      <ul className="mt-3 divide-y divide-hairline">
        {result.checks.map((c) => (
          <CheckItem
            key={c.key}
            c={c}
            lane={{ reports: [] }}
            reviewing
            read={read.has(c.key)}
            onRead={(v) =>
              setRead((s) => {
                const n = new Set(s);
                if (v) n.add(c.key);
                else n.delete(c.key);
                return n;
              })
            }
          />
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button onClick={() => onConfirm([...read])} disabled={busy || !allRead}>
          I read today’s answers
        </Button>
        {!allRead && (
          <span className="type-footnote text-ink-2">
            Tick each quote from today first ({readCount} of {quoted.length})
          </span>
        )}
      </div>
    </Block>
  );
}
