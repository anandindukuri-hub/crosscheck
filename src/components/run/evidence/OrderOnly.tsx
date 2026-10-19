import type { Diner, LaneResult } from "@/lib/types";
import { engineText, sentence } from "../../kit/typo";
import { bySeverity } from "../plain";

// A match covers only the dishes the kitchen suggested, so those dishes are what a guest orders. Said plainly, in the
// order a server would read it: the most serious allergy first. bare: inside another card, without its own surface
export function OrderOnly({ diners, r, bare = false }: { diners: Diner[]; r: Pick<LaneResult, "dishes">; bare?: boolean }) {
  const rows = bySeverity(diners)
    .map((d) => ({ d, dishes: (r.dishes.find((x) => x.diner === d.label)?.dishes ?? []).map(engineText).filter(Boolean) }))
    .filter((x) => x.dishes.length);
  if (!rows.length) return null;
  return (
    <section aria-label="Will order only" className={bare ? "" : "rounded-card bg-surface px-4 py-4 shadow-card md:px-5"}>
      <h3 className="type-footnote font-semibold text-ink-2">Will order only</h3>
      <ul className="mt-2 space-y-2.5">
        {rows.map(({ d, dishes }) => (
          <li key={d.id}>
            <p className="type-footnote text-ink-2">{d.label}</p>
            <p className="text-[17px] leading-[1.3] font-semibold tracking-[-0.01em]">{sentence(dishes.join(", "))}</p>
          </li>
        ))}
      </ul>
      <p className="type-footnote mt-3 text-ink-2">Matched for these dishes only. Nothing else on the menu was checked.</p>
    </section>
  );
}
