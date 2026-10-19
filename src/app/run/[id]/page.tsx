"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { scrollBehavior } from "@/components/kit/useMedia";
import { smart, whenText } from "@/components/kit/typo";
import { ApproveCard } from "@/components/run/ApproveCard";
import { CalibrationCard } from "@/components/run/CalibrationCard";
import { aliasReplay } from "@/components/run/alias";
import { EvidenceSheet, type PendingKind } from "@/components/run/EvidenceSheet";
import { FoConversations } from "@/components/run/FoConversations";
import { laneFlags, SETTLED, type LaneView } from "@/components/run/laneState";
import { GroupAsk, LaneList, sameOpener } from "@/components/run/LaneList";
import { LiveActivity } from "@/components/run/LiveActivity";
import { AlertsRow, NeedsYouAlerts } from "@/components/run/NeedsYouAlerts";
import { bySeverity, guestNeeds, sortNeeds } from "@/components/run/plain";
import { BestMatch, bestMatch, RunSummary } from "@/components/run/RunSummary";
import { api, Button, buttonClass, ErrorNote, errText, Skeleton } from "@/components/ui";
import type { CalibrationLines } from "@/lib/calibration";
import { DISCLAIMER } from "@/lib/note";
import type { Run } from "@/lib/types";
import { StateDot } from "@/components/kit/State";

const SEVERITY_INK: Record<string, string> = { "Life threatening": "text-nomatch", Severe: "text-chef", Mild: "text-ink-3" };

type View = { run: Run; lanes: LaneView[]; scripts: Record<string, string>; calibration: CalibrationLines | null; calibrationNoCall: boolean };
type Pending = { laneId: string; kind: PendingKind; at: number };

// the server has caught up with a tap: the callback or the booking is on the lane itself
const landed = (v: View, p: Pending) => {
  const l = v.lanes.find((x) => x.id === p.laneId);
  if (!l) return true;
  return p.kind === "chef" ? l.callbacks >= 1 : !!l.booking;
};

// What a tap promises shows at once, before the next poll: the row spins, the pill appears, the button waits.
// Display only. The server's lane replaces it as soon as it says the same thing
function withPending(lanes: LaneView[], pending: Pending[]): LaneView[] {
  if (!pending.length) return lanes;
  return lanes.map((l) => {
    const p = pending.find((x) => x.laneId === l.id);
    if (!p) return l;
    const live = { status: "calling" as const, active: true, startedAt: l.startedAt };
    if (p.kind === "chef") return { ...l, ...live, phase: "callback", progress: "Calling the chef back" };
    return { ...l, ...live, phase: "booking", progress: "Booking the table", booking: { status: "requested", text: "", at: new Date(p.at).toISOString() } };
  });
}

