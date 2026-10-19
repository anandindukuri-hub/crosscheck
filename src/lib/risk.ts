import { targetLabel } from "./checks";
import type { Cuisine, Diner, Restaurant, RunMode, TargetKey } from "./types";

type RiskTarget = Exclude<TargetKey, "crustacean" | "mollusk" | `custom_${string}`>;

// Common hidden sources and shared gear by cuisine. A heads up before the
// call, never a verdict: only the kitchen's own answers decide a lane.
export const CUISINE_RISK: Record<Cuisine, RiskTarget[]> = {
  thai: ["peanut", "shellfish", "fish", "gluten"],
  chinese: ["peanut", "shellfish", "sesame", "soy", "gluten", "egg"],
  indian: ["tree_nut", "milk", "gluten", "peanut"],
  mexican: ["peanut", "sesame", "milk"],
  burgers: ["beef", "sesame", "milk", "gluten", "egg"],
  pizza: ["gluten", "milk", "tree_nut", "fish"],
  italian: ["gluten", "milk", "tree_nut", "fish", "beef"],
  japanese: ["shellfish", "fish", "soy", "sesame", "gluten", "egg"],
  american: ["beef", "milk", "egg", "gluten"],
  mediterranean: ["sesame", "tree_nut", "milk"],
  cafe: ["tree_nut", "peanut", "egg", "milk", "gluten"],
  other: [],
};

export type DinerRisk = { diner: string; targets: string[] };

export function riskFor(cuisine: Cuisine, diners: Diner[]): DinerRisk[] {
  const risky = new Set<TargetKey>(CUISINE_RISK[cuisine] ?? []);
  const out: DinerRisk[] = [];
  for (const d of diners) {
    const mine: RiskTarget[] = [];
    for (const r of d.restrictions) {
      // no cuisine data for an allergen a guest typed in, so it never adds a heads up or changes who is called first
      if (r.kind !== "diet" && r.kind !== "allergy") continue;
      const t: RiskTarget = r.kind === "diet" ? "beef" : r.allergen === "crustacean" || r.allergen === "mollusk" ? "shellfish" : r.allergen;
      if (risky.has(t) && !mine.includes(t)) mine.push(t);
    }
    if (mine.length) out.push({ diner: d.label, targets: mine.map(targetLabel) });
  }
  return out;
}

// a replay's scripted kitchens all play Thai kitchens on screen (components/run/alias.ts), so they rank as Thai and the
// order on New table and on the run stay the same
export const callCuisine = (mode: RunMode, r: Pick<Restaurant, "cuisine" | "source">): Cuisine => (mode === "replay" && r.source === "test" ? "thai" : r.cuisine);

// how many of this table's needs the cuisine often hides, used only to pick who Fo calls first
export const riskCount = (cuisine: Cuisine, diners: Diner[]) => riskFor(cuisine, diners).reduce((n, d) => n + d.targets.length, 0);

// best bet first: a kitchen that matched from memory, then the fewest risk overlaps, then the order you picked.
// Returns the picked indexes in call order
export function callOrder(items: { memory: boolean; risk: number }[]): number[] {
  return items
    .map((x, i) => ({ ...x, i }))
    .sort((a, b) => Number(b.memory) - Number(a.memory) || a.risk - b.risk || a.i - b.i)
    .map((x) => x.i);
}
