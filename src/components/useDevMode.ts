"use client";

import { useSyncExternalStore } from "react";

// Developer modes (test calls to your own phone and scripted replays) stay hidden until turned on in Developer setup.
// A per browser convenience, so it lives in localStorage and every read is guarded.
const KEY = "cc-dev";
const subs = new Set<() => void>();

function read() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setDevMode(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {}
  subs.forEach((f) => f());
}

export function useDevMode() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      const onStorage = (e: StorageEvent) => e.key === KEY && f();
      window.addEventListener("storage", onStorage);
      return () => {
        subs.delete(f);
        window.removeEventListener("storage", onStorage);
      };
    },
    read,
    () => false,
  );
}
