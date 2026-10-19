import { Download } from "lucide-react";
import type { Metadata } from "next";
import { DevStatus, DevToggle } from "@/components/setup/DevSetup";
import { sentence } from "@/components/kit/typo";
import { listRuns } from "@/lib/store";
import { readStats } from "@/lib/trace";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Developer setup" };

const MODE = { test: "Test calls", live: "Real calls", replay: "Sample" } as const;

// Everything a person who runs CrossCheck from source needs, kept off the consumer path: keys, Fo sign in,
// developer modes, run counts and the redacted traces
export default async function DeveloperSetup() {
  const [runs, stats] = await Promise.all([listRuns(), readStats()]);
  const recent = runs.slice(0, 12);
  return (
    <div className="wrap pt-10 pb-20 md:pt-14">
      <div className="mx-auto max-w-[720px]">
        <h1 className="type-large">Developer setup</h1>
        <p className="type-body mt-2 text-ink-2">For running CrossCheck from its source folder. None of this is needed to use it.</p>

        <h2 className="type-footnote mt-10 mb-2 px-6 font-medium text-ink-2 md:px-8">Keys and Fo</h2>
        <div className="card px-6 md:px-8">
          <DevStatus />
        </div>

        <h2 className="type-footnote mt-10 mb-2 px-6 font-medium text-ink-2 md:px-8">Developer modes</h2>
        <div className="card px-6 md:px-8">
          <DevToggle />
        </div>

        <h2 className="type-footnote mt-10 mb-2 px-6 font-medium text-ink-2 md:px-8">Runs that finished</h2>
        <dl className="card grid grid-cols-2 gap-px overflow-hidden bg-hairline sm:grid-cols-4">
          {(
            [
              ["Real calls", stats.live],
              ["Test calls", stats.test],
              ["Rule check runs", stats.eval],
              ["Sample", stats.replay],
            ] as const
          ).map(([label, s]) => (
            <div key={label} className="bg-surface px-6 py-4 md:px-8">
              <dt className="type-footnote text-ink-2">{label}</dt>
              <dd className="mt-0.5 text-[21px] font-semibold tabular-nums">
                {s.ok} <span className="type-callout font-normal text-ink-2">of {s.runs}</span>
              </dd>
            </div>
          ))}
        </dl>
        <p className="type-caption mt-2 px-6 text-ink-2 md:px-8">
          A rule check run counts only when every case passes. {stats.eval.runs - stats.eval.ok > 0 ? `${stats.eval.runs - stats.eval.ok} earlier ${stats.eval.runs - stats.eval.ok === 1 ? "run" : "runs"} missed a case. The count keeps every run. ` : ""}
          <a href="/api/dev/eval" className="text-link hover:underline">
            See the latest run
          </a>
        </p>

        <h2 className="type-footnote mt-10 mb-2 px-6 font-medium text-ink-2 md:px-8">Run traces</h2>
        <p className="type-callout mb-3 px-6 text-ink-2 md:px-8">Every Fo, Jev and Claude call in a run, with phone numbers, emails, sign in values, staff names and the names of places that were not booked removed.</p>
        <ul className="card divide-y divide-hairline overflow-hidden">
          {recent.length === 0 && <li className="type-callout px-6 py-4 text-ink-2">No runs yet.</li>}
          {recent.map((r) => (
            <li key={r.id}>
              <a href={`/api/runs/${r.id}/trace?export=1`} className="flex min-h-12 items-center gap-3 px-6 py-3 hover:bg-fill/50 md:px-8">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{r.purpose === "calibration" ? "Practice call" : sentence(r.when)}</span>
                  <span className="type-footnote block text-ink-2">
                    {MODE[r.mode]} · {new Date(r.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                </span>
                <Download size={18} strokeWidth={1.75} aria-hidden className="shrink-0 text-link" />
                <span className="sr-only">Download the trace</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
