import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/kit/button";
import type { RingTone } from "@/components/kit/State";
import { whenText } from "@/components/kit/typo";
import { aliasReplay } from "@/components/run/alias";
import { tableDate } from "@/components/run/plain";
import { RunsList, type RunRow } from "@/components/run/RunsList";
import { plural, RESULT_META } from "@/lib/labels";
import { listRuns, loadLanes } from "@/lib/store";
import type { Lane, LaneResultState, Run } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your tables" };

const ORDER: LaneResultState[] = ["matched", "needs_review", "needs_chef", "not_matched", "no_answer", "declined"];

// how the table came out, as a dot and a few words; the kitchen it is about is the row's title
function outcome(run: Run, lanes: Lane[]): { tone: RingTone; word: string; kitchen: string | null } {
  if (run.purpose === "calibration")
    return { tone: run.calibratedAt ? "matched" : "quiet", word: run.calibratedAt ? "Checked" : run.approvedAt ? "In progress" : "Not sent to Fo yet", kitchen: null };
  const booked = lanes.find((l) => l.booking?.status === "done");
  if (booked) return { tone: "matched", word: booked.reconfirm?.status === "reconfirmed" ? "Booked and reconfirmed" : "Booked", kitchen: booked.restaurant.name };
  const best = ORDER.find((s) => lanes.some((l) => l.result?.state === s));
  const at = best ? lanes.find((l) => l.result?.state === best)! : null;
  const kitchen = best === "matched" || best === "needs_review" ? at!.restaurant.name : null;
  if (!run.approvedAt) return { tone: "you", word: "Review the calls", kitchen };
  if (lanes.some((l) => l.status === "needs_you")) return { tone: "you", word: "Fo needs your OK", kitchen };
  if (best === "matched") return { tone: "matched", word: "Matched", kitchen };
  if (best === "needs_review") return { tone: "review", word: "Ready for your review", kitchen };
  if (lanes.some((l) => !l.result && l.status !== "done")) return { tone: "work", word: "Calls in progress", kitchen: null };
  return { tone: best ? RESULT_META[best].tone : "quiet", word: best ? "No kitchen matched" : "No answers", kitchen: null };
}

const clock = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(":00", "").replace(" ", "\u00a0");
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

// one date format for every row: "Tonight at 7 PM", "Tomorrow at 7 PM", "Sat, Oct 17 at 7 PM"
function rowWhen(at: Date | null, when: string, now: Date) {
  if (!at) return whenText(when);
  const t = clock(at);
  if (sameDay(at, now)) return `${at.getHours() >= 17 ? "Tonight" : "Today"} at ${t}`;
  if (sameDay(at, new Date(now.getTime() + 86_400_000))) return `Tomorrow at ${t}`;
  return `${at.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at ${t}`;
}

export default async function Runs() {
  const runs = await listRuns();
  const shown = runs.slice(0, 40);
  const lanes = await Promise.all(shown.map((r) => loadLanes(r).catch(() => [] as Lane[])));
  const now = new Date().getTime();
  const rows: RunRow[] = shown.map((run, i) => {
    const view = aliasReplay(run.mode, { run, lanes: lanes[i] });
    const o = outcome(view.run, view.lanes);
    const practice = run.purpose === "calibration";
    // a table sorts by its own time; it stays upcoming until three hours after it starts. A practice call is past
    const at = practice ? null : tableDate(run.when, run.createdAt);
    const t = (at ?? new Date(run.createdAt)).getTime();
    const upcoming = !!at && t > now - 3 * 3_600_000;
    // the row leads with the table's time, never a raw run label; the kitchen it came out at sits beside the state
    const title = practice ? "Practice call" : rowWhen(at, run.when, new Date(now));
    const word = o.kitchen ? `${o.kitchen} · ${o.word}` : o.word;
    const meta = practice
      ? [`${new Date(run.createdAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at ${clock(new Date(run.createdAt))}`, "Call to your phone"]
      : [`Table for ${run.partySize}`, plural(run.laneIds.length, "kitchen"), ...(run.mode === "test" ? ["Test calls"] : [])];
    return { id: run.id, title, at: t, upcoming, tone: o.tone, word, meta, replay: run.mode === "replay", draft: practice && !run.approvedAt, hidden: false };
  });
  // practice calls never sent to Fo are a developer's leftovers: they show only with developer modes on
  for (const r of rows) r.hidden = r.replay || r.draft;

  return (
    <div className="wrap pt-10 pb-20 md:pt-14">
      <div className="mx-auto max-w-[720px]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="type-large">Your tables</h1>
            <p className="type-body mt-2 text-ink-2">Every table you sent Fo to check. Coming up first, then the rest.</p>
          </div>
          <Link href="/new" className={buttonClass("primary")}>
            Start a table
          </Link>
        </div>
        <RunsList rows={rows} />
      </div>
    </div>
  );
}
