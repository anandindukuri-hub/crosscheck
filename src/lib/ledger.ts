import { describeDiner } from "./checks";
import type { Fidelity } from "./rules";
import { dataPath, readJson, writeJson } from "./store";
import type { CheckInstance, CheckVerdict, Diner, Lane, LaneResult, Run } from "./types";

// Every answer a kitchen gave becomes a dated record. Records expire (7 days for severe allergy
// checks, 30 otherwise) so stale answers get asked again instead of trusted forever.
export type LedgerRecord = {
  restaurantId: string;
  restaurantName: string;
  checkKey: string;
  label: string;
  outcome: "pass" | "escalate" | "fail";
  quote: string | null;
  speaker: string;
  confidence: number | null;
  decider: string;
  mode: Run["mode"];
  runId: string;
  laneId?: string; // older records have none, so they never count as the same lane
  verifiedAt: string;
  expiresAt: string;
};

// One whole lane decision for one table at one kitchen, so the same table can skip a repeat call
export type KitchenMemory = {
  restaurantId: string;
  restaurantName: string;
  mode: Run["mode"];
  tableKey: string;
  dinerLabels: string[];
  dinerIdLabels?: Record<string, string>; // diner id to label in the run that answered, so verdicts can be moved to a new run's ids
  diners: string[]; // sorted describeDiner lines, so a changed severity or diet never reuses old answers
  state: LaneResult["state"];
  decider: LaneResult["decider"];
  dishes: LaneResult["dishes"];
  checks: CheckVerdict[];
  misconception: number;
  decidedAt: string;
  expiresAt: string;
  runId: string;
  laneId: string;
};

export type LedgerFile = { records: LedgerRecord[]; kitchens: KitchenMemory[] };

const file = () => dataPath("ledger.json");

// the first version stored a bare array of records
export async function readLedgerFile(): Promise<LedgerFile> {
  const raw = await readJson<LedgerRecord[] | Partial<LedgerFile>>(file(), { records: [], kitchens: [] });
  if (Array.isArray(raw)) return { records: raw, kitchens: [] };
  return { records: raw.records ?? [], kitchens: raw.kitchens ?? [] };
}

export const readLedger = async () => (await readLedgerFile()).records;

const DAY = 86_400_000;

export async function recordResult(run: Run, lane: Lane, result: LaneResult, checks: CheckInstance[]) {
  if (run.mode === "replay" || run.purpose === "calibration") return;
  if (!["matched", "needs_review", "needs_chef", "not_matched"].includes(result.state)) return;
  await writeJson(file(), mergeResult(await readLedgerFile(), run, lane, result, checks));
}

const RANK = { fail: 0, escalate: 1, pass: 2 } as const;

// a newer answer from the same run and lane (a chef callback) supersedes that lane's own earlier one
const ownEarlier = (r: Pick<LedgerRecord, "runId" | "laneId" | "verifiedAt">, by: { runId: string; laneId?: string }, at: string) =>
  !!by.laneId && r.runId === by.runId && r.laneId === by.laneId && r.verifiedAt <= at;

// The worst answer still in date wins per restaurant and check across runs and lanes, so a later pass
// never hides a fresh doubt from somewhere else. A pass replaces only an expired record or the same
// lane's own earlier answer. History stays in the run trace.
export function mergeResult(led: LedgerFile, run: Run, lane: Lane, result: LaneResult, checks: CheckInstance[]): LedgerFile {
  const out: LedgerFile = { records: [...led.records], kitchens: [...led.kitchens] };
  const at = result.decidedAt;
  for (const v of result.checks) {
    const c = checks.find((x) => x.key === v.key);
    const rec: LedgerRecord = {
      restaurantId: lane.restaurant.id,
      restaurantName: lane.restaurant.name,
      checkKey: v.key,
      label: v.label,
      outcome: v.outcome,
      quote: v.quote,
      speaker: v.speaker,
      confidence: v.jev?.confidence ?? null,
      decider: result.decider,
      mode: run.mode,
      runId: run.id,
      laneId: lane.id,
      verifiedAt: at,
      expiresAt: new Date(new Date(at).getTime() + (c?.ttlDays ?? 7) * DAY).toISOString(),
    };
    const i = out.records.findIndex((r) => r.restaurantId === rec.restaurantId && r.checkKey === rec.checkKey && r.mode === rec.mode);
    const old = out.records[i];
    if (i < 0) out.records.push(rec);
    else if (ownEarlier(old, rec, at) || !isFresh(old, new Date(at)) || RANK[rec.outcome] <= RANK[old.outcome]) out.records[i] = rec;
  }
  const mem = memoryFrom(run, lane, result, checks);
  // never upgrade a table to matched while a fresh answer about its checks is still in doubt
  if (mem && !(mem.state === "matched" && freshDoubt(out, mem, new Date(at)))) {
    const i = out.kitchens.findIndex((k) => sameTable(k, mem));
    if (i >= 0) out.kitchens[i] = mem;
    else out.kitchens.push(mem);
  }
  return out;
}

export function isFresh(r: { expiresAt: string }, now = new Date()) {
  return new Date(r.expiresAt) > now;
}

