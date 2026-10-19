import { randomUUID } from "node:crypto";
import { z } from "zod";
import data from "../../data/madison-restaurants.json";
import { dataPath, readJson, writeJson } from "./store";
import { CUISINES, Restaurant } from "./types";

// Test kitchens are for test and replay runs: Fo calls your own phone and you play the kitchen
const TEST: Restaurant[] = [
  { id: "test-thai", name: "Test Kitchen Thai", phone: "test", cuisine: "thai", source: "test" },
  { id: "test-burgers", name: "Test Kitchen Burgers", phone: "test", cuisine: "burgers", source: "test" },
  { id: "test-italian", name: "Test Kitchen Italian", phone: "test", cuisine: "italian", source: "test" },
  { id: "test-indian", name: "Test Kitchen Indian", phone: "test", cuisine: "indian", source: "test" },
];

const OSM: Restaurant[] = (data.restaurants as unknown[]).map((r) => Restaurant.parse(r));

export const restaurantMeta = data.meta;

// the built in list: test kitchens and the Madison quick picks
export function allRestaurants() {
  return [...TEST, ...OSM];
}

export function searchRestaurants(q: string, cuisine: string | null, limit = 40) {
  return matching(allRestaurants(), q, cuisine).slice(0, limit);
}

function matching(list: Restaurant[], q: string, cuisine: string | null) {
  const s = q.trim().toLowerCase();
  return list.filter((r) => (!cuisine || r.cuisine === cuisine) && (!s || r.name.toLowerCase().includes(s) || (r.cuisineRaw ?? "").includes(s)));
}

// ---- restaurants you add, so CrossCheck works in any US city ----

// file: .data/restaurants.json, or a temp file in the dev eval
const customFile = () => dataPath("restaurants.json");

export async function customRestaurants(file = customFile()): Promise<Restaurant[]> {
  const raw = await readJson<{ restaurants?: unknown[] }>(file, { restaurants: [] });
  return (Array.isArray(raw.restaurants) ? raw.restaurants : []).flatMap((r) => {
    const p = Restaurant.safeParse(r);
    return p.success && p.data.source === "custom" ? [p.data] : [];
  });
}

// every server lookup by id goes through here, so a restaurant you added is found like a quick pick
export async function findRestaurant(id: string, file = customFile()): Promise<Restaurant | null> {
  return allRestaurants().find((r) => r.id === id) ?? (await customRestaurants(file)).find((r) => r.id === id) ?? null;
}

// the ones you added first, then the built in list
export async function listRestaurants(q: string, cuisine: string | null, limit = 60, file = customFile()) {
  const added = matching(await customRestaurants(file), q, cuisine).map((r) => ({ ...r, added: true as const }));
  return [...added, ...searchRestaurants(q, cuisine, limit)];
}

// letters in any language, digits, spaces and & ' . , - only
const NAME_CHARS = new RegExp("^[\\p{L}\\p{M}\\p{N} &'.,-]+$", "u");
const HAS_WORD = new RegExp("[\\p{L}\\p{N}]", "u");
// optional +1 or 1, then a 10 digit number whose area code and exchange start with 2 to 9
const US_PHONE = /^(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-]?([2-9]\d{2})[\s.-]?(\d{4})$/;
// +1 numbers outside the US: Canada, then the Caribbean and Atlantic, where a call can cost international rates
const NOT_US = new Set(
  (
    "204 226 236 249 250 257 263 289 306 343 354 365 367 368 382 387 403 416 418 428 431 437 438 450 460 468 474 506 514 519 " +
    "548 579 581 584 587 600 604 613 622 639 647 672 683 705 709 742 753 778 780 782 807 819 825 867 873 879 902 905 942 " +
    "242 246 264 268 284 345 441 473 649 658 664 721 758 767 784 809 829 849 868 869 876"
  ).split(" "),
);

export const RESTAURANT_NAME_BAD = "Use 2 to 60 characters for the name: letters, numbers, spaces and the marks & ' . , - only.";
export const RESTAURANT_PHONE_BAD = "Enter a US phone number with its area code, for example 608 555 0134.";
export const RESTAURANT_PHONE_PAID = "That looks like a pay per call number. Enter the restaurant's own phone number.";
export const RESTAURANT_PHONE_ABROAD = "That number is outside the US. CrossCheck calls US restaurants only.";
export const RESTAURANT_CUISINE_BAD = "Pick a cuisine from the list.";

export const cleanRestaurantName = (s: string) => s.replace(/[‘’]/g, "'").trim().replace(/\s+/g, " ");

// why a number cannot be called, else null. 900 and 976 numbers charge the caller
export function phoneProblem(raw: string): string | null {
  const m = raw.trim().replace(/\s+/g, " ").match(US_PHONE);
  if (!m || m[1].slice(1) === "11" || m[2].slice(1) === "11") return RESTAURANT_PHONE_BAD;
  if (m[1] === "900" || m[2] === "976") return RESTAURANT_PHONE_PAID;
  if (NOT_US.has(m[1])) return RESTAURANT_PHONE_ABROAD;
  return null;
}

// "+1 (608) 555-0134", "608.555.0134" and "16085550134" all become "+16085550134". Anything phoneProblem refuses is null
export function normalizePhone(raw: string): string | null {
  if (phoneProblem(raw)) return null;
  const m = raw.trim().replace(/\s+/g, " ").match(US_PHONE)!;
  return `+1${m[1]}${m[2]}${m[3]}`;
}

export const AddRestaurant = z
  .object({ name: z.string().max(200), phone: z.string().max(40), cuisine: z.string().optional() })
  .superRefine((v, ctx) => {
    const name = cleanRestaurantName(v.name);
    if (name.length < 2 || name.length > 60 || !NAME_CHARS.test(name) || !HAS_WORD.test(name)) ctx.addIssue({ code: "custom", message: RESTAURANT_NAME_BAD, path: ["name"] });
    const phone = phoneProblem(v.phone);
    if (phone) ctx.addIssue({ code: "custom", message: phone, path: ["phone"] });
    if (v.cuisine !== undefined && !(CUISINES as readonly string[]).includes(v.cuisine)) ctx.addIssue({ code: "custom", message: RESTAURANT_CUISINE_BAD, path: ["cuisine"] });
  })
  .transform((v) => ({ name: cleanRestaurantName(v.name), phone: normalizePhone(v.phone)!, cuisine: (v.cuisine ?? "other") as Restaurant["cuisine"] }));
export type AddRestaurant = z.infer<typeof AddRestaurant>;

// one write at a time, so two quick adds never lose one
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}

// the same phone as a quick pick or one you already added gives that one back instead of a second copy
export function addRestaurant(input: AddRestaurant, file = customFile()): Promise<Restaurant> {
  return serial(async () => {
    const list = await customRestaurants(file);
    const same = [...OSM, ...list].find((r) => normalizePhone(r.phone) === input.phone);
    if (same) return same;
    const r: Restaurant = { id: `custom-${randomUUID().replace(/-/g, "").slice(0, 12)}`, name: input.name, phone: input.phone, cuisine: input.cuisine, source: "custom" };
    await writeJson(file, { restaurants: [...list, r] });
    return r;
  });
}

// only a restaurant you added can be removed. Runs that used it keep their own copy
export function removeRestaurant(id: string, file = customFile()): Promise<boolean> {
  return serial(async () => {
    const list = await customRestaurants(file);
    if (!list.some((r) => r.id === id)) return false;
    await writeJson(file, { restaurants: list.filter((r) => r.id !== id) });
    return true;
  });
}
