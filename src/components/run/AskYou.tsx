"use client";

import { useState } from "react";
import { STILL_BOOKING } from "@/lib/lanes";
import { Disclosure } from "../kit/Disclosure";
import { engineText } from "../kit/typo";
import { Button } from "../ui";
import type { Act } from "./useLaneAct";

// Fo is waiting on you: Fo's exact words and only the ways on the server allows.
// sendAgain: the last send lost its reply, so Fo may have it: Fo has it, Send again or No, stop.
// lost: CrossCheck has no conversation to send into, so Send again stays hidden.
// booked: Fo's booking reply was not a clear yes, so you read Fo's words and say whether it is booked.
// working: Fo is still on this lane, so Not booked stays hidden until it is done.
export function AskYou({
  question,
  busy,
  act,
  laneId,
  sendAgain,
  lost,
  booked,
  working,
  title,
  surface = false,
}: {
  question: string | null;
  busy: boolean;
  act: Act;
  laneId: string;
  sendAgain?: boolean;
  lost?: boolean;
  booked?: boolean;
  working?: boolean;
  title?: string;
  surface?: boolean; // a white card of its own (in the evidence sheet); in a row it sits on the row under a hairline
}) {
  const [answer, setAnswer] = useState("");
  const heading = title ?? (booked ? "Did Fo book it?" : sendAgain ? "Check your Fo app" : "Fo is asking");
  const id = `ask-${laneId}`;

  return (
    <div role="group" aria-labelledby={id} className={surface ? "rounded-card bg-surface px-4 pt-4 pb-4 md:px-5" : "border-t border-hairline pt-3"}>
      <p id={id} className="type-footnote font-semibold text-ink-2">
        {heading}
      </p>
      <p className="mt-1 max-w-[62ch] text-[17px] leading-[1.45] whitespace-pre-wrap text-ink [overflow-wrap:anywhere] [text-wrap:pretty]">
        {engineText(question) || "Fo is waiting for your answer."}
      </p>

      {booked ? (
        <>
          {working && <p className="type-callout mt-2 text-ink-2">{STILL_BOOKING}. Not booked comes back once Fo is done.</p>}
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
            <Button onClick={() => act({ action: "booking_confirmed" })} disabled={busy || working}>
              Fo booked it
            </Button>
            {!working && (
              <Button variant="quiet" onClick={() => act({ action: "booking_not_booked" })} disabled={busy}>
                Not booked
              </Button>
            )}
          </div>
        </>
      ) : sendAgain ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
          <Button onClick={() => act({ action: "fo_has_it" })} disabled={busy}>
            Fo has it
          </Button>
          {!lost && (
            <Button variant="plain" onClick={() => act({ action: "send_again" })} disabled={busy}>
              Send again
            </Button>
          )}
          <Button variant="quiet" onClick={() => act({ action: "decline" })} disabled={busy}>
            No, stop
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
            <Button onClick={() => act({ action: "answer", text: "Yes, go ahead." })} disabled={busy}>
              Yes, go ahead
            </Button>
            <Button variant="quiet" onClick={() => act({ action: "decline" })} disabled={busy}>
              No, stop
            </Button>
          </div>
          <Disclosure summary="Reply in your own words" className="mt-1">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (answer.trim()) void act({ action: "answer", text: answer }).then((ok) => ok && setAnswer(""));
              }}
            >
              <input
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                name="answer"
                placeholder="Or type an answer…"
                aria-label="Your answer to Fo"
                autoComplete="off"
                maxLength={1000}
                className="h-11 w-full min-w-0 rounded-input border border-transparent bg-fill px-3.5 text-[17px]"
              />
              <Button variant="secondary" type="submit" disabled={busy || !answer.trim()}>
                Send
              </Button>
            </form>
          </Disclosure>
        </>
      )}
    </div>
  );
}
