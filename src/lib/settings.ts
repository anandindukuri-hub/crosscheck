import { env } from "./env";
import type { Fidelity } from "./rules";
import { dataPath, readJson, writeJson } from "./store";

export type CalibrationSignals = { format: boolean; hedge: boolean; relay: boolean; sharedFryer: boolean; firstHand: boolean };

export type FidelitySetting = { status: "verified" | "failed"; at: string; runId: string; signals: CalibrationSignals };

export type Settings = { fidelity?: FidelitySetting | null };

const file = () => dataPath("settings.json");

export const readSettings = () => readJson<Settings>(file(), {});

// the latest calibration wins, so a failed rerun after a report format change drops back to unverified
export async function saveFidelity(f: FidelitySetting) {
  const s = await readSettings();
  await writeJson(file(), { ...s, fidelity: f });
}

type FidelityStatus = { fidelity: Fidelity; source: "env" | "calibration" | null; calibration: FidelitySetting | null };

// verified only from a passed calibration saved here; FO_REPORT_FIDELITY=force_unverified can force it back, never forward
export function fidelityFrom(forceUnverified: boolean, calibration: FidelitySetting | null): FidelityStatus {
  if (forceUnverified) return { fidelity: "unverified", source: "env", calibration };
  if (calibration?.status === "verified") return { fidelity: "verified", source: "calibration", calibration };
  return { fidelity: "unverified", source: null, calibration };
}

export async function fidelityStatus(): Promise<FidelityStatus> {
  return fidelityFrom(env.forceUnverified(), (await readSettings()).fidelity ?? null);
}

export async function currentFidelity(): Promise<Fidelity> {
  return (await fidelityStatus()).fidelity;
}
