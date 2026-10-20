"use client";

import { ChevronRight, PhoneCall } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FidelitySetting } from "@/lib/settings";
import { buttonClass } from "../kit/button";
import { api, Button, ErrorNote, errText, fmtDateTime, Skeleton } from "../ui";
import { useStatus } from "../useStatus";
import { SignalList } from "./SignalList";
import { LiveReady } from "./LiveReady";
import { Rows, StatusRow } from "./StepKeys";

export type Settings = { fidelity: "verified" | "unverified"; source: "env" | "calibration" | null; calibration: FidelitySetting | null };

// a sample table: the launch page's own table, scripted, so anyone can see a run before setup is done
const SAMPLE = {
  mode: "replay",
  when: "tonight at 7 PM",
  partySize: 2,
  diners: [
    {
      id: "g1",
      label: "Anand",
      restrictions: [
        { kind: "allergy", allergen: "crustacean", severity: "severe" },
        { kind: "allergy", allergen: "mollusk", severity: "severe" },
        { kind: "diet", diet: "no_beef", strictness: "contact" },
      ],
    },
    { id: "g2", label: "Guest 2", restrictions: [{ kind: "allergy", allergen: "peanut", severity: "anaphylaxis" }] },
  ],
  restaurantIds: ["test-thai", "test-burgers", "test-italian", "test-indian"],
};

