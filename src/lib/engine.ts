import { randomUUID } from "node:crypto";
import { calibrationAction, calibrationCallHappened, calibrationLines, evaluateCalibration, SIGNAL_TEXT } from "./calibration";
import { buildChecks } from "./checks";
import { claudeJudge, decisionsFromClaude } from "./claude";
import { buildCase, buildCleanCallback, buildReconfirm, CASES, HERO, REPLAY_CASES } from "./dev/cases";
import { env } from "./env";
import { callFo } from "./fo/client";
import { resumeTurn, runFoTurn, userTurnHas, waitForReport, type TurnOutcome } from "./fo/turn";
import { buildJevQuestions, buildJevState, classifyBookingReply, jevDecide } from "./jev";
import {
  agreedMissing,
  approvalPlan,
  askStep,
  bookAgreedBlocked,
  bookBlocked,
  bookedCard,
  bookingAnswerBlocked,
  bookingByYou,
  bookingConfirmShown,
  bookingSettled,
  bookingStep,
  callAnywayBlocked,
  callAnywayStep,
  canStartReconfirm,
  foBegan,
  foMayHaveIt,
  followUpLost,
  foHasItStep,
  landResult,
  lanesToSkip,
  LOST_CONVERSATION,
  lostConversationStep,
  NO_CONVERSATION,
  NO_FOLLOW,
  noConversationStep,
  notStarted,
  nothingNew,
  reconfirmDoubts,
  refusedStep,
  reportWait,
  resumePlan,
  runFinished,
  sendAgainShown,
  sendingStep,
  showPreview,
  skipLane,
  stopLane,
  stopNotTold,
  UNCERTAIN_SEND,
  waitCeiling,
} from "./lanes";
import { findMemory, readLedgerFile, recordResult, resultFromMemory } from "./ledger";
import { addDoNotCall, blockedByOptOut, listDoNotCall, optedOut } from "./donotcall";
import { allergyNote } from "./note";
import { compareReconfirm, missingTicks, reconfirmFailure } from "./reconfirm";
import { CALL_ENDED, parseReport, selfCallback } from "./report";
import { busy, hold, newRegistry, type Registry } from "./queue";
import { findRestaurant, normalizePhone } from "./restaurants";
import { callCuisine, callOrder, riskCount } from "./risk";
import { decideLane, previewLane, type Fidelity } from "./rules";
import { bookingMessage, callbackMessage, callMessage, reconfirmMessage, replayAsk } from "./script";
import { currentFidelity, saveFidelity } from "./settings";
import { listRuns, loadLane, loadLanes, loadRun, saveLane, saveRun } from "./store";
import { bumpStats, phonePattern, readTrace, trace } from "./trace";
import { foUsage } from "./usage";
import type { CheckInstance, ChoiceDecision, ClaudeJudgement, Decisions, Diner, Lane, LaneResult, LaneStatus, NewRunInput, ParsedReport, Reconfirm, Restaurant, Run } from "./types";

// Engine state lives on globalThis so dev server reloads do not start a second poller
const g = globalThis as unknown as { __ccEngine?: Registry };
const reg: Registry = (g.__ccEngine ??= newRegistry());
reg.locks ??= new Map();
reg.pending ??= new Set();
reg.stopping ??= new Set();

// read, change and save one file at a time, so two updates to a lane never overwrite each other
function locked<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = reg.locks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  reg.locks.set(key, next.catch(() => undefined));
  return next;
}

const now = () => new Date().toISOString();
const newId = () => randomUUID().replace(/-/g, "").slice(0, 12);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class UserError extends Error {}

export const CUSTOM_NOT_IN_SAMPLE = "A sample uses only the sample kitchens. Use Test calls or Real calls for a restaurant you added.";

// test kitchens never get a real call, and a restaurant you added is a real place, so a sample never uses it
export function pickBlocked(mode: Run["mode"], r: Pick<Restaurant, "source">): string | null {
  if (mode === "live" && r.source === "test") return "Real calls need real restaurants, not test kitchens";
  if (mode === "replay" && r.source === "custom") return CUSTOM_NOT_IN_SAMPLE;
  return null;
}

function addEvent(l: Lane, kind: string, text: string) {
  l.events.push({ at: now(), kind, text });
  if (l.events.length > 200) l.events.splice(0, l.events.length - 200);
}

function mutate(runId: string, laneId: string, fn: (l: Lane) => void) {
  return locked(`lane:${laneId}`, async () => {
    const l = await loadLane(runId, laneId);
    if (!l) throw new Error("lane not found");
    fn(l);
    l.updatedAt = now();
    await saveLane(l);
    return l;
  });
}

// Taken before an action's first await, so two quick taps can never both start Fo work on one lane
function claim(laneId: string) {
  if (busy(reg, laneId)) throw new UserError("Fo is still busy with this restaurant");
  reg.pending.add(laneId);
}
const release = (laneId: string) => reg.pending.delete(laneId);

// The message stays saved on the lane until ask_fo takes it, so a failed send or a restart resends it.
// claimed: the caller already took the lane with claim(), otherwise a busy lane is refused
function enqueueLane(runId: string, laneId: string, message: string, opts: { conversationId?: string | null; newConversation?: boolean }, claimed = false) {
  return hold(
    reg,
    laneId,
    () =>
      mutate(runId, laneId, (l) => {
        l.pending = { message, conversationId: opts.conversationId ?? null, newConversation: !!opts.newConversation };
        l.stoppedAt = null;
      }),
    () => work(runId, laneId, message, opts),
    claimed,
  );
}

type TurnCtx = Awaited<ReturnType<typeof turnCtx>>;

// Resume jobs are held like a send: pending and shown as queued until their turn, then active
function enqueueJob(runId: string, laneId: string, wait: { status: LaneStatus; progress: string }, job: (ctx: TurnCtx) => Promise<void>, claimed = false) {
  return hold(
    reg,
    laneId,
    () =>
      mutate(runId, laneId, (l) => {
        l.status = wait.status;
        l.progress = wait.progress;
        l.error = null;
        l.stoppedAt = null;
      }),
    async () => {
      try {
        // Stop all calls came while this waited its turn: nothing runs
        const l = await loadLane(runId, laneId);
        if (l && stoppedHere(l)) return;
        await job(await turnCtx(runId, laneId));
        if (reg.stopping.has(laneId)) await finishStop(runId, laneId, null);
      } catch (e) {
        await fail(runId, laneId, e);
      } finally {
        reg.active.delete(laneId);
        reg.stopping.delete(laneId);
        await maybeCount(runId);
      }
    },
    claimed,
  );
}

// Stop all calls ended this lane and nothing you tapped since has queued it again
const stoppedHere = (l: Pick<Lane, "stoppedAt" | "status" | "skipped">) => !!l.skipped || (!!l.stoppedAt && l.status === "done");

// DEV REPLAY work starts right away but holds the lane like a real job, so buttons wait for it too
function replayJob(runId: string, laneId: string, fn: () => Promise<unknown>) {
  reg.active.add(laneId);
  reg.pending.delete(laneId);
  void fn()
    .catch((e) => fail(runId, laneId, e))
    .finally(() => {
      reg.active.delete(laneId);
      void maybeCount(runId);
    });
}

// DEV REPLAY calls wait in the same serial queue as real ones, with the request saved as pending until their turn,
// so call order and stop at first match behave the way they do on a real run. A skipped lane runs nothing
function replayQueued(runId: string, laneId: string, message: string, fn: () => Promise<unknown>, claimed = false) {
  return hold(
    reg,
    laneId,
    () =>
      mutate(runId, laneId, (l) => {
        l.pending = { message, conversationId: null, newConversation: false };
      }),
    async () => {
      let skipped = false;
      try {
        await mutate(runId, laneId, (l) => {
          skipped = !!l.skipped;
          l.pending = null;
        });
        if (!skipped) await fn();
      } catch (e) {
        await fail(runId, laneId, e);
      } finally {
        reg.active.delete(laneId);
        await maybeCount(runId);
      }
    },
    claimed,
  );
}

// progress lines plus how long this lane's turn may hold the queue (short while booking)
async function turnCtx(runId: string, laneId: string) {
  const [run, lane] = await Promise.all([loadRun(runId), loadLane(runId, laneId)]);
  let last = "";
  return {
    runId,
    laneId,
    // Stop all calls ends a turn at its next poll instead of waiting out the report
    signal: {
      get stopped() {
        return reg.stopping.has(laneId);
      },
    },
    ceilingMs: waitCeiling(lane?.phase ?? "call", run?.mode ?? "test"),
    onProgress: async (line: string) => {
      if (line === last) return;
      last = line;
      await mutate(runId, laneId, (l) => {
        l.progress = line;
        addEvent(l, "progress", line);
      });
    },
  };
}

// one lane per kitchen: the same id twice, or two entries with one phone number, would have Fo call one kitchen twice
export function pickedTwice(picked: Pick<Restaurant, "id" | "name" | "phone">[]): string | null {
  for (const [i, r] of picked.entries()) {
    const phone = normalizePhone(r.phone);
    const twin = picked.slice(0, i).find((x) => x.id === r.id || (!!phone && normalizePhone(x.phone) === phone));
    if (twin) return twin.id === r.id || twin.name === r.name ? `You picked ${r.name} twice.` : `${twin.name} and ${r.name} have the same phone number. Pick one of them.`;
  }
  return null;
}

// a sample's scripted kitchens all speak as a Thai kitchen, so their questions use Thai examples too
export const laneChecks = (mode: Run["mode"], diners: Diner[], r: Restaurant) => buildChecks(diners, callCuisine(mode, r));

