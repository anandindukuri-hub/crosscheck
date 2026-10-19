"use client";

import { ChefHat, CircleCheck, CircleX, Info } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useId, useState } from "react";
import { hedgeWords } from "@/lib/report";
import type { CheckVerdict, Diner, Lane, LaneResult } from "@/lib/types";
import { engineText, sentence } from "../../kit/typo";
import { SPEAKER_LABEL } from "../../ui";
import { useDevMode } from "../../useDevMode";
import { bySeverity, fmtClock, foldedWords, groupAnswers, groupTitle, heardFor, howChecked, reading, topicTitle, whyLine, type AnswerGroup } from "../plain";

const listAnd = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

const RANK = { fail: 0, escalate: 1, pass: 2 } as const;

// the kitchen's words in serif, with a hedge like "I think" underlined in the chef's amber so it cannot be missed
// dim: an earlier answer the callback replaced, shown as it was said (never struck through: those are still its words)
export function Quote({ text, size = "md", dim = false }: { text: string; size?: "md" | "lg"; dim?: boolean }) {
  const clean = engineText(text);
  const hw = hedgeWords(clean);
  const cls = `${size === "lg" ? "font-serif text-[21px] leading-[28px]" : "quote"} ${dim ? "text-ink opacity-60" : "text-ink"} [overflow-wrap:anywhere]`;
  if (!hw || dim) return <blockquote className={cls}>“{clean}”</blockquote>;
  const at = clean.toLowerCase().indexOf(hw.toLowerCase());
  return (
    <blockquote className={cls}>
      “{clean.slice(0, at)}
      <mark className="bg-transparent text-inherit [text-decoration:underline_2px_var(--chef)] [text-decoration-skip-ink:none] [text-underline-offset:4px]">{clean.slice(at, at + hw.length)}</mark>
      {clean.slice(at + hw.length)}”
    </blockquote>
  );
}

export function who(c: CheckVerdict, heard: { who: string | null }) {
  if (c.speaker === "chef_or_manager" && heard.who) return heard.who;
  return sentence(SPEAKER_LABEL[c.speaker]);
}

// "Chef Mai, head chef · 1:36 PM": who gave an answer and when
export function byLine(c: CheckVerdict, lane: Pick<Lane, "reports">) {
  const heard = heardFor(lane, c.code);
  return `${who(c, heard)}${heard.at ? ` · ${fmtClock(heard.at)}` : ""}`;
}

const forWhom = (c: CheckVerdict, diners: Diner[]) =>
  diners
    .filter((d) => c.dinerIds.includes(d.id))
    .map((d) => d.label)
    .join(" and ");

// the small (i) beside a check's title; the answer it opens runs full width under the quote
function InfoButton({ open, onClick, controls }: { open: boolean; onClick: () => void; controls: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-controls={controls}
      aria-label="How this answer was read"
      className="-my-3 -mr-3 grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-3 hover:text-ink"
    >
      <Info size={16} strokeWidth={1.75} aria-hidden />
    </button>
  );
}

