"use client";

import { motion } from "motion/react";
import { Phone } from "lucide-react";
import { useEffect, useState } from "react";
import { followUpLost } from "@/lib/lanes";
import { parseReport } from "@/lib/report";
import { DISCLAIMER } from "@/lib/note";
import type { CheckVerdict, Run } from "@/lib/types";
import { ConfidenceRing } from "../kit/ConfidenceRing";
import { Disclosure } from "../kit/Disclosure";
import { Sheet } from "../kit/Sheet";
import { Spinner } from "../kit/Spinner";
import { StateDot } from "../kit/State";
import { engineText, sentence, smart, whenText } from "../kit/typo";
import { fmtDate } from "../ui";
import { AskYou } from "./AskYou";
import { answerRows, DecidingCheck, GuestCard, GuestChecks, leadGroups } from "./evidence/CheckItem";
import { CallLog, FoTurns } from "./evidence/FoTurns";
import { BookConfirm, BookFooter, chefCalling, hasActions, LaneActions } from "./evidence/LaneActions";
import { OrderOnly } from "./evidence/OrderOnly";
import { BookingStatus, ReconfirmStatus } from "./evidence/Status";
import { ScriptView } from "./ScriptView";
import { DECIDING_LINE, isBooked, laneFlags, liveStep, onCallId, ringState, type LaneView } from "./laneState";
import { wordColor } from "./LaneRow";
import { bySeverity, fmtClock, laneNotes, pctText, readBackBy, whenTime } from "./plain";
import { useLaneAct } from "./useLaneAct";

export type PendingKind = "chef" | "book";

const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

type Props = {
  run: Run;
  lanes: LaneView[];
  openId: string | null;
  bookId: string | null;
  scripts: Record<string, string>;
  onChange: () => void;
  onClose: () => void;
  onPending: (laneId: string, kind: PendingKind | null) => void;
};

const FADE = { duration: 0.22, ease: "easeOut" } as const;

// The evidence for one kitchen. Keeps the last lane on screen while the sheet slides away.
export function EvidenceSheet(props: Props) {
  const [lastId, setLastId] = useState<string | null>(null);
  if (props.openId && props.openId !== lastId) setLastId(props.openId);
  const lane = props.lanes.find((l) => l.id === (props.openId ?? lastId));
  if (!lane) return null;
  return <LaneSheet key={`${lane.id}:${props.bookId === lane.id ? "book" : ""}`} {...props} lane={lane} open={!!props.openId} />;
}