export async function createRun(input: NewRunInput, opts: { purpose?: Run["purpose"] } = {}): Promise<Run> {
  const picked = await Promise.all(
    input.restaurantIds.map(async (id) => {
      const r = await findRestaurant(id);
      if (!r) throw new UserError(`Unknown restaurant ${id}`);
      const blocked = pickBlocked(input.mode, r);
      if (blocked) throw new UserError(blocked);
      return r;
    }),
  );
  const twice = pickedTwice(picked);
  if (twice) throw new UserError(twice);
  const run: Run = {
    id: newId(),
    createdAt: now(),
    mode: input.mode,
    when: input.when,
    partySize: input.partySize,
    diners: input.diners,
    bookingName: input.bookingName,
    stopAtFirstMatch: input.stopAtFirstMatch,
    laneIds: [],
    approvedAt: null,
    countedAt: null,
    checks: {},
    ...(opts.purpose ? { purpose: opts.purpose } : {}),
  };
  // kitchen memory: test and live only, never for a calibration call (it exists to make the call)
  const useMemory = run.mode !== "replay" && !run.purpose;
  const ledger = useMemory ? await readLedgerFile() : null;
  const fidelity = useMemory ? await currentFidelity() : "unverified";
  const found = picked.map((r) => {
    const checks = laneChecks(input.mode, input.diners, r);
    if (checks.length > 12) throw new UserError(`Too many checks for one call (${checks.length}). Remove a diner or restriction.`);
    const mem = ledger ? findMemory(ledger, { restaurantId: r.id, mode: run.mode, checks, diners: input.diners, fidelity }) : null;
    return { r, checks, mem };
  });
  // best bet first: the serial queue calls lanes in this order
  const order = callOrder(found.map((x) => ({ memory: !!x.mem, risk: riskCount(callCuisine(input.mode, x.r), input.diners) })));
  const restaurants = order.map((i) => found[i].r);
  for (const [i, { r, checks, mem }] of order.map((k) => found[k]).entries()) {
    const id = newId();
    run.laneIds.push(id);
    run.checks[id] = checks;
    const lane: Lane = {
      id,
      runId: run.id,
      restaurant: r,
      phase: "call",
      agreed: false,
      // replay scripts are dealt by call order, so the first kitchen called gets the first script
      replayCase: input.mode === "replay" ? REPLAY_CASES[i % REPLAY_CASES.length] : null,
      kitchenEmail: null,
      pending: null,
      status: mem ? "done" : "queued",
      progress: mem ? "Matched on answers from an earlier call" : "Waiting for your approval",
      conversationId: null,
      foQuestion: null,
      reports: [],
      result: mem ? resultFromMemory(mem, input.diners, checks) : null,
      callbacks: 0,
      booking: null,
      fromMemory: mem ? { runId: mem.runId, decidedAt: mem.decidedAt } : null,
      reconfirm: null,
      events: mem
        ? [{ at: now(), kind: "memory", text: `Matched on answers from an earlier call on ${new Date(mem.decidedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}. No call needed.` }]
        : [],
      startedAt: null,
      updatedAt: now(),
      error: null,
    };
    await saveLane(lane);
    if (mem) await trace({ runId: run.id, laneId: id, actor: "engine", action: "memory_match", input: { fromRun: mem.runId, decidedAt: mem.decidedAt }, ok: true });
  }
  await saveRun(run);
  await trace({
    runId: run.id,
    actor: "user",
    action: "create_run",
    input: { mode: run.mode, purpose: run.purpose ?? null, restaurants: restaurants.map((r) => r.name), diners: run.diners.map((d) => d.label), stopAtFirstMatch: run.stopAtFirstMatch },
    ok: true,
  });
  return run;
}

// Anand plays the kitchen on his own phone and reads calibrationLines(); the report proves Fo keeps hedges
export function createCalibrationRun() {
  return createRun({ mode: "test", when: "Calibration test call", partySize: 2, diners: HERO, restaurantIds: ["test-thai"], bookingName: HERO[0].label, stopAtFirstMatch: false }, { purpose: "calibration" });
}

// the page shows the placeholder, never the real test phone, in any format: its last 10 digits with any
// separators, after its country code (+1 when it has none), a trunk 0 or neither
const TEST_PHONE = "<FO_TEST_PHONE>";
export function phoneMasker(phone: string | null = env.testPhone()): (text: string) => string {
  const re = phonePattern(phone);
  if (!phone || !re) return (text) => text;
  return (text) => text.split(phone).join(TEST_PHONE).replace(re, TEST_PHONE);
}
export const hidePhone = (text: string, phone: string | null = env.testPhone()) => phoneMasker(phone)(text);

// every lane field that can carry Fo's words or the messages sent to Fo
export function maskLane<L extends Lane>(l: L, mask: (text: string) => string): L {
  const result = (r: LaneResult): LaneResult => ({ ...r, headline: mask(r.headline), reasons: r.reasons.map(mask) });
  const reconfirm = (rc: Reconfirm): Reconfirm => ({ ...rc, reasons: rc.reasons.map(mask), ...(rc.result && { result: result(rc.result) }) });
  return {
    ...l,
    result: l.result && result(l.result),
    reconfirm: l.reconfirm && reconfirm(l.reconfirm),
    reconfirmHistory: l.reconfirmHistory?.map(reconfirm),
    pending: l.pending && { ...l.pending, message: mask(l.pending.message) },
    foQuestion: l.foQuestion && mask(l.foQuestion),
    progress: mask(l.progress),
    waitingOn: l.waitingOn && mask(l.waitingOn),
    error: l.error && mask(l.error),
    events: l.events.map((e) => ({ ...e, text: mask(e.text) })),
    reports: l.reports.map((r) => ({ ...r, text: mask(r.text) })),
    booking: l.booking && { ...l.booking, text: mask(l.booking.text) },
  };
}

export async function runView(id: string) {
  const run = await loadRun(id);
  if (!run) return null;
  // a run that finished while the server was down is counted the first time it is opened, once
  if (run.approvedAt && !run.countedAt) void maybeCount(id);
  const lanes = await loadLanes(run);
  const mask = phoneMasker();
  return {
    run,
    lanes: lanes.map((l) => ({ ...maskLane(l, mask), active: reg.active.has(l.id), inQueue: reg.pending.has(l.id) })),
    scripts: Object.fromEntries(lanes.map((l) => [l.id, callMessage(run, l.restaurant, run.checks[l.id], TEST_PHONE)])),
    calibration: run.purpose === "calibration" && run.laneIds[0] ? calibrationLines(run.checks[run.laneIds[0]]) : null,
    calibrationNoCall: run.purpose === "calibration" && !run.calibratedAt && noCall(lanes[0]),
    // how this run used Fo, from its own trace
    usage: run.mode === "replay" ? [] : foUsage(await readTrace(id), lanes),
  };
}

// the calibration card says so when Fo's last report shows the call never really happened
function noCall(lane: Lane | undefined) {
  const last = lane?.reports.filter((r) => r.kind === "call").at(-1);
  return !!last && !calibrationCallHappened(last.text);
}

// What every real Fo call needs before it can go out
function assertCanCall(run: Run, lanes: Lane[], agreedIds: string[]) {
  if (run.mode === "replay" || !lanes.length) return;
  if (!env.anthropicKey()) throw new UserError("Add ANTHROPIC_API_KEY to .env.local before any call. Claude weighs every answer.");
  if (run.mode === "test" && !env.testPhone()) throw new UserError("Add FO_TEST_PHONE (your own number) to .env.local for test runs.");
  const missing = agreedMissing(run.mode, lanes, agreedIds);
  if (missing) throw new UserError(missing);
}

// the real run still going, if any, for the Setup page's ready check
export async function openLiveRun(): Promise<{ id: string; when: string } | null> {
  for (const run of await listRuns()) {
    if (run.mode !== "live" || !run.approvedAt) continue;
    if (liveBlocked([], [{ lanes: await loadLanes(run) }])) return { id: run.id, when: run.when };
  }
  return null;
}

export const LIVE_RUN_OPEN = "Another real run is still going. Finish it or tap Stop all calls on it first.";
export const OPTED_OUT = (name: string) => `${name} asked not to get calls like this. CrossCheck will not call them.`;
export const OPTED_OUT_BOOK = "They asked not to get calls like this. Book online or call them yourself.";

// a kitchen that said no to more calls gets none: no chef callback, booking call or reconfirm either
async function assertNotOptedOut(run: Run, lane: Lane, message = OPTED_OUT(lane.restaurant.name)) {
  if (run.mode !== "live") return;
  if (blockedByOptOut([lane.restaurant], await listDoNotCall())) throw new UserError(message);
}
export const SAY_IF_BOOKED = (name: string) => `Say whether ${name} is booked first. Open it and tap Fo booked it or Not booked.`;
export const CALLED_RECENTLY = (name: string) => `${name} was called in the last 12 hours. CrossCheck waits 12 hours before calling a kitchen again.`;
const RECENT_MS = 12 * 3600_000;

// Real calls: one run at a time, and no new run calls a kitchen Fo began calling in the last 12 hours (Monday had two runs
// both calling Bartaco). Fo only asking "Should I call?" does not count
export function liveBlocked(calling: Pick<Lane, "restaurant">[], others: { lanes: Pick<Lane, "restaurant" | "status" | "skipped" | "goAhead" | "reports" | "startedAt" | "updatedAt" | "phase" | "booking">[] }[], at = Date.now()): string | null {
  const open = (l: (typeof others)[number]["lanes"][number]) => !l.skipped && !["done", "error", "fo_still_working"].includes(l.status);
  const card = others.flatMap((o) => o.lanes).find((l) => bookingConfirmShown(l));
  if (card) return SAY_IF_BOOKED(card.restaurant.name);
  if (others.some((o) => o.lanes.some(open))) return LIVE_RUN_OPEN;
  const phone = (r: Pick<Restaurant, "phone">) => (r.phone ? (normalizePhone(r.phone) ?? r.phone) : "");
  const recent = new Set(
    others.flatMap((o) => o.lanes.filter((l) => (l.goAhead || l.reports.length) && at - Date.parse(l.startedAt ?? l.updatedAt) < RECENT_MS).map((l) => phone(l.restaurant))),
  );
  recent.delete("");
  const again = calling.find((l) => recent.has(phone(l.restaurant)));
  return again ? CALLED_RECENTLY(again.restaurant.name) : null;
}

async function assertLiveFree(run: Run, calling: Lane[]) {
  const others = [];
  for (const o of await listRuns()) {
    if (o.id === run.id || o.mode !== "live" || !o.approvedAt) continue;
    others.push({ lanes: await loadLanes(o) });
  }
  const why = liveBlocked(calling, others);
  if (why) throw new UserError(why);
  const asked = blockedByOptOut(calling.map((l) => l.restaurant), await listDoNotCall());
  if (asked) throw new UserError(OPTED_OUT(asked.name));
}

