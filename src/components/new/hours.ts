// OpenStreetMap data, made readable: "latin_american;mexican" -> "Mexican", "Mo-Sa 11:00-22:00; Su off" -> "Open today until 10 PM"

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const titleCase = (s: string) => s.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

// OpenStreetMap tags that name a meal or a format rather than a cuisine are skipped
const NOT_CUISINE = new Set(["breakfast", "lunch", "dinner", "brunch", "regional", "buffet", "undefined", "local", "fine_dining", "family"]);
// tags whose plain label is not just the tag in title case
const LABEL: Record<string, string> = {
  burger: "Burgers",
  burgers: "Burgers",
  italian_pizza: "Pizza",
  steak_house: "Steakhouse",
  steak: "Steakhouse",
  "tex-mex": "Tex Mex",
  noodle: "Noodles",
  sandwich: "Sandwiches",
  pancake: "Pancakes",
  waffle: "Waffles",
  tacos: "Tacos",
  cafe: "Café",
  other: "Restaurant",
};

// one cuisine, the first real one, as a person would say it: "thai;indonesian;lunch" -> "Thai"
export function cuisineLabel(r: { cuisine: string; cuisineRaw?: string; source?: string }): string {
  if (r.source === "test") return "Test kitchen";
  const tags = (r.cuisineRaw ?? "")
    .split(";")
    .map((x) => x.trim().toLowerCase())
    .filter((x) => x && !NOT_CUISINE.has(x));
  const first = tags[0] ?? (r.cuisine !== "other" ? r.cuisine : "");
  if (!first) return "Restaurant";
  return LABEL[first] ?? titleCase(first);
}

function daySet(spec: string): Set<number> {
  const out = new Set<number>();
  for (const part of spec.split(",")) {
    const [a, b] = part.split("-").map((x) => DAYS.indexOf(x.trim()));
    if (a < 0) continue;
    if (b === undefined || b < 0) out.add(a);
    else for (let i = a; ; i = (i + 1) % 7) {
      out.add(i);
      if (i === b) break;
    }
  }
  return out;
}

const RULE = /((?:[A-Z][a-z](?:-[A-Z][a-z])?)(?:,(?:[A-Z][a-z](?:-[A-Z][a-z])?))*)?\s*((?:\d{1,2}:\d{2}-\d{1,2}:\d{2})(?:,\s*\d{1,2}:\d{2}-\d{1,2}:\d{2})*|off|closed)/g;

function clock(mins: number) {
  const m = mins % (24 * 60);
  if (m === 0) return "midnight";
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const h12 = h % 12 || 12;
  return `${h12}${mm ? `:${String(mm).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

// Whether a kitchen is open at the table's day and time: open false only when its hours say so, null when unknown
export function openAt(hours: string | undefined, day: Date, minutes: number | null): { open: boolean | null; label: string | null } {
  if (!hours) return { open: null, label: null };
  if (/24\/7/.test(hours)) return { open: true, label: "Open 24 hours" };
  const d = (day.getDay() + 6) % 7;
  let times: string | null | undefined;
  for (const m of hours.matchAll(RULE)) {
    const days = m[1] ? daySet(m[1]) : null;
    if (days && !days.has(d)) continue;
    times = /off|closed/.test(m[2]) ? null : m[2];
  }
  const today = new Date().toDateString() === day.toDateString();
  const dayWord = today ? "today" : day.toLocaleDateString("en-US", { weekday: "long" });
  if (times === undefined) return { open: null, label: null };
  if (times === null) return { open: false, label: today ? "Closed today" : `Closed ${dayWord}` };
  const ranges = times.split(",").map((r) => r.trim().split("-").map(toMin));
  if (minutes != null) {
    const inside = ranges.some(([a, b]) => (b <= a ? minutes >= a || minutes < b : minutes >= a && minutes < b));
    if (!inside) return { open: false, label: `Closed at ${clock(minutes)}` };
  }
  const [start, end] = ranges[ranges.length - 1];
  return { open: true, label: `Open until ${clock(end <= start ? end + 24 * 60 : end)}` };
}

// today's hours in a few words, or null when the data cannot be read
export function hoursToday(hours: string | undefined, now = new Date()): string | null {
  if (!hours) return null;
  if (/24\/7/.test(hours)) return "Open 24 hours";
  const today = (now.getDay() + 6) % 7;
  let times: string | null | undefined;
  for (const m of hours.matchAll(RULE)) {
    const days = m[1] ? daySet(m[1]) : null;
    if (days && !days.has(today)) continue;
    times = /off|closed/.test(m[2]) ? null : m[2];
  }
  if (times === undefined) return null;
  if (times === null) return "Closed today";
  const ranges = times.split(",").map((r) => r.trim().split("-").map(toMin));
  const [start, end] = ranges[ranges.length - 1];
  return `Open until ${clock(end <= start ? end + 24 * 60 : end)}`;
}