// Setup status, honestly: nothing on this page can save a value, so it shows what is ready, what is not and the
// one place where it gets fixed. The practice call starts here once the phone and Fo are ready.
export function SetupFlow() {
  const router = useRouter();
  const { data: s, error } = useStatus(5_000);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [setErr, setSetErr] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startErr, setStartErr] = useState<string | null>(null);
  const [sampling, setSampling] = useState(false);

  useEffect(() => {
    const load = () =>
      api<Settings>("/api/settings")
        .then((x) => {
          setSettings(x);
          setSetErr(null);
        })
        .catch((e) => setSetErr(errText(e)));
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, []);

  if (!s) {
    return (
      <div className="card mx-auto max-w-[620px] rounded-sheet px-6 py-14 md:px-12" aria-busy="true" aria-label="Loading setup status">
        {error ? (
          <ErrorNote>{error}</ErrorNote>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <Skeleton className="h-9 w-72 max-w-full" />
            <Skeleton className="h-5 w-80 max-w-full" />
            <Skeleton className="mt-6 h-40 w-full" />
          </div>
        )}
      </div>
    );
  }

  const verified = settings ? settings.fidelity === "verified" : s.keys.fidelity === "verified";
  const checks = s.keys.claude && s.keys.jev;
  const rows = [
    { name: "Your phone", line: "Test calls and the practice call ring it.", ok: s.keys.testPhone },
    { name: "Fo", line: "Makes the calls to each kitchen.", ok: s.fo.signedIn, okWord: "Connected", missingWord: "Not connected" },
    { name: "Answer checks", line: "Claude and Jev read every answer.", ok: checks, okWord: "Set up", missingWord: "Not set up" },
  ];
  const missing = rows.filter((r) => !r.ok).length;
  const canPractice = s.keys.claude && s.keys.testPhone;
  const cal = settings?.calibration ?? null;
  // FO_REPORT_FIDELITY in .env.local holds every match for your review whatever the last practice call said
  const held = settings?.source === "env";
  const passed = cal ? cal.status === "verified" : verified;
  const title = missing ? "Real calls are not on yet" : verified ? "CrossCheck is ready" : held ? "You read each answer before booking" : "Try a practice call";
  const line = missing
    ? "Real calls need a few keys added by the person who set up this CrossCheck. You do not need to do anything. Until then, try a sample table."
    : verified
      ? "Fo is connected and its reports keep every word that matters."
      : held
        ? "Fo is connected. You read each quote yourself before you book."
        : "One call to your own phone, where you play the chef. It checks that Fo writes down unsure words like “I think”, answers passed on by other staff and a shared fryer, word for word.";
  const practiceLine = held
    ? "FO_REPORT_FIDELITY in .env.local holds every match for your review. Remove it to use your practice call."
    : verified
      ? cal
        ? `Passed ${fmtDateTime(cal.at)}`
        : "Passed"
      : !s.keys.testPhone
        ? "The practice call needs your phone number first."
        : !canPractice
          ? "The practice call needs developer setup on this computer first."
          : cal
            ? `Did not pass ${fmtDateTime(cal.at)}. Try it again.`
            : "Until it passes, every match waits for your review. You read each quote yourself.";

  async function sample() {
    setSampling(true);
    setStartErr(null);
    try {
      const { id } = await api<{ id: string }>("/api/runs", SAMPLE);
      router.push(`/run/${id}`);
    } catch (e) {
      setStartErr(errText(e));
      setSampling(false);
    }
  }

  async function start() {
    if (!canPractice) return;
    setStarting(true);
    setStartErr(null);
    try {
      const { id } = await api<{ id: string }>("/api/calibration", {});
      router.push(`/run/${id}`);
    } catch (e) {
      setStartErr(errText(e));
      setStarting(false);
    }
  }

  return (
    <div className="mx-auto max-w-[620px]">
      <section aria-labelledby="setup-h" className="card overflow-hidden rounded-sheet">
        <div className="px-6 pt-10 pb-2 md:px-12 md:pt-12">
          <h1 id="setup-h" className="text-[28px] leading-[1.12] font-semibold tracking-[-0.02em] [text-wrap:balance] md:text-[40px]">
            {title}
          </h1>
          <p className="type-body mt-2 text-ink-2">{line}</p>
          {setErr && (
            <div className="mt-4">
              <ErrorNote>{setErr}</ErrorNote>
            </div>
          )}
          <div className="mt-8">
            <Rows className="border-t border-hairline">
              {rows
                .filter((r) => missing > 0 || r.name !== "Answer reviews" || !r.ok)
                .map((r) => (
                  <StatusRow key={r.name} name={r.name} line={r.line} ok={r.ok} okWord={r.okWord} missingWord={r.missingWord} />
                ))}
              {missing === 0 && <StatusRow name="Practice call" line={practiceLine} ok={passed} okWord="Passed" missingWord={cal ? "Not passed" : "Not yet"} />}
            </Rows>
            {cal && <SignalList signals={cal.signals} className="mt-5" />}
            {cal && (
              <Link href={`/run/${cal.runId}`} className="type-footnote mt-2 inline-flex min-h-11 items-center gap-0.5 font-medium text-link hover:underline">
                Open the last practice call
                <ChevronRight size={14} strokeWidth={2} aria-hidden />
              </Link>
            )}
          </div>
          {startErr && (
            <div className="mt-4">
              <ErrorNote>{startErr}</ErrorNote>
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-col-reverse items-stretch gap-2 border-t border-hairline px-6 py-4 sm:flex-row sm:items-center sm:justify-end md:px-12">
          {missing > 0 ? (
            <>
              <p className="type-footnote text-ink-2 sm:mr-auto">A sample table plays scripted kitchens. Nothing is called.</p>
              <Button size="lg" onClick={sample} disabled={sampling}>
                {sampling ? "Opening…" : "Try a sample table"}
              </Button>
            </>
          ) : verified || held ? (
            <>
              <Button variant="plain" onClick={start} disabled={starting || !canPractice}>
                {starting ? "Starting…" : cal ? "Try the practice call again" : "Start the practice call"}
              </Button>
              <Link href="/new" className={buttonClass("primary", "lg")}>
                Start a table
              </Link>
            </>
          ) : (
            <>
              <Link href="/new" className={buttonClass("plain")}>
                Skip for now
              </Link>
              <Button size="lg" onClick={start} disabled={starting || !canPractice}>
                <PhoneCall size={18} strokeWidth={1.75} aria-hidden />
                {starting ? "Starting…" : "Start the practice call"}
              </Button>
            </>
          )}
        </div>
      </section>
      {missing === 0 && <LiveReady />}
      {missing > 0 && (
        <p className="mt-4 text-center">
          <Link href="/setup/developer" className="type-footnote inline-flex min-h-11 items-center text-ink-2 hover:text-ink hover:underline">
            Running CrossCheck from its source folder? Developer setup
          </Link>
        </p>
      )}
    </div>
  );
}