// under the run lock, so two approve taps (two tabs, a phone and a laptop, a retried request) never queue the calls twice
export function approveRun(id: string, agreedIds: string[]) {
  return locked(`run:${id}`, () => locked("approve", () => approveLocked(id, agreedIds)));
}

async function approveLocked(id: string, agreedIds: string[]) {
  const run = await loadRun(id);
  if (!run) throw new UserError("Run not found");
  if (run.approvedAt) throw new UserError("Already approved");
  const lanes = await loadLanes(run);
  // lanes matched from kitchen memory are already done and never get a call here. With stop at first match on,
  // a memory match means the others are not called either
  const plan = approvalPlan(run, lanes);
  assertCanCall(run, plan.call, agreedIds);
  if (run.mode === "live" && plan.call.length) await assertLiveFree(run, plan.call);
  run.approvedAt = now();
  await saveRun(run);
  await trace({ runId: id, actor: "user", action: "approve_calls", input: { lanes: plan.call.map((l) => l.restaurant.name), fromMemory: lanes.filter((l) => l.fromMemory).length, notCalled: plan.skip.map((l) => l.restaurant.name) }, ok: true });
  for (const l of plan.skip) {
    await mutate(id, l.id, (x) => {
      x.agreed = agreedIds.includes(l.id);
      skipLane(x, plan.winner!.restaurant.name, now());
      addEvent(x, "skipped", x.progress);
    });
    await trace({ runId: id, laneId: l.id, actor: "engine", action: "skip_lane", input: { matched: plan.winner!.restaurant.name, from: "memory" }, ok: true });
  }
  for (const l of plan.call) {
    await mutate(id, l.id, (x) => {
      x.agreed = agreedIds.includes(l.id);
      x.progress = run.mode === "replay" ? "DEV REPLAY queued" : "Queued for Fo";
      addEvent(x, "approved", "You approved this call");
    });
    const message = callMessage(run, l.restaurant, run.checks[l.id], env.testPhone() ?? "<FO_TEST_PHONE>");
    if (run.mode === "replay") await replayQueued(run.id, l.id, message, () => replayCall(run, l.id));
    else await enqueueLane(run.id, l.id, message, { newConversation: true });
  }
}

// One Fo turn for one lane, then sort the result
async function work(runId: string, laneId: string, message: string, opts: { conversationId?: string | null; newConversation?: boolean }) {
  reg.active.add(laneId);
  try {
    const ctx = {
      ...(await turnCtx(runId, laneId)),
      // Fo has the message now, so a Resume checks in with Fo instead of sending it again
      onSent: (conversationId: string | null) =>
        mutate(runId, laneId, (l) => {
          l.pending = null;
          if (conversationId) l.conversationId = conversationId;
          // anything after the first request is your answer, so Fo may be calling from here on
          if (!opts.newConversation) l.goAhead ??= now();
        }),
      // saved before ask_fo: a restart mid send looks for the message first and never sends it again blind
      onSending: () => mutate(runId, laneId, sendingStep),
      // ask_fo returned an error, so Fo does not have it and a Resume may send it again
      onRefused: () => mutate(runId, laneId, refusedStep),
      // a new conversation with no id: a follow up could reach another kitchen, so answers are refused from here on
      onNoConversation: async () => {
        await trace({ runId, laneId, actor: "engine", action: "warning", output: "ask_fo returned no conversationId", ok: false });
        if (!opts.conversationId) await mutate(runId, laneId, (l) => addEvent(l, "warning", "Fo took the message but gave back no conversation. Answers for this kitchen go through your Fo app."));
      },
      // ask_fo threw, so Fo may have it: never sent again without a look first
      onUncertain: () =>
        mutate(runId, laneId, (l) => {
          if (l.pending) l.pending.uncertain = true;
          addEvent(l, "warning", "The send to Fo lost its reply. Fo may already have this message.");
        }),
    };
    // another kitchen matched, or Stop all calls came, while this one waited its turn: nothing is sent
    let skipped = false;
    await mutate(runId, laneId, (l) => {
      if (stoppedHere(l) || reg.stopping.has(laneId)) {
        skipped = true;
        l.pending = null;
        return;
      }
      // you queued this lane again after a stop, so it is live again
      l.stoppedAt = null;
      l.status = "calling";
      l.error = null;
      l.waitingOn = null;
      l.progress = l.phase === "booking" ? "Fo is booking" : l.phase === "reconfirm" ? "Fo is calling to reconfirm" : "Fo is working on it";
      l.startedAt ??= now();
    });
    if (skipped) {
      if (reg.stopping.has(laneId)) await finishStop(runId, laneId, null);
      return;
    }
    const out = await runFoTurn(message, opts, ctx);
    // a finished report that lands right as Stop comes is still weighed, then the lane stops
    if (reg.stopping.has(laneId) && out.kind !== "report") return await finishStop(runId, laneId, out.conversationId);
    if (out.kind === "no_conversation") {
      await mutate(runId, laneId, (l) => {
        noConversationStep(l, message, out.text);
        addEvent(l, "warning", "Fo is working in a conversation CrossCheck cannot follow. Nothing from it is weighed");
      });
      return;
    }
    await settle(runId, laneId, out, ctx);
    if (reg.stopping.has(laneId)) await finishStop(runId, laneId, out.conversationId);
  } catch (e) {
    await fail(runId, laneId, e);
  } finally {
    reg.active.delete(laneId);
    reg.stopping.delete(laneId);
    await maybeCount(runId);
  }
}

// ---- stops: a stop is a message, never a call, so it never waits behind queued calls ----

export const stopText = (name: string) =>
  `Please stop. Do not call ${name} again and cancel any callback, redial or retry you set for them. Reply in one line with what you cancelled.`;

// one stop per lane at a time, so a second tap or tab never sends it twice
const stopsInFlight = new Set<string>();

// save: keep the stop on the lane until Fo confirms, so a restart sends it once more. A resend after a restart
// passes false, so a stop Fo keeps refusing is never sent on every restart
async function sendStop(runId: string, laneId: string, conversationId: string, name: string, save = true): Promise<boolean> {
  if (stopsInFlight.has(laneId)) return false;
  stopsInFlight.add(laneId);
  const text = stopText(name);
  try {
    if (save) await mutate(runId, laneId, (l) => void (l.stopPending = { conversationId, text, at: now() }));
    const r = await callFo("ask_fo", { message: text, conversationId }, { runId, laneId });
    if (r.isError) throw new Error(r.response || "Fo refused the message");
    await mutate(runId, laneId, (l) => {
      l.stopPending = null;
      if (l.foCallback && !l.foCallback.cancelled) l.foCallback.cancelled = now();
      addEvent(l, "progress", "Fo was told to stop and cancel any callback for this kitchen.");
    });
    return true;
  } catch (e) {
    await mutate(runId, laneId, (l) => addEvent(l, "warning", `Could not tell Fo to stop: ${e instanceof Error ? e.message : e}. Stop it in your Fo app.`)).catch(() => undefined);
    return false;
  } finally {
    stopsInFlight.delete(laneId);
  }
}

// a turn Stop all calls cut short: the lane ends and Fo is told to stop
async function finishStop(runId: string, laneId: string, conversationId: string | null) {
  reg.stopping.delete(laneId);
  const lane = await mutate(runId, laneId, (l) => {
    if (conversationId) l.conversationId ??= conversationId;
    l.stoppedAt ??= now();
    if (l.status !== "done") stopLane(l, now());
  });
  if (lane.conversationId) await sendStop(runId, laneId, lane.conversationId, lane.restaurant.name);
}

// a follow up (an answer, the chef callback, a reconfirm) still waiting in the queue: Fo never got it
const unsentFollowUp = (l: Lane) => l.status === "queued" && !!l.pending && !l.pending.uncertain && l.phase !== "booking";

// Stop all calls: kitchens Fo never got are not called, the one Fo is on ends at its next poll, and every
// kitchen Fo has (or said it will call again) is told to stop. Nothing new is ever dialed by this
export async function stopAll(runId: string) {
  const run = await loadRun(runId);
  if (!run) throw new UserError("Not found");
  if (run.mode === "replay") throw new UserError("A sample makes no calls");
  run.stoppedAt ??= now();
  await saveRun(run);
  await trace({ runId, actor: "user", action: "stop_all", ok: true });
  const toTell: Lane[] = [];
  for (const l of await loadLanes(run)) {
    // already on the "Did Fo book it?" card: only your answer ends it, so no second stop goes to Fo
    if (bookingConfirmShown(l) && !reg.active.has(l.id)) continue;
    if (reg.active.has(l.id)) {
      reg.stopping.add(l.id);
      // saved too, so a restart before the turn ends still stops it and tells Fo
      await mutate(runId, l.id, (x) => {
        x.stoppedAt = now();
        if (x.conversationId) x.stopPending = { conversationId: x.conversationId, text: stopText(x.restaurant.name), at: now() };
      });
      continue;
    }
    if (notStarted(l, false) || (l.status === "queued" && !l.conversationId && !foMayHaveIt(l))) {
      await mutate(runId, l.id, (x) => {
        x.status = "done";
        x.pending = null;
        x.foQuestion = null;
        x.stoppedAt = now();
        x.skipped = { reason: "You stopped all calls.", at: now() };
        x.progress = "Not called. You stopped all calls.";
        addEvent(x, "skipped", x.progress);
      });
      continue;
    }
    if (unsentFollowUp(l)) {
      await mutate(runId, l.id, (x) => {
        x.status = "done";
        x.pending = null;
        x.stoppedAt = now();
        x.progress = "You stopped this before it reached Fo.";
        // nothing went out, so the one chef callback is not used up and a reconfirm can be asked again
        if (x.phase === "callback") x.callbacks = Math.max(0, x.callbacks - 1);
        if (x.phase === "reconfirm" && x.reconfirm?.status === "requested") x.reconfirm = { ...x.reconfirm, status: "failed", reasons: [x.progress] };
        addEvent(x, "you", x.progress);
      });
      if (!l.foCallback || l.foCallback.cancelled) continue;
    }
    const open = !["done", "error"].includes(l.status);
    const callbackLeft = !!l.foCallback && !l.foCallback.cancelled;
    if (!open && !callbackLeft) continue;
    const lane = await mutate(runId, l.id, (x) => {
      x.stoppedAt = now();
      if (open) stopLane(x, now());
      // saved now, so the stop survives a restart before it goes out
      if (x.conversationId) x.stopPending = { conversationId: x.conversationId, text: stopText(x.restaurant.name), at: now() };
    });
    if (lane.conversationId) toTell.push(lane);
  }
  // in the background and in parallel: each is a short text to its own conversation, so the tap answers at once
  void Promise.all(toTell.map((l) => sendStop(runId, l.id, l.conversationId!, l.restaurant.name))).then(() => maybeCount(runId));
  await maybeCount(runId);
}

