import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { trace } from "../trace";
import { FO_URL, FileFoProvider, hasTokens } from "./provider";

// One shared MCP client, kept on globalThis so dev server reloads reuse it
const g = globalThis as unknown as { __ccFo?: Promise<Client> };

function connect(): Promise<Client> {
  return (g.__ccFo ??= (async () => {
    const c = new Client({ name: "crosscheck", version: "0.1.0" });
    await c.connect(new StreamableHTTPClientTransport(FO_URL, { authProvider: new FileFoProvider({ interactive: false }) }));
    return c;
  })().catch((e) => {
    g.__ccFo = undefined;
    throw e;
  }));
}

export type FoResult = {
  isError: boolean;
  status: "complete" | "working" | "failed";
  rawStatus: string;
  conversationId: string | null;
  response: string;
  progress: string;
  raw: unknown;
};

function textOf(r: { content?: unknown }) {
  const blocks = Array.isArray(r.content) ? (r.content as { type?: string; text?: string }[]) : [];
  return blocks.map((b) => (b.type === "text" ? (b.text ?? "") : "")).join("\n");
}

// Fo's result shape was not documented as JSON vs structuredContent, so accept both and plain text
export function normalize(r: { content?: unknown; structuredContent?: unknown; isError?: unknown }): FoResult {
  const text = textOf(r);
  let body: Record<string, unknown> | null = (r.structuredContent as Record<string, unknown>) ?? null;
  if (!body) {
    try {
      const j = JSON.parse(text);
      if (j && typeof j === "object") body = j as Record<string, unknown>;
    } catch {
      body = null;
    }
  }
  const status = body?.status === "working" || body?.status === "failed" ? body.status : "complete";
  return {
    isError: r.isError === true,
    status,
    rawStatus: typeof body?.status === "string" ? body.status : "",
    conversationId: typeof body?.conversationId === "string" ? body.conversationId : null,
    response: typeof body?.response === "string" ? body.response : body ? "" : text,
    progress: typeof body?.progress === "string" ? body.progress : "",
    raw: body ?? text,
  };
}

// A dropped MCP session (idle expiry, server deploy) throws transport errors and the SDK never reconnects.
// Drop the cached client and retry once. ask_fo is retried only on 404 so a timeout never sends twice.
const TRANSPORT = /not connected|fetch failed|error posting|econnreset|socket hang up|session|404|streamablehttp/i;

export async function callFo(
  tool: "ask_fo" | "get_fo_reply" | "get_fo_conversation" | "list_fo_conversations" | "start_fo_call",
  args: Record<string, unknown>,
  ctx: { runId: string; laneId?: string; scrub?: (raw: unknown, isError: boolean) => unknown },
): Promise<FoResult> {
  const { scrub, ...where } = ctx;
  const t0 = Date.now();
  const once = async () => {
    const client = await connect();
    const r = await client.callTool({ name: tool, arguments: args }, undefined, { timeout: 90_000 });
    return normalize(r as { content?: unknown; structuredContent?: unknown; isError?: unknown });
  };
  try {
    let out: FoResult;
    try {
      out = await once();
    } catch (e) {
      const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e);
      const retry = tool === "ask_fo" ? /404|session/i.test(msg) : TRANSPORT.test(msg);
      if (!retry) throw e;
      g.__ccFo = undefined;
      out = await once();
    }
    // scrub keeps other Fo conversations (Anand's private chats) and call links out of the trace
    await trace({ ...where, actor: "fo", action: tool, input: args, output: scrub ? scrub(out.raw, out.isError) : out.raw, ms: Date.now() - t0, ok: !out.isError });
    return out;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await trace({ ...where, actor: "fo", action: tool, input: args, output: msg, ms: Date.now() - t0, ok: false });
    g.__ccFo = undefined;
    throw e;
  }
}

export async function foStatus() {
  if (!hasTokens()) return { signedIn: false, tools: [] as string[], error: "Not signed in. Run npm run fo:login." };
  try {
    let t;
    try {
      t = await (await connect()).listTools();
    } catch {
      g.__ccFo = undefined;
      t = await (await connect()).listTools();
    }
    return { signedIn: true, tools: t.tools.map((x) => x.name), error: null };
  } catch (e) {
    return { signedIn: false, tools: [] as string[], error: e instanceof Error ? e.message : String(e) };
  }
}
