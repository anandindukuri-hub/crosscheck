import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "./env";
import type { Lane, Run } from "./types";

const dir = (...p: string[]) => path.join(env.dataDir(), ...p);

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

// write to a temp file then rename, so a crash never leaves half a file
export async function writeJson(file: string, data: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2));
  await rename(tmp, file);
}

const runFile = (id: string) => dir("runs", id, "run.json");
const laneFile = (runId: string, laneId: string) => dir("runs", runId, "lanes", `${laneId}.json`);

export const saveRun = (run: Run) => writeJson(runFile(run.id), run);
export const loadRun = (id: string) => readJson<Run | null>(runFile(safeId(id)), null);
export const saveLane = (lane: Lane) => writeJson(laneFile(lane.runId, lane.id), lane);
export const loadLane = (runId: string, laneId: string) => readJson<Lane | null>(laneFile(safeId(runId), safeId(laneId)), null);

export async function loadLanes(run: Run) {
  const lanes = await Promise.all(run.laneIds.map((id) => loadLane(run.id, id)));
  return lanes.filter((l): l is Lane => !!l);
}

const ID = /^[a-zA-Z0-9_-]{1,64}$/;

// root: the runs folder (a temp folder in the dev eval). Strays such as .DS_Store are skipped, never fatal
export async function listRuns(root = dir("runs")): Promise<Run[]> {
  try {
    const ids = (await readdir(root)).filter((id) => ID.test(id));
    const runs = await Promise.all(ids.map((id) => readJson<Run | null>(path.join(root, id, "run.json"), null)));
    return runs.filter((r): r is Run => !!r).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export function safeId(id: string) {
  if (!ID.test(id)) throw new Error("bad id");
  return id;
}

export const dataPath = dir;
