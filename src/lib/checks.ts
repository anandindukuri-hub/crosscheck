import { customAllergenProblem, customNameProblem, customTargetKey, normalizeCustomName } from "./allergens";
import { ALLERGEN_KEYS } from "./constants";
import { kitchenWords } from "./words";
import type { CheckInstance, ChoiceOption, Cuisine, Diner, Station, TargetKey } from "./types";

type BuiltIn = Exclude<TargetKey, `custom_${string}`>;

// What each target means on the phone. Sources: FARE, CDF, Beyond Celiac and the FDA Food Code.
const TARGETS: Record<BuiltIn, { label: string; items: string }> = {
  shellfish: { label: "shellfish", items: "shrimp, crab, lobster, clams, mussels, oysters, scallops, squid, octopus or oyster sauce" },
  crustacean: { label: "crustacean shellfish", items: "shrimp, crab or lobster" },
  mollusk: { label: "mollusks", items: "clams, mussels, oysters, scallops, squid, octopus or oyster sauce" },
  peanut: { label: "peanut", items: "peanuts, peanut oil of any kind, peanut sauce or peanut butter" },
  tree_nut: { label: "tree nuts", items: "almonds, cashews, walnuts, pecans, pistachios, hazelnuts, nut oils or nut pastes" },
  fish: { label: "fish", items: "fish, anchovy, fish sauce or Worcestershire" },
  milk: { label: "milk", items: "milk, butter, ghee, cream, cheese or casein" },
  egg: { label: "egg", items: "egg, egg wash, mayo, batter with egg or fresh egg pasta" },
  soy: { label: "soy", items: "soy sauce, tamari, tofu, miso or soybean oil" },
  sesame: { label: "sesame", items: "sesame seeds, sesame oil or tahini" },
  gluten: { label: "gluten", items: "wheat flour, breading, batter, soy sauce, barley, malt or flour dust" },
  beef: { label: "beef", items: "beef, beef fat or tallow, beef stock or broth, bouillon, natural beef flavor or gelatin" },
};

// Cuisine specific hidden sources worth naming out loud. Each one is the same allergen as its question, said as a list
const HIDDEN_EXTRAS: Partial<Record<BuiltIn, Partial<Record<Cuisine, string>>>> = {
  shellfish: {
    thai: "shrimp paste in curry paste, dried shrimp or oyster sauce",
    chinese: "oyster sauce, XO sauce, dried shrimp or seafood stock",
    japanese: "shrimp tempura bits, imitation crab or seafood stock",
    italian: "clam sauce or seafood stock in risotto or soup",
    mexican: "shrimp in shared salsa or rice",
    indian: "shrimp in shared curry bases",
  },
  crustacean: { thai: "shrimp paste in curry paste or dried shrimp", chinese: "XO sauce or dried shrimp" },
  mollusk: { thai: "oyster sauce", chinese: "oyster sauce", italian: "clam sauce" },
  peanut: {
    thai: "crushed peanut garnish, satay sauce, peanut sauce or peanuts in massaman curry",
    chinese: "peanut oil, kung pao or crushed peanuts",
    indian: "peanuts in chutneys, curries or snacks",
    mexican: "mole",
    cafe: "desserts or baked goods bought in",
    american: "desserts bought in",
  },
  tree_nut: { indian: "cashew or almond paste in curry bases", italian: "pesto", cafe: "nut flours in baking" },
  gluten: {
    thai: "soy and oyster sauce", chinese: "soy and oyster sauce", japanese: "soy sauce or tempura",
    indian: "hing cut with wheat or wheat flour in batters",
    pizza: "breadcrumbs in toppings or flour in sauces", italian: "breadcrumbs in meatballs or flour in sauces",
    burgers: "breaded toppings or flour in sauces and gravy",
  },
  beef: {
    burgers: "beef tallow fries or natural beef flavor",
    italian: "bolognese, meatballs or beef stock in risotto or sauces",
    mexican: "beef broth in rice or beans",
    american: "tallow fries or beef stock in gravy or soups",
    chinese: "beef broth in soups",
    japanese: "beef dashi or broth",
  },
};

const fryerOptions = (t: string): ChoiceOption[] => [
  { key: "shared", desc: `Food with ${t} (or the fat it was cooked in) goes in the same fryer or oil`, outcome: "fail" },
  { key: "shared_oil_changed", desc: `The fryer is shared with ${t} food, even if the oil is changed or filtered`, outcome: "fail" },
  { key: "unclear", desc: "Not stated, unsure, hedged or answered by someone guessing", outcome: "escalate" },
  { key: "dedicated", desc: `A separate fryer or oil that ${t} never goes into`, outcome: "pass" },
  { key: "not_fried", desc: "None of the named dishes are fried", outcome: "pass" },
];

