import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { engineText, sentence, smart } from "@/components/kit/typo";
import type { PassGuest } from "@/components/launch/WalletPass";
import { aliasReplay } from "@/components/run/alias";
import { PassView } from "@/components/run/PassView";
import { bySeverity, fmtClock, groupAnswers, groupTitle, guestNeeds, heardFor, mergedTitle, passTime, sortNeeds, target } from "@/components/run/plain";
import { PrintIcon } from "@/components/ServerView";
import { fmtDate, RESULT_META, SPEAKER_LABEL } from "@/lib/labels";
import { tableCard } from "@/lib/lanes";
import { DISCLAIMER } from "@/lib/note";
import { passFileName } from "@/lib/passImage";
import { loadLane, loadRun, safeId } from "@/lib/store";
import type { CheckVerdict, Lane, LaneResult, Run } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Table pass" };

type Props = { params: Promise<{ runId: string; laneId: string }> };

async function load(p: Props["params"]) {
  const { runId, laneId } = await p;
  try {
    const [run, lane] = await Promise.all([loadRun(safeId(runId)), loadLane(safeId(runId), safeId(laneId))]);
    return run && lane ? aliasReplay(run.mode, { run, lane }) : null;
  } catch {
    return null;
  }
}

// the kitchen's words for staff to read: one allergen per line with its own quote, the most serious allergy first.
// Never folded, so no title ever names an allergen its quote does not. Who said it and when sits once on top when
// one person gave every answer
function Quotes({ run, lane, quotes }: { run: Run; lane: Lane; quotes: CheckVerdict[] }) {
  const groups = groupAnswers(quotes, run.diners, { quotedOnly: true, fold: false });
  const by = groups.map((g) => {
    const c = g.lead;
    const heard = heardFor(lane, c.code);
    const who = c.speaker === "chef_or_manager" && heard.who ? heard.who : sentence(SPEAKER_LABEL[c.speaker]);
    return `${who}${heard.at ? ` · ${fmtDate(heard.at)}, ${fmtClock(heard.at)}` : ""}`;
  });
  const one = by.every((x) => x === by[0]) ? by[0] : null;
  // the same words said once cover every allergen they were said for: one quote, its allergens as small tags under
  // it. Words that differ by allergen stay on their own lines
  const merged: { key: string; title: string; quote: string; tags: string[]; by: string; leads: CheckVerdict[] }[] = [];
  groups.forEach((g, i) => {
    const quote = g.lead.quote ?? "";
    const same = merged.find((m) => m.quote === quote && m.by === by[i]);
    if (same) {
      same.tags.push(target(g.lead));
      same.leads.push(g.lead);
      // one title names every allergen the same words cover: "Shellfish and beef never go in this fryer"
      same.title = mergedTitle(same.leads, same.tags);
    } else merged.push({ key: g.key, title: groupTitle(g), quote, tags: [target(g.lead)], by: by[i], leads: [g.lead] });
  });
  const item = (m: (typeof merged)[number]) => (
    <li key={m.key}>
      <p className="text-[15px] leading-[1.35] font-semibold text-ink">{m.title}</p>
      <blockquote className="quote mt-1 [overflow-wrap:anywhere]">“{smart(m.quote)}”</blockquote>
      {m.tags.length > 1 && <p className="mt-1.5 text-[12px] leading-[16px] font-medium text-ink-2">{m.tags.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(" · ")}</p>}
      {!one && <p className="type-footnote mt-1 text-ink-2">{m.by}</p>}
    </li>
  );
  const first = merged.slice(0, 3);
  const rest = merged.slice(3);
  return (
    <>
      {one && <p className="type-footnote -mt-1 mb-4 text-ink-2">{one}</p>}
      <ul className="space-y-4">{first.map(item)}</ul>
      {rest.length > 0 && (
        <details className="group/all mt-4">
          <summary className="flex min-h-11 cursor-pointer items-center gap-1 text-[15px] font-medium text-link select-none group-open/all:hidden">
            Show every answer
          </summary>
          <ul className="space-y-4 pt-1">{rest.map(item)}</ul>
        </details>
      )}
    </>
  );
}

