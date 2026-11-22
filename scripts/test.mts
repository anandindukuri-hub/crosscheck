// npm test: starts the dev server on a free local port, runs the rules eval at /api/dev/eval, prints the totals
// and stops the server. Exits with 1 when any check fails. Needs no keys. Run it from the crosscheck folder
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

type UnitResult = { name: string; pass: boolean; got: unknown; want: unknown };
type KitchenResult = { id: string; title: string; expect: string; got: string; pass: boolean; reasons: string[] };
type CoverageResult = { cuisine: string; tooMany: boolean; missing: string[] };
type EvalAnswer = {
  passed: number;
  total: number;
  unitPassed: number;
  unitTotal: number;
  unitFailures: UnitResult[];
  coverageOk: boolean;
  coverage: CoverageResult[];
  results: KitchenResult[];
};

const root = fileURLToPath(new URL("..", import.meta.url));
const nextBin = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
// the first request compiles the whole eval, which takes a while on a cold machine
const LIMIT_MS = 5 * 60_000;

let server: ChildProcess | null = null;
let log = "";

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const at = probe.address();
      const port = typeof at === "object" && at ? at.port : 0;
      probe.close(() => (port ? resolve(port) : reject(new Error("No free port on 127.0.0.1"))));
    });
  });
}

// the server gets its own process group. One signal stops next and everything it started
function signal(s: ChildProcess, sig: NodeJS.Signals) {
  try {
    if (process.platform === "win32") s.kill(sig);
    else if (s.pid) process.kill(-s.pid, sig);
  } catch {
    // already stopped
  }
}

async function stopServer() {
  const s = server;
  if (!s) return;
  if (s.exitCode === null && s.signalCode === null) {
    const gone = new Promise((resolve) => s.once("exit", resolve));
    signal(s, "SIGTERM");
    const force = setTimeout(() => signal(s, "SIGKILL"), 5000);
    await gone;
    clearTimeout(force);
  }
  signal(s, "SIGKILL");
}

const short = (v: unknown) => {
  const s = JSON.stringify(v) ?? String(v);
  return s.length > 300 ? `${s.slice(0, 300)}...` : s;
};

async function fetchEval(url: string): Promise<EvalAnswer> {
  const deadline = Date.now() + LIMIT_MS;
  while (Date.now() < deadline) {
    if (server && (server.exitCode !== null || server.signalCode !== null)) throw new Error("The dev server stopped before the eval ran");
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) });
    } catch {
      // not listening yet
      await new Promise((r) => setTimeout(r, 500));
      continue;
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`The eval answered ${res.status}: ${short(text)}`);
    return JSON.parse(text) as EvalAnswer;
  }
  throw new Error(`No answer from the dev server within ${LIMIT_MS / 60_000} minutes`);
}

async function main(): Promise<boolean> {
  const port = await freePort();
  // the eval answers only in development
  const env = { ...process.env, NODE_ENV: "development" as const, NEXT_TELEMETRY_DISABLED: "1" };
  console.log(`Starting the dev server on 127.0.0.1:${port}`);
  server = spawn(process.execPath, [nextBin, "dev", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  const keep = (chunk: Buffer) => {
    log = (log + chunk.toString()).slice(-20_000);
  };
  server.stdout?.on("data", keep);
  server.stderr?.on("data", keep);

  const r = await fetchEval(`http://127.0.0.1:${port}/api/dev/eval`);
  if (typeof r.passed !== "number" || typeof r.unitPassed !== "number" || !Array.isArray(r.results)) throw new Error(`Unexpected eval answer: ${short(r)}`);

  console.log(`Scripted kitchens: ${r.passed} of ${r.total} passed`);
  for (const k of r.results.filter((x) => !x.pass)) console.log(`  ${k.id} (${k.title}): expected ${k.expect}, got ${k.got}. ${k.reasons.join(" ")}`);
  console.log(`Unit checks: ${r.unitPassed} of ${r.unitTotal} passed`);
  for (const u of r.unitFailures) console.log(`  ${u.name}\n    got  ${short(u.got)}\n    want ${short(u.want)}`);
  console.log(`Script coverage: ${r.coverageOk ? "every cuisine's script asks every required question" : "FAILED"}`);
  for (const c of r.coverage.filter((x) => x.tooMany || x.missing.length)) {
    console.log(`  ${c.cuisine}: ${c.tooMany ? "too many checks for one call. " : ""}${c.missing.length ? `Never asked: ${c.missing.join(" ")}` : ""}`);
  }
  return r.total > 0 && r.unitTotal > 0 && r.passed === r.total && r.unitPassed === r.unitTotal && r.coverageOk;
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    void stopServer().finally(() => process.exit(1));
  });
}

main().then(
  async (ok) => {
    await stopServer();
    console.log(ok ? "All checks passed" : "Some checks failed");
    process.exit(ok ? 0 : 1);
  },
  async (e: unknown) => {
    await stopServer();
    console.error(`npm test could not run the eval: ${e instanceof Error ? e.message : String(e)}`);
    if (log.trim()) console.error(`\nLast dev server output:\n${log}`);
    process.exit(1);
  },
);