const hiddenOptions = (t: string): ChoiceOption[] => [
  { key: "in_dish", desc: `${t} is in a named dish or in its sauce, stock, paste, oil, garnish or a bought in part`, outcome: "fail" },
  { key: "remove_after", desc: `${t} would only be picked off or left off after cooking (or "a little" is fine)`, outcome: "fail" },
  { key: "unclear", desc: "Not stated, unsure, hedged, a supplier or spice blend nobody can check", outcome: "escalate" },
  { key: "free", desc: `The kitchen checked and none of the named dishes contain ${t} in any part`, outcome: "pass" },
];

const surfacesOptions = (t: string): ChoiceOption[] => [
  { key: "shared_no_step", desc: `Same wok, grill, pan, boiling water, board or utensils as ${t} food with no cleaning step`, outcome: "fail" },
  { key: "rinsed", desc: "Shared gear that is only rinsed, wiped or scraped before this order", outcome: "escalate" },
  { key: "unclear", desc: "Not stated, unsure or hedged", outcome: "escalate" },
  { key: "separate_or_washed", desc: "Separate gear or a wok or pan washed with soap and hot water or fresh oil right before this order, with clean utensils", outcome: "pass" },
  { key: "not_on_site", desc: `${t} is not used anywhere in this kitchen`, outcome: "pass" },
];

const STATION_LABEL: Record<Station, string> = { hidden: "Ingredients", fryer: "Fryer oil", surfaces: "Cooking gear" };
const STATION_ORDER: Station[] = ["hidden", "fryer", "surfaces"];

// what a check is about in words a cook reads the right way: "peanut in the fryer", never "Fryer oil: peanut"
const ABOUT: Record<Station, string> = { hidden: "in the dishes", fryer: "in the fryer", surfaces: "on shared pans and tools" };
export function checkTopic(c: Pick<CheckInstance, "key" | "label">) {
  const about = ABOUT[c.key.split(":")[0] as Station];
  const target = c.label.split(": ").slice(1).join(": ");
  return about && target ? `${target} ${about}` : c.label;
}

function stationsFor(target: TargetKey, beefStrictness?: string): Station[] {
  if (target === "beef") return beefStrictness === "ingredient" ? ["hidden", "fryer"] : ["hidden", "fryer", "surfaces"];
  if (target === "milk" || target === "soy") return ["hidden", "surfaces"];
  return ["hidden", "fryer", "surfaces"];
}

// name: what the guest typed, for a custom target only
type TargetUse = { target: TargetKey; dinerIds: Set<string>; strict: boolean; beef?: string; name?: string };

const unknownNeed = (r: unknown): never => {
  throw new Error(`CrossCheck has no checks for this need: ${JSON.stringify(r).slice(0, 80)}`);
};

// a typed allergen as Fo may say it: checked again and cleaned like kitchen words. A bad name stops the run.
// strict false: a saved run is shown and described with only the say it safely check, so a newer rule never breaks its page
function customName(raw: string, strict = true) {
  const problem = strict ? customAllergenProblem(raw) : customNameProblem(raw);
  if (problem) throw new Error(`This other allergen cannot be checked: ${problem}`);
  return kitchenWords(normalizeCustomName(raw), 30);
}

// One entry per target across the whole table. A merged question gets one named answer per target.
// A need it does not know throws, so nothing a guest asked for is ever left out of the call
export function targetsFor(diners: Diner[], strict = true): TargetUse[] {
  const out = new Map<TargetKey, TargetUse>();
  const add = (t: TargetKey, dinerId: string, strict: boolean, beef?: string, name?: string) => {
    const cur = out.get(t) ?? { target: t, dinerIds: new Set<string>(), strict: false, ...(name ? { name } : {}) };
    cur.dinerIds.add(dinerId);
    cur.strict ||= strict;
    if (beef && (!cur.beef || beef !== "ingredient")) cur.beef = beef;
    out.set(t, cur);
  };
  for (const d of diners) {
    const keys = new Set(d.restrictions.flatMap((r) => (r.kind === "allergy" ? [r.allergen] : [])));
    const both = keys.has("crustacean") && keys.has("mollusk");
    for (const r of d.restrictions) {
      if (r.kind === "diet") {
        if (r.diet !== "no_beef") unknownNeed(r);
        add("beef", d.id, false, r.strictness);
      } else if (r.kind === "allergy") {
        if (!(ALLERGEN_KEYS as readonly string[]).includes(r.allergen)) unknownNeed(r);
        const t: TargetKey = both && (r.allergen === "crustacean" || r.allergen === "mollusk") ? "shellfish" : r.allergen;
        add(t, d.id, r.severity !== "intolerance");
      } else if (r.kind === "custom") {
        const name = customName(r.name, strict);
        add(customTargetKey(name), d.id, r.severity !== "intolerance", undefined, name);
      } else unknownNeed(r);
    }
  }
  return [...out.values()];
}

// label and items for a target. A custom one carries its own name, so it never falls back to a built in
function textFor(u: Pick<TargetUse, "target" | "name">): { label: string; items: string } {
  if (u.target.startsWith("custom_")) {
    if (!u.name) unknownNeed(u.target);
    return { label: u.name!, items: `${u.name} in any form` };
  }
  const t = TARGETS[u.target as BuiltIn];
  if (!t) unknownNeed(u.target);
  return t;
}

