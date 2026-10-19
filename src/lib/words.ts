// Kitchen words never reach Fo as instructions: one line with no quote marks or angle brackets, capped and labeled as data.
// Apostrophes inside words stay. The app still shows the exact quotes and Claude's verbatim check is unchanged
export function kitchenWords(s: string, max = 200) {
  const flat = s
    .replace(/\s+/g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/["“”„‟«»‹›<>`]/g, "")
    .replace(/(?<![A-Za-z])'|'(?![A-Za-z])/g, "")
    .trim();
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat;
}