// how the answer was read, in plain words. Developer modes add the engine names and its own reasons
function HowPanel({ c, id, open }: { c: CheckVerdict; id: string; open: boolean }) {
  const dev = useDevMode();
  const lines = howChecked(c, dev);
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          id={id}
          className="overflow-hidden"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        >
          <div className="type-footnote mt-2 space-y-1 rounded-input bg-black/[0.04] px-3 py-2.5 text-ink-2">
            {lines.map((x) => (
              <p key={x}>{x}</p>
            ))}
            {dev && c.reasons.length > 0 && (
              <ul className="space-y-0.5 pt-1 font-mono text-[11px] text-ink-3">
                {c.reasons.map((x) => (
                  <li key={x}>{engineText(x)}</li>
                ))}
              </ul>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// one answer that is not matched, pinned at the top of the sheet: the quote, who said it, then why in one line.
// before: the words from the first call, struck through, when a callback changed the answer. Each quote carries
// its own caption above it, so "First call" can never read as the label of the new answer
export function DecidingCheck({
  c,
  lane,
  diners,
  tint,
  before,
  beforeAt,
}: {
  c: CheckVerdict;
  lane: Pick<Lane, "reports">;
  diners: Diner[];
  tint: "chef" | "nomatch" | "matched";
  before?: string | null;
  beforeAt?: string | null;
}) {
  const heard = heardFor(lane, c.code);
  const bg = tint === "nomatch" ? "bg-nomatch-tint" : tint === "chef" ? "bg-chef-tint" : "bg-matched-tint";
  const why = tint === "matched" ? reading(c, c.jev?.choice) : whyLine(c, heard.who);
  const [info, setInfo] = useState(false);
  const id = useId();
  const by = `${who(c, heard)}${heard.at ? ` · ${fmtClock(heard.at)}` : ""}`;
  return (
    <li className={`rounded-card px-4 py-4 ${bg}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="type-footnote font-semibold text-ink-2">
          {forWhom(c, diners)} · {topicTitle(c)}
        </p>
        <InfoButton open={info} onClick={() => setInfo((o) => !o)} controls={id} />
      </div>
      {before ? (
        <>
          <div className="mt-2">
            <p className="type-footnote text-ink-2">Replaced by the callback{beforeAt ? ` · ${fmtClock(beforeAt)}` : ""}</p>
            <div className="mt-1">
              <Quote text={before} dim />
            </div>
          </div>
          <div className="mt-3">
            <p className="type-footnote font-medium text-ink-2">Callback{heard.at ? ` · ${fmtClock(heard.at)}` : ""}</p>
            <div className="mt-1">{c.quote ? <Quote text={c.quote} size="lg" /> : <p className="type-callout text-ink-2">No exact words in the report</p>}</div>
            <p className="type-footnote mt-1.5 text-ink-2">{who(c, heard)}</p>
          </div>
        </>
      ) : (
        <>
          <div className="mt-1.5">{c.quote ? <Quote text={c.quote} size="lg" /> : <p className="type-callout text-ink-2">No exact words in the report</p>}</div>
          <p className="type-footnote mt-1.5 text-ink-2">{by}</p>
        </>
      )}
      <HowPanel c={c} id={id} open={info} />
      {why && <p className="type-body mt-2 text-ink">{why}</p>}
    </li>
  );
}

const ICON = { pass: CircleCheck, fail: CircleX, escalate: ChefHat } as const;
const COLOR = { pass: "var(--matched)", fail: "var(--nomatch)", escalate: "var(--chef)" } as const;

// one answer in the list. The conclusion leads as the title, only ever about the allergen the quote names ("Peanut never
// goes in this fryer"), then the kitchen's words in serif. Another allergen the kitchen answered the same way folds in
// under it with its own words on its own line, so a title never claims more than the quote under it says.
// by: who said it and when, unless the guest's header already says it once for every row
export function AnswerRow({
  g,
  lane,
  reviewing,
  read,
  onRead,
  card = false,
  by = true,
}: {
  g: AnswerGroup;
  lane: Pick<Lane, "reports">;
  reviewing: boolean;
  read: boolean;
  onRead: (v: boolean) => void;
  card?: boolean; // a white card of its own
  by?: boolean;
}) {
  const c = g.lead;
  const Icon = ICON[c.outcome];
  const color = COLOR[c.outcome];
  const title = c.outcome === "pass" ? groupTitle(g) : topicTitle(c);
  const folded = g.checks.filter((x) => x !== c).map((x) => foldedWords(x, c));
  const [info, setInfo] = useState(false);
  const id = useId();
  return (
    <li className={card ? "rounded-card bg-surface px-4 py-4 shadow-card md:px-5" : "py-4 first:pt-0 last:pb-0"}>
      <div className="flex items-start gap-x-2.5">
        <Icon size={18} strokeWidth={2} aria-hidden style={{ color }} className="mt-[3px] shrink-0" />
        <p className="min-w-0 flex-1 text-[17px] leading-[1.35] font-semibold tracking-[-0.01em]">
          {title}
          <span className="sr-only">{c.outcome === "pass" ? ", matched" : c.outcome === "fail" ? ", did not match" : ", needs the chef"}</span>
        </p>
        <InfoButton open={info} onClick={() => setInfo((o) => !o)} controls={id} />
      </div>
      <div className="mt-2">{c.quote ? <Quote text={c.quote} /> : <p className="type-callout text-ink-2">No exact words in the report</p>}</div>
      {by && <p className="type-footnote mt-1.5 text-ink-2">{byLine(c, lane)}</p>}
      <HowPanel c={c} id={id} open={info} />
      {folded.some((f) => f.same) && (
        <p className="mt-1.5 text-[12px] leading-[16px] font-medium text-ink-3">
          Also covers {listAnd(folded.filter((f) => f.same).map((f) => f.target.toLowerCase()))}
        </p>
      )}
      {folded.some((f) => !f.same) && (
        <ul className="mt-2.5 space-y-1" aria-label="The answer for other allergens">
          {folded.filter((f) => !f.same).map((f) => (
            <li key={f.target} className="text-[15px] leading-[1.4] text-ink-2 [overflow-wrap:anywhere]">
              <span className="font-medium">{sentence(f.target)}:</span>{" "}
              <span className="font-serif">“{f.words}”</span>
            </li>
          ))}
        </ul>
      )}
      {c.outcome !== "pass" && (
        <p className="type-callout mt-1.5 font-medium" style={{ color }}>
          {whyLine(c, heardFor(lane, c.code).who)}
        </p>
      )}
      {reviewing && c.quote && (
        <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-3 text-[15px]">
          <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={read} onChange={(e) => onRead(e.target.checked)} />
          I read this answer
        </label>
      )}
    </li>
  );
}

// one check on its own (today's reconfirm review)
export function CheckItem({ c, lane, reviewing, read, onRead }: { c: CheckVerdict; lane: Pick<Lane, "reports">; reviewing: boolean; read: boolean; onRead: (v: boolean) => void }) {
  return <AnswerRow g={{ key: c.key, checks: [c], targets: [c.label.split(": ").slice(1).join(": ") || c.label], lead: c, rank: 0 }} lane={lane} reviewing={reviewing} read={read} onRead={onRead} />;
}

// a guest's answers that matter most: every answer about a severe or life threatening allergy, so a peanut allergy
// never hides its fryer answer behind a tap. A guest with only mild allergies or a diet leads with one answer
export function leadGroups(checks: CheckVerdict[], diners: Diner[], d: Diner): AnswerGroup[] {
  const groups = groupAnswers(
    checks.filter((c) => c.dinerIds.includes(d.id)),
    diners,
  );
  const serious = groups.filter((g) => g.rank <= 1);
  return serious.length ? serious : groups.slice(0, 1);
}

// one guest: the name, who answered (once, when one person gave every answer), optionally the dishes, then each answer
export function GuestCard({
  d,
  groups,
  r,
  lane,
  reviewing,
  read,
  setRead,
  flat = false,
  dishes: showDishes = false,
}: {
  d: Diner;
  groups: AnswerGroup[];
  r: LaneResult;
  lane: Pick<Lane, "reports">;
  reviewing: boolean;
  read: Set<string>;
  setRead: (key: string, v: boolean) => void;
  flat?: boolean;
  dishes?: boolean;
}) {
  if (!groups.length) return null;
  const lines = groups.map((g) => byLine(g.lead, lane));
  const one = lines.every((x) => x === lines[0]) ? lines[0] : null;
  const dishes = r.dishes.find((x) => x.diner === d.label)?.dishes ?? [];
  return (
    <section aria-labelledby={`g-${d.id}${flat ? "-all" : ""}`} className={flat ? "pt-2 pb-3" : ""}>
      <h3 id={`g-${d.id}${flat ? "-all" : ""}`} className={flat ? "text-[15px] font-semibold" : "type-headline"}>
        {d.label}
      </h3>
      {one && <p className="type-footnote mt-0.5 text-ink-2">{one}</p>}
      {showDishes && <p className="type-footnote mt-0.5 text-ink-2">{dishes.length ? `Dishes the kitchen suggested: ${dishes.map(engineText).join(", ")}` : "No dishes named yet"}</p>}
      <ul className={`mt-3 divide-y divide-hairline ${flat ? "" : "rounded-card bg-surface px-4 py-4 shadow-card md:px-5"}`}>
        {groups.map((g) => (
          <AnswerRow
            key={g.key}
            g={g}
            lane={lane}
            by={!one}
            reviewing={reviewing}
            read={g.checks.every((c) => read.has(c.key))}
            onRead={(v) => g.checks.forEach((c) => setRead(c.key, v))}
          />
        ))}
      </ul>
    </section>
  );
}

// per guest, the most serious allergy first: optionally the dishes the kitchen named, then each answer
// how many answer rows GuestChecks draws for these checks: answers that fold together count once, so a "Show 5
// answers" link opens five rows
export const answerRows = (checks: CheckVerdict[], diners: Diner[]) =>
  diners.reduce((n, d) => n + groupAnswers(checks.filter((c) => c.dinerIds.includes(d.id)), diners).length, 0);

export function GuestChecks({
  diners,
  r,
  lane,
  checks,
  reviewing,
  read,
  setRead,
  flat = false,
  dishes = true,
}: {
  diners: Diner[];
  r: LaneResult;
  lane: Pick<Lane, "reports">;
  checks: CheckVerdict[];
  reviewing: boolean;
  read: Set<string>;
  setRead: (key: string, v: boolean) => void;
  flat?: boolean;
  dishes?: boolean;
}) {
  return (
    <div className={flat ? "" : "space-y-6"}>
      {bySeverity(diners).map((d) => {
        const groups = groupAnswers(
          checks.filter((c) => c.dinerIds.includes(d.id)),
          diners,
        ).sort((a, b) => RANK[a.lead.outcome] - RANK[b.lead.outcome]);
        return <GuestCard key={d.id} d={d} groups={groups} r={r} lane={lane} reviewing={reviewing} read={read} setRead={setRead} flat={flat} dishes={dishes} />;
      })}
    </div>
  );
}