export function targetLabel(t: TargetKey) {
  return textFor({ target: t }).label;
}

export const GATING_WARN = 9;
export const GATING_MAX = 12;

export function buildChecks(diners: Diner[], cuisine: Cuisine): CheckInstance[] {
  const uses = targetsFor(diners);
  const list: Omit<CheckInstance, "code">[] = [];
  const items = new Map(uses.map((u) => [u.target, textFor(u).items]));
  for (const station of STATION_ORDER) {
    for (const u of uses) {
      if (!stationsFor(u.target, u.beef).includes(station)) continue;
      const t = textFor(u).label;
      const options = station === "hidden" ? hiddenOptions(t) : station === "fryer" ? fryerOptions(t) : surfacesOptions(t);
      list.push({
        key: `${station}:${u.target}`,
        templateId: station,
        target: u.target,
        label: `${STATION_LABEL[station]}: ${t}`,
        spoken: spokenFor(station, u, cuisine),
        instructions: "",
        options,
        dinerIds: [...u.dinerIds],
        // every check needs the chef or manager first hand; severity only sets how long the answer is kept
        strictSpeaker: true,
        ttlDays: u.strict ? 7 : 30,
      });
    }
  }
  return list.map((c, i) => {
    const code = `C${i + 1}`;
    return {
      ...c,
      code,
      instructions: `The guest must avoid ${items.get(c.target)}. Based only on \`answers.${code}\` (what the restaurant said about ${c.label.toLowerCase()} for the named dishes), which option fits?`,
    };
  });
}

// what Fo asks out loud, so each line must sound natural on a phone
function spokenFor(station: Station, u: TargetUse, cuisine: Cuisine) {
  const t = u.target;
  const label = textFor(u).label;
  const extra = HIDDEN_EXTRAS[t as BuiltIn]?.[cuisine];
  if (station === "hidden")
    return `Do those dishes have any ${label} in them, including the sauces, stocks, pastes, oils, garnishes or anything bought in?${extra ? ` That includes things like ${extra}.` : ""}`;
  if (station === "fryer")
    return t === "beef"
      ? "If any of those dishes are fried, is that oil beef tallow? Does anything with beef go in the same fryer?"
      : t === "peanut"
        ? "If any of those dishes are fried, what oil do you fry them in? Is it ever peanut oil? Does anything with peanut go in that fryer?"
        : `If any of those dishes are fried, does anything with ${label} go in the same fryer or oil?`;
  return `Do those dishes share a wok, grill, flat top, pan, cooking water, cutting board or utensils with anything that has ${label}? If they do, how do you clean them before cooking for ${u.dinerIds.size > 1 ? "these guests" : "this guest"}?`;
}

// What each word means, said once in the call instead of in every question
export function definitions(diners: Diner[]) {
  return targetsFor(diners, false).map((u) => {
    const t = textFor(u);
    return `"${t.label}" means ${t.items}`;
  });
}

// "severe tree nut allergy", never "tree nuts allergy"
const SINGULAR: Partial<Record<BuiltIn, string>> = { mollusk: "mollusk", tree_nut: "tree nut" };

// How each diner is described to Fo and the kitchen. No health detail beyond what the kitchen needs.
export function describeDiner(d: Diner): string {
  const parts: string[] = [];
  const keys = new Set(d.restrictions.flatMap((r) => (r.kind === "allergy" ? [r.allergen] : [])));
  const both = keys.has("crustacean") && keys.has("mollusk");
  let shellfishSaid = false;
  for (const r of d.restrictions) {
    if (r.kind === "diet") {
      parts.push(
        r.strictness === "ingredient"
          ? "no beef, beef stock or beef fat"
          : r.strictness === "contact"
            ? "no beef and nothing cooked with or next to beef"
            : "vegetarian, no meat and nothing cooked with meat",
      );
      continue;
    }
    if (r.kind !== "allergy" && r.kind !== "custom") unknownNeed(r);
    const sev = r.severity === "anaphylaxis" ? "life threatening" : r.severity === "severe" ? "severe" : "mild";
    if (r.kind === "custom") {
      parts.push(`${sev} ${customName(r.name, false)} allergy`);
      continue;
    }
    if (both && (r.allergen === "crustacean" || r.allergen === "mollusk")) {
      if (shellfishSaid) continue;
      shellfishSaid = true;
      parts.push(`${sev} shellfish allergy, including mollusks and oyster sauce`);
      continue;
    }
    parts.push(r.allergen === "gluten" ? `${sev} gluten allergy, no wheat or gluten and no cross contact` : `${sev} ${SINGULAR[r.allergen] ?? TARGETS[r.allergen].label} allergy`);
  }
  return `${d.label}: ${parts.join("; ")}`;
}

export function gatingSummary(checks: CheckInstance[]) {
  return { count: checks.length, warn: checks.length > GATING_WARN, tooMany: checks.length > GATING_MAX };
}
