"use client";

import { Check, ChevronDown, Plus, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useId, useState, type KeyboardEvent } from "react";
import { CUSTOM_ALLERGEN_MAX, customAllergenProblem, normalizeCustomName, restrictionLabel } from "@/lib/allergens";
import { ALLERGEN_KEYS } from "@/lib/constants";
import { initials, shortNeeds } from "@/lib/labels";
import type { Diner, Restriction } from "@/lib/types";
import { Segmented } from "../kit/Segmented";
import { Button } from "../ui";

export const ALLERGEN_LABEL: Record<(typeof ALLERGEN_KEYS)[number], string> = {
  crustacean: "Crustacean shellfish",
  mollusk: "Mollusks",
  peanut: "Peanut",
  tree_nut: "Tree nuts",
  fish: "Fish",
  milk: "Milk",
  egg: "Egg",
  soy: "Soy",
  sesame: "Sesame",
  gluten: "Celiac (gluten)",
};

// for the severity control's name: "How serious is the mollusk allergy for Anand"
const allergyName = (a: (typeof ALLERGEN_KEYS)[number]) =>
  a === "gluten" ? "celiac (gluten)" : `the ${a === "mollusk" ? "mollusk" : a === "tree_nut" ? "tree nut" : ALLERGEN_LABEL[a].toLowerCase()} allergy`;

// what the two shellfish choices cover, in words a parent uses
const ALLERGEN_HINT: Partial<Record<(typeof ALLERGEN_KEYS)[number], string>> = {
  crustacean: "Shrimp, crab, lobster",
  mollusk: "Clams, oysters, squid",
};

type Allergy = Extract<Restriction, { kind: "allergy" }>;
type Custom = Extract<Restriction, { kind: "custom" }>;
type Diet = Extract<Restriction, { kind: "diet" }>;

// the unset key for a typed allergen, apart from the built in keys
export const customKey = (name: string) => `custom:${normalizeCustomName(name)}`;

// an other allergen still in its field: it is not on the table until Add is tapped
export const draftLine = (draft: string) => `Tap Add to include ${normalizeCustomName(draft)} or clear it.`;
type BeefPick = "none" | "ingredient" | "contact";

const SEVERITY: { value: Allergy["severity"]; label: string }[] = [
  { value: "anaphylaxis", label: "Life threatening" },
  { value: "severe", label: "Severe" },
  { value: "intolerance", label: "Mild" },
];

const BEEF: { value: BeefPick; label: string; aria: string }[] = [
  { value: "none", label: "Eats beef", aria: "Eats beef" },
  { value: "ingredient", label: "No beef", aria: "No beef ingredients" },
  { value: "contact", label: "No contact", aria: "No beef, no contact" },
];

const BEEF_HINT: Record<BeefPick, string> = {
  none: "Fo does not ask about beef for this guest.",
  ingredient: "No beef, beef stock or beef fat.",
  contact: "No beef and nothing cooked with or next to beef.",
};

const SPRING = { type: "spring", stiffness: 380, damping: 32 } as const;

