import { checkTopic, describeDiner } from "./checks";
import { callerName, kitchenWords } from "./script";
import type { Lane, Run } from "./types";

export const DISCLAIMER =
  "CrossCheck relays what staff said. Not a guarantee. Tell your server again and follow your allergist's plan.";

// Deterministic on purpose: the kitchen gets exactly what was said, nothing a model made up.
// forFo: the copy inside Fo's booking message, with each kitchen quote and dish cleaned by kitchenWords and quoted
export function allergyNote(run: Run, lane: Lane, opts: { forFo?: boolean } = {}): string {
  const r = lane.result;
  const words = (s: string) => (opts.forFo ? kitchenWords(s) : s);
  const when = r ? new Date(r.decidedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "";
  const quotes = (r?.checks ?? [])
    .filter((c) => c.quote)
    .map((c) => `- About ${checkTopic(c)}: "${words(c.quote!)}"`);
  const dishes = (r?.dishes ?? []).map((d) => {
    const list = d.dishes.map(words).join(", ");
    return `${d.diner}: ${!list ? "not named" : opts.forFo ? `"${list}"` : list}`;
  });
  return [
    `Allergy note for ${callerName(run)}'s table, ${run.when}, party of ${run.partySize}.`,
    "Please share this with the chef before we arrive.",
    "",
    ...run.diners.map((d) => `${describeDiner(d)}.`),
    "",
    dishes.length ? `Dishes your kitchen suggested: ${dishes.join("; ")}.` : "",
    quotes.length ? `What your kitchen told us${when ? ` on ${when}` : ""}:` : "",
    ...quotes,
    "",
    "Please flag our tickets for allergies, use clean pans and utensils and have the chef or manager check in with us when we arrive.",
    "Thank you for taking the time to answer our questions.",
    "",
    // the kitchen reads this line, so it never gives the diner's own advice
    `Sent for ${callerName(run)} by CrossCheck, an app that asks kitchens about allergies by phone. It passes on what your staff told us and is not a guarantee. We will also tell our server when we arrive.`,
  ]
    .filter((l, i, a) => l !== "" || a[i - 1] !== "")
    .join("\n");
}