// One tap on the warning "Fo plans to call them again": Fo is told to cancel
export async function cancelFoCallback(runId: string, laneId: string) {
  const lane = await loadLane(runId, laneId);
  if (!lane) throw new UserError("Not found");
  if (!lane.foCallback || lane.foCallback.cancelled) throw new UserError("There is no callback from Fo to cancel");
  if (!lane.conversationId) throw new UserError("CrossCheck cannot reach this Fo conversation. Cancel it in your Fo app.");
  if (busy(reg, laneId) || stopsInFlight.has(laneId)) throw new UserError("Fo is still busy with this restaurant");
  if (!(await sendStop(runId, laneId, lane.conversationId, lane.restaurant.name))) throw new UserError("Could not reach Fo. Cancel it in your Fo app.");
}

// After a restart nothing is running, so lanes left mid step say so and wait for a Resume tap (a lane Stop all
// calls reached ends stopped). Nothing is sent on its own, except a saved stop, which goes out once
export async function recoverAfterRestart() {
  for (const run of await listRuns()) {
    if (run.mode === "replay") continue;
    for (const l of await loadLanes(run)) {
      if (busy(reg, l.id)) continue;
      try {
        const stuck = ["calling", "waiting_report", "queued", "deciding"].includes(l.status);
        const stop = l.stopPending;
        if (stuck || stop) {
          await mutate(run.id, l.id, (x) => {
            x.stopPending = null;
            if (!stuck) return;
            if (x.stoppedAt) {
              stopLane(x, now());
              return;
            }
            x.status = "fo_still_working";
            x.progress = x.pending && !x.pending.uncertain && !x.conversationId
              ? "CrossCheck restarted before this call went out. Tap Resume to send it."
              : "CrossCheck restarted. Tap Resume to check on Fo.";
            addEvent(x, "warning", x.progress);
          });
        }
        if (stop) void sendStop(run.id, l.id, stop.conversationId, l.restaurant.name, false);
      } catch (e) {
        console.error("CrossCheck could not recover a lane", l.id, e);
      }
    }
    await maybeCount(run.id);
  }
}

async function fail(runId: string, laneId: string, e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  await mutate(runId, laneId, (l) => {
    l.status = "error";
    l.error = msg;
    l.preview = null;
    l.progress = "Something went wrong";
    addEvent(l, "error", msg);
  });
  await trace({ runId, laneId, actor: "engine", action: "error", output: msg, ok: false });
}

async function settle(runId: string, laneId: string, out: TurnOutcome, ctx: Parameters<typeof waitForReport>[1]): Promise<void> {
  // Fo said it will call this kitchen again on its own: the lane warns and offers one tap to cancel
  // Fo asking first ("I can set up a call, want me to?") is a question for you, not a plan
  const plan = out.kind === "question" ? null : selfCallback(out.text);
  const lane = await mutate(runId, laneId, (l) => {
    if (out.conversationId) l.conversationId = out.conversationId;
    addEvent(l, `fo_${out.kind}`, out.text.slice(0, 2000));
    if (plan && (!l.foCallback || l.foCallback.cancelled)) {
      l.foCallback = { text: plan, at: now() };
      addEvent(l, "warning", `Fo said it will call them again on its own: "${plan}"`);
    }
    // kept as a flag too, since old events get trimmed
    if (foBegan(out.kind)) l.goAhead ??= now();
  });
  if (lane.phase === "booking") {
    const step = bookingStep(out.kind, out.text, await bookingDecision(runId, laneId, out));
    await mutate(runId, laneId, (l) => bookingSettled(l, step, out, now()));
    if (step !== "wait") return;
    // like a call: wait for Fo's next turn, then settle the booking from it
    if (!lane.conversationId) return askBooked(runId, laneId, out, NO_FOLLOW);
    return settle(runId, laneId, await waitForReport(lane.conversationId, ctx, reportWait(ctx.ceilingMs), out.text), ctx);
  }
  if (lane.phase === "reconfirm" && out.kind === "failed") {
    // the booking and the first answers still stand; only this reconfirm attempt failed
    await mutate(runId, laneId, (l) => {
      l.status = "done";
      l.reconfirm = { status: "failed", at: now(), reasons: [out.text || "Fo could not finish the reconfirm call"] };
      l.progress = "Reconfirm call did not finish";
      addEvent(l, "error", out.text || "Fo could not finish the reconfirm call");
    });
    return;
  }
  switch (out.kind) {
    case "report":
      return decide(runId, laneId, out.text);
    case "question":
      if (await askForReport(runId, laneId, lane, out)) return settle(runId, laneId, await runFoTurn(REPORT_AGAIN, { conversationId: lane.conversationId }, ctx), ctx);
      return askUser(runId, laneId, out.text);
    case "other":
      // a plain prose ending ("went to voicemail", "they declined") still gets weighed, not lost
      if (CALL_ENDED.test(out.text)) return decide(runId, laneId, out.text);
      if (await askForReport(runId, laneId, lane, out)) return settle(runId, laneId, await runFoTurn(REPORT_AGAIN, { conversationId: lane.conversationId }, ctx), ctx);
      return askUser(runId, laneId, out.text);
    case "underway":
      // "The call is complete... I'll send the full report" is a summary, so the report is asked for, not waited on
      if (await askForReport(runId, laneId, lane, out)) return settle(runId, laneId, await runFoTurn(REPORT_AGAIN, { conversationId: lane.conversationId }, ctx), ctx);
      await mutate(runId, laneId, (l) => {
        l.status = "waiting_report";
        l.waitingOn = out.text;
        l.progress = "Fo is on the call";
      });
      if (!lane.conversationId) return askUser(runId, laneId, out.text);
      return settle(runId, laneId, await waitForReport(lane.conversationId, ctx, reportWait(ctx.ceilingMs), out.text), ctx);
    case "still_working":
      await mutate(runId, laneId, (l) => {
        l.status = "fo_still_working";
        l.progress = "Fo is still working. It keeps going even if this page closes. Tap Resume to check again.";
      });
      return;
    case "failed":
      return fail(runId, laneId, new Error(out.text || "Fo could not finish this request"));
  }
}

// Fo can end a call with a short summary and no report in the reply format. Ask once, in the same conversation,
// for the report itself, so the checks read the kitchen's own words instead of Fo's summary.
export const REPORT_AGAIN =
  "Please paste the full call report here in exactly the reply format from my first message, starting with CALL OUTCOME. Use their exact words and say who said each answer.";
export const AFTER_CALL =
  /\b(the (test )?call (went|is (now )?(complete|done|over|finished)|ended|wrapped( up)?|finished)|call is complete|checks? came back|after the call)\b/i;

async function askForReport(runId: string, laneId: string, lane: Lane, out: TurnOutcome): Promise<boolean> {
  if (lane.phase !== "call" || !lane.goAhead || !lane.conversationId || lane.reportAsked || reg.stopping.has(laneId) || !AFTER_CALL.test(out.text)) return false;
  await mutate(runId, laneId, (l) => {
    l.reportAsked = now();
    l.progress = "Asking Fo for the full report";
    addEvent(l, "progress", "Fo sent a summary without the report. CrossCheck asked once for the full report.");
  });
  await trace({ runId, laneId, actor: "engine", action: "ask_report", input: { summary: out.text.slice(0, 500) }, ok: true });
  return true;
}

async function askUser(runId: string, laneId: string, text: string) {
  await mutate(runId, laneId, (l) => askStep(l, text));
}

// Jev reads Fo's booking reply, questions too ("Booked, want it on your calendar?"). No key or a failure gives no decision, which is never done
async function bookingDecision(runId: string, laneId: string, out: TurnOutcome): Promise<ChoiceDecision | null> {
  if (!["other", "underway", "question"].includes(out.kind) || !out.text.trim() || !env.jevKey()) return null;
  try {
    return await classifyBookingReply(out.text, { runId, laneId });
  } catch (e) {
    await mutate(runId, laneId, (l) => addEvent(l, "warning", `Jev could not read Fo's booking reply. You decide: ${e instanceof Error ? e.message : e}`));
    return null;
  }
}

// Not a clear booked: Anand reads Fo's exact words and taps Fo booked it or Not booked
async function askBooked(runId: string, laneId: string, out: Pick<TurnOutcome, "kind" | "text">, why: string) {
  await mutate(runId, laneId, (l) => bookedCard(l, now(), why, out.text));
}

async function decide(runId: string, laneId: string, text: string) {
  const run = await loadRun(runId);
  const lane = await mutate(runId, laneId, (l) => {
    l.status = "deciding";
    l.preview = null;
    l.progress = l.phase === "reconfirm" ? "Claude and Jev are weighing today's answers" : "Claude and Jev are weighing the answers";
    l.reports.push({ kind: l.phase === "callback" || l.phase === "reconfirm" ? l.phase : "call", text, at: now() });
  });
  if (!run) throw new Error("run not found");
  // the calibration verdict needs no decider, so it is saved first and survives a Claude or Jev failure
  if (run.purpose === "calibration" && lane.phase === "call") await calibrate(run, laneId, text);
  const allChecks = run.checks[laneId];
  const parsed = parseReport(text);
  // the kitchen asked not to get calls like this again: never on a test call, which rings your own phone
  if (run.mode === "live" && optedOut(parsed.optOut)) {
    await addDoNotCall(lane.restaurant, run.id);
    await mutate(runId, laneId, (l) => addEvent(l, "warning", `${l.restaurant.name} asked not to get calls like this again. CrossCheck will not call them again, not even to book.`));
  }
  if (lane.phase === "reconfirm") return decideReconfirm(run, lane, parsed, text);
  const prior = lane.phase === "callback" ? lane.result : null;
  const openKeys = new Set((prior?.checks ?? []).filter((v) => v.outcome !== "pass").map((v) => v.key));
  const relevant = prior ? allChecks.filter((c) => (openKeys.size ? openKeys.has(c.key) : true)) : allChecks;
  const fidelity = await currentFidelity();
  // Jev usually answers first: show what the lane would be if Claude agrees, while Claude still reads the report
  const onJev = (decisions: Decisions) =>
    mutate(runId, laneId, (l) => void showPreview(l, previewLane({ checks: allChecks, relevant, diners: run.diners, parsed, decisions, fidelity, prior })));
  const { judgement, decisions } = await weigh(run, lane, relevant, parsed, text, onJev);
  const result = withOpening(decideLane({ checks: allChecks, diners: run.diners, parsed, decisions, judgement, fidelity, prior }), text);
  await finishDecision(runId, laneId, result, parsed.email);
}