// "!" marks a severe check (the short memory), so a severity change that flips it is a new table
export function tableKey(checks: CheckInstance[]) {
  return checks
    .map((c) => `${c.key}${c.ttlDays <= 7 ? "!" : ""}`)
    .sort()
    .join(",");
}

export const dinerSummary = (diners: Diner[]) => diners.map(describeDiner).sort();

const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join("\n") === [...b].sort().join("\n");

const sameTable = (a: Pick<KitchenMemory, "restaurantId" | "mode" | "tableKey" | "diners">, b: Pick<KitchenMemory, "restaurantId" | "mode" | "tableKey" | "diners">) =>
  a.restaurantId === b.restaurantId && a.mode === b.mode && a.tableKey === b.tableKey && sameSet(a.diners, b.diners);

export function memoryFrom(run: Run, lane: Lane, result: LaneResult, checks: CheckInstance[]): KitchenMemory | null {
  if (run.mode === "replay" || run.purpose === "calibration" || !checks.length) return null;
  const ttl = Math.min(...checks.map((c) => c.ttlDays));
  return {
    restaurantId: lane.restaurant.id,
    restaurantName: lane.restaurant.name,
    mode: run.mode,
    tableKey: tableKey(checks),
    dinerLabels: run.diners.map((d) => d.label),
    dinerIdLabels: Object.fromEntries(run.diners.map((d) => [d.id, d.label])),
    diners: dinerSummary(run.diners),
    state: result.state,
    decider: result.decider,
    dishes: result.dishes,
    checks: result.checks,
    misconception: result.misconception ?? 0,
    decidedAt: result.decidedAt,
    expiresAt: new Date(new Date(result.decidedAt).getTime() + ttl * DAY).toISOString(),
    runId: run.id,
    laneId: lane.id,
  };
}

// a non pass answer about any of these checks that is still in date or newer than the memory,
// leaving out the memory's own lane from before it was decided (superseded by its callback)
function freshDoubt(led: LedgerFile, m: Pick<KitchenMemory, "restaurantId" | "mode" | "tableKey" | "decidedAt" | "runId" | "laneId">, now: Date) {
  const keys = new Set(m.tableKey.split(",").map((k) => k.replace(/!$/, "")));
  return led.records.some(
    (r) =>
      r.restaurantId === m.restaurantId &&
      r.mode === m.mode &&
      keys.has(r.checkKey) &&
      r.outcome !== "pass" &&
      !ownEarlier(r, m, m.decidedAt) &&
      (isFresh(r, now) || r.verifiedAt > m.decidedAt),
  );
}

// Reuse only a clean Jev match for this exact table, still fresh, while Fo's reports are verified,
// and only if this kitchen has said nothing worse since: no later table at this kitchen came out
// anything but matched and no answer in date about the same checks is unclear or unsafe.
export function findMemory(
  led: LedgerFile,
  q: { restaurantId: string; mode: Run["mode"]; checks: CheckInstance[]; diners: Diner[]; fidelity: Fidelity; now?: Date },
): KitchenMemory | null {
  if (q.mode === "replay" || q.fidelity !== "verified") return null;
  const now = q.now ?? new Date();
  const want = { restaurantId: q.restaurantId, mode: q.mode, tableKey: tableKey(q.checks), diners: dinerSummary(q.diners) };
  const labels = q.diners.map((d) => d.label);
  const m = led.kitchens.find((k) => sameTable(k, want) && sameSet(k.dinerLabels, labels));
  if (!m || m.state !== "matched" || m.decider !== "jev" || !isFresh(m, now)) return null;
  // a memory saved before every check needed the chef or manager first hand is never reused on a cook's word
  if (m.checks.some((v) => v.outcome !== "pass" || v.speaker !== "chef_or_manager")) return null;
  const laterMiss = led.kitchens.some((k) => k.restaurantId === m.restaurantId && k.mode === m.mode && k.decidedAt > m.decidedAt && k.state !== "matched");
  return laterMiss || freshDoubt(led, m, now) ? null : m;
}

// Verdicts carry the old run's diner ids. Move them to this run's ids by label so no guest's quotes go missing.
export function resultFromMemory(m: KitchenMemory, diners: Diner[], checks: CheckInstance[]): LaneResult {
  const on = new Date(m.decidedAt).toLocaleDateString("en-US", { dateStyle: "medium" });
  const idFor = (old: string) => diners.find((d) => d.label === m.dinerIdLabels?.[old])?.id;
  const remap = (v: CheckVerdict): CheckVerdict => {
    const ids = v.dinerIds.map(idFor);
    // older memories have no id map; the same table means this run's check lists the same guests
    const dinerIds = ids.length && ids.every((x): x is string => !!x) ? ids : (checks.find((c) => c.key === v.key)?.dinerIds ?? v.dinerIds);
    return { ...v, dinerIds };
  };
  return {
    state: "matched",
    headline: "Matched on answers from an earlier call",
    reasons: [`The kitchen answered these exact questions on ${on}. No new call needed.`],
    checks: m.checks.map(remap),
    dishes: m.dishes,
    decider: m.decider,
    decidedAt: m.decidedAt,
    misconception: m.misconception,
  };
}
