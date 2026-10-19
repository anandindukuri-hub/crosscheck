"use client";

import { ChevronRight, Download } from "lucide-react";
import { useState, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import { WalletPass, type PassGuest } from "../launch/WalletPass";
import { ServerView } from "../ServerView";

// "Who is Guest 2?" lives only in this browser: it helps the server at the table and never reaches Fo or the kitchen
const key = (runId: string) => `cc-who-${runId}`;
const subs = new Set<() => void>();
function readRaw(runId: string): string {
  try {
    return localStorage.getItem(key(runId)) ?? "{}";
  } catch {
    return "{}";
  }
}
function parse(raw: string): Record<string, string> {
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}
function save(runId: string, who: Record<string, string>) {
  try {
    localStorage.setItem(key(runId), JSON.stringify(who));
  } catch {}
  subs.forEach((f) => f());
}

const anonymous = (name: string) => /^guest\s*\d+$/i.test(name.trim());

type Props = {
  runId: string;
  state: string;
  restaurant: string;
  time: string;
  party: string;
  sample: boolean;
  guests: PassGuest[];
  back: ReactNode;
  print: ReactNode;
  image: { href: string; name: string }; // the pass as a PNG to keep in Photos
  words: ReactNode | null; // the kitchen's words, folded and ordered
  footer: ReactNode;
  note: ReactNode | null;
};

// The table pass in the app: the pass and its back link in one 400px column; from 1024px the server view, the
// guest names and the kitchen's words sit in a second column at the same top
export function PassView({ runId, state, restaurant, time, party, sample, guests, back, print, image, words, footer, note }: Props) {
  const raw = useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => void subs.delete(f);
    },
    () => readRaw(runId),
    () => "{}",
  );
  const who = parse(raw);
  // "Maya, window seat" becomes the guest's name on the pass and in the server view: "Maya · window seat"
  const named = guests.map((g) => {
    const typed = who[g.name]?.trim();
    return { ...g, name: typed ? typed.replace(/\s*,\s*/g, " · ") : g.name };
  });
  const askable = guests.filter((g) => anonymous(g.name));
  const typed = askable.some((g) => who[g.name]?.trim());
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState(false);
  // with a name typed for a guest, the image is drawn with it, so the saved pass matches the one on screen. The names
  // go only to CrossCheck on this computer, in the request body
  async function saveNamed(e: MouseEvent<HTMLAnchorElement>) {
    if (!typed) return;
    e.preventDefault();
    setSaving(true);
    setSaveErr(false);
    try {
      const res = await fetch(image.href.replace(/\?.*$/, ""), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ who }) });
      if (!res.ok) throw new Error(String(res.status));
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = image.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setSaveErr(true);
    } finally {
      setSaving(false);
    }
  }
  // phones ask before the pass, where it is needed first; wider screens ask beside it
  const whoIs = (where: "phone" | "device") =>
    askable.length > 0 && (
      <section aria-labelledby={`who-h-${where}`} className={`card px-5 py-4 print:hidden ${where === "phone" ? "mb-4 lg:hidden" : "hidden lg:block"}`}>
        <h2 id={`who-h-${where}`} className="type-footnote font-semibold text-ink-2">
          Only on this {where}
        </h2>
        <div className="mt-2 space-y-3">
          {askable.map((g) => (
            <label key={g.name} className="block">
              <span className="text-[15px] font-medium">Who is {g.name}?</span>
              <input
                value={who[g.name] ?? ""}
                onChange={(e) => save(runId, { ...who, [g.name]: e.target.value.slice(0, 40) })}
                placeholder="Name or seat"
                autoComplete="off"
                className="mt-1.5 min-h-11 w-full rounded-input border border-transparent bg-page px-3.5 text-[17px] focus:bg-surface"
              />
            </label>
          ))}
        </div>
        <p className="type-footnote mt-2 text-ink-2">Helps your server know who is who. It stays on this {where} and is never sent to Fo or the kitchen.</p>
      </section>
    );

  return (
    <div className="wrap py-6 md:py-10 print:p-0">
      <div className="mx-auto max-w-[400px] lg:grid lg:max-w-[880px] lg:grid-cols-[400px_minmax(0,1fr)] lg:items-start lg:gap-x-12 print:max-w-none">
        <div>
          <div className="mb-3 flex items-center justify-between gap-3 print:hidden">
            {back}
            <div className="flex items-center gap-1">
              <a
                href={image.href}
                download={image.name}
                onClick={saveNamed}
                aria-busy={saving || undefined}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-control px-2 text-[17px] text-link hover:underline ${saving ? "pointer-events-none opacity-60" : ""}`}
              >
                <Download size={18} strokeWidth={1.75} aria-hidden />
                Save as image
              </a>
              {print}
            </div>
          </div>
          {saveErr && (
            <p role="alert" className="type-footnote mb-3 text-nomatch print:hidden">
              Could not save the image. Try again.
            </p>
          )}
          {whoIs("phone")}
          <div className="[&_.ccl-pass]:shadow-sheet print:[&_.ccl-pass]:shadow-none">
            <WalletPass state={state} restaurant={restaurant} time={time} party={party} sample={sample} guests={named} footer={footer}>
              {words && (
                <details className="group mt-4 lg:hidden print:hidden">
                  <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-[17px] text-link select-none">
                    <span className="group-open:hidden">Show the kitchen’s words</span>
                    <span className="hidden group-open:inline">Hide the kitchen’s words</span>
                    <ChevronRight size={18} strokeWidth={1.75} aria-hidden className="transition-transform group-open:rotate-90 motion-reduce:transition-none" />
                  </summary>
                  <div className="pt-3 pb-1">{words}</div>
                </details>
              )}
            </WalletPass>
          </div>
          {note}
        </div>

        <div className="mt-6 space-y-6 lg:mt-[56px] print:hidden">
          {/* who is who comes before the server view, so the server never reads "Guest 2" */}
          {whoIs("device")}
          {/* on phones the one action used at the table is pinned to the bottom, in reach of a thumb */}
          <div
            data-sticky-bar-phone
            className="max-md:glass max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-40 max-md:border-t max-md:border-hairline max-md:px-5 max-md:pt-3 max-md:pb-[max(12px,env(safe-area-inset-bottom))] max-md:[&_button]:min-h-[56px]"
          >
            <ServerView restaurant={restaurant} time={time} guests={named} sample={sample} />
          </div>
          {words && (
            <section aria-labelledby="words-h" className="card hidden px-5 py-5 lg:block">
              <h2 id="words-h" className="type-footnote font-semibold text-ink-2">
                What the kitchen told us
              </h2>
              <div className="mt-3">{words}</div>
            </section>
          )}
        </div>
      </div>
      {words && (
        <div className="mt-6 hidden border-t border-hairline pt-4 print:block">
          <p className="type-footnote mb-3 font-medium text-ink-2">What the kitchen told us</p>
          {words}
        </div>
      )}
    </div>
  );
}
