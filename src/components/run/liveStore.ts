"use client";

import { useSyncExternalStore } from "react";

// whether a Live Activity pill is on screen, so the nav can make room for it in the same frame
let active = false;
const subs = new Set<() => void>();

export function setLiveActive(v: boolean) {
  if (active === v) return;
  active = v;
  subs.forEach((f) => f());
}

export function useLiveActive() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => void subs.delete(f);
    },
    () => active,
    () => false,
  );
}
