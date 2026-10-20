"use client";

import { useEffect, useSyncExternalStore } from "react";
import { api, errText } from "./ui";

export type AppStatus = {
  fo: { signedIn: boolean; tools: string[]; error: string | null };
  keys: { claude: boolean; jev: boolean; testPhone: boolean; fidelity: "verified" | "unverified" };
  live?: { openRun: { id: string; when: string } | null; production: boolean; doNotCall: number };
};

type Snap = { data: AppStatus | null; error: string | null; at: number };

// one shared /api/status poll for the header and the setup page
let snap: Snap = { data: null, error: null, at: 0 };
let inflight: Promise<void> | null = null;
const subs = new Set<() => void>();
const SERVER: Snap = { data: null, error: null, at: 0 };

export function refreshStatus() {
  inflight ??= api<AppStatus>("/api/status")
    .then((data) => void (snap = { data, error: null, at: Date.now() }))
    .catch((e) => void (snap = { ...snap, error: errText(e), at: Date.now() }))
    .finally(() => {
      inflight = null;
      subs.forEach((f) => f());
    });
  return inflight;
}

const subscribe = (f: () => void) => {
  subs.add(f);
  return () => void subs.delete(f);
};

export function useStatus(everyMs = 20_000) {
  const s = useSyncExternalStore(subscribe, () => snap, () => SERVER);
  useEffect(() => {
    const tick = () => {
      if (Date.now() - snap.at > everyMs / 2) void refreshStatus();
    };
    tick();
    const t = setInterval(tick, everyMs);
    const onFocus = () => void refreshStatus();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [everyMs]);
  return s;
}

export function setupGaps(s: AppStatus | null) {
  if (!s) return [];
  const gaps: string[] = [];
  if (!s.keys.claude) gaps.push("Claude key");
  if (!s.keys.jev) gaps.push("Jev key");
  if (!s.keys.testPhone) gaps.push("test phone");
  if (!s.fo.signedIn) gaps.push("Fo sign in");
  if (s.keys.fidelity !== "verified") gaps.push("calibration call");
  return gaps;
}