export function GuestRow({
  diner,
  you = false,
  fallback = "Guest",
  open,
  flag = false,
  unset,
  draft,
  onToggle,
  onChange,
  onRemove,
  onUnset,
  onDraft,
}: {
  diner: Diner;
  you?: boolean; // the first guest is the person booking: named in the booking field, never removed
  fallback?: string; // what Fo says when the name is left blank: "Guest 2"
  open: boolean;
  flag?: boolean; // Next was tapped, or this guest was closed, with nothing picked: the hint turns into an error
  unset: Set<string>; // allergens added but with no severity chosen yet
  draft: string; // an other allergen typed but not added yet
  onToggle: () => void;
  onChange: (d: Diner) => void;
  onRemove?: () => void;
  onUnset: (allergen: string, pending: boolean) => void;
  onDraft: (draft: string) => void;
}) {
  const needs = shortNeeds(diner);
  const panelId = `guest-${diner.id}`;
  return (
    <li id={`row-${diner.id}`} className="scroll-mt-[64px]">
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={panelId} className="flex min-h-[64px] w-full items-center gap-3.5 px-4 py-3 text-left hover:bg-fill/50">
        <Avatar label={diner.label || (you ? "You" : fallback)} size={40} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[17px] font-semibold">
            {diner.label || (you ? "You" : fallback)}
            {you && diner.label && <span className="font-normal text-ink-2"> · you</span>}
          </span>
          <span className={`block truncate text-[15px] ${!needs && flag ? "text-nomatch" : "text-ink-2"}`}>
            {!needs ? (flag ? "Pick at least one allergy or diet" : "Tap to add allergies or diets") : needs.charAt(0).toUpperCase() + needs.slice(1)}
          </span>
        </span>
        <ChevronDown size={20} strokeWidth={1.75} aria-hidden className={`shrink-0 text-ink-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={panelId} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={SPRING} className="overflow-hidden">
            <GuestFields diner={diner} you={you} fallback={fallback} flag={flag} unset={unset} draft={draft} onChange={onChange} onRemove={onRemove} onUnset={onUnset} onDraft={onDraft} />
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

function GuestFields({
  diner,
  you,
  fallback,
  flag,
  unset,
  draft,
  onChange,
  onRemove,
  onUnset,
  onDraft,
}: {
  diner: Diner;
  you: boolean;
  fallback: string;
  flag: boolean;
  unset: Set<string>;
  draft: string;
  onChange: (d: Diner) => void;
  onRemove?: () => void;
  onUnset: (allergen: string, pending: boolean) => void;
  onDraft: (draft: string) => void;
}) {
  const has = (a: string) => diner.restrictions.find((r) => r.kind === "allergy" && r.allergen === a) as Allergy | undefined;
  const beef = diner.restrictions.find((r) => r.kind === "diet") as Diet | undefined;
  const set = (rs: Restriction[]) => onChange({ ...diner, restrictions: rs });
  // a new allergy starts with no severity: the person chooses it, nothing is assumed
  const toggle = (a: (typeof ALLERGEN_KEYS)[number]) => {
    const on = !!has(a);
    onUnset(a, !on);
    set(on ? diner.restrictions.filter((r) => !(r.kind === "allergy" && r.allergen === a)) : [...diner.restrictions, { kind: "allergy", allergen: a, severity: "severe" }]);
  };
  // every allergy that needs a severity, built in or typed, in the order they were added
  const allergies = diner.restrictions.filter((r): r is Allergy | Custom => r.kind !== "diet");
  const customs = diner.restrictions.filter((r): r is Custom => r.kind === "custom");
  const sevKey = (r: Allergy | Custom) => (r.kind === "custom" ? customKey(r.name) : r.allergen);
  const beefPick: BeefPick = beef?.strictness === "ingredient" || beef?.strictness === "contact" ? beef.strictness : "none";
  const nameId = `name-${diner.id}`;
  const who = diner.label || (you ? "you" : "this guest");

  return (
    <div className="space-y-6 px-4 pt-1 pb-5">
      {/* the person booking is named once, in the booking field above */}
      <div className={you ? "hidden" : ""}>
        <label htmlFor={nameId} className="type-footnote font-medium text-ink-2">
          Name on calls
        </label>
        <input
          id={nameId}
          value={diner.label}
          onChange={(e) => onChange({ ...diner, label: e.target.value.slice(0, 40) })}
          name={`guest-${diner.id}`}
          autoComplete="off"
          spellCheck={false}
          placeholder="First name or initial"
          aria-describedby={`${nameId}-hint`}
          className="mt-1.5 min-h-11 w-full rounded-input border border-transparent bg-page px-3.5 text-[17px] placeholder:text-ink-3 focus:bg-surface"
        />
        <p id={`${nameId}-hint`} className="type-footnote mt-1.5 text-ink-3">
          Optional. Leave blank and Fo says {fallback}.
        </p>
      </div>

      <fieldset>
        <legend className="type-footnote font-medium text-ink-2">Allergies</legend>
        <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label={`Allergies for ${who}`}>
          {ALLERGEN_KEYS.map((a) => {
            const on = !!has(a);
            return (
              <button
                type="button"
                key={a}
                onClick={() => toggle(a)}
                aria-pressed={on}
                className={`flex min-h-11 items-center justify-between gap-2 rounded-control px-3 py-1.5 text-left text-[15px] transition-colors ${on ? "bg-surface font-medium text-ink shadow-[inset_0_0_0_2px_var(--accent)]" : "bg-page text-ink hover:bg-fill-2"}`}
              >
                <span className="min-w-0 leading-tight">
                  {ALLERGEN_LABEL[a]}
                  {ALLERGEN_HINT[a] && <span className="mt-0.5 block text-[12px] leading-[16px] font-normal text-ink-2">{ALLERGEN_HINT[a]}</span>}
                </span>
                {on && <Check size={16} strokeWidth={2.25} aria-hidden className="shrink-0 text-accent" />}
              </button>
            );
          })}
        </div>
        <p className="type-footnote mt-2 text-ink-2">Allergic to all shellfish? Pick both shellfish choices.</p>
      </fieldset>

      <OtherAllergens
        customs={customs}
        who={who}
        flag={flag}
        draft={draft}
        setDraft={onDraft}
        onAdd={(name) => {
          onUnset(customKey(name), true);
          set([...diner.restrictions, { kind: "custom", name, severity: "severe" }]);
        }}
        onRemove={(r) => {
          onUnset(customKey(r.name), false);
          set(diner.restrictions.filter((x) => x !== r));
        }}
      />

      {allergies.length > 0 && (
        <div className="space-y-4">
          {allergies.map((r) => {
            const key = sevKey(r);
            const pending = unset.has(key);
            const label = r.kind === "custom" ? restrictionLabel(r) : ALLERGEN_LABEL[r.allergen];
            return (
              <div key={key}>
                <p className="type-footnote mb-1.5 font-medium text-ink-2">{label}: how serious</p>
                <Segmented
                  full
                  fit
                  label={`How serious is ${r.kind === "custom" ? `the ${normalizeCustomName(r.name)} allergy` : allergyName(r.allergen)} for ${who}`}
                  value={pending ? null : r.severity}
                  options={SEVERITY}
                  onChange={(v) => {
                    onUnset(key, false);
                    set(diner.restrictions.map((x) => (x === r ? { ...r, severity: v } : x)));
                  }}
                />
              </div>
            );
          })}
          <p className="type-footnote text-ink-2">Fo asks for the chef or manager for every allergy. Answers for life threatening and severe allergies are asked again after 7 days. Answers for mild ones last 30 days.</p>
        </div>
      )}

      <div>
        <p className="type-footnote mb-1.5 font-medium text-ink-2">Beef</p>
        <Segmented
          full
          label={`Beef rule for ${who}`}
          value={beefPick}
          options={BEEF}
          onChange={(v) => {
            const rest = diner.restrictions.filter((r) => r.kind !== "diet");
            set(v === "none" ? rest : [...rest, { kind: "diet", diet: "no_beef", strictness: v }]);
          }}
        />
        <p className="type-footnote mt-1.5 text-ink-2">{BEEF_HINT[beefPick]}</p>
      </div>

      {diner.restrictions.length === 0 && flag && <p className="type-footnote text-nomatch">Pick at least one allergy or diet{onRemove ? " or remove this guest" : ""}.</p>}
      {onRemove && (
        <Button variant="destructive" size="sm" onClick={onRemove} className="-ml-2">
          Remove {who}
        </Button>
      )}
    </div>
  );
}

// Allergens the list does not have, typed in: up to three per guest, each checked as it is typed, each with its own
// severity below. The checks run again on the server. The typed word is kept by the page, and Next waits until it
// is added or cleared, so nothing typed is ever left off the calls
function OtherAllergens({
  customs,
  who,
  flag,
  draft,
  setDraft,
  onAdd,
  onRemove,
}: {
  customs: Custom[];
  who: string;
  flag: boolean;
  draft: string;
  setDraft: (draft: string) => void;
  onAdd: (name: string) => void;
  onRemove: (r: Custom) => void;
}) {
  const id = useId();
  const [tried, setTried] = useState(false);
  const [said, setSaid] = useState("");
  const taken = customs.map((r) => r.name);
  const name = normalizeCustomName(draft);
  const problem = customAllergenProblem(draft, taken);
  // quiet while the first letters go in, then plain words as soon as there is something to say
  const shown = tried || (name && (flag || name.length >= 3)) ? problem : null;
  // Next was tapped with a word still in the field: say what to do with it
  const waiting = !shown && !!name && flag;
  const full = customs.length >= CUSTOM_ALLERGEN_MAX;

  function add() {
    if (problem) {
      setTried(true);
      return;
    }
    onAdd(name);
    setSaid(`${sentenceCase(name)} added. Choose how serious it is below.`);
    setDraft("");
    setTried(false);
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    add();
  }

  return (
    <div>
      <label htmlFor={`${id}-in`} className="type-footnote font-medium text-ink-2">
        Other allergens
      </label>
      {customs.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2" aria-label={`Other allergens for ${who}`}>
          {customs.map((r) => (
            <li key={r.name} className="flex min-h-11 items-center gap-1 rounded-control bg-surface pl-3 text-[15px] font-medium shadow-[inset_0_0_0_2px_var(--accent)]">
              {restrictionLabel(r)}
              <button
                type="button"
                onClick={() => {
                  onRemove(r);
                  setSaid(`${restrictionLabel(r)} removed.`);
                }}
                aria-label={`Remove ${normalizeCustomName(r.name)}`}
                className="grid h-11 w-10 place-items-center rounded-control text-ink-2 hover:text-ink"
              >
                <X size={16} strokeWidth={2} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {full ? (
        <p className="type-footnote mt-2 text-ink-2">Up to {CUSTOM_ALLERGEN_MAX} other allergens per guest.</p>
      ) : (
        <div className="mt-2 flex gap-2">
          <input
            id={`${id}-in`}
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 40))}
            onKeyDown={onKey}
            enterKeyHint="done"
            autoComplete="off"
            spellCheck
            placeholder="For example mustard"
            aria-invalid={shown || waiting ? true : undefined}
            aria-describedby={`${id}-msg`}
            className="min-h-11 w-full min-w-0 flex-1 rounded-input border border-transparent bg-page px-3.5 text-[17px] placeholder:text-ink-3 focus:bg-surface aria-[invalid=true]:shadow-[inset_0_0_0_1.5px_var(--nomatch)]"
          />
          <button type="button" onClick={add} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-control bg-fill px-4 text-[15px] font-semibold text-link hover:bg-fill-2">
            <Plus size={16} strokeWidth={2} aria-hidden />
            Add
          </button>
        </div>
      )}
      <p id={`${id}-msg`} aria-live="polite" className={`type-footnote mt-1.5 ${shown || waiting ? "text-nomatch" : "text-ink-2"}`}>
        {shown ?? (waiting ? draftLine(draft) : full ? "" : "Fo asks the same questions as for any allergy above.")}
      </p>
      <p className="sr-only" aria-live="polite">
        {said}
      </p>
    </div>
  );
}

const sentenceCase = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// one avatar everywhere: a light gray disc with the initials in ink; selected adds an accent ring
export function Avatar({ label, size = 40, selected = false }: { label: string; size?: number; selected?: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full bg-[#e8e8ed] font-semibold text-ink ${selected ? "ring-2 ring-accent ring-offset-2 ring-offset-surface" : ""}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {initials(label)}
    </span>
  );
}