export default function RunPage() {
  const { id } = useParams<{ id: string }>();
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  // the run was removed while this page was open: stop polling and say so
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);
  // the open kitchen lives in the URL hash, so a link or the pass's back link opens it again
  const [openId, setOpenIdState] = useState<string | null>(() => (typeof window === "undefined" ? null : (/^#lane-(.+)$/.exec(window.location.hash)?.[1] ?? null)));
  const [bookId, setBookId] = useState<string | null>(null);
  const [oneByOne, setOneByOne] = useState(false);
  const [flash, setFlash] = useState<{ id: string | null; n: number }>({ id: null, n: 0 });
  const [pending, setPendingList] = useState<Pending[]>([]);
  const setPending = useCallback((laneId: string, kind: PendingKind | null) => {
    setPendingList((ps) => [...ps.filter((p) => p.laneId !== laneId), ...(kind ? [{ laneId, kind, at: Date.now() }] : [])]);
  }, []);
  const setOpenId = useCallback((laneId: string | null) => {
    setOpenIdState(laneId);
    if (!laneId) setBookId(null);
    const url = location.pathname + location.search + (laneId ? `#lane-${laneId}` : "");
    if (url !== location.pathname + location.search + location.hash) history.replaceState(history.state, "", url);
  }, []);
  const last = useRef("");
  const seq = useRef({ sent: 0, shown: 0 });

  // a slow poll never overwrites a newer one; an unchanged run skips the re-render
  const load = useCallback(() => {
    const n = ++seq.current.sent;
    api<View>(`/api/runs/${id}`)
      .then((raw) => {
        if (n < seq.current.shown) return;
        seq.current.shown = n;
        const v = aliasReplay(raw.run.mode, raw);
        setPendingList((ps) => (ps.length ? ps.filter((p) => !landed(v, p) && Date.now() - p.at < 20_000) : ps));
        const s = JSON.stringify(v);
        if (s !== last.current) {
          last.current = s;
          setView(v);
        }
        setError(null);
      })
      .catch((e) => {
        const msg = errText(e);
        setError(msg);
        if (/not found/i.test(msg)) setGone(true);
      });
  }, [id]);

  const working = !!view?.run.approvedAt && view.lanes.some((l) => l.active || l.inQueue || !SETTLED.has(l.status));

  useEffect(() => {
    if (gone) return;
    load();
    // once a second while Fo is working, so the call clock and each step land when they happen
    const t = setInterval(load, working ? 1000 : 8000);
    const onShow = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [load, working, gone]);

  // an alert click lands on #lane-id: open that kitchen
  useEffect(() => {
    const onHash = () => {
      const m = /^#lane-(.+)$/.exec(location.hash);
      if (m) setOpenIdState(m[1]);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (!view || gone) {
    if (error) {
      const missing = /not found/i.test(error);
      return (
        <div className="wrap flex flex-col items-center py-28 text-center">
          <h1 className="type-large">{missing ? "Table not found" : "Could not load this table"}</h1>
          <p className="type-body mt-3 max-w-md text-ink-2">{missing ? "This table does not exist on this computer. It may have been removed." : error}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {!missing && <Button onClick={load}>Try again</Button>}
            <Link href="/new" className={buttonClass(missing ? "primary" : "plain")}>
              Start a table
            </Link>
          </div>
        </div>
      );
    }
    return <RunSkeleton />;
  }

  const { run, scripts } = view;
  const lanes = withPending(view.lanes, pending);
  const approved = !!run.approvedAt;
  const agreedIds = lanes.filter((l) => l.agreed).map((l) => l.id);
  const calibration = run.purpose === "calibration" ? view.calibration : null;
  const waiting = lanes.filter((l) => l.status === "needs_you").map((l) => ({ id: l.id, name: l.restaurant.name, question: l.foQuestion }));
  const title = calibration ? "Practice call" : whenText(run.when);
  const group = approved ? sameOpener(lanes, run.mode, approved) : [];
  const grouped = group.length > 0 && !oneByOne;
  // one filled button per view: while Fo waits on a question, Book on the best match steps back to tinted
  const asking = waiting.length > 0;
  const best = approved && !calibration ? bestMatch(lanes) : null;
  // Fo still has other kitchens to call: Book says it can happen now, and waiting is fine too
  const early = !!best && lanes.some((l) => l.id !== best.id && (l.status === "needs_you" || laneFlags(l, run.mode, approved).running));
  // a later group of asks is the rest of the same table, so it drops the step count
  const later = lanes.some((l) => !group.includes(l) && (!!l.result || l.reports.length > 0));
  const guests = bySeverity(run.diners);

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/runs/${run.id}/approve`, { agreed: agreedIds });
      load();
      window.scrollTo({ top: 0, behavior: scrollBehavior() });
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  // Phones: one column in reading order. From 1024px: the table and its outcome in a sticky left column,
  // the asks and the kitchens on the right. The two columns use display: contents below lg so order can interleave.
  return (
    <div className="wrap pb-20">
      <NeedsYouAlerts waiting={waiting} baseTitle={`${title} · CrossCheck`} />
      {approved && <LiveActivity lanes={lanes} replay={run.mode === "replay"} onOpen={setOpenId} />}

      <div className="flex flex-col pt-10 md:pt-12 lg:grid lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start lg:gap-x-12 lg:pt-16 xl:gap-x-16">
        <div className="contents lg:sticky lg:top-[72px] lg:block">
          <header className="order-1">
            {run.mode === "test" && !calibration && <p className="type-footnote mb-1 font-medium text-ink-2">Test calls to your phone</p>}
            {run.mode === "replay" && <p className="type-footnote mb-1 font-medium text-ink-2">Sample</p>}
            <h1 className="type-large [overflow-wrap:anywhere]">{title}</h1>
            <ul className="type-callout mt-3 space-y-1 text-ink-2" aria-label="Your table">
              <li>Table for {run.partySize}</li>
              {guests.map((d) => {
                const needs = sortNeeds(guestNeeds(d));
                const life = needs.some((x) => x.severity === "Life threatening");
                const severe = needs.some((x) => x.severity === "Severe");
                const allergies = needs.filter((x) => x.severity);
                const diets = needs.filter((x) => !x.severity);
                // every allergy says how serious it is: "Anand · shellfish · Severe · no beef, no contact"
                return (
                  <li key={d.id} className="flex items-baseline gap-2">
                    <StateDot tone={life ? "nomatch" : severe ? "chef" : "quiet"} className="relative top-[-1px]" />
                    <span className="min-w-0">
                      <span className="text-ink">{d.label}</span>
                      {allergies.map((x) => (
                        <span key={x.text}>
                          {" "}
                          · {x.what} · <span className={`font-semibold ${SEVERITY_INK[x.severity!]}`}>{x.severity}</span>
                        </span>
                      ))}
                      {diets.length > 0 && <> · {diets.map((x) => x.what).join(" · ")}</>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </header>

          {approved && !calibration && (
            <div className={`order-2 ${grouped && group.length === lanes.length ? "" : "mt-8"}`}>
              <RunSummary lanes={lanes} mode={run.mode} approved={approved} hidden={grouped && group.length === lanes.length} />
              {waiting.length > 0 && (
                <div className="mt-4">
                  <AlertsRow />
                </div>
              )}
            </div>
          )}

        </div>

        <div className="contents lg:block">
          {error && (
            <div className="order-3 mt-6 lg:mt-0 lg:mb-6">
              <ErrorNote onRetry={approved ? load : undefined}>{error}</ErrorNote>
            </div>
          )}
          {!approved && (
            <div className="order-4 mt-8 lg:mt-0">
              <ApproveCard run={run} lanes={lanes} scripts={scripts} calibration={!!calibration} busy={busy} onApprove={approve} onChange={load} onOpen={setOpenId} />
            </div>
          )}
          {grouped && (
            <div className="order-4 mt-6 lg:mt-0 lg:mb-8">
              <GroupAsk
                runId={run.id}
                lanes={group}
                later={later}
                stops={!!run.stopAtFirstMatch && !lanes.some((l) => l.result?.state === "matched")}
                replay={run.mode === "replay"}
                onChange={load}
                onOneByOne={() => setOneByOne(true)}
              />
            </div>
          )}
          {/* the outcome leads the wide right column; on phones it follows the summary as before */}
          {best && (
            <div className="order-5 mt-6 lg:mt-0 lg:mb-8">
              <BestMatch
                run={run}
                lane={best}
                alsoMatched={lanes.filter((l) => l.id !== best.id && l.result?.state === "matched").map((l) => l.restaurant.name)}
                table={lanes}
                quiet={asking}
                early={early}
                onOpen={() => setOpenId(best.id)}
                onBook={() => {
                  setBookId(best.id);
                  setOpenId(best.id);
                }}
                onChange={load}
              />
            </div>
          )}

          {calibration && (
            <div className="order-6 mt-8 space-y-4 lg:mt-6 lg:first:mt-0">
              <CalibrationCard
                runId={run.id}
                lines={calibration}
                reports={lanes[0]?.reports.length ?? 0}
                status={lanes[0]?.status ?? ""}
                judged={!!run.calibratedAt}
                noCall={view.calibrationNoCall}
              />
            </div>
          )}

          {approved && (
            <div className="order-6 mt-10 lg:mt-6 lg:first:mt-0">
              <LaneList runId={run.id} lanes={lanes} mode={run.mode} approved={approved} oneByOne={oneByOne} flash={flash} onChange={load} onOpen={setOpenId} />
              {run.mode !== "replay" && (
                <div className="mt-6">
                  <FoConversations runId={run.id} onOpen={setOpenId} />
                </div>
              )}
            </div>
          )}

          {(approved || lanes.some((l) => l.result) || calibration) && (
            <div className="order-7 mt-12 border-t border-hairline pt-6">
              {(lanes.some((l) => l.result) || calibration) && <p className="type-footnote max-w-xl text-ink-2">{smart(DISCLAIMER)}</p>}
              {approved && (
                <div className="mt-2 flex flex-wrap items-center gap-x-6">
                  {!calibration && (
                    <Link href="/new" className="type-callout inline-flex min-h-11 items-center font-medium text-link hover:underline">
                      Start another table
                    </Link>
                  )}
                  {/* the redacted trace: no phones, emails, tokens or names of kitchens that did not book */}
                  <a href={`/api/runs/${run.id}/trace?export=1`} download className="type-footnote inline-flex min-h-11 items-center text-ink-2 hover:text-ink hover:underline">
                    Download the run trace
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <EvidenceSheet
        run={run}
        lanes={lanes}
        openId={openId}
        bookId={bookId}
        scripts={scripts}
        onChange={load}
        onPending={setPending}
        onClose={() => {
          setFlash((f) => ({ id: openId, n: f.n + 1 }));
          setOpenId(null);
        }}
      />
    </div>
  );
}

function RunSkeleton() {
  return (
    <div className="wrap pt-10 md:pt-12" aria-busy="true" aria-label="Loading the table">
      <Skeleton className="h-10 w-72 max-w-full" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      <div className="card mt-10 max-w-[640px] overflow-hidden">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex min-h-[76px] items-center gap-4 px-4 py-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3.5 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