function passGuests(run: Run, r: LaneResult): PassGuest[] {
  return bySeverity(run.diners).map((d) => ({
    name: d.label,
    needs: sortNeeds(guestNeeds(d)),
    dish: smart((r.dishes.find((x) => x.diner === d.label)?.dishes ?? []).map(engineText).join(", ")) || null,
  }));
}

export default async function TablePass({ params }: Props) {
  const found = await load(params);
  if (!found) notFound();
  const { run, lane } = found;
  const r = lane.result;
  const card = tableCard(lane);
  const back = (
    <Link href={`/run/${run.id}#lane-${lane.id}`} className="-ml-2 inline-flex min-h-11 items-center gap-0.5 rounded-control px-2 text-[17px] text-link hover:underline">
      <ChevronLeft size={20} strokeWidth={1.75} aria-hidden />
      Your table
    </Link>
  );

  if (card.kind === "none" || !r) {
    return (
      <div className="wrap py-10">
        <div className="mx-auto max-w-[400px]">
          {back}
          <div className="card mt-4 rounded-pass px-6 py-8 text-center">
            <h1 className="type-title">No table pass yet</h1>
            <p className="type-callout mt-2 text-ink-2">
              {lane.restaurant.name} {r ? `came out as “${RESULT_META[r.state].label}”.` : "has no answers yet."} {card.kind === "none" ? smart(card.why) : ""}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // the reconfirm took the evidence away, so the old quotes never reach the chef
  if (card.kind === "blocked") {
    return (
      <div className="wrap py-10">
        <div className="mx-auto max-w-[400px]">
          {back}
          <article role="alert" className="card mt-4 overflow-hidden rounded-pass">
            <div className="flex items-center justify-between px-6 py-4 text-white" style={{ background: "var(--nomatch)" }}>
              <span translate="no" className="text-[17px] font-semibold tracking-[-0.01em]">
                CrossCheck
              </span>
              <span className="text-[15px] font-semibold">Not reconfirmed</span>
            </div>
            <div className="px-6 pt-6 pb-7">
              <h1 className="type-title text-nomatch">Do not use this pass</h1>
              <p className="type-body mt-2">{lane.restaurant.name} did not give the same answers when Fo called to reconfirm. The earlier answers no longer hold.</p>
              <h2 className="type-footnote mt-6 font-medium text-ink-2">Why</h2>
              <ul className="type-callout mt-2 space-y-1">
                {card.reasons.slice(0, 8).map((x) => (
                  <li key={x}>{smart(x)}</li>
                ))}
              </ul>
              <p className="type-body mt-6 font-semibold">Do not order from these answers. Talk to the chef in person first. You can also pick another kitchen.</p>
              <p className="type-footnote mt-6 border-t border-hairline pt-4 text-ink-2">{smart(DISCLAIMER)}</p>
            </div>
          </article>
        </div>
      </div>
    );
  }

  const quotes = r.checks.filter((c) => c.quote);
  const rc = lane.reconfirm;
  const booked = lane.booking?.status === "done";
  const state = rc?.status === "reconfirmed" ? "Booked and reconfirmed" : booked ? "Booked" : r.state === "matched" ? "Matched" : "Reviewed";
  return (
    <PassView
      runId={run.id}
      state={state}
      restaurant={lane.restaurant.name}
      time={passTime(run.when, run.createdAt)}
      party={`Table for ${run.partySize}`}
      sample={run.mode === "replay"}
      guests={passGuests(run, r)}
      back={back}
      print={<PrintIcon />}
      image={{ href: `/card/${run.id}/${lane.id}/image?download=1`, name: passFileName(lane.restaurant.name) }}
      words={quotes.length > 0 ? <Quotes run={run} lane={lane} quotes={quotes} /> : null}
      footer={<p className="type-footnote mt-4 border-t border-hairline pt-4 text-ink-2">{smart(DISCLAIMER)}</p>}
      note={lane.reconfirm?.status === "needs_review" ? <p className="type-callout mt-4 font-semibold">Fo called again today. Read today’s answers on your table page before you go.</p> : null}
    />
  );
}
