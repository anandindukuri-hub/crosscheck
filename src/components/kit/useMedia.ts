"use client";

import { useSyncExternalStore } from "react";

// a media query as state; false on the server
export function useMedia(query: string) {
  return useSyncExternalStore(
    (f) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", f);
      return () => m.removeEventListener("change", f);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const usePhone = () => useMedia("(max-width: 767px)");

const noop = () => () => {};
// true once hydrated, so portals never render on the server
export const useIsClient = () => useSyncExternalStore(noop, () => true, () => false);

// smooth scrolling only when the viewer has not asked for less motion
export const scrollBehavior = (): ScrollBehavior => (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");
