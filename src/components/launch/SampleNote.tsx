"use client";

import { useStatus } from "../useStatus";

// under the last call to action: while real calls are off, say plainly that the first table is a sample
export function SampleNote() {
  const { data: s } = useStatus();
  const live = !!s && s.fo.signedIn && s.keys.claude && s.keys.jev;
  if (!s || live) return null;
  return <p className="mt-3 text-center text-[13px] text-dark-ink-3">Starts with a sample table. No calls are made.</p>;
}
