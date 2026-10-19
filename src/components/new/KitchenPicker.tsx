"use client";

import { Check, ChevronDown, Info, MapPin, Plus, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { CUISINES } from "@/lib/constants";
import { capFirst, listJoin } from "@/lib/labels";
import { callCuisine, riskFor } from "@/lib/risk";
import { tableDate, whenTime } from "../run/plain";
import { aliasKitchen } from "../run/alias";
import type { Diner, LaneResultState, Restaurant, RunMode } from "@/lib/types";
import { api, Button, ErrorNote, errText, fmtDate, Skeleton } from "../ui";
import { cuisineLabel, openAt } from "./hours";

export type Memory = Record<string, { decidedAt: string; state: LaneResultState; mode: RunMode }>;

// plural cuisine labels read as a typo before "kitchens": "Taco kitchens", not "Tacos kitchens"
const ONE: Record<string, string> = { Burgers: "Burger", Tacos: "Taco", Noodles: "Noodle", Sandwiches: "Sandwich", Pancakes: "Pancake", Waffles: "Waffle" };

type Row = { r: Restaurant; hours: { open: boolean | null; label: string | null } };

// "+16085550134" as people write it: "(608) 555-0134"
const phoneText = (p: string) => p.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3");

export function KitchenPicker(props: { mode: RunMode; diners: Diner[]; picked: Restaurant[]; when: string; onToggle: (r: Restaurant) => void }) {
  const { mode, diners, picked, when, onToggle } = props;
  const [q, setQ] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [results, setResults] = useState<Restaurant[] | null>(null);
  const [memory, setMemory] = useState<Memory>({});
  const [error, setError] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const [removeErr, setRemoveErr] = useState<string | null>(null);
  // a removed restaurant waits 5 seconds with an Undo in its row before it is really removed
  const [undo, setUndo] = useState<{ r: Restaurant; picked: boolean } | null>(null);
  const undoTimer = useRef<number | null>(null);
  const pendingRemove = useRef<Restaurant | null>(null);
  const [gone, setGone] = useState<Set<string>>(new Set()); // removed and on their way out, hidden until the list reloads

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      const u = new URLSearchParams({ q, cuisine });
      api<{ restaurants: Restaurant[]; memory: Memory }>(`/api/restaurants?${u}`)
        .then((d) => {
          if (!alive) return;
          setResults(d.restaurants);
          setMemory(d.memory ?? {});
          setError(null);
        })
        .catch((e) => alive && setError(errText(e)));
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, cuisine, tries]);

  // open at the table's time first, then hours unknown, then closed; closed kitchens cannot be picked
  const at = tableDate(when, new Date().toISOString());
  const day = at ?? new Date();
  const minutes = at ? at.getHours() * 60 + at.getMinutes() : null;
  const time = whenTime(when);
  // live calls reach real restaurants, quick picks or ones you added; a replay uses only the scripted kitchens, so no
  // real restaurant's name is ever put on scripted answers
  const rows: Row[] =
    results
      ?.filter((r) => (mode === "live" ? r.source !== "test" : mode === "replay" ? r.source === "test" : true) && !gone.has(r.id))
      .map((r) => aliasKitchen(mode, r))
      .map((r) => ({ r, hours: openAt(r.hours, day, minutes) })) ?? [];
  const at_ = time ? `at ${time}` : "that day";
  // test kitchens lead in a test run, where they are the point; then the restaurants you added; then the quick picks
  // by whether they are open at the table's time
  const groups: { id: string; label: string | null; rows: Row[] }[] =
    mode === "replay"
      ? [{ id: "sample", label: null, rows }]
      : [
          { id: "test", label: "Test kitchens", rows: rows.filter((x) => x.r.source === "test") },
          { id: "added", label: "Added by you", rows: rows.filter((x) => x.r.source === "custom") },
          { id: "open", label: `Open ${at_}`, rows: rows.filter((x) => x.r.source === "osm" && x.hours.open === true) },
          { id: "unknown", label: "Hours not listed", rows: rows.filter((x) => x.r.source === "osm" && x.hours.open === null) },
          { id: "closed", label: `Closed ${at_}`, rows: rows.filter((x) => x.r.source === "osm" && x.hours.open === false) },
        ].filter((g) => g.rows.length);
  const full = picked.length >= 5;
  // a sample has only its scripted kitchens to pick from
  const cap = mode === "replay" && rows.length ? Math.min(5, rows.length) : 5;

  // what the picked kitchens' cuisines often cook with, said once above the list, only once something is picked
  const notes = (() => {
    const seen = new Map<string, string[]>();
    for (const raw of picked) {
      const risks = [...new Set(riskFor(callCuisine(mode, raw), diners).flatMap((x) => x.targets))];
      if (!risks.length) continue;
      const label = cuisineLabel({ ...aliasKitchen(mode, raw), source: undefined });
      const name = ONE[label] ?? label;
      seen.set(name, [...new Set([...(seen.get(name) ?? []), ...risks])]);
    }
    // the first two cuisines, said once per allergen: "American and Italian kitchens often cook with beef."
    const byRisk = new Map<string, string[]>();
    for (const [name, risks] of [...seen].slice(0, 2)) for (const risk of risks) byRisk.set(risk, [...(byRisk.get(risk) ?? []), name]);
    const lines = new Map<string, { names: string[]; risks: string[] }>();
    for (const [risk, names] of byRisk) {
      const line = lines.get(names.join("|")) ?? { names, risks: [] };
      line.risks.push(risk);
      lines.set(names.join("|"), line);
    }
    return [...lines.values()];
  })();

  async function commitRemove(r: Restaurant) {
    try {
      const res = await fetch(`/api/restaurants/${encodeURIComponent(r.id)}`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? "Could not remove it. Try again.");
    } catch (e) {
      setRemoveErr(errText(e));
      setGone((g) => new Set([...g].filter((x) => x !== r.id)));
    } finally {
      setTries((n) => n + 1);
    }
  }
  // a second remove, or leaving this step, finishes the one waiting first
  function flushRemove() {
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    undoTimer.current = null;
    const r = pendingRemove.current;
    pendingRemove.current = null;
    if (!r) return;
    setGone((g) => new Set(g).add(r.id));
    setUndo((u) => (u?.r.id === r.id ? null : u));
    void commitRemove(r);
  }
  function remove(r: Restaurant) {
    flushRemove();
    setRemoveErr(null);
    const was = picked.some((p) => p.id === r.id);
    if (was) onToggle(r);
    pendingRemove.current = r;
    setUndo({ r, picked: was });
    undoTimer.current = window.setTimeout(flushRemove, 5000);
  }
  function undoRemove() {
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    undoTimer.current = null;
    pendingRemove.current = null;
    if (undo?.picked && !full) onToggle(undo.r);
    setUndo(null);
  }
  useEffect(
    () => () => {
      if (undoTimer.current) window.clearTimeout(undoTimer.current);
      const r = pendingRemove.current;
      if (r) void fetch(`/api/restaurants/${encodeURIComponent(r.id)}`, { method: "DELETE" }).catch(() => undefined);
    },
    [],
  );

  return (
    <>
      {mode === "live" && (
        <p className="type-callout mb-3 flex items-start gap-1.5 px-1 text-ink-2">
          <MapPin size={16} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0" />
          Quick picks in Madison, WI. Add any US restaurant with its phone number below.
        </p>
      )}
      <div className={`flex flex-col gap-2 sm:flex-row ${mode === "replay" ? "hidden" : ""}`}>
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search restaurants</span>
          <Search size={18} strokeWidth={1.75} aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" />
          <input
            type="search"
            name="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            autoComplete="off"
            className="min-h-11 w-full rounded-input border border-transparent bg-surface pr-3 pl-10 text-[17px] shadow-card"
          />
        </label>
        <label className="relative w-full shrink-0 sm:w-auto">
          <span className="sr-only">Cuisine</span>
          <select
            name="cuisine"
            value={cuisine}
            onChange={(e) => setCuisine(e.target.value)}
            className="min-h-11 w-full appearance-none rounded-input border border-transparent bg-surface pr-9 pl-3.5 text-[17px] shadow-card sm:text-[15px]"
          >
            <option value="">Any cuisine</option>
            {CUISINES.map((c) => (
              <option key={c} value={c}>
                {capFirst(c)}
              </option>
            ))}
          </select>
          <ChevronDown size={16} strokeWidth={1.75} aria-hidden className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-2" />
        </label>
      </div>
      {mode === "replay" ? (
        <p className="type-footnote mb-3 px-1 text-ink-2">Sample uses four made up kitchens. Restaurants you add are for real calls.</p>
      ) : (
        <AddRestaurant
          full={full}
          onAdded={(r) => {
            if (!full && !picked.some((p) => p.id === r.id)) onToggle(r);
            setTries((n) => n + 1);
          }}
        />
      )}
      {error && (
        <div className="mt-3">
          <ErrorNote onRetry={() => setTries((n) => n + 1)}>Could not load restaurants. {error}</ErrorNote>
        </div>
      )}
      {removeErr && (
        <div className="mt-3">
          <ErrorNote>{removeErr}</ErrorNote>
        </div>
      )}
      {notes.length > 0 && (
        <div className="mb-3 flex items-start gap-2.5 rounded-[12px] bg-raised px-3.5 py-3 shadow-[inset_0_0_0_1px_var(--hairline)]">
          <Info size={16} strokeWidth={1.75} aria-hidden className="mt-px shrink-0 text-ink-2" />
          <p className="text-[13px] leading-[1.4] text-ink-2">
            {notes.map(({ names, risks }) => `${listJoin(names)} kitchens often cook with ${listJoin(risks)}.`).join(" ")} Fo asks every kitchen about shared fryers and pans.
          </p>
        </div>
      )}
      {results === null && !error ? (
        <ul className="card divide-y divide-hairline overflow-hidden" aria-busy="true" aria-label="Restaurants">
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i} className="flex items-center gap-3.5 px-4 py-3.5">
              <Skeleton className="h-6 w-6 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        results !== null && (
          <div className="space-y-4">
            {groups.map((g) => (
              <section key={g.id} aria-labelledby={g.label ? `kp-${g.id}` : undefined} aria-label={g.label ? undefined : "Restaurants"}>
                {/* the group's name stays in view under the nav while its rows scroll */}
                {g.label && (
                  <h3 id={`kp-${g.id}`} className="sticky top-[52px] z-10 -mx-1 bg-page/95 px-5 py-2 text-[13px] font-semibold text-ink-2 backdrop-blur-sm">
                    {g.label}
                  </h3>
                )}
                <ul className="card divide-y divide-hairline overflow-hidden">
                  {g.rows.map(({ r, hours }) => {
                    const on = picked.some((p) => p.id === r.id);
                    const mem = memory[r.id];
                    const closed = hours.open === false;
                    const added = r.source === "custom";
                    if (undo?.r.id === r.id)
                      return (
                        <li key={r.id} className="flex min-h-[64px] items-center gap-3 py-3 pr-2 pl-4">
                          <span className="min-w-0 flex-1 truncate text-[15px] text-ink-2">{r.name} removed</span>
                          <button type="button" onClick={undoRemove} autoFocus aria-label={`Undo removing ${r.name}`} className="min-h-11 shrink-0 rounded-control px-3 text-[17px] font-medium text-link hover:bg-fill">
                            Undo
                          </button>
                        </li>
                      );
                    return (
                      <li key={r.id} className="flex items-center">
                        <button
                          type="button"
                          onClick={() => onToggle(results.find((x) => x.id === r.id) ?? r)}
                          aria-pressed={on}
                          disabled={!on && (full || closed)}
                          className={`flex min-h-[64px] min-w-0 flex-1 items-center gap-3.5 py-3 pl-4 text-left transition-colors hover:bg-fill/50 disabled:cursor-not-allowed disabled:hover:bg-transparent ${added ? "pr-1" : "pr-4"} ${closed ? "" : "disabled:opacity-50"}`}
                        >
                          <span
                            aria-hidden
                            className={`grid h-6 w-6 shrink-0 place-items-center rounded-full transition-colors ${on ? "bg-accent text-white" : "shadow-[inset_0_0_0_1.5px_var(--line)]"}`}
                          >
                            {on && <Check size={14} strokeWidth={3} />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={`block truncate text-[17px] font-medium leading-snug ${closed ? "text-ink-3" : ""}`}>{r.name}</span>
                            <span className={`block truncate text-[15px] ${closed ? "text-ink-3" : "text-ink-2"}`}>
                              {r.source === "test"
                                ? mode === "replay"
                                  ? cuisineLabel({ ...r, source: undefined })
                                  : "Test kitchen that calls your phone"
                                : added
                                  ? `${cuisineLabel(r)} · ${phoneText(r.phone)}`
                                  : `${cuisineLabel(r)}${hours.label ? ` · ${hours.label}` : ""}`}
                            </span>
                            {mem && (
                              <span className="mt-1 block text-[13px] text-ink-2" title={`Answers from an earlier ${mem.mode === "live" ? "real" : "test"} call. Used only for this same table.`}>
                                Answers on file from {fmtDate(mem.decidedAt)}
                              </span>
                            )}
                          </span>
                        </button>
                        {added && (
                          <button
                            type="button"
                            onClick={() => remove(r)}
                            aria-label={`Remove ${r.name}`}
                            className="mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-fill hover:text-ink disabled:opacity-50"
                          >
                            <X size={18} strokeWidth={1.75} aria-hidden />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            {rows.length === 0 && (
              <p className="card type-callout px-4 py-8 text-center text-ink-2">
                No restaurants match{q ? ` “${q}”` : ""}. Try another name or pick Any cuisine.
              </p>
            )}
          </div>
        )
      )}
      <p className="type-footnote mt-3 px-1 text-ink-2">
        {picked.length ? `${picked.length} of ${cap} picked. ` : `Pick up to ${cap}. `}
        Only the chef or manager’s answers decide, never the cuisine.
        {mode === "live" ? " Fo says it is an AI and ends the call politely if it is a bad time or they would rather not talk." : ""}
      </p>
    </>
  );
}

type Field = "name" | "phone" | "cuisine";

// Any restaurant in the US with a phone number: a name, a number and a cuisine. The server checks each field and
// says what to fix; the same number as one you already added gives that one back
function AddRestaurant({ full, onAdded }: { full: boolean; onAdded: (r: Restaurant) => void }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [cuisine, setCuisine] = useState<string>("other");
  const [errs, setErrs] = useState<Partial<Record<Field | "form", string>>>({});
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const local: typeof errs = {};
    if (!name.trim()) local.name = "Add the restaurant’s name.";
    if (!phone.trim()) local.phone = "Add the restaurant’s phone number.";
    setErrs(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    try {
      const res = await fetch("/api/restaurants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, phone, cuisine }) });
      const json = (await res.json().catch(() => ({}))) as { data?: { restaurant: Restaurant }; error?: string; issues?: { path?: (string | number)[]; message?: string }[] };
      if (!res.ok || !json.data) {
        const next: typeof errs = {};
        for (const i of json.issues ?? []) {
          const f = i.path?.[0];
          if ((f === "name" || f === "phone" || f === "cuisine") && i.message && !next[f]) next[f] = i.message;
        }
        if (!Object.keys(next).length) next.form = json.error ?? "Could not add it. Try again.";
        setErrs(next);
        return;
      }
      onAdded(json.data.restaurant);
      setSaid(`${json.data.restaurant.name} added${full ? "" : " and picked"}.`);
      setName("");
      setPhone("");
      setCuisine("other");
      setErrs({});
      setOpen(false);
    } catch {
      setErrs({ form: "Could not reach CrossCheck. Try again." });
    } finally {
      setBusy(false);
    }
  }

  const field = "mt-1.5 min-h-11 w-full rounded-input border border-transparent bg-page px-3.5 text-[17px] placeholder:text-ink-3 focus:bg-surface aria-[invalid=true]:shadow-[inset_0_0_0_1.5px_var(--nomatch)]";
  const err = (f: Field) =>
    errs[f] ? (
      <p id={`${id}-${f}-err`} className="type-footnote mt-1.5 text-nomatch">
        {errs[f]}
      </p>
    ) : null;

  return (
    <div className="my-3">
      <p className="sr-only" aria-live="polite">
        {said}
      </p>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          className="card flex min-h-[56px] w-full items-center gap-3.5 px-4 text-left text-[17px] text-link hover:bg-fill/50"
        >
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-page">
            <Plus size={16} strokeWidth={2} aria-hidden />
          </span>
          Add a restaurant
        </button>
      ) : (
        <form onSubmit={submit} noValidate aria-labelledby={`${id}-h`} className="card px-4 pt-4 pb-3">
          <h3 id={`${id}-h`} className="text-[17px] font-semibold">
            Add a restaurant
          </h3>
          <p className="type-footnote mt-1 text-ink-2">Any restaurant in the US with a phone number. Fo calls it like any other kitchen.</p>
          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor={`${id}-name`} className="type-footnote font-medium text-ink-2">
                Name
              </label>
              <input
                id={`${id}-name`}
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 80))}
                autoComplete="off"
                autoFocus
                placeholder="Restaurant name"
                aria-invalid={errs.name ? true : undefined}
                aria-describedby={errs.name ? `${id}-name-err` : undefined}
                className={field}
              />
              {err("name")}
            </div>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,180px)]">
              <div>
                <label htmlFor={`${id}-phone`} className="type-footnote font-medium text-ink-2">
                  Phone
                </label>
                <input
                  id={`${id}-phone`}
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.slice(0, 30))}
                  autoComplete="off"
                  placeholder="608 555 0134"
                  aria-invalid={errs.phone ? true : undefined}
                  aria-describedby={errs.phone ? `${id}-phone-err` : undefined}
                  className={field}
                />
                {err("phone")}
              </div>
              <div>
                <label htmlFor={`${id}-cuisine`} className="type-footnote font-medium text-ink-2">
                  Cuisine
                </label>
                <div className="relative">
                  <select
                    id={`${id}-cuisine`}
                    value={cuisine}
                    onChange={(e) => setCuisine(e.target.value)}
                    aria-invalid={errs.cuisine ? true : undefined}
                    aria-describedby={errs.cuisine ? `${id}-cuisine-err` : undefined}
                    className={`${field} appearance-none pr-9`}
                  >
                    {CUISINES.map((c) => (
                      <option key={c} value={c}>
                        {capFirst(c)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={16} strokeWidth={1.75} aria-hidden className="pointer-events-none absolute top-1/2 right-3 mt-[3px] -translate-y-1/2 text-ink-2" />
                </div>
                {err("cuisine")}
              </div>
            </div>
          </div>
          {errs.form && (
            <div className="mt-3">
              <ErrorNote>{errs.form}</ErrorNote>
            </div>
          )}
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button
              variant="plain"
              onClick={() => {
                setOpen(false);
                setErrs({});
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Adding…" : "Add"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
