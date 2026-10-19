// Typography for text that comes from the engine, Fo or a replay script. Render only: the stored text never changes.

// straight quotes and three dots become ’ “ ” and …
export function smart(s: string): string {
  return s
    .replace(/\.\.\./g, "…")
    .replace(/(\w)'(\w)/g, "$1’$2")
    .replace(/(^|[\s([{-])'/g, "$1‘")
    .replace(/'/g, "’")
    .replace(/(^|[\s([{-])"/g, "$1“")
    .replace(/"/g, "”");
}

// the run header already says it is a replay, so the engine's tag is dropped wherever it starts a line
export const stripReplay = (s: string) => s.replace(/(^|\n)\s*DEV REPLAY:?\s*/gi, "$1");

// what every engine string goes through before it reaches the screen
export const engineText = (s: string | null | undefined) => keepTime(smart(stripReplay(s ?? "")).trim());

// "tonight at 7 PM" -> "Tonight at 7 PM"
export const sentence = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// "7 PM" never breaks across two lines: the number and the meridiem share a non breaking space
export const keepTime = (s: string) => s.replace(/(\d)\s+(AM|PM)\b/gi, "$1 $2");

// the table's time as a heading: "Tonight at 7 PM", glued
export const whenText = (s: string) => keepTime(sentence(s.trim()));

// the table's time inside a sentence: "tonight at 7 PM", "on Sat, Oct 24 at 7 PM"
export function whenPhrase(s: string) {
  const t = s.trim();
  if (/^(tonight|today|tomorrow)\b/i.test(t)) return keepTime(t.charAt(0).toLowerCase() + t.slice(1));
  return keepTime(/^(sun|mon|tue|wed|thu|fri|sat|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(t) ? `on ${t}` : t);
}
