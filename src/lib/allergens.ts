import type { AllergenKey, Restriction } from "./types";

// Other allergens a guest types in. Pure, with no node imports, so the guest editor and the server check names the same way

export const CUSTOM_ALLERGEN_MAX = 3;
const NAME_MIN = 2;
const NAME_MAX = 30;
const WORDS_MAX = 3;

// built with RegExp so the unicode letter class works with the ES2017 target
const ALLOWED = new RegExp("^[\\p{L}\\p{M}' -]+$", "u");
const EDGES = new RegExp("^\\p{L}(?:.*[\\p{L}\\p{M}])?$", "u");
const MARKS = new RegExp("\\p{M}", "gu");
// words that only make sense as an instruction to an assistant, never as a food
const NOT_FOOD = /\b(ignore|disregard|instructions?|system|prompt|assistant|override|pretend|forget|rules?)\b/;

export const normalizeCustomName = (name: string) => name.replace(/[‘’]/g, "'").trim().replace(/\s+/g, " ").toLowerCase();

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// the choices as the guest editor shows them
export const ALLERGEN_CHOICE: Record<AllergenKey, string> = {
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

const BEEF_CHOICE = "the No beef choice";

// names a built in choice already asks about
const SAME_AS: Record<string, AllergenKey | "beef"> = {
  shrimp: "crustacean", crab: "crustacean", lobster: "crustacean", prawn: "crustacean",
  crustacean: "crustacean", "crustacean shellfish": "crustacean",
  clam: "mollusk", oyster: "mollusk", mussel: "mollusk", scallop: "mollusk", squid: "mollusk", octopus: "mollusk",
  mollusk: "mollusk", mollusc: "mollusk",
  peanut: "peanut",
  almond: "tree_nut", cashew: "tree_nut", walnut: "tree_nut", pecan: "tree_nut", pistachio: "tree_nut", hazelnut: "tree_nut",
  "tree nut": "tree_nut",
  dairy: "milk", lactose: "milk", milk: "milk",
  wheat: "gluten", gluten: "gluten", celiac: "gluten", coeliac: "gluten",
  salmon: "fish", tuna: "fish", cod: "fish", fish: "fish",
  egg: "egg",
  soy: "soy", soya: "soy", soybean: "soy",
  sesame: "sesame", tahini: "sesame",
  beef: "beef",
};

// names that cover more than one choice, so the guest hears every one of them
const SHELLFISH = "Shellfish is covered by Crustacean shellfish and Mollusks. Pick both for all shellfish.";
const SEAFOOD = "Seafood is covered by Fish, Crustacean shellfish and Mollusks. Pick all three for all seafood.";
const SPANS: Record<string, string> = {
  shellfish: SHELLFISH,
  "shell fish": SHELLFISH,
  seafood: SEAFOOD,
  "sea food": SEAFOOD,
  nut: "Nuts are covered by Peanut and Tree nuts. Pick both to avoid all nuts.",
};

// a need, a negation or an answer instead of a food: "gluten free", "no nuts", "peanut allergy", "none"
const NOT_JUST_FOOD = new Set(
  ("free no not without none nothing nope nah nil na ok okay yes avoid allergy allergies allergic intolerance intolerances " +
    "intolerant sensitivity sensitivities sensitive disease").split(" "),
);

// two words that only look like a built in choice: coconut milk is not dairy, an oyster mushroom is not a mollusk
const LOOKALIKE = new Set([
  "coconut milk", "oat milk", "rice milk", "hemp milk", "goat milk", "goats milk", "goat's milk", "sheep milk", "sheep's milk",
  "camel milk", "oyster mushroom", "oyster mushrooms", "egg plant",
]);

// "shrimps", "oysters" and "tree nuts" point the same way as the singular
const forms = (n: string) => [n, n.replace(/es$/, ""), n.replace(/s$/, "")];

function builtInFor(n: string): { label: string; plural: boolean } | null {
  for (const form of forms(n)) {
    const key = SAME_AS[form];
    if (key) return { label: key === "beef" ? BEEF_CHOICE : ALLERGEN_CHOICE[key], plural: form !== n };
  }
  return null;
}

// a choice hiding inside a longer name: "peanut oil", "tree-nut", "shellfish stock". Pairs first, so "tree nut" wins over "nut"
function partCovered(n: string): string | null {
  const words = n.split(/[ -]+/);
  const pairs = words.slice(1).map((w, i) => `${words[i]} ${w}`);
  const skip = new Set(pairs.filter((p) => LOOKALIKE.has(p)).flatMap((p) => p.split(" ")));
  const parts = [...pairs, ...words].filter((p) => !p.split(" ").some((w) => skip.has(w)));
  const last = words[words.length - 1];
  const is = /[^s]s$/.test(last) ? "are" : "is";
  for (const part of parts) {
    // "pine nut" and "brazil nut" are their own foods, so a lone "nut" only counts as the whole name
    const span = forms(part).find((f) => f !== "nut" && SPANS[f]);
    if (span) return SPANS[span];
    const built = builtInFor(part);
    if (built) return `${cap(n)} ${is} covered by ${built.label}. Pick that instead.`;
  }
  return null;
}

// a short stable hash, so names in other scripts still get their own key
function hash(s: string) {
  let h = 5381;
  for (const ch of s) h = ((h * 33) ^ ch.codePointAt(0)!) >>> 0;
  return h.toString(36);
}

// the key part for a custom allergen: "pine nut" -> "pine_nut". Accents fold, apostrophes drop, other scripts add a hash
export function customSlug(name: string) {
  const folded = normalizeCustomName(name).normalize("NFD").replace(MARKS, "");
  const plain = folded.replace(/'/g, "").replace(/[^a-z]+/g, "_").replace(/^_+|_+$/g, "");
  return /^[a-z' -]+$/.test(folded) && plain ? plain : `${plain ? `${plain}_` : ""}${hash(folded)}`;
}

// the target in every check key for this allergen, e.g. "fryer:custom_pine_nut"
export const customTargetKey = (name: string) => `custom_${customSlug(name)}` as const;

// A name Fo can say on a call: short, letters only and never an instruction. Saved runs are shown with only this check
export function customNameProblem(name: string): string | null {
  const n = normalizeCustomName(name);
  if (!n) return "Type the food or ingredient.";
  if (n.length < NAME_MIN || n.length > NAME_MAX) return `Use ${NAME_MIN} to ${NAME_MAX} characters.`;
  if (!ALLOWED.test(n)) return "Use only letters, spaces, hyphens and apostrophes.";
  if (!EDGES.test(n)) return "Start and end with a letter.";
  if (n.split(" ").length > WORDS_MAX) return `Use ${WORDS_MAX} words or fewer.`;
  if (NOT_FOOD.test(n)) return "Type only the food or ingredient, for example mustard or celery.";
  return null;
}

// A plain sentence when the name cannot be used, else null. takenNames: this guest's other typed allergens
export function customAllergenProblem(name: string, takenNames: string[] = []): string | null {
  const said = customNameProblem(name);
  if (said) return said;
  const n = normalizeCustomName(name);
  if (n.split(/[ -]+/).some((w) => NOT_JUST_FOOD.has(w))) return "Type just the food, for example mustard.";
  const span = forms(n).find((f) => SPANS[f]);
  if (span) return SPANS[span];
  const built = builtInFor(n);
  if (built) {
    const is = built.plural ? "are" : "is";
    return built.label.toLowerCase() === n ? `${built.label} ${is} already a choice. Pick it instead.` : `${cap(n)} ${is} covered by ${built.label}. Pick that instead.`;
  }
  const part = partCovered(n);
  if (part) return part;
  const slug = customSlug(n);
  if (takenNames.some((t) => customSlug(t) === slug)) return `${cap(n)} is already on this guest's list.`;
  return null;
}

// every typed allergen on one guest: the cap plus each name against the ones before it
export function customListProblem(restrictions: Restriction[]): string | null {
  const names = restrictions.flatMap((r) => (r.kind === "custom" ? [r.name] : []));
  if (names.length > CUSTOM_ALLERGEN_MAX) return `Add up to ${CUSTOM_ALLERGEN_MAX} other allergens per guest.`;
  for (const [i, name] of names.entries()) {
    const p = customAllergenProblem(name, names.slice(0, i));
    if (p) return p;
  }
  return null;
}

// a need as the guest picked it, e.g. "Peanut", "No beef, no contact" or "Mustard"
export function restrictionLabel(r: Restriction): string {
  if (r.kind === "allergy") return ALLERGEN_CHOICE[r.allergen] ?? r.allergen;
  if (r.kind === "diet") return r.strictness === "contact" ? "No beef, no contact" : r.strictness === "ingredient" ? "No beef" : "Vegetarian";
  return cap(normalizeCustomName(r.name));
}
