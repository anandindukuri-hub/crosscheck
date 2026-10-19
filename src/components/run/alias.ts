// Replay runs use the four scripted test kitchens. On screen they wear the names the launch page uses, so a replay
// and the launch tell one story. Display only: ids, the server and every live or test run keep the real names.
// The replay script is a Thai kitchen's (pad see ew, a wok, the same fryer questions), and a script is dealt by call
// order rather than by kitchen, so every scripted kitchen wears a Thai name: no name ever meets another cuisine's words.
const NAMES: [string, string][] = [
  ["Test Kitchen Thai", "Tamarind Table"],
  ["Test Kitchen Burgers", "Jasmine Row"],
  ["Test Kitchen Italian", "Chili Lane"],
  ["Test Kitchen Indian", "Pandan House"],
];

export const aliasName = (name: string) => NAMES.find(([from]) => from === name)?.[1] ?? name;

// a scripted kitchen as a replay shows it: its launch name and the cuisine its script speaks
export function aliasKitchen<T extends { name: string; cuisine: string; source?: string }>(mode: string | undefined, r: T): T {
  if (mode !== "replay" || r.source !== "test") return r;
  return { ...r, name: aliasName(r.name), cuisine: "thai" };
}

// every string in a replay view with the display names swapped in; anything else comes back untouched
export function aliasReplay<T>(mode: string | undefined, data: T): T {
  if (mode !== "replay") return data;
  let s = JSON.stringify(data);
  for (const [from, to] of NAMES) s = s.split(from).join(to);
  return JSON.parse(s) as T;
}
