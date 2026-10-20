import { z } from "zod";
import { phoneMasker, UserError } from "../engine";
import type { Lane, Run } from "../types";
import { callFo, type FoResult } from "./client";

// Talk to Fo out loud and read back what Fo and the kitchen calls said. Field names in Fo's results
// are not documented, so each reader accepts the common spellings and fails loudly when nothing fits.

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

function failed(r: FoResult, what: string) {
  if (r.isError || r.status === "failed") throw new Error(`Fo could not ${what}: ${r.response || r.progress || "no details"}`);
}

const CallTicket = z.object({ joinUrl: z.string().url(), expiresAt: z.string().nullish() });

const LINK = /https?:\/\/\S+/g;

// the join link works once, so the trace keeps only that a link came back and when it expires,
// whether Fo answered with JSON, plain text or an error
export const scrubCallTicket = (raw: unknown) => ({ joinUrl: "[redacted]", expiresAt: str(obj(raw).expiresAt) });

export async function startFoCall(): Promise<{ joinUrl: string; expiresAt: string }> {
  const r = await callFo("start_fo_call", {}, { runId: "talk", scrub: scrubCallTicket });
  if (r.isError || r.status === "failed") throw new Error(`Fo could not start a call: ${(r.response || r.progress || "no details").replace(LINK, "[link]")}`);
  const body = obj(r.raw);
  const fromText = typeof r.raw === "string" ? r.raw.match(/https:\/\/\S+/)?.[0] : undefined;
  const t = CallTicket.safeParse({ joinUrl: body.joinUrl ?? body.url ?? fromText, expiresAt: str(body.expiresAt) });
  if (!t.success) throw new Error("Fo did not return a call link. Try again.");
  // Fo's tool docs: the link works once and expires after 10 minutes
  return { joinUrl: t.data.joinUrl, expiresAt: t.data.expiresAt ?? new Date(Date.now() + 10 * 60_000).toISOString() };
}

export type FoTurn = { role: string; text: string; at: string | null };

export function turnsOf(raw: unknown): FoTurn[] {
  const turns = obj(raw).turns ?? obj(raw).messages;
  if (!Array.isArray(turns)) return [];
  return turns
    .map((t) => {
      const x = obj(t);
      return { role: str(x.role) ?? "unknown", text: str(x.text) ?? str(x.content) ?? "", at: str(x.at) ?? str(x.createdAt) ?? str(x.timestamp) ?? null };
    })
    .filter((t) => t.text);
}

export type FoConversation = { conversationId: string; title: string | null; channel: string | null; startedAt: string | null };

export function conversationsOf(raw: unknown): FoConversation[] {
  const list = Array.isArray(raw) ? raw : (obj(raw).conversations ?? obj(raw).items);
  if (!Array.isArray(list)) return [];
  return list.flatMap((c) => {
    const x = obj(c);
    const id = str(x.conversationId) ?? str(x.id);
    if (!id) return [];
    return [{ conversationId: id, title: str(x.title) ?? str(x.subject), channel: str(x.channel), startedAt: str(x.startedAt) ?? str(x.createdAt) ?? str(x.updatedAt) }];
  });
}

const notInReplay = (run: Run) => {
  if (run.mode === "replay") throw new UserError("Fo conversations are not available in a sample. Nothing was sent to Fo.");
};

export async function laneConversation(run: Run, lane: Lane): Promise<FoTurn[]> {
  notInReplay(run);
  if (!lane.conversationId) throw new UserError("Fo has no conversation for this restaurant yet");
  const r = await callFo("get_fo_conversation", { conversationId: lane.conversationId }, { runId: run.id, laneId: lane.id });
  failed(r, "read this conversation");
  // the first turn is the call request, which carries the test phone on test runs
  const mask = phoneMasker();
  return turnsOf(r.raw).map((t) => ({ ...t, text: mask(t.text) }));
}

// Check Fo's conversations: every Fo conversation started since this run began, sorted into this run's kitchens and the
// rest. Only counts leave this function: the rest are Anand's own chats with Fo and are never read or named
export async function callCheck(run: Run, lanes: Lane[]) {
  notInReplay(run);
  const ours = new Set(lanes.map((l) => l.conversationId).filter(Boolean) as string[]);
  // only conversations with a start time after the run began, so an undated one is never counted as new
  const since = (raw: unknown) => conversationsOf(raw).filter((c) => !!c.startedAt && c.startedAt >= run.createdAt);
  const count = (raw: unknown) => {
    const list = since(raw);
    const mine = list.filter((c) => ours.has(c.conversationId)).length;
    return { since: list.length, ours: mine, other: list.length - mine };
  };
  const r = await callFo("list_fo_conversations", {}, { runId: run.id, scrub: (raw, isError) => (isError ? raw : count(raw)) });
  failed(r, "list conversations");
  return { ...count(r.raw), kitchens: ours.size };
}

// Only this run's own lane conversations. Everything else in the list is Anand's private chats with Fo
// and never leaves this function or reaches the trace.
export async function runConversations(run: Run, lanes: Lane[]) {
  notInReplay(run);
  const byConvo = new Map(lanes.filter((l) => l.conversationId).map((l) => [l.conversationId as string, l]));
  if (!byConvo.size) return [];
  const mine = (raw: unknown) => conversationsOf(raw).filter((c) => byConvo.has(c.conversationId));
  const r = await callFo("list_fo_conversations", {}, { runId: run.id, scrub: (raw, isError) => (isError ? raw : { conversations: mine(raw) }) });
  failed(r, "list conversations");
  const mask = phoneMasker();
  return mine(r.raw).map((c) => {
    const l = byConvo.get(c.conversationId)!;
    return { laneId: l.id, restaurant: l.restaurant.name, title: c.title && mask(c.title), channel: c.channel, startedAt: c.startedAt };
  });
}
