import type { TraceEvent } from "./trace";
import type { Lane, Run } from "./types";

// How a run used Fo, read from its trace: every Fo tool per kitchen and why. Nothing here calls Fo
export type ToolUse = { tool: string; count: number; why: string[] };
export type LaneUsage = { laneId: string | null; restaurant: string | null; tools: ToolUse[] };

const ASK_WHY: [RegExp, string][] = [
  [/^Please stop\./, "told Fo to stop"],
  [/^Please paste the full call report/, "asked for the full report"],
  [/^Please book a table|^This is a test run of my app\. Do not contact/, "sent the booking"],
  [/^Please call .* back at/, "sent the chef callback"],
  [/reconfirm the allergy details/, "sent the day of reconfirm"],
  [/^Please call /, "sent the call request"],
];
const askWhy = (message: string) => ASK_WHY.find(([re]) => re.test(message))?.[1] ?? "sent your answer";

const WHY: Record<string, string> = {
  get_fo_reply: "waited for Fo's reply",
  get_fo_conversation: "read Fo's report as it came in",
  list_fo_conversations: "listed this run's Fo conversations",
  start_fo_call: "opened Talk to Fo",
};
const ORDER = ["ask_fo", "get_fo_reply", "get_fo_conversation", "list_fo_conversations", "start_fo_call"];

export function foUsage(events: Pick<TraceEvent, "actor" | "action" | "laneId" | "input">[], lanes: Pick<Lane, "id" | "restaurant">[]): LaneUsage[] {
  const by = new Map<string, Map<string, ToolUse>>();
  for (const e of events) {
    if (e.actor !== "fo") continue;
    const k = e.laneId ?? "";
    const tools = by.get(k) ?? new Map<string, ToolUse>();
    const t = tools.get(e.action) ?? { tool: e.action, count: 0, why: [] };
    t.count++;
    const message = (e.input as { message?: unknown } | undefined)?.message;
    const why = e.action === "ask_fo" ? askWhy(typeof message === "string" ? message : "") : (WHY[e.action] ?? e.action);
    if (!t.why.includes(why)) t.why.push(why);
    tools.set(e.action, t);
    by.set(k, tools);
  }
  const name = new Map(lanes.map((l) => [l.id, l.restaurant.name]));
  return [...by.entries()].map(([k, tools]) => ({
    laneId: k || null,
    restaurant: k ? (name.get(k) ?? null) : null,
    tools: [...tools.values()].sort((a, b) => ORDER.indexOf(a.tool) - ORDER.indexOf(b.tool)),
  }));
}

// One real run in a line per kitchen, for the run count: who Fo reached, what came back, booked or not
export type RealRun = { id: string; createdAt: string; stopped: boolean; kitchens: { name: string; outcome: string; booked: boolean }[] };

const OUTCOME: Record<string, string> = {
  matched: "Matched",
  needs_review: "Matched, read by you",
  needs_chef: "Needs the chef",
  not_matched: "Did not match",
  no_answer: "No answer",
  declined: "Declined",
};

export function realRuns(runs: { run: Pick<Run, "id" | "createdAt" | "mode" | "approvedAt" | "stoppedAt">; lanes: Pick<Lane, "restaurant" | "result" | "booking" | "skipped" | "goAhead" | "reports" | "stoppedAt" | "progress">[] }[]): RealRun[] {
  return runs
    .filter((x) => x.run.mode === "live" && x.run.approvedAt)
    .map(({ run, lanes }) => ({
      id: run.id,
      createdAt: run.createdAt,
      stopped: !!run.stoppedAt || lanes.some((l) => !!l.stoppedAt || /^You stopped|cancelled this call/.test(l.progress)),
      kitchens: lanes.map((l) => ({
        name: l.restaurant.name,
        booked: l.booking?.status === "done",
        outcome: l.booking?.status === "done"
          ? "Booked"
          : l.result
            ? (OUTCOME[l.result.state] ?? l.result.state)
            : l.skipped
              ? "Not called"
              : l.goAhead || l.reports.length
                ? "Stopped"
                : "Not called",
      })),
    }));
}
