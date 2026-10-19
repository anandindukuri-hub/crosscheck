import { LANE_CEILING_MS } from "../lanes";
import { classifyFoReply, type FoReplyKind } from "../report";
import { callFo, type FoResult } from "./client";

// Fo's own instructions say a turn waiting on the user carries the question in its progress line
const WAITING = /waiting (for|on) (you|your|the user)|needs? your (answer|ok|approval|confirmation)|asked you|your (answer|confirmation) (is )?needed/i;
const isWaiting = (r: FoResult) => WAITING.test(r.progress) || !["complete", "working", "failed", ""].includes(r.rawStatus);

// Fo's server says this when a turn ended on a message it did not hand back (a "Ready to dial, confirm?" for one).
// The real words are the last thing Fo wrote in the conversation, so read them from there.
export const NO_TEXT = /^the run finished without a textual reply\.?$/i;

export function lastFoWords(raw: unknown): string {
  const turns = extractTurns(raw);
  let mine = -1;
  turns.forEach((t, i) => {
    if (/^(user|human)$/i.test(t.role)) mine = i;
  });
  const after = turns.slice(mine + 1).filter((t) => !/^(user|human)$/i.test(t.role));
  return after.at(-1)?.text ?? "";
}

async function withWords(r: FoResult, conversationId: string | null, ctx: Ctx): Promise<FoResult> {
  if (!conversationId || !NO_TEXT.test(r.response.trim())) return r;
  const c = await (ctx.call ?? callFo)("get_fo_conversation", { conversationId }, ctx);
  const words = c.isError ? "" : lastFoWords(c.raw);
  return words ? { ...r, response: words } : r;
}

function finish(r: FoResult, conversationId: string | null): TurnOutcome {
  if (r.isError || r.status === "failed") return { kind: "failed", conversationId, text: r.response || r.progress };
  if (isWaiting(r)) return { kind: "question", conversationId, text: r.response || r.progress };
  if (!r.response.trim() && r.progress) return { kind: "question", conversationId, text: r.progress };
  return { kind: classifyFoReply(r.response), conversationId, text: r.response };
}

// no_conversation: ask_fo took a new request with no conversationId and Fo is still working on it
export type TurnOutcome = {
  kind: FoReplyKind | "failed" | "still_working" | "no_conversation";
  conversationId: string | null;
  text: string;
};

// onSending runs (and is saved) just before ask_fo, since from then on Fo may have the message. onSent runs once
// ask_fo took it, onRefused when ask_fo returned an error (Fo does not have it), onUncertain when ask_fo threw.
// onNoConversation runs when ask_fo took the message but gave back no conversationId.
// ceilingMs caps how long one turn holds the queue; call and pollMs swap in a fake Fo for the dev eval
type Ctx = {
  runId: string;
  laneId: string;
  onProgress: (line: string) => Promise<void> | void;
  onSent?: (conversationId: string | null) => Promise<unknown> | void;
  onUncertain?: () => Promise<unknown> | void;
  onSending?: () => Promise<unknown> | void;
  onRefused?: () => Promise<unknown> | void;
  onNoConversation?: () => Promise<unknown> | void;
  signal?: { stopped: boolean };
  ceilingMs?: number;
  call?: typeof callFo;
  pollMs?: number;
};

// One Fo turn: ask, then keep polling while Fo works, then sort the reply.
export async function runFoTurn(
  message: string,
  opts: { conversationId?: string | null; newConversation?: boolean },
  ctx: Ctx,
): Promise<TurnOutcome> {
  const started = Date.now();
  const call = ctx.call ?? callFo;
  // neither would continue Fo's latest conversation, maybe another kitchen's, so it is never sent
  if (!opts.conversationId && !opts.newConversation) throw new Error("No Fo conversation to send this to. Answer Fo in your Fo app.");
  const args: Record<string, unknown> = { message };
  if (opts.conversationId) args.conversationId = opts.conversationId;
  else args.newConversation = true;

  const ceiling = ctx.ceilingMs ?? LANE_CEILING_MS;
  // a failed save here stops before the send, so the message is still plainly unsent
  await ctx.onSending?.();
  let r: FoResult;
  try {
    r = await call("ask_fo", args, ctx);
  } catch (e) {
    // a timeout or dropped connection after the send: only a returned error proves Fo refused it
    await ctx.onUncertain?.();
    throw e;
  }
  let conversationId = r.conversationId ?? opts.conversationId ?? null;
  if (r.isError) {
    await ctx.onRefused?.();
    return { kind: "failed", conversationId, text: r.response || String(r.raw) };
  }
  if (!r.conversationId) await ctx.onNoConversation?.();
  await ctx.onSent?.(conversationId);
  // get_fo_reply with no id reads whatever conversation Fo treats as current, maybe another kitchen's
  if (!conversationId && r.status === "working" && !isWaiting(r)) return { kind: "no_conversation", conversationId: null, text: r.progress };

  while (r.status === "working" && !isWaiting(r)) {
    if (r.progress) await ctx.onProgress(r.progress);
    if (ctx.signal?.stopped) return { kind: "still_working", conversationId, text: r.progress };
    if (Date.now() - started > ceiling) return { kind: "still_working", conversationId, text: r.progress };
    r = await call("get_fo_reply", { conversationId, waitSeconds: 40 }, ctx);
    conversationId = r.conversationId ?? conversationId;
    if (r.isError) return { kind: "failed", conversationId, text: r.response || String(r.raw) };
  }
  return finish(await withWords(r, conversationId, ctx), conversationId);
}

