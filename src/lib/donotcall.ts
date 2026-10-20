import { normalizePhone } from "./restaurants";
import { dataPath, readJson, writeJson } from "./store";
import type { Restaurant } from "./types";

// Kitchens that asked on a call not to be called again. A real call to one is refused until you remove it
export type DoNotCall = { phone: string; name: string; at: string; runId: string | null };

const file = () => dataPath("donotcall.json");
const key = (phone: string) => normalizePhone(phone) ?? phone.replace(/\D/g, "");

export async function listDoNotCall(at = file()): Promise<DoNotCall[]> {
  return readJson<DoNotCall[]>(at, []);
}

export async function addDoNotCall(r: Pick<Restaurant, "phone" | "name">, runId: string | null, at = file()) {
  const list = await listDoNotCall(at);
  const phone = key(r.phone);
  if (!phone || list.some((d) => d.phone === phone)) return;
  await writeJson(at, [...list, { phone, name: r.name, at: new Date().toISOString(), runId }]);
}

export async function removeDoNotCall(phone: string, at = file()) {
  const list = await listDoNotCall(at);
  const k = key(phone);
  await writeJson(at, list.filter((d) => d.phone !== k));
}

// the kitchens in this list that asked not to be called
export function blockedByOptOut<R extends Pick<Restaurant, "phone" | "name">>(rs: R[], list: DoNotCall[]): R | null {
  const asked = new Set(list.map((d) => d.phone));
  return rs.find((r) => !!r.phone && asked.has(key(r.phone))) ?? null;
}

// what Fo wrote in MORE CALLS OK. When the field leads with a verdict, only the verdict counts: a bare "no" or a
// leading "no thanks" opts the kitchen out; a yes, a friendly filler ("No problem", "No, that's fine", "sure") or
// "not asked" never does. With no verdict, only a narrow, clear refusal in their words counts ("please don't call
// again", "we'd rather not", "stop calling"), never a passing "don't call during the rush"
const BARE_NO =
  /^\s*\**\s*no\b(?!\s*(problem|prob|worries|worry|issue|bother)|,?\s*(that['’]?s|that is|it['’]?s)\s+(fine|ok|okay|alright))(?=\s*($|[*,.;:)\-–—]|["“]))/i;
const LEADING_NO_THANKS = /^\s*\**\s*["“]?\s*no,? thank(s|\s+you)\b/i;
const VERDICT = /^\s*\**\s*["“]?\s*(yes|yeah|yep|sure|ok|okay|fine|of course|absolutely|definitely|anytime|please do|no problem|no worries|no issue|not asked|no answer)\b/i;
const REFUSAL =
  /\b(don['’]?t|do not) call (us )?(again|anymore|any more|back)\b(?!\s+(during|before|after|until|between|at|in|on|when|while))|\b(don['’]?t|do not) want (any )?(more )?(calls|to be called)\b|\brather not(?=\s*($|[.,;!"”]))|\brather not (get|have) (any )?(more )?calls\b|\bstop calling\b|\btake us off\b|\bremove us\b/i;
export const optedOut = (field: string | undefined | null) => {
  const f = field ?? "";
  if (BARE_NO.test(f) || LEADING_NO_THANKS.test(f)) return true;
  if (VERDICT.test(f)) return false;
  return REFUSAL.test(f);
};