// "No one answered" for a kitchen that is simply closed reads wrong. Fo's own words say when they open
// only a real time or day: "until further notice" says nothing about when to try again
const CLOSED = /\b(?:closed|not open)(?: today)? until ([^.,;\n()]{0,30}?(?:\d|noon|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)[^.,;\n()]{0,20})/i;
export function withOpening(result: LaneResult, text: string): LaneResult {
  const m = result.state === "no_answer" ? text.match(CLOSED) : null;
  if (!m) return result;
  return { ...result, reasons: result.reasons.map((r) => (r === "No one answered" ? `Closed until ${m[1].trim()}. Try them again after they open.` : r)) };
}

// Claude reads the report, Jev decides each question; Claude alone only when Jev is missing or fails.
// A structured report goes to both at once. A freeform one goes to Claude first, since Jev needs Claude's quotes
async function weigh(run: Run, lane: Lane, relevant: CheckInstance[], parsed: ParsedReport, text: string, onJev?: (d: Decisions) => Promise<unknown>) {
  const runId = run.id;
  const laneId = lane.id;
  let claudeDone = false;
  const claudeP = claudeJudge({ runId, laneId, restaurant: lane.restaurant, diners: run.diners, checks: relevant, parsed, raw: text })
    .catch(async (e) => {
      await mutate(runId, laneId, (l) => addEvent(l, "warning", `Claude could not weigh in: ${e instanceof Error ? e.message : e}`));
      return null;
    })
    .finally(() => {
      claudeDone = true;
    });
  const jevRun = () =>
    jevDecide({
      runId,
      laneId,
      state: buildJevState(lane.restaurant, run.diners, relevant, parsed, text),
      questions: buildJevQuestions(relevant),
      checks: relevant,
    });

  let judgement: Awaited<typeof claudeP> = null;
  let jev: { ok: true; d: Decisions } | { ok: false; e: unknown } | null = null;
  if (parsed.format === "freeform" || !env.jevKey()) {
    judgement = await claudeP;
    if (parsed.format === "freeform" && judgement) {
      for (const c of relevant) {
        const q = judgement.checks[c.key];
        if (q?.quote) parsed.answers[c.code] = { code: c.code, words: q.quote, speaker: q.speaker, speakerRaw: q.speaker };
      }
    }
    if (env.jevKey()) jev = await jevRun().then((d) => ({ ok: true as const, d }), (e: unknown) => ({ ok: false as const, e }));
  } else {
    const jevP = jevRun().then(
      async (d) => {
        // a preview only helps while Claude is still reading; a failed save never stops the real decision
        if (!claudeDone && onJev) await onJev(d).catch(() => undefined);
        return { ok: true as const, d };
      },
      (e: unknown) => ({ ok: false as const, e }),
    );
    [judgement, jev] = await Promise.all([claudeP, jevP]);
  }

  let decisions: Decisions;
  let jevFailed = false;
  if (jev?.ok) {
    decisions = jev.d;
  } else if (jev && !jev.ok) {
    if (!judgement) throw jev.e;
    const e = jev.e;
    await mutate(runId, laneId, (l) => addEvent(l, "warning", `Jev could not be reached, so only Claude read the answers. Read each quote before booking. (${e instanceof Error ? e.message : e})`));
    decisions = decisionsFromClaude(judgement, relevant);
    jevFailed = true;
  } else if (judgement) {
    decisions = decisionsFromClaude(judgement, relevant);
  } else {
    throw new Error("No decider available. Add ANTHROPIC_API_KEY and TYPESAFE_API_KEY to .env.local, then tap Resume.");
  }
  return { judgement, decisions, jevFailed };
}

async function calibrate(run: Run, laneId: string, text: string) {
  const action = calibrationAction((await loadRun(run.id)) ?? run, await listRuns(), text);
  if (action === "skip") return; // already judged; a Resume runs decide again
  if (action === "no_call") {
    await mutate(run.id, laneId, (l) => addEvent(l, "calibration", "The practice call did not happen. Nothing changed. Start a new practice call from Setup."));
    await trace({ runId: run.id, laneId, actor: "engine", action: "calibration", output: { status: "no_call" }, ok: true });
    return;
  }
  if (action === "superseded") {
    await markCalibrated(run.id);
    await mutate(run.id, laneId, (l) => addEvent(l, "calibration", "A newer practice call decides how far Fo's reports are trusted. This one changed nothing."));
    return;
  }
  const ev = evaluateCalibration(text, run.checks[laneId]);
  await locked("settings", () => saveFidelity({ status: ev.status, at: now(), runId: run.id, signals: ev.signals }));
  await markCalibrated(run.id);
  const msg =
    ev.status === "verified"
      ? `Practice call passed: Fo's report kept the unsure words, the answer passed on by staff and the shared fryer word for word. ${
          env.forceUnverified()
            ? "FO_REPORT_FIDELITY=force_unverified in .env.local still holds every match for your review. Remove that line to use this practice call."
            : "CrossCheck can now match a kitchen on its own."
        }`
      : `Practice call did not pass: Fo's report lost ${ev.missing.map((k) => SIGNAL_TEXT[k]).join("; ")}. Every match waits for your review until a practice call passes.`;
  await mutate(run.id, laneId, (l) => addEvent(l, "calibration", msg));
  await trace({ runId: run.id, laneId, actor: "engine", action: "calibration", output: { status: ev.status, signals: ev.signals }, ok: true });
}

function markCalibrated(runId: string) {
  return locked(`run:${runId}`, async () => {
    const r = await loadRun(runId);
    if (!r) return;
    r.calibratedAt = now();
    await saveRun(r);
  });
}

async function saveToLedger(run: Run, lane: Lane, result: LaneResult) {
  await locked("ledger", () => recordResult(run, lane, result, run.checks[lane.id])).catch((e) =>
    mutate(run.id, lane.id, (l) => addEvent(l, "warning", `Could not save this answer to Kitchen answers: ${e instanceof Error ? e.message : e}`)),
  );
}

async function finishDecision(runId: string, laneId: string, result: NonNullable<Lane["result"]>, email: string | null) {
  const lane = await mutate(runId, laneId, (l) => {
    landResult(l, result, email);
    addEvent(l, "result", `${result.headline}${result.reasons.length ? `: ${result.reasons.slice(0, 3).join("; ")}` : ""}`);
  });
  await trace({ runId, laneId, actor: "engine", action: "decide", output: { state: result.state, decider: result.decider, reasons: result.reasons }, ok: true });
  const run = await loadRun(runId);
  if (!run) return;
  await stopOthers(run, lane);
  await saveToLedger(run, lane, result);
}

// Stop at first match: a real match skips every kitchen whose call has not started, Fo's first question included.
// Calls under way finish
async function stopOthers(run: Run, winner: Lane) {
  if (!run.stopAtFirstMatch || winner.result?.state !== "matched") return;
  const lanes = await loadLanes(run);
  for (const l of lanesToSkip(run, winner, lanes, (id) => reg.active.has(id))) {
    let did = false;
    // checked again under the lane's lock, so a lane that started a moment ago is never touched
    await mutate(run.id, l.id, (x) => {
      if (!lanesToSkip(run, winner, [x], (id) => reg.active.has(id)).length) return;
      skipLane(x, winner.restaurant.name, now());
      addEvent(x, "skipped", x.progress);
      did = true;
    });
    if (did) await trace({ runId: run.id, laneId: l.id, actor: "engine", action: "skip_lane", input: { matched: winner.restaurant.name }, ok: true });
  }
}

// A fresh decision on today's answers alone (no prior), then compared with the result the booking used
async function decideReconfirm(run: Run, lane: Lane, parsed: ParsedReport, text: string) {
  if (!lane.result) throw new Error("Nothing to reconfirm: this lane has no earlier result");
  const checks = run.checks[lane.id];
  const { judgement, decisions, jevFailed } = await weigh(run, lane, checks, parsed, text);
  const today = decideLane({ checks, diners: run.diners, parsed, decisions, judgement, fidelity: await currentFidelity(), prior: null });
  await finishReconfirm(run, lane.id, lane.result, today, parsed, jevFailed);
}

async function finishReconfirm(run: Run, laneId: string, before: LaneResult, today: LaneResult, parsed: ParsedReport, jevFailed = false) {
  // nobody answered, they declined or Jev failed on all clear answers: no result and no ledger write, so Retry comes back
  const failed = reconfirmFailure(today, jevFailed);
  if (failed) {
    await mutate(run.id, laneId, (l) => {
      l.status = "done";
      l.reconfirm = { status: "failed", at: now(), reasons: failed };
      l.progress = "Today's reconfirm did not count. Try it again.";
      addEvent(l, "reconfirm", `Reconfirm did not count: ${failed.slice(0, 3).join("; ")}`);
    });
    await trace({ runId: run.id, laneId, actor: "engine", action: "reconfirm_decide", output: { status: "failed", state: today.state, decider: today.decider, jevFailed, reasons: failed }, ok: true });
    return;
  }
  let cmp: ReturnType<typeof compareReconfirm> = { status: "not_reconfirmed", reasons: [] };
  const lane = await mutate(run.id, laneId, (l) => {
    // anything an earlier reconfirm here found still counts against today
    cmp = compareReconfirm(before, today, parsed, reconfirmDoubts(l));
    l.status = "done";
    l.reconfirm = { status: cmp.status, at: now(), reasons: cmp.reasons, result: today };
    l.progress =
      cmp.status === "reconfirmed" ? "Reconfirmed with the kitchen today" : cmp.status === "needs_review" ? "Read today's answers to finish the reconfirm" : "Not reconfirmed. Read why before you go.";
    addEvent(
      l,
      "reconfirm",
      cmp.status === "reconfirmed"
        ? "Reconfirmed: same answers and the note is on the booking"
        : cmp.status === "needs_review"
          ? "Same answers today. Read each quote to finish the reconfirm"
          : `Not reconfirmed: ${cmp.reasons.slice(0, 3).join("; ")}`,
    );
  });
  await trace({ runId: run.id, laneId, actor: "engine", action: "reconfirm_decide", output: { status: cmp.status, state: today.state, decider: today.decider, reasons: cmp.reasons }, ok: true });
  await saveToLedger(run, lane, today);
}