// After a restart: pick the conversation back up from wherever Fo is now
export async function resumeTurn(conversationId: string, ctx: Ctx): Promise<TurnOutcome> {
  const started = Date.now();
  const call = ctx.call ?? callFo;
  const ceiling = ctx.ceilingMs ?? LANE_CEILING_MS;
  let r = await call("get_fo_reply", { conversationId, waitSeconds: 40 }, ctx);
  while (r.status === "working" && !r.isError && !isWaiting(r)) {
    if (r.progress) await ctx.onProgress(r.progress);
    if (Date.now() - started > ceiling) return { kind: "still_working", conversationId, text: r.progress };
    r = await call("get_fo_reply", { conversationId, waitSeconds: 40 }, ctx);
  }
  return finish(await withWords(r, conversationId, ctx), conversationId);
}

// When Fo says "calling now, will report back", the report arrives later as a new turn in the conversation.
// Only turns that appear after we start waiting count, so an old "Should I call?" never comes back.
// since: the reply Fo ended its turn with. The get_fo_reply fallback never settles on that same reply
export async function waitForReport(conversationId: string, ctx: Ctx, ceilingMs = ctx.ceilingMs ?? LANE_CEILING_MS, since = ""): Promise<TurnOutcome> {
  const started = Date.now();
  const call = ctx.call ?? callFo;
  const first = await call("get_fo_conversation", { conversationId }, ctx);
  const seen = extractTurns(first.raw).length;
  // the conversation's shape is a guess: when no turn can be read, follow get_fo_reply until its reply changes
  if (!seen) return waitOnReply(conversationId, ctx, ceilingMs, since, started);
  while (Date.now() - started < ceilingMs) {
    if (ctx.signal?.stopped) break;
    await new Promise((r) => setTimeout(r, ctx.pollMs ?? 30_000));
    const r = await call("get_fo_conversation", { conversationId }, ctx);
    const newer = extractTurns(r.raw)
      .slice(seen)
      .filter((t) => !/^(user|human)$/i.test(t.role));
    for (const t of newer.reverse()) {
      const kind = classifyFoReply(t.text);
      if (kind !== "underway") return { kind, conversationId, text: t.text };
    }
    await ctx.onProgress(`Waiting for Fo's report (${Math.round((Date.now() - started) / 60_000)} min)`);
  }
  return { kind: "still_working", conversationId, text: "" };
}

async function waitOnReply(conversationId: string, ctx: Ctx, ceilingMs: number, since: string, started: number): Promise<TurnOutcome> {
  const call = ctx.call ?? callFo;
  const poll = ctx.pollMs ?? 30_000;
  while (Date.now() - started < ceilingMs) {
    if (ctx.signal?.stopped) break;
    const r = await call("get_fo_reply", { conversationId, waitSeconds: 40 }, ctx);
    if (r.isError) return { kind: "failed", conversationId, text: r.response || String(r.raw) };
    const working = r.status === "working" && !isWaiting(r);
    if (working && r.progress) await ctx.onProgress(r.progress);
    if (!working) {
      const out = finish(await withWords(r, conversationId, ctx), conversationId);
      if (out.text.trim() && same(out.text) !== same(since) && out.kind !== "underway") return out;
      await ctx.onProgress(`Waiting for Fo's report (${Math.round((Date.now() - started) / 60_000)} min)`);
    }
    // get_fo_reply already waits while Fo works. A working reply only gets a short pause
    await new Promise((res) => setTimeout(res, working ? Math.min(poll, 5_000) : poll));
  }
  return { kind: "still_working", conversationId, text: "" };
}

const same = (s: string) => s.toLowerCase().replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();

// Did any user turn in this conversation carry this message? null unless at least one user turn could be
// read, so an unknown shape (only "fo" turns, content blocks) goes to Send again and is never resent on
// its own. An older identical answer only skips a resend, the safe side: a fresh question comes back to Anand
export function userTurnHas(raw: unknown, message: string): boolean | null {
  const mine = extractTurns(raw).filter((t) => /^(user|human)$/i.test(t.role));
  if (!mine.length) return null;
  return mine.some((t) => same(t.text) === same(message));
}

function extractTurns(raw: unknown): { role: string; text: string }[] {
  const body = raw as { turns?: unknown; messages?: unknown } | null;
  const turns = body?.turns ?? body?.messages;
  if (!Array.isArray(turns)) return [];
  return turns
    .map((t) => {
      const x = t as { role?: unknown; text?: unknown; content?: unknown };
      return { role: String(x.role ?? ""), text: typeof x.text === "string" ? x.text : typeof x.content === "string" ? x.content : "" };
    })
    .filter((t) => t.text);
}
