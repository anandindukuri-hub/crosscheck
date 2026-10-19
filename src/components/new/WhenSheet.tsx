"use client";

import { useState } from "react";
import { Segmented } from "../kit/Segmented";
import { Sheet } from "../kit/Sheet";
import { Button } from "../ui";

type Day = "tonight" | "tomorrow" | "other";
const DAYS: { value: Day; label: string }[] = [
  { value: "tonight", label: "Tonight" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "other", label: "Another day" },
];
const TIMES = ["5 PM", "5:30 PM", "6 PM", "6:30 PM", "7 PM", "7:30 PM", "8 PM", "8:30 PM", "9 PM", "9:30 PM"];

// "tonight at 7 PM" back into its parts, so the sheet opens where the person left it
function parse(when: string): { day: Day; date: string; time: string } {
  const t = TIMES.find((x) => new RegExp(`\\b${x.replace(" ", "\\s*")}\\b`, "i").test(when)) ?? "7 PM";
  const day: Day = /^tomorrow/i.test(when) ? "tomorrow" : /^tonight|^today/i.test(when) ? "tonight" : "other";
  return { day, date: "", time: t };
}

function label(day: Day, date: string, time: string) {
  if (day === "tonight") return `tonight at ${time}`;
  if (day === "tomorrow") return `tomorrow at ${time}`;
  if (!date) return `tonight at ${time}`;
  const d = new Date(`${date}T12:00:00`);
  return `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at ${time}`;
}

// When: a day and a time, written the way Fo says it on the call ("tonight at 7 PM")
// from 768px it hangs under the When row as a popover; on phones it is a bottom sheet
export function WhenSheet({ open, when, anchor, onClose, onDone }: { open: boolean; when: string; anchor?: () => HTMLElement | null; onClose: () => void; onDone: (when: string) => void }) {
  const start = parse(when);
  const [day, setDay] = useState<Day>(start.day);
  const [date, setDate] = useState(start.date);
  const [time, setTime] = useState(start.time);
  const today = new Date();
  const min = new Date(today.getTime() + 2 * 86_400_000).toISOString().slice(0, 10);
  // tonight, a time that has already gone by (or is under 30 minutes away) cannot be picked
  const past = (t: string) => {
    if (day !== "tonight") return false;
    const m = /^(\d{1,2})(?::(\d{2}))?\s*PM$/.exec(t);
    if (!m) return false;
    const mins = (Number(m[1]) % 12) * 60 + 720 + Number(m[2] ?? 0);
    return mins < today.getHours() * 60 + today.getMinutes() + 30;
  };
  const allPast = TIMES.every(past);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="When"
      subtitle="Fo tells each kitchen the day and time."
      anchor={anchor}
      footer={
        <Button size="lg" className="w-full" onClick={() => onDone(label(day, date, time))} disabled={(day === "other" && !date) || past(time)}>
          Done
        </Button>
      }
    >
      <div className="space-y-6">
        <Segmented full label="Day" value={day} options={DAYS} onChange={setDay} />
        {day === "other" && (
          <label className="block">
            <span className="type-footnote font-medium text-ink-2">Date</span>
            <input
              type="date"
              min={min}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-input border border-transparent bg-surface px-3.5 text-[17px]"
            />
          </label>
        )}
        <fieldset>
          <legend className="type-footnote mb-2 font-medium text-ink-2">Time</legend>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {TIMES.map((t) => {
              const gone = past(t);
              const on = t === time && !gone;
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  aria-disabled={gone || undefined}
                  title={gone ? "This time has passed" : undefined}
                  onClick={() => !gone && setTime(t)}
                  className={`min-h-11 rounded-control text-[15px] tabular-nums transition-colors ${
                    gone
                      ? "cursor-default bg-quiet-tint text-ink-3"
                      : on
                        ? "bg-you-tint font-semibold text-accent shadow-[inset_0_0_0_1.5px_var(--accent)]"
                        : "bg-surface text-ink shadow-[inset_0_0_0_1px_var(--hairline)] hover:bg-fill-2"
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
          {allPast && <p className="type-footnote mt-2 text-ink-2">Every time tonight has passed. Pick tomorrow or another day.</p>}
        </fieldset>
      </div>
    </Sheet>
  );
}
