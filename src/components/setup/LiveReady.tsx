"use client";

import Link from "next/link";
import { useStatus } from "../useStatus";
import { Rows, StatusRow } from "./StepKeys";

// Everything a real run needs, checked in one place before you phone a kitchen
export function LiveReady() {
  const { data } = useStatus();
  if (!data?.live) return null;
  const { fo, keys, live } = data;
  const rows = [
    { name: "Fo", ok: fo.signedIn && fo.tools.length >= 5, okWord: "Connected", missingWord: "Not connected", line: "Makes the calls." },
    { name: "Answer checks", ok: keys.claude && keys.jev, okWord: "Set up", missingWord: "Not set up", line: "Claude and Jev read every answer." },
    { name: "Practice call", ok: keys.fidelity === "verified", okWord: "Passed", missingWord: "Not passed", line: "Until it passes, a match waits for you to read each answer." },
    {
      name: "Other real runs",
      ok: !live.openRun,
      okWord: "None going",
      missingWord: "One is going",
      line: live.openRun ? (
        <>
          Finish it or stop it first.{" "}
          <Link href={`/run/${live.openRun.id}`} className="text-link hover:underline">
            Open it
          </Link>
        </>
      ) : (
        "Only one real run goes at a time."
      ),
    },
    { name: "Recording build", ok: live.production, okWord: "Ready", missingWord: "Dev build", line: live.production ? "No developer badge on screen." : "Record from npm run build then npm start, so no developer badge shows." },
  ];
  // the build only matters for recording, so a dev server can still be ready for a real run
  const ready = rows.filter((r) => r.name !== "Recording build").every((r) => r.ok);
  return (
    <section aria-labelledby="live-h" className="card mt-6 overflow-hidden rounded-sheet px-6 pt-6 pb-4 md:px-12">
      <h2 id="live-h" className="type-headline">{ready ? "Ready for a real run" : "Before a real run"}</h2>
      <p className="type-callout mt-1 text-ink-2">Phone each restaurant first and ask if a short AI call about allergies is OK.</p>
      <Rows className="mt-4 border-t border-hairline">
        {rows.map((r) => (
          <StatusRow key={r.name} name={r.name} line={r.line} ok={r.ok} okWord={r.okWord} missingWord={r.missingWord} />
        ))}
      </Rows>
      {live.doNotCall > 0 && (
        <p className="type-footnote mt-3 text-ink-2">
          {live.doNotCall} {live.doNotCall === 1 ? "kitchen has" : "kitchens have"} asked not to be called. CrossCheck will not call them.{" "}
          <Link href="/ledger" className="text-link hover:underline">
            See the list
          </Link>
        </p>
      )}
    </section>
  );
}