function maybeCount(runId: string) {
  return locked(`run:${runId}`, () => countRun(runId)).catch(() => undefined);
}

async function countRun(runId: string) {
  const run = await loadRun(runId);
  if (!run || run.countedAt || !run.approvedAt) return;
  const lanes = await loadLanes(run);
  if (!runFinished(lanes, (id) => reg.active.has(id))) return;
  if (lanes.some((l) => l.status === "needs_you")) return;
  // a run stopped before any kitchen gave a result never ran, so it is not counted at all
  if (!lanes.some((l) => l.result || l.fromMemory)) return;
  run.countedAt = now();
  await saveRun(run);
  // a run you stopped is counted but never as a success
  await bumpStats(run.mode, !run.stoppedAt && lanes.every((l) => l.status === "done"));
}

// ---- actions from the run page ----

export async function answerFo(runId: string, laneId: string, text: string) {
  const run = await loadRun(runId);
  const lane = await loadLane(runId, laneId);
  if (!run || !lane) throw new UserError("Not found");
  if (lane.status !== "needs_you") throw new UserError("Fo is not waiting on you for this restaurant");
  if (sendAgainShown(lane)) throw new UserError("Check your Fo app first, then tap Fo has it, Send again or No, stop.");
  if (bookingConfirmShown(lane)) throw new UserError("Tap Fo booked it or Not booked first.");
  const answer = text.trim().slice(0, 1000);
  if (!answer) throw new UserError("Type an answer first");
  if (followUpLost({ conversationId: lane.conversationId }, run.mode)) {
    await lostFollowUp(runId, laneId, answer, "answer_fo", (l) => {
      if (l.status !== "needs_you" || sendAgainShown(l) || bookingConfirmShown(l)) throw new UserError("Fo is not waiting on your answer for this restaurant");
    });
    throw new UserError(LOST_CONVERSATION);
  }
  claim(laneId);
  try {
    await trace({ runId, laneId, actor: "user", action: "answer_fo", input: { question: lane.foQuestion, answer }, ok: true });
    await mutate(runId, laneId, (l) => {
      if (l.status !== "needs_you") throw new UserError("Fo is not waiting on you for this restaurant");
      l.foQuestion = null;
      l.status = "queued";
      l.progress = "Sending your answer to Fo";
      addEvent(l, "you", answer);
    });
    if (run.mode === "replay") return await replayQueued(runId, laneId, answer, () => replayAfterAnswer(run, laneId, answer), true);
    await enqueueLane(runId, laneId, answer, { conversationId: lane.conversationId }, true);
  } catch (e) {
    release(laneId);
    throw e;
  }
}

export async function askChef(runId: string, laneId: string) {
  const run = await loadRun(runId);
  const lane = await loadLane(runId, laneId);
  if (!run || !lane) throw new UserError("Not found");
  if (lane.result?.state !== "needs_chef") throw new UserError("Only lanes that need the chef get a callback");
  if (lane.callbacks >= 1) throw new UserError("One callback per restaurant. CrossCheck will not keep calling them.");
  await assertNotOptedOut(run, lane);
  claim(laneId);
  try {
    const checks = run.checks[laneId];
    const open = lane.result.checks.filter((v) => v.outcome !== "pass");
    const list = (open.length ? open : lane.result.checks).map((v) => ({ check: checks.find((c) => c.key === v.key)!, quote: v.quote }));
    await trace({ runId, laneId, actor: "user", action: "ask_chef", input: { checks: list.map((x) => x.check.code) }, ok: true });
    await mutate(runId, laneId, (l) => {
      if (l.callbacks >= 1) throw new UserError("One callback per restaurant. CrossCheck will not keep calling them.");
      l.phase = "callback";
      l.callbacks += 1;
      l.status = "queued";
      l.progress = "Queued: chef callback";
      addEvent(l, "you", "Asked Fo to call back for the chef");
    });
    if (run.mode === "replay") return replayJob(runId, laneId, () => replayCallback(run, laneId));
    // the callback message names the kitchen and every question, so with no conversation to follow it starts its own
    await enqueueLane(runId, laneId, callbackMessage(run, lane.restaurant, list, env.testPhone() ?? ""), { conversationId: lane.conversationId, newConversation: !lane.conversationId }, true);
  } catch (e) {
    release(laneId);
    throw e;
  }
}

export async function book(runId: string, laneId: string, opts: { depositCap: number; reviewed: boolean }) {
  const run = await loadRun(runId);
  const lane = await loadLane(runId, laneId);
  if (!run || !lane?.result) throw new UserError("Not found");
  const blocked = bookBlocked(lane, !!run.approvedAt, opts.reviewed, await loadLanes(run)) ?? bookAgreedBlocked(run, lane);
  if (blocked) throw new UserError(blocked);
  await assertNotOptedOut(run, lane, OPTED_OUT_BOOK);
  // a live booking phones the kitchen, so it needs what every call needs
  if (run.mode === "live") assertCanCall(run, [lane], [lane.id]);
  claim(laneId);
  try {
    const cap = Math.max(0, Math.min(500, Math.round(opts.depositCap)));
    const note = allergyNote(run, lane);
    await trace({ runId, laneId, actor: "user", action: "book", input: { depositCap: cap, reviewed: opts.reviewed, note }, ok: true });
    // one booking per table: the run lock keeps two quick Book taps on different kitchens from both going out
    await locked(`book:${runId}`, async () => {
      const table = await loadLanes(run);
      await mutate(runId, laneId, (l) => {
        const again = bookBlocked(l, true, opts.reviewed, table);
        if (again) throw new UserError(again);
        l.phase = "booking";
        l.status = "queued";
        l.booking = { status: "requested", text: note, at: now() };
        l.progress = "Queued: booking and allergy note";
        addEvent(l, "you", `Approved booking (deposit cap $${cap})`);
      });
    });
    if (run.mode === "replay") {
      return replayJob(runId, laneId, async () => {
        await sleep(1500);
        await mutate(runId, laneId, (l) => {
          l.status = "done";
          l.booking = { status: "done", text: `DEV REPLAY: would book ${lane.restaurant.name} for ${run.partySize} ${run.when} and email the allergy note.\n\n${note}`, at: now() };
          l.progress = "DEV REPLAY booking done";
        });
      });
    }
    const msg = bookingMessage({ run, r: lane.restaurant, depositCap: cap, note: allergyNote(run, lane, { forFo: true }), kitchenEmail: lane.kitchenEmail, testPhone: env.testPhone() ?? "" });
    // a lane matched from kitchen memory has no conversation yet, so it starts its own
    await enqueueLane(runId, laneId, msg, { conversationId: lane.conversationId, newConversation: !lane.conversationId }, true);
  } catch (e) {
    release(laneId);
    throw e;
  }
}

export async function resume(runId: string, laneId: string) {
  const run = await loadRun(runId);
  const lane = await loadLane(runId, laneId);
  if (!run || !lane) throw new UserError("Not found");
  // a replay never reaches Fo, Claude or Jev, so there is nothing to pick up again
  if (run.mode === "replay") throw new UserError("Start a new sample table");
  if (busy(reg, laneId)) throw new UserError("Already running or queued");
  if (lane.status === "done" || lane.status === "needs_you") throw new UserError("Nothing to resume");
  const plan = resumePlan(lane);
  const p = lane.pending;
  // never sent (a failed send or a restart): send the saved message, never read an old reply instead
  if (plan === "resend" && p) {
    if (followUpLost(p, run.mode)) return lostFollowUp(runId, laneId, p.message, "resume");
    await enqueueLane(runId, laneId, p.message, { conversationId: p.conversationId, newConversation: p.newConversation });
    return;
  }
  // ask_fo threw and there is no conversation to look in: never resend on our own, Anand checks his Fo app
  if (plan === "ask_resend" && p) return askSendAgain(runId, laneId);
  // ask_fo threw: look for the message in its conversation first and only send it if Fo never got it
  if (plan === "check_sent" && p?.conversationId) {
    const convo = p.conversationId;
    return enqueueJob(runId, laneId, { status: "queued", progress: "Queued: checking in with Fo" }, async (ctx) => {
      const landed = await callFo("get_fo_conversation", { conversationId: convo }, { runId, laneId })
        .then((r) => (r.isError ? null : userTurnHas(r.raw, p.message)))
        .catch(() => null);
      if (landed === null) return askSendAgain(runId, laneId);
      if (!landed) {
        await mutate(runId, laneId, (l) => {
          l.pending = { message: p.message, conversationId: convo, newConversation: false };
          addEvent(l, "progress", "Fo never got the last message. Sending it again");
        });
        return work(runId, laneId, p.message, { conversationId: convo });
      }
      await mutate(runId, laneId, (l) => {
        l.pending = null;
        l.conversationId = convo;
        l.goAhead ??= now();
        l.status = "calling";
        l.progress = "Checking in with Fo";
        addEvent(l, "progress", "Fo already had the last message. Picking up its reply.");
      });
      await settle(runId, laneId, await resumeTurn(convo, ctx), ctx);
    });
  }
  const lastReport = lane.reports.at(-1);
  if (plan === "decide" && lastReport) {
    // stays "deciding" so a restart before its turn still weighs the report again
    return enqueueJob(runId, laneId, { status: "deciding", progress: "Queued: weighing the answers again" }, () => decide(runId, laneId, lastReport.text));
  }
  // the first call never reached Fo: start it again
  if (plan === "restart_call") {
    await enqueueLane(runId, laneId, callMessage(run, lane.restaurant, run.checks[laneId], env.testPhone() ?? ""), { newConversation: true });
    return;
  }
  if (!lane.conversationId) {
    // a booking with no conversation to read back: Anand says whether it is booked instead of a dead end
    if (lane.phase === "booking" && lane.booking?.status === "requested") {
      await mutate(runId, laneId, (l) => bookedCard(l, now(), "CrossCheck cannot follow this booking in Fo. Check your Fo app.", null));
      return maybeCount(runId);
    }
    throw new UserError(lane.phase === "booking" && lane.booking?.status === "failed" ? "Tap Book again to start a new booking with Fo." : "Fo never started this conversation. Start a new run.");
  }
  const convo = lane.conversationId;
  return enqueueJob(runId, laneId, { status: "queued", progress: "Queued: checking in with Fo" }, async (ctx) => {
    await mutate(runId, laneId, (l) => {
      l.status = "calling";
      l.error = null;
      l.progress = "Checking in with Fo";
    });
    const out = await resumeTurn(convo, ctx);
    // the same reply that already ran out the wait: no second long wait, Anand gets Fo's words
    if (nothingNew(lane, out)) return stalled(runId, laneId, lane.phase, out);
    await settle(runId, laneId, out, ctx);
  });
}

