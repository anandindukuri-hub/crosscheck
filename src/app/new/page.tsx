"use client";

import { ChevronRight, Minus, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { scrollBehavior, useIsClient } from "@/components/kit/useMedia";
import { whenText } from "@/components/kit/typo";
import { whenTime } from "@/components/run/plain";
import { draftLine, GuestRow } from "@/components/new/GuestEditor";
import { KitchenPicker } from "@/components/new/KitchenPicker";
import { MODE_LINE, TableHeader, TableVisual } from "@/components/new/TableVisual";
import { WhenSheet } from "@/components/new/WhenSheet";
import { api, Button, ErrorNote, errText, Segmented } from "@/components/ui";
import { useDevMode } from "@/components/useDevMode";
import { useStatus } from "@/components/useStatus";
import { bookingNameProblem } from "@/lib/constants";
import { plural, sameLabels } from "@/lib/labels";
import type { Diner, Restaurant, RunMode } from "@/lib/types";

// a new table starts with one guest, you, with nothing assumed: your name, then your allergies
const START: Diner[] = [{ id: "g1", label: "", restrictions: [] }];

type Step = "guests" | "kitchens";

// which kitchens each kind of run may call: live calls reach real restaurants, a replay only the scripted kitchens
const allowed = (mode: RunMode, r: Restaurant) => (mode === "live" ? r.source !== "test" : mode === "replay" ? r.source === "test" : true);

const MODE_NOTE: Record<RunMode, string> = {
  live: "Fo calls only restaurants that said yes to an AI call. It says it is an AI and ends the call if it is a bad time. Nothing is called until you send it.",
  replay: "Scripted Thai kitchens. Nothing is called and nothing is sent.",
  test: "Fo calls your own phone and you play each kitchen.",
};

const whenAnchor = () => document.getElementById("when-row");

export default function NewTable() {
  const router = useRouter();
  const dev = useDevMode();
  // developer modes live in this browser, so the step control waits one frame for them instead of growing a tab
  const client = useIsClient();
  const [diners, setDiners] = useState<Diner[]>(START);
  const [unset, setUnset] = useState<Record<string, Set<string>>>({});
  // an other allergen typed but not added yet, by guest: it lives here so it outlasts the guest panel closing
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [when, setWhen] = useState("tonight at 7 PM");
  const [whenOpen, setWhenOpen] = useState(false);
  const [party, setParty] = useState(2);
  const [stopFirst, setStopFirst] = useState(true);
  const [pickedMode, setMode] = useState<RunMode>("live");
  const [tried, setTried] = useState<string | null>(null); // what was missing when Next was tapped
  const [closed, setClosed] = useState<Set<string>>(new Set()); // guests the person opened and closed again
  const { data: status } = useStatus();
  const [picked, setPicked] = useState<Restaurant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStepState] = useState<Step>("guests");
  const [editing, setEditing] = useState<string | null>("g1");
  const segRef = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  // the step control starts again when a prefill opens on Kitchens, so its thumb sits under the right step
  const [prefilled, setPrefilled] = useState(0);

  // "Start a new table with other kitchens" from a run: the same guests and time, new kitchens
  useEffect(() => {
    const from = new URLSearchParams(window.location.search).get("from");
    if (!from) return;
    let alive = true;
    api<{ run: { diners: Diner[]; when: string; partySize: number } }>(`/api/runs/${encodeURIComponent(from)}`)
      .then(({ run }) => {
        if (!alive || !run.diners.length) return;
        setDiners(run.diners);
        setWhen(run.when);
        setParty(run.partySize);
        setEditing(null);
        setStepState("kitchens");
        setPrefilled((n) => n + 1);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  // Live calls need Fo and both answer checks. Otherwise the table is a replay. Fo calls for the name on the booking
  const liveReady = !status || (status.fo.signedIn && status.keys.claude && status.keys.jev);
  const bookName = diners[0]?.label.trim() ?? "";
  const nameProblem = bookingNameProblem(bookName);
  const liveWhy = !liveReady ? "Not set up yet" : null;
  const effective = (m: RunMode): RunMode => {
    const wanted = m === "test" && !dev ? "live" : m;
    return wanted === "live" && liveWhy ? "replay" : wanted;
  };
  const mode = effective(pickedMode);
  const modes = [
    { value: "live" as const, label: "Real calls", disabled: !!liveWhy, aria: liveWhy ? `Real calls. ${liveWhy}` : undefined },
    { value: "replay" as const, label: "Sample" },
    ...(dev ? [{ value: "test" as const, label: "Test calls" }] : []),
  ];
  const kitchens = picked.filter((r) => allowed(mode, r));
  // kitchens the new mode cannot call are dropped, so hidden picks never count toward the 5
  const changeMode = (m: RunMode) => {
    setMode(m);
    setPicked((ps) => ps.filter((r) => allowed(effective(m), r)));
  };
  const steps: { value: Step; label: string }[] = [
    { value: "guests", label: "Guests" },
    { value: "kitchens", label: "Kitchens" },
  ];
  const at = Math.max(0, steps.findIndex((s) => s.value === step));
  const next = steps[at + 1] ?? null;

  const setStep = (s: Step) => {
    moved.current = true;
    setTried(null);
    setStepState(s);
  };
  // each step opens at its top, with the step control just under the nav
  useEffect(() => {
    if (!moved.current) return;
    segRef.current?.scrollIntoView({ block: "start", behavior: scrollBehavior() });
  }, [step]);

  const updateDiner = (i: number, d: Diner) => setDiners((ds) => ds.map((x, j) => (j === i ? d : x)));
  const markUnset = (dinerId: string) => (allergen: string, pending: boolean) =>
    setUnset((u) => {
      const s = new Set(u[dinerId] ?? []);
      if (pending) s.add(allergen);
      else s.delete(allergen);
      return { ...u, [dinerId]: s };
    });
  const toggle = (r: Restaurant) =>
    setPicked((all) => {
      const ps = all.filter((p) => allowed(mode, p));
      return ps.some((p) => p.id === r.id) ? ps.filter((p) => p.id !== r.id) : ps.length >= 5 ? ps : [...ps, r];
    });
  const addGuest = () => {
    const n = diners.length + 1;
    const id = `g${Date.now() % 100000}`;
    setDiners([...diners, { id, label: "", restrictions: [] }]);
    setParty((p) => Math.max(p, n));
    setEditing(id);
  };

  const anyUnset = diners.some((d) => (unset[d.id]?.size ?? 0) > 0);
  const drafted = diners.find((d) => drafts[d.id]?.trim());
  // a guest left unnamed is "Guest 2" on calls, notes and the pass
  const named = diners.map((d, i) => (i > 0 && !d.label.trim() ? { ...d, label: `Guest ${i + 1}` } : d));
  const guestBlocker = nameProblem
    ? nameProblem
    : drafted
      ? draftLine(drafts[drafted.id])
      : !when.trim()
      ? "Add when you are going."
      : diners.some((d) => !d.restrictions.length)
      ? "Give each guest at least one allergy or diet."
      : anyUnset
        ? "Choose how serious each allergy is."
        : sameLabels(named)
          ? "Give each guest a different name."
          : null;
  const kitchenBlocker = !kitchens.length ? "Pick a kitchen to call." : null;
  const blocker = step === "guests" ? guestBlocker : (guestBlocker ?? kitchenBlocker);
  // "Table for 2 · 1 guest with allergies · Tonight at 7 PM": the party, then who has needs, then when
  const needsWord = diners.every((d) => d.restrictions.some((r) => r.kind !== "diet")) ? "allergies" : "allergies or diets";
  const summary =
    step === "guests"
      ? `Table for ${party} · ${plural(diners.length, "guest")} with ${needsWord} · ${whenText(when)}`
      : `${plural(kitchens.length, "kitchen")} · ${MODE_LINE[mode].short}`;
  // phones get one short line: the time is already in the header and the mode is on the step
  const shortSummary = step === "guests" ? `Table for ${party} · ${whenTime(when) ?? whenText(when)}` : plural(kitchens.length, "kitchen");

  // a Next that cannot go on yet says why in red and takes the person to the first thing to fix, 12px under the nav
  function showProblem() {
    // a guest problem found from Kitchens goes back to the guests, once their step has faded in
    const back = step !== "guests" && !!guestBlocker;
    if (back) setStep("guests");
    setTried(blocker);
    if (step !== "guests" && !back) return;
    const go = (f: () => void) => (back ? window.setTimeout(f, 320) : f());
    if (nameProblem) {
      go(() => {
        const el = document.querySelector<HTMLInputElement>("input[name=booking-name]");
        el?.scrollIntoView({ block: "center", behavior: scrollBehavior() });
        el?.focus({ preventScroll: true });
      });
      return;
    }
    const d = drafted ?? diners.find((x) => !x.restrictions.length || (unset[x.id]?.size ?? 0) > 0) ?? diners.find((x) => !x.label.trim());
    if (!d) return;
    setEditing(d.id);
    go(() => requestAnimationFrame(() => document.getElementById(`row-${d.id}`)?.scrollIntoView({ block: "start", behavior: scrollBehavior() })));
  }

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const d = await api<{ id: string }>("/api/runs", { mode, when, partySize: party, diners: named, restaurantIds: kitchens.map((p) => p.id), bookingName: bookName, stopAtFirstMatch: stopFirst });
      router.push(`/run/${d.id}`);
    } catch (e) {
      setError(errText(e));
      setBusy(false);
    }
  }

  const primaryLabel = busy ? "Saving…" : next ? `Next: ${next.label}` : "Review calls";

  return (
    <div>
      <div className="wrap pt-10 md:pt-14">
        <header className="max-w-3xl">
          <h1 className="type-large">New table</h1>
          <p className="type-body mt-2 text-ink-2">Who is eating and where should Fo call? Nothing is called until you send it to Fo on the next screen.</p>
          {liveWhy && (
            <p className="mt-4 rounded-[12px] bg-fill-2 px-3.5 py-2.5 text-[13px] leading-[1.4] text-ink-2">
              Sample mode. Four made up Thai kitchens answer so you can see how it works. Nothing is called.{" "}
              <Link href="/setup" className="font-medium whitespace-nowrap text-link hover:underline">
                What real calls need
              </Link>
            </p>
          )}
        </header>

        <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.04fr)] lg:gap-12">
          <div className="hidden min-w-0 lg:sticky lg:top-[76px] lg:block lg:self-start">
            <TableVisual
              diners={named}
              party={party}
              when={when}
              picked={kitchens}
              mode={mode}
              editing={step === "guests" ? editing : null}
              unset={unset}
              onPickGuest={(id) => {
                setStep("guests");
                setEditing(id);
              }}
              onAddGuest={() => {
                setStep("guests");
                addGuest();
              }}
            />
          </div>
          <div className="min-w-0 lg:hidden">
            <TableHeader diners={diners} party={party} picked={kitchens} mode={mode} />
          </div>

          <div className="min-w-0">
            <div ref={segRef} className="scroll-mt-[72px]">
              {client ? (
                <Segmented key={`${steps.length}:${prefilled}`} full label="Steps" value={step} options={steps} onChange={setStep} />
              ) : (
                <div aria-hidden className="h-11 w-full rounded-full bg-fill-2/70 md:h-9" />
              )}
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={step} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }} className="mt-6">
                {step === "guests" && (
                  <section aria-label="Guests" className="space-y-6">
                    <div className="card divide-y divide-hairline overflow-hidden">
                      <label className="flex min-h-[56px] items-center gap-4 px-4">
                        <span className="shrink-0 text-[17px]">Name for the booking</span>
                        <input
                          value={diners[0]?.label ?? ""}
                          onChange={(e) => updateDiner(0, { ...diners[0], label: e.target.value.slice(0, 40) })}
                          name="booking-name"
                          autoComplete="given-name"
                          placeholder="Your name"
                          required
                          aria-required="true"
                          aria-invalid={tried !== null && !!nameProblem ? true : undefined}
                          className="min-h-11 w-full min-w-0 flex-1 bg-transparent text-right text-[17px] text-ink outline-none placeholder:text-ink-3 focus-visible:outline-none"
                        />
                      </label>
                      <button id="when-row" type="button" onClick={() => setWhenOpen(true)} aria-haspopup="dialog" className="flex min-h-[56px] w-full items-center gap-4 px-4 text-left hover:bg-fill/40">
                        <span className="flex-1 text-[17px]">When</span>
                        <span className="text-[17px] text-ink-2">{whenText(when)}</span>
                        <ChevronRight size={18} strokeWidth={1.75} aria-hidden className="-mr-1 shrink-0 text-ink-3" />
                      </button>
                      <div className="flex min-h-[56px] items-center gap-4 px-4">
                        <span id="party-l" className="flex-1 text-[17px]">
                          Table for
                        </span>
                        <div role="group" aria-labelledby="party-l" className="flex items-center gap-1 rounded-control bg-page p-0.5">
                          <button type="button" aria-label="One fewer" disabled={party <= Math.max(1, diners.length)} onClick={() => setParty((p) => p - 1)} className="grid h-11 w-11 place-items-center rounded-control hover:bg-fill-2 disabled:opacity-30 md:h-9 md:w-10">
                            <Minus size={16} strokeWidth={2} aria-hidden />
                          </button>
                          <span aria-live="polite" className="w-7 text-center text-[17px] font-semibold tabular-nums">
                            {party}
                          </span>
                          <button type="button" aria-label="One more" disabled={party >= 20} onClick={() => setParty((p) => p + 1)} className="grid h-11 w-11 place-items-center rounded-control hover:bg-fill-2 disabled:opacity-30 md:h-9 md:w-10">
                            <Plus size={16} strokeWidth={2} aria-hidden />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h2 className="type-footnote mb-2 px-4 font-medium text-ink-2">Guests with allergies or diets</h2>
                      <ul className="card divide-y divide-hairline overflow-hidden">
                        {diners.map((d, i) => (
                          <GuestRow
                            key={d.id}
                            you={i === 0}
                            fallback={`Guest ${i + 1}`}
                            diner={d}
                            open={editing === d.id}
                            flag={tried !== null || closed.has(d.id)}
                            unset={unset[d.id] ?? new Set()}
                            onToggle={() => {
                              if (editing === d.id) setClosed((c) => new Set(c).add(d.id));
                              setEditing((e) => (e === d.id ? null : d.id));
                            }}
                            onChange={(x) => updateDiner(i, x)}
                            onUnset={markUnset(d.id)}
                            draft={drafts[d.id] ?? ""}
                            onDraft={(v) => setDrafts((x) => ({ ...x, [d.id]: v }))}
                            onRemove={i > 0 ? () => setDiners((ds) => ds.filter((_, j) => j !== i)) : undefined}
                          />
                        ))}
                        {diners.length < 4 && (
                          <li>
                            <button type="button" onClick={addGuest} className="flex min-h-[56px] w-full items-center gap-3.5 px-4 text-left text-[17px] text-link hover:bg-fill/50">
                              <span className="grid h-10 w-10 place-items-center rounded-full bg-page">
                                <Plus size={20} strokeWidth={1.75} aria-hidden />
                              </span>
                              Add a guest
                            </button>
                          </li>
                        )}
                      </ul>
                      <p className="type-footnote mt-2 px-4 text-ink-2">Allergies go only to the AI services that make and check the calls (Fo, Claude and Jev) and to the kitchens you approve.</p>
                    </div>
                  </section>
                )}
                {step === "kitchens" && (
                  <section aria-label="Kitchens">
                    {/* who picks up decides which kitchens can be picked, so it comes first */}
                    <div className="flex flex-col gap-2 px-1 sm:flex-row sm:items-center sm:justify-between">
                      <h2 className="text-[17px] font-semibold">Who answers</h2>
                      <Segmented label="Who answers" value={mode} options={modes} onChange={changeMode} className="sm:min-w-[260px]" />
                    </div>
                    <p className="type-footnote mt-2 mb-5 px-1 text-ink-2">
                      {mode === "replay" && liveWhy ? "Real calls are not on yet. " : ""}
                      {MODE_NOTE[mode]}
                    </p>
                    <label className="card mb-6 flex min-h-[64px] cursor-pointer items-center gap-4 px-4 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[17px] text-ink">{mode === "replay" ? "Stop once a kitchen matches" : "Stop calling once a kitchen matches"}</span>
                        <span className="type-footnote block text-ink-2">{mode === "replay" ? "The sample skips the kitchens after a match." : "Fewer calls to busy kitchens."}</span>
                      </span>
                      <span className="relative inline-flex shrink-0">
                        <input type="checkbox" role="switch" checked={stopFirst} onChange={(e) => setStopFirst(e.target.checked)} className="peer sr-only" />
                        <span aria-hidden className="h-[31px] w-[51px] rounded-full bg-fill-2 transition-colors peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent" />
                        <span aria-hidden className="absolute top-[2px] left-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.15),0_1px_1px_rgba(0,0,0,0.16)] transition-transform peer-checked:translate-x-5" />
                      </span>
                    </label>
                    <KitchenPicker mode={mode} diners={diners} picked={kitchens} when={when} onToggle={toggle} />
                  </section>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div data-sticky-bar className="glass fixed inset-x-0 bottom-0 z-40 border-t border-hairline pb-[max(12px,env(safe-area-inset-bottom))]">
        <div className="wrap flex min-h-[62px] items-center gap-4 pt-3">
          <div className="min-w-0 flex-1" aria-live="polite">
            <p className={`truncate text-[15px] leading-[1.3] sm:line-clamp-2 sm:whitespace-normal md:text-[17px] ${blocker ? (tried === blocker ? "font-medium text-nomatch" : "text-ink-2") : "font-medium text-ink"}`}>
              <span className="hidden sm:inline">{blocker ?? summary}</span>
              <span className="sm:hidden">{blocker ? (tried === blocker ? blocker : step === "guests" || guestBlocker ? "Finish the guests" : "Pick a kitchen") : shortSummary}</span>
            </p>
            {error && (
              <div className="mt-1">
                <ErrorNote>{error}</ErrorNote>
              </div>
            )}
          </div>
          <Button size="lg" onClick={() => (blocker ? showProblem() : next ? setStep(next.value) : submit())} disabled={busy} className="shrink-0">
            {primaryLabel}
          </Button>
        </div>
      </div>

      <WhenSheet key={when} open={whenOpen} when={when} anchor={whenAnchor} onClose={() => setWhenOpen(false)} onDone={(w) => (setWhen(w), setWhenOpen(false))} />
    </div>
  );
}