function LaneSheet({ run, lanes, lane, open, bookId, scripts, onChange, onClose, onPending }: Props & { lane: LaneView; open: boolean }) {
  const approved = !!run.approvedAt;
  const mode = run.mode;
  const f = laneFlags(lane, mode, approved, lanes);
  const current = onCallId(lanes, mode, approved) === lane.id;
  const ring = ringState(lane, f, approved, { current });
  const { act, busy, err } = useLaneAct(run.id, lane.id, onChange);
  const [read, setRead] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(bookId === lane.id && f.canBook);
  const [cap, setCap] = useState(0);
  // Book pressed: the confirm step stays, busy, until the lane reports how the booking went
  const [placing, setPlacing] = useState(false);
  const [sent, setSent] = useState(false);
  const [justBooked, setJustBooked] = useState(false);
  const tick = (key: string, v: boolean) =>
    setRead((s) => {
      const n = new Set(s);
      if (v) n.add(key);
      else n.delete(key);
      return n;
    });
  const r = lane.result;
  const quoted = r?.checks.filter((c) => c.quote) ?? [];
  const count = quoted.filter((c) => read.has(c.key)).length;
  const allRead = quoted.length > 0 && count === quoted.length;
  const booked = isBooked(lane);
  const bookState = lane.booking?.status ?? null;

  // the booking landed: straight from the confirm step to the booked view, with its one beat
  if (placing && bookState === "done") {
    setPlacing(false);
    setConfirm(false);
    setJustBooked(true);
  } else if (placing && (bookState === "needs_you" || bookState === "failed")) {
    setPlacing(false);
    setConfirm(false);
  }
  // a live booking can take minutes: once the server has it, the sheet shows the booking under way instead of a spinner
  useEffect(() => {
    if (!placing || !sent) return;
    const t = setTimeout(() => {
      setPlacing(false);
      setConfirm(false);
    }, 12_000);
    return () => clearTimeout(t);
  }, [placing, sent]);

  const booking = confirm && (f.canBook || placing);
  // the optimistic lane from onPending flips the sheet to calling at the tap; after that only the server's lane says so
  const calling = chefCalling(lane, f);
  const otherMatched = lanes.find((l) => l.id !== lane.id && l.result?.state === "matched")?.restaurant.name ?? null;
  const open_ = r?.checks.filter((c) => c.outcome !== "pass") ?? [];
  const passed = r?.checks.filter((c) => c.outcome === "pass") ?? [];
  const notes = r ? laneNotes(r) : [];
  const callback = lane.reports.filter((x) => x.kind === "callback").at(-1);
  const firstCall = lane.reports.find((x) => x.kind === "call");
  const firstWords = firstCall ? parseReport(firstCall.text).answers : {};
  const reasked = callback && r ? r.checks.filter((c) => c.outcome === "pass" && new RegExp(`^${c.code}\\b`, "m").test(callback.text)) : [];
  const good = r?.state === "matched" || r?.state === "needs_review";
  const reconfirmed = lane.reconfirm?.status === "reconfirmed";
  const quietState = r?.state === "no_answer" || r?.state === "declined";
  const guests = bySeverity(run.diners).filter((d) => r?.checks.some((c) => c.dinerIds.includes(d.id)));
  const leads = r ? guests.map((d) => ({ d, groups: leadGroups(r.checks, run.diners, d) })) : [];
  const shown = new Set(leads.flatMap((x) => x.groups.flatMap((g) => g.checks.map((c) => c.key))));
  const more = r?.checks.filter((c) => !shown.has(c.key)) ?? [];
  const moreRows = answerRows(more, run.diners);
  const passedRows = answerRows(passed, run.diners);
  const dialable = /\d{3}/.test(lane.restaurant.phone);

  async function book() {
    setPlacing(true);
    onPending(lane.id, "book");
    const ok = await act({ action: "book", depositCap: cap, reviewed: allRead });
    if (ok) setSent(true);
    else {
      setPlacing(false);
      onPending(lane.id, null);
    }
  }
  async function askChef() {
    onPending(lane.id, "chef");
    const ok = await act({ action: "ask_chef" });
    if (!ok) onPending(lane.id, null);
  }

  const actions = hasActions(lane, f, approved) || calling ? (
    <LaneActions run={run} lane={lane} f={f} act={act} busy={busy} calling={calling} otherMatched={otherMatched} read={{ all: allRead, count, of: quoted.length }} onBook={() => setConfirm(true)} onAskChef={askChef} onClose={onClose} />
  ) : null;

  // one line under the title, never wrapping: the state as a dot and a word
  const time = whenTime(run.when) ?? whenText(run.when);
  const status = booking ? (
    <span className="block truncate">
      Table for {run.partySize} · {whenText(run.when)}
    </span>
  ) : calling ? (
    <span className="flex items-center gap-2 font-semibold whitespace-nowrap text-ink">
      <span aria-hidden className="live-dot h-2 w-2 shrink-0 rounded-full bg-[#30d158]" />
      <span className="truncate">{f.replay ? "Playing the chef’s answer" : "Calling the chef back"}</span>
    </span>
  ) : (
    <span className="flex items-center gap-2 font-semibold whitespace-nowrap" style={{ color: booked ? "var(--matched)" : wordColor(ring.tone) }}>
      <StateDot tone={booked ? "matched" : ring.tone} pulse={ring.pulse} />
      <span className="truncate">{booked ? (reconfirmed ? "Booked and reconfirmed" : `Booked · ${time}`) : ring.word}</span>
    </span>
  );

  // the header ring only for the booking's calendar; a match says how sure it heard right in words under the state
  const aside = booking ? null : booked ? <ConfidenceRing key="booked" tone="matched" booked celebrate={justBooked} size={40} label={reconfirmed ? "Booked and reconfirmed" : "Booked"} /> : null;
  const heardRight = !booking && !booked && !calling && ring.tone === "matched" && ring.value != null ? `${pctText(ring.value)} sure it heard right` : null;

  const view = booking ? "book" : "evidence";

  return (
    <Sheet
      open={open}
      onClose={onClose}
      scrollKey={view}
      returnFocus={() => document.getElementById(`open-${lane.id}`)}
      title={booking ? `Book ${lane.restaurant.name}` : lane.restaurant.name}
      subtitle={
        <motion.div key={view} initial={view === "book" || justBooked ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={FADE} className="min-w-0">
          <span className="block min-w-0">{status}</span>
          {heardRight && <span className="mt-0.5 block text-[13px] leading-[18px] font-normal text-ink-2">{heardRight}</span>}
        </motion.div>
      }
      aside={aside}
      footer={
        booking ? (
          <BookFooter test={mode === "test"} name={lane.restaurant.name} busy={placing || busy} onBook={book} onCancel={() => setConfirm(false)} />
        ) : actions ? (
          <motion.div key="actions" initial={justBooked ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={FADE}>
            {actions}
          </motion.div>
        ) : null
      }
    >
      <motion.div key={view} initial={justBooked || view === "book" ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={FADE}>
        {booking ? (
          <>
            <BookConfirm run={run} lane={lane} cap={cap} setCap={setCap} locked={placing} />
            {err && (
              <p role="alert" className="type-callout mt-4 text-nomatch">
                {err}
              </p>
            )}
          </>
        ) : (
          <div className="space-y-6 pb-2">
            {lane.fromMemory && <p className="type-footnote text-ink-2">Matched on answers from {fmtDate(lane.fromMemory.decidedAt)}. No call was made for this table.</p>}

            {lane.status === "needs_you" && <AskYou question={lane.foQuestion} busy={busy} act={act} laneId={`${lane.id}-sheet`} sendAgain={f.sendAgain} lost={!!lane.pending && followUpLost(lane.pending, mode)} booked={f.bookedAsk} working={!f.idle} surface />}

            {/* the answers are in: no verdict word until the rule decides */}
            {f.previewing && (
              <section aria-live="polite" className="rounded-card bg-surface px-4 py-4 md:px-5">
                <p className="type-headline flex items-center gap-2">
                  <Spinner />
                  Checking the answers
                </p>
                <p className="type-footnote mt-2 text-ink-2">{DECIDING_LINE}. Nothing can be booked until both finish.</p>
              </section>
            )}

            {/* what Fo is doing on the first call; a booking, a reconfirm or a callback says so in its own place */}
            {(f.running || lane.status === "fo_still_working") && lane.phase === "call" && !f.previewing && (
              <p className="type-callout flex items-center gap-2 text-ink" aria-live="polite">
                <StateDot tone="work" pulse={current} size={7} />
                {current || !f.running ? (f.replay ? liveStep(lane, true).line : sentence(engineText(lane.progress))) : f.replay ? "Up next. The sample plays one kitchen at a time." : "Up next. Fo calls one kitchen at a time."}
              </p>
            )}
            {lane.error && <p className="type-callout text-nomatch">{engineText(lane.error)}</p>}

            {f.showAgreed && (
              <label className="flex cursor-pointer items-start gap-3 rounded-card bg-surface px-4 py-3.5 text-[15px]">
                <input type="checkbox" checked={lane.agreed} onChange={(e) => act({ action: "agree", agreed: e.target.checked })} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]" />
                <span>{lane.restaurant.name} has said yes to a short AI call about allergies.</span>
              </label>
            )}

            {lane.booking && <BookingStatus b={lane.booking} run={run} lane={lane} />}
            {f.rc && (
              <ReconfirmStatus
                rc={f.rc}
                history={lane.reconfirmHistory ?? []}
                canRetry={f.canReconfirm}
                busy={busy}
                replay={f.replay}
                onRetry={() => act({ action: "reconfirm" })}
                onConfirmReview={(keys) => act({ action: "reconfirm_reviewed", keys })}
              />
            )}

            {r ? (
              <section aria-label="Why" className="space-y-6">
                {callback && reasked.length > 0 && (
                  <div className="rounded-card bg-matched-tint px-4 py-3">
                    <p className="type-callout font-medium text-ink">{f.replay ? `Updated with the chef’s sample answer at ${fmtClock(callback.at)}.` : `Updated after Fo called the kitchen back at ${fmtClock(callback.at)}.`}</p>
                  </div>
                )}

                {good && !booked && (
                  <p className="type-body text-ink">
                    {r.state === "matched" ? `All ${r.checks.length} checks passed for the dishes the kitchen suggested.` : "The answers look clear. Read each quote, then book."}
                    {r.state === "matched" && <span className="text-ink-2"> Claude and Jev read every answer the same way. {readBackBy(lane)} heard Fo repeat the answers and said they were right.</span>}
                  </p>
                )}
                {good && <OrderOnly diners={run.diners} r={r} />}

                {quietState && (
                  <div className="overflow-hidden rounded-card bg-surface shadow-card">
                    <div className="px-4 py-4 md:px-5">
                      <p className="type-footnote font-semibold text-ink-2">What happened</p>
                      {notes.length > 0 && (
                        <ul className="type-body mt-1 space-y-1 text-ink">
                          {notes.slice(0, 3).map((x) => (
                            <li key={x}>{sentence(x.replace(/\.?$/, "."))}</li>
                          ))}
                        </ul>
                      )}
                      <p className="type-callout mt-2 text-ink-2">
                        {r.state === "declined"
                          ? "They said no to the AI call. CrossCheck will not call them again."
                          : dialable
                            ? "Fo does not call back on its own. You can call them yourself."
                            : otherMatched
                              ? `Fo does not call back on its own. ${otherMatched} already matched.`
                              : "Fo does not call back on its own. Start a new table with other kitchens."}
                      </p>
                    </div>
                    {r.state === "no_answer" && dialable && (
                      <a href={telHref(lane.restaurant.phone)} className="flex min-h-11 items-center gap-3 border-t border-hairline px-4 py-2.5 text-[17px] text-link hover:bg-fill/40 md:px-5">
                        <Phone size={20} strokeWidth={1.75} aria-hidden className="shrink-0" />
                        <span className="min-w-0 flex-1">Call {lane.restaurant.name}</span>
                        <span className="shrink-0 text-ink-2 tabular-nums">{lane.restaurant.phone}</span>
                      </a>
                    )}
                  </div>
                )}

                {reasked.length > 0 && (
                  <div>
                    <h3 className="type-footnote mb-2 font-medium text-ink-2">What changed</h3>
                    <ul className="space-y-3">
                      {reasked.map((c) => (
                        <DecidingCheck key={c.key} c={c} lane={lane} diners={run.diners} tint="matched" before={firstWords[c.code]?.words ?? null} beforeAt={firstCall?.at ?? null} />
                      ))}
                    </ul>
                  </div>
                )}

                {!quietState && (open_.length > 0 || (!good && notes.length > 0)) && (
                  <div className={`transition-opacity duration-300 ${calling ? "opacity-60" : ""}`} aria-busy={calling || undefined}>
                    <h3 className="type-footnote mb-2 font-medium text-ink-2">What decided it</h3>
                    <ul className="space-y-3">
                      {open_.map((c: CheckVerdict) => (
                        <DecidingCheck key={c.key} c={c} lane={lane} diners={run.diners} tint={c.outcome === "fail" ? "nomatch" : "chef"} />
                      ))}
                    </ul>
                    {notes.length > 0 && (
                      <ul className={`type-body space-y-1 text-ink ${open_.length ? "mt-3" : ""}`}>
                        {notes.slice(0, 4).map((x) => (
                          <li key={x}>{sentence(x.replace(/\.?$/, "."))}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {r.checks.length > 0 &&
                  (f.reviewing ? (
                    // reading each quote is the point here, so every answer shows, each with its tick
                    <GuestChecks diners={run.diners} r={r} lane={lane} checks={r.checks} reviewing read={read} setRead={tick} dishes={false} />
                  ) : good ? (
                    <>
                      {/* every answer about a severe or life threatening allergy leads, stacked under its guest; the
                          mild and diet answers wait one tap away */}
                      {leads.map(({ d, groups }) => (
                        <GuestCard key={d.id} d={d} groups={groups} r={r} lane={lane} reviewing={false} read={read} setRead={tick} />
                      ))}
                      {more.length > 0 && (
                        <Disclosure summary={`Show ${moreRows} more ${moreRows === 1 ? "answer" : "answers"}`}>
                          <GuestChecks diners={run.diners} r={r} lane={lane} checks={more} reviewing={false} read={read} setRead={tick} flat dishes={false} />
                        </Disclosure>
                      )}
                    </>
                  ) : (
                    passed.length > 0 && (
                      <Disclosure summary={`Show the ${passedRows} ${passedRows === 1 ? "answer" : "answers"} that passed`}>
                        <GuestChecks diners={run.diners} r={r} lane={lane} checks={passed} reviewing={false} read={read} setRead={tick} flat />
                      </Disclosure>
                    )
                  ))}
              </section>
            ) : lane.skipped && lane.status === "done" ? (
              <div className="rounded-card bg-surface px-4 py-4 md:px-5">
                <p className="type-headline">Not called</p>
                <p className="type-callout mt-1 text-ink-2">
                  {lane.skipped.reason.replace(/\.$/, "")}. Fo did not call this kitchen. You can still call it.
                </p>
              </div>
            ) : (
              !f.running &&
              lane.status !== "needs_you" && (
                <p className="type-callout text-ink-2">{approved ? sentence(engineText(lane.progress)) || "No answers yet." : "Fo has not called yet. Send the calls to Fo to start."}</p>
              )
            )}

            {err && (
              <p role="alert" className="type-callout text-nomatch">
                {err}
              </p>
            )}

            <div className="border-t border-hairline pt-2">
              {!approved && !lane.fromMemory && (
                <Disclosure summary="What Fo will say" meta={`${run.checks[lane.id]?.length ?? 0} questions`}>
                  <ScriptView run={run} lane={lane} script={scripts[lane.id] ?? ""} />
                </Disclosure>
              )}
              {(approved || lane.conversationId) && !f.replay && <FoTurns runId={run.id} laneId={lane.id} />}
              <CallLog lane={lane} order={bySeverity(run.diners).map((d) => d.label)} />
            </div>
            {r && <p className="type-footnote text-ink-2">{smart(DISCLAIMER)}</p>}
          </div>
        )}
      </motion.div>
    </Sheet>
  );
}