async function stalled(runId: string, laneId: string, phase: Lane["phase"], out: TurnOutcome) {
  await mutate(runId, laneId, (l) => addEvent(l, "warning", "Fo has sent nothing new since the last wait"));
  const why = "Fo has sent nothing new since this reply.";
  if (phase === "booking") return askBooked(runId, laneId, out, why);
  return askUser(runId, laneId, `${why} Check your Fo app, then answer Fo or tap No, stop.\n\n${out.text}`);
}

// what the Send again card says, with the test phone masked
export function sendAgainText(l: Pick<Lane, "phase" | "pending">, mask = phoneMasker()) {
  const sent = mask(l.pending?.message ?? "");
  return `${UNCERTAIN_SEND[l.phase]}${sent ? `\n\nWhat was sent: "${sent.length > 240 ? `${sent.slice(0, 240)}…` : sent}"` : ""}`;
}

// the message may already be with Fo, so the lane waits on Anand with a Send again button
async function askSendAgain(runId: string, laneId: string) {
  await mutate(runId, laneId, (l) => {
    l.status = "needs_you";
    l.error = null;
    l.foQuestion = sendAgainText(l);
    l.progress = "Check your Fo app before sending again";
    addEvent(l, "warning", "Fo may already have the last message. Waiting for you to check the Fo app.");
  });
}

// No conversation to send a follow up to: it stays unsent and Anand answers in the Fo app, then taps Fo has it
async function lostFollowUp(runId: string, laneId: string, message: string, from: string, check: (l: Lane) => void = () => undefined) {
  await mutate(runId, laneId, (l) => {
    check(l);
    lostConversationStep(l, message);
    addEvent(l, "warning", "No Fo conversation for this kitchen. The answer was not sent");
  });
  await trace({ runId, laneId, actor: "engine", action: "warning", input: { from }, output: "follow up refused: lane has no conversationId", ok: false });
}

// Anand checked his Fo app and the message is not there: send it once more
export async function sendAgain(runId: string, laneId: string) {
  const run = await loadRun(runId);
  const lane = await loadLane(runId, laneId);
  if (!run || !lane) throw new UserError("Not found");
  if (run.mode === "replay") throw new UserError("Nothing is sent to Fo in a sample");
  const p = lane.pending;
  if (!p || !sendAgainShown(lane)) throw new UserError("Nothing is waiting to be sent again");
  if (followUpLost(p, run.mode)) throw new UserError(lane.foQuestion?.startsWith(NO_CONVERSATION) ? NO_CONVERSATION : LOST_CONVERSATION);
  claim(laneId);
  try {
    await trace({ runId, laneId, actor: "user", action: "send_again", input: { phase: lane.phase }, ok: true });
    await mutate(runId, laneId, (l) => {
      if (!sendAgainShown(l)) throw new UserError("Nothing is waiting to be sent again");
      l.foQuestion = null;
      l.status = "queued";
      l.progress = "Sending to Fo again";
      addEvent(l, "you", "Checked the Fo app and sent again");
    });
    await enqueueLane(runId, laneId, p.message, { conversationId: p.conversationId, newConversation: p.newConversation }, true);
  } catch (e) {
    release(laneId);
    throw e;
  }
}

// Anand found the lost message in his Fo app: check in on its conversation instead of sending it twice
export async function foHasIt(runId: string, laneId: string) {
  const run = await loadRun(runId);
  const lane = await loadLane(runId, laneId);
  if (!run || !lane) throw new UserError("Not found");
  if (run.mode === "replay") throw new UserError("Nothing is sent to Fo in a sample");
  if (!sendAgainShown(lane)) throw new UserError("Nothing is waiting on your Fo app check");
  claim(laneId);
  try {
    await trace({ runId, laneId, actor: "user", action: "fo_has_it", input: { phase: lane.phase }, ok: true });
    const l = await mutate(runId, laneId, (x) => {
      if (!sendAgainShown(x)) throw new UserError("Nothing is waiting on your Fo app check");
      foHasItStep(x, now());
      addEvent(x, "you", "Checked the Fo app: Fo has the last message");
    });
    // no conversation to follow: the step ended and the Fo app has it
    if (l.status !== "queued" || !l.conversationId) {
      release(laneId);
      return maybeCount(runId);
    }
    const convo = l.conversationId;
    await enqueueJob(runId, laneId, { status: "queued", progress: "Queued: checking in with Fo" }, async (ctx) => {
      await mutate(runId, laneId, (x) => {
        x.status = "calling";
        x.progress = "Checking in with Fo";
      });
      await settle(runId, laneId, await resumeTurn(convo, ctx), ctx);
    }, true);
  } catch (e) {
    release(laneId);
    throw e;
  }
}

// Fo's booking reply was not a clear yes: Anand says whether the table is booked
export async function confirmBooking(runId: string, laneId: string, booked: boolean) {
  const lane = await loadLane(runId, laneId);
  if (!lane) throw new UserError("Not found");
  // Not booked frees Book, so never while Fo is still on this booking
  const blocked = bookingAnswerBlocked(lane, busy(reg, laneId));
  if (blocked) throw new UserError(blocked);
  await trace({ runId, laneId, actor: "user", action: booked ? "booking_confirmed" : "booking_not_booked", input: { fo: lane.booking?.text }, ok: true });
  await mutate(runId, laneId, (l) => {
    const again = bookingAnswerBlocked(l, busy(reg, laneId));
    if (again) throw new UserError(again);
    bookingByYou(l, booked, now());
    addEvent(l, "you", booked ? "Fo booked it" : "Not booked");
  });
  await maybeCount(runId);
}

// "No, stop" ends the lane whatever Fo says back, so one stray tap can never approve the call
export async function declineFo(runId: string, laneId: string) {
  const run = await loadRun(runId);
  const lane = await loadLane(runId, laneId);
  if (!run || !lane) throw new UserError("Not found");
  if (lane.status !== "needs_you") throw new UserError("Fo is not waiting on you for this restaurant");
  if (bookingConfirmShown(lane)) throw new UserError("Tap Fo booked it or Not booked first.");
  if (busy(reg, laneId)) throw new UserError("Fo is still busy with this restaurant");
  const convo = run.mode === "replay" ? null : lane.conversationId;
  // a booking stop holds the lane until Fo is told, so Not booked never frees Book before that
  const holdIt = !!convo && lane.phase === "booking";
  if (holdIt) claim(laneId);
  let card = false;
  try {
    await trace({ runId, laneId, actor: "user", action: "decline", input: { question: lane.foQuestion }, ok: true });
    await mutate(runId, laneId, (l) => {
      if (l.status !== "needs_you") throw new UserError("Fo is not waiting on you for this restaurant");
      if (bookingConfirmShown(l)) throw new UserError("Tap Fo booked it or Not booked first.");
      card = stopLane(l, now());
      addEvent(l, "you", "No, stop");
    });
  } catch (e) {
    if (holdIt) release(laneId);
    throw e;
  }
  if (!convo) return maybeCount(runId);
  const tell = async () => {
    try {
      const r = await callFo("ask_fo", { message: "No. Do not do that. Please stop here and do not contact them.", conversationId: convo }, { runId, laneId });
      if (r.isError) throw new Error(r.response || "Fo refused the message");
      if (card) await mutate(runId, laneId, (l) => addEvent(l, "progress", "Fo was told to stop. Waiting for you to say whether the table is booked."));
    } catch (e) {
      await mutate(runId, laneId, (l) => {
        addEvent(l, "warning", `Could not tell Fo to stop: ${e instanceof Error ? e.message : e}`);
        if (card) stopNotTold(l);
      });
    }
    await maybeCount(runId);
  };
  if (holdIt)
    return void (await hold(reg, laneId, async () => undefined, async () => {
      try {
        await tell();
      } finally {
        reg.stopping.delete(laneId);
        await mutate(runId, laneId, (l) => void (l.stopPending = null));
      }
    }, true));
  // not a booking: a stop is a message, never a call, so it goes out now instead of behind queued calls
  await mutate(runId, laneId, (l) => {
    l.stopPending = { conversationId: convo, text: stopText(lane.restaurant.name), at: now() };
  });
  void sendStop(runId, laneId, convo, lane.restaurant.name).then(() => maybeCount(runId));
}

export async function setAgreed(runId: string, laneId: string, agreed: boolean) {
  await mutate(runId, laneId, (l) => {
    l.agreed = agreed;
  });
}

// Skip kitchen memory and ask the kitchen fresh
export async function callAgain(runId: string, laneId: string) {
  const run = await loadRun(runId);
  const lane = await loadLane(runId, laneId);
  if (!run || !lane) throw new UserError("Not found");
  if (run.mode === "replay") throw new UserError("A sample never uses earlier answers");
  if (!lane.fromMemory) throw new UserError("Only a kitchen matched on earlier answers can be called again");
  if (!run.approvedAt) throw new UserError("Approve the run first");
  if (lane.booking && lane.booking.status !== "failed") throw new UserError("This table is already booked from these answers. Reconfirm with the kitchen instead.");
  assertCanCall(run, [lane], lane.agreed ? [lane.id] : []);
  const from = lane.fromMemory.runId;
  claim(laneId);
  try {
    await trace({ runId, laneId, actor: "user", action: "call_again", input: { memoryFrom: from }, ok: true });
    await mutate(runId, laneId, (l) => {
      l.fromMemory = null;
      l.result = null;
      l.reconfirm = null;
      l.phase = "call";
      l.status = "queued";
      l.calledAnyway = now();
      l.progress = "Queued for Fo";
      addEvent(l, "you", "Asked Fo to call again instead of using the earlier answers");
    });
    await enqueueLane(runId, laneId, callMessage(run, lane.restaurant, run.checks[laneId], env.testPhone() ?? ""), { newConversation: true }, true);
  } catch (e) {
    release(laneId);
    throw e;
  }
}

// A kitchen skipped because another one matched: a normal first call, under the same rules as any call
export async function callAnyway(runId: string, laneId: string) {
  const run = await loadRun(runId);
  const lane = await loadLane(runId, laneId);
  if (!run || !lane) throw new UserError("Not found");
  const blocked = callAnywayBlocked(lane, !!run.approvedAt, busy(reg, laneId));
  if (blocked) throw new UserError(blocked);
  assertCanCall(run, [lane], lane.agreed ? [lane.id] : []);
  if (run.mode === "live") await assertLiveFree(run, [lane]);
  claim(laneId);
  try {
    await trace({ runId, laneId, actor: "user", action: "call_anyway", input: { skipped: lane.skipped?.reason ?? null }, ok: true });
    await mutate(runId, laneId, (l) => {
      const again = callAnywayBlocked(l, true, false);
      if (again) throw new UserError(again);
      callAnywayStep(l, now(), run.mode === "replay");
      addEvent(l, "you", "Asked Fo to call anyway");
    });
    const message = callMessage(run, lane.restaurant, run.checks[laneId], env.testPhone() ?? "<FO_TEST_PHONE>");
    if (run.mode === "replay") await replayQueued(runId, laneId, message, () => replayCall(run, laneId), true);
    else await enqueueLane(runId, laneId, message, { newConversation: true }, true);
  } catch (e) {
    release(laneId);
    throw e;
  }
}

// Day of reconfirm, after the booking: same questions again, judged fresh, never overwriting the first result
export async function requestReconfirm(runId: string, laneId: string) {
  const run = await loadRun(runId);
  const lane = await loadLane(runId, laneId);
  if (!run || !lane) throw new UserError("Not found");
  const st = lane.result?.state;
  if (!canStartReconfirm(lane.reconfirm)) throw new UserError(reconfirmBlocked(lane.reconfirm?.status));
  if (lane.status !== "done" || !lane.result || !(st === "matched" || st === "needs_review")) throw new UserError("Only a matched or reviewed restaurant can be reconfirmed");
  await assertNotOptedOut(run, lane);
  if (lane.booking?.status !== "done") throw new UserError("Reconfirm comes after the booking is done");
  assertCanCall(run, [lane], lane.agreed ? [lane.id] : []);
  const dishes = lane.result.dishes;
  claim(laneId);
  try {
    await trace({ runId, laneId, actor: "user", action: "reconfirm", input: { state: st }, ok: true });
    await mutate(runId, laneId, (l) => {
      if (!canStartReconfirm(l.reconfirm)) throw new UserError(reconfirmBlocked(l.reconfirm?.status));
      // the attempt before stays on record and still counts against this one
      if (l.reconfirm) (l.reconfirmHistory ??= []).push(l.reconfirm);
      l.phase = "reconfirm";
      l.status = "queued";
      l.reconfirm = { status: "requested", at: now(), reasons: [] };
      l.progress = "Queued: day of reconfirm";
      addEvent(l, "you", "Asked Fo to reconfirm with the kitchen today");
    });
    if (run.mode === "replay") return replayJob(runId, laneId, () => replayReconfirm(run, laneId));
    const msg = reconfirmMessage(run, lane.restaurant, run.checks[laneId], env.testPhone() ?? "", dishes);
    await enqueueLane(runId, laneId, msg, { conversationId: lane.conversationId, newConversation: !lane.conversationId }, true);
  } catch (e) {
    release(laneId);
    throw e;
  }
}

function reconfirmBlocked(status: string | undefined) {
  if (status === "requested") return "A reconfirm is already under way";
  if (status === "needs_review") return "Read today's answers on the ticket first";
  return "Today's reconfirm already finished. A new call cannot replace its result.";
}

// Today's answers were clear but unverified: Anand ticks every quote from today before it counts
export async function confirmReconfirmReview(runId: string, laneId: string, keys: string[]) {
  const lane = await loadLane(runId, laneId);
  if (!lane) throw new UserError("Not found");
  const check = (l: Lane) => {
    const rc = l.reconfirm;
    if (rc?.status !== "needs_review" || !rc.result) throw new UserError("Nothing from today waits for your review");
    const missing = missingTicks(rc.result, keys);
    if (missing.length) throw new UserError(`Tick each quote from today first (${missing.join(", ")})`);
    if (reconfirmDoubts(l).length) throw new UserError("An earlier reconfirm here did not pass. This one cannot count");
    return rc;
  };
  check(lane);
  if (busy(reg, laneId)) throw new UserError("Fo is still busy with this restaurant");
  await trace({ runId, laneId, actor: "user", action: "reconfirm_reviewed", input: { keys }, ok: true });
  await mutate(runId, laneId, (l) => {
    const rc = check(l);
    l.reconfirm = { ...rc, status: "reconfirmed", reviewedAt: now() };
    l.progress = "Reconfirmed with the kitchen today. You read every quote.";
    addEvent(l, "you", "Read every quote from today's reconfirm");
  });
}

// ---- DEV REPLAY: scripted kitchens, clearly labeled, never used in a recording ----

async function replayCall(run: Run, laneId: string) {
  const lane = await loadLane(run.id, laneId);
  if (!lane) return;
  for (const line of ["DEV REPLAY: Fo is reading your request"]) {
    await mutate(run.id, laneId, (l) => {
      l.status = "calling";
      l.progress = line;
      l.startedAt = now();
      addEvent(l, "progress", line);
    });
    await sleep(1200);
  }
  await askUser(run.id, laneId, replayAsk(run, lane.restaurant.name));
}

async function replayAfterAnswer(run: Run, laneId: string, answer: string) {
  const lane = await loadLane(run.id, laneId);
  if (!lane?.replayCase) return;
  if (/^(no|stop|cancel|don'?t)/i.test(answer)) {
    await mutate(run.id, laneId, (l) => {
      l.status = "done";
      l.progress = "You declined. No call was made.";
    });
    return maybeCount(run.id);
  }
  const c = CASES.find((x) => x.id === lane.replayCase)!;
  for (const line of ["DEV REPLAY: Dialing", "DEV REPLAY: Talking to the kitchen", "DEV REPLAY: Writing the report"]) {
    await mutate(run.id, laneId, (l) => {
      l.status = "calling";
      l.progress = line;
      addEvent(l, "progress", line);
    });
    await sleep(1500);
  }
  const b = buildCase(c, run.diners, callCuisine(run.mode, lane.restaurant));
  const fidelity: Fidelity = c.fidelity ?? "unverified";
  await replayPreview(run, laneId, b.report, "call", previewLane({ checks: b.checks, diners: run.diners, parsed: b.parsed, decisions: b.decisions, fidelity }));
  const result = decideLane({ checks: b.checks, diners: run.diners, parsed: b.parsed, decisions: b.decisions, judgement: b.judgement as ClaudeJudgement, fidelity });
  await finishDecision(run.id, laneId, result, null);
  await maybeCount(run.id);
}

// the scripted Jev answers first: its preview shows while the scripted Claude "reads", then the real result lands
async function replayPreview(run: Run, laneId: string, report: string, kind: "call" | "callback", preview: ReturnType<typeof previewLane>) {
  await mutate(run.id, laneId, (l) => {
    l.reports.push({ kind, text: report, at: now() });
    l.status = "deciding";
    l.progress = "DEV REPLAY: Claude and Jev are weighing the answers";
  });
  await sleep(700);
  await mutate(run.id, laneId, (l) => void showPreview(l, preview));
  await sleep(2200);
}

async function replayCallback(run: Run, laneId: string) {
  const lane = await loadLane(run.id, laneId);
  if (!lane?.result) return;
  await mutate(run.id, laneId, (l) => {
    l.status = "calling";
    l.progress = "DEV REPLAY: Calling back for the chef";
  });
  await sleep(2000);
  const open = new Set(lane.result.checks.filter((v) => v.outcome !== "pass").map((v) => v.key));
  const b = buildCleanCallback(run.diners, callCuisine(run.mode, lane.restaurant), open);
  const c = CASES.find((x) => x.id === lane.replayCase);
  const base = { checks: run.checks[laneId], diners: run.diners, parsed: b.parsed, decisions: b.decisions, fidelity: c?.fidelity ?? "unverified", prior: lane.result } as const;
  await replayPreview(run, laneId, b.report, "callback", previewLane({ ...base, relevant: run.checks[laneId].filter((x) => open.has(x.key)) }));
  const result = decideLane({ ...base, judgement: b.judgement });
  await finishDecision(run.id, laneId, result, null);
}

async function replayReconfirm(run: Run, laneId: string) {
  const lane = await loadLane(run.id, laneId);
  if (!lane?.result) return;
  for (const line of ["DEV REPLAY: Calling to reconfirm", "DEV REPLAY: Checking the note and every answer"]) {
    await mutate(run.id, laneId, (l) => {
      l.status = "calling";
      l.progress = line;
      addEvent(l, "progress", line);
    });
    await sleep(1200);
  }
  const b = buildReconfirm({}, run.diners, callCuisine(run.mode, lane.restaurant));
  await mutate(run.id, laneId, (l) => {
    l.reports.push({ kind: "reconfirm", text: b.report, at: now() });
  });
  const c = CASES.find((x) => x.id === lane.replayCase);
  const today = decideLane({ checks: run.checks[laneId], diners: run.diners, parsed: b.parsed, decisions: b.decisions, judgement: b.judgement, fidelity: c?.fidelity ?? "unverified" });
  await finishReconfirm(run, laneId, lane.result, today, b.parsed);
}
