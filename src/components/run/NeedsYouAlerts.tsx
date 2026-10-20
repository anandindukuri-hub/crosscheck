"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { Bell, X } from "lucide-react";
import { listJoin } from "@/lib/labels";
import { engineText } from "../kit/typo";
import { Button } from "../ui";

type Perm = NotificationPermission | "unsupported";
export type Waiting = { id: string; name: string; question: string | null };

const listeners = new Set<() => void>();
const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};
const getPerm = (): Perm => (typeof Notification === "undefined" ? "unsupported" : Notification.permission);
const serverPerm = (): Perm => "unsupported";

const DISMISSED = "cc-alerts-dismissed";
const readDismissed = () => {
  try {
    return localStorage.getItem(DISMISSED) === "1";
  } catch {
    return false;
  }
};

// One quiet row, once: offer alerts while the browser has not been asked yet. Blocked or on, it says nothing.
export function AlertsRow() {
  const perm = useSyncExternalStore(subscribe, getPerm, serverPerm);
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => true);
  if (perm !== "default" || dismissed) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED, "1");
    } catch {}
    listeners.forEach((f) => f());
  };
  return (
    <div className="card flex items-center gap-3 py-2 pr-2 pl-4">
      <Bell size={18} strokeWidth={1.75} aria-hidden className="shrink-0 text-ink-2" />
      <p className="type-callout min-w-0 flex-1 text-ink">Get an alert when Fo needs you.</p>
      <Button size="sm" variant="plain" onClick={() => void Notification.requestPermission().finally(() => listeners.forEach((f) => f()))}>
        Turn on alerts
      </Button>
      <button type="button" onClick={dismiss} aria-label="Not now" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-fill hover:text-ink">
        <X size={18} strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  );
}

// title, notification and screen reader line whenever a kitchen starts waiting on you
export function NeedsYouAlerts({ waiting, baseTitle }: { waiting: Waiting[]; baseTitle: string }) {
  const seen = useRef<Set<string> | null>(null);
  const count = waiting.length;

  useEffect(() => {
    if (!count) {
      document.title = baseTitle;
      return;
    }
    const alert = `(${count}) Fo needs you · CrossCheck`;
    let on = true;
    document.title = alert;
    const t = setInterval(() => {
      on = document.hidden ? !on : true;
      document.title = on ? alert : baseTitle;
    }, 1200);
    return () => {
      clearInterval(t);
      document.title = baseTitle;
    };
  }, [count, baseTitle]);

  useEffect(() => {
    const ids = new Set(waiting.map((w) => w.id));
    const before = seen.current;
    seen.current = ids;
    if (!before || getPerm() !== "granted" || (!document.hidden && document.hasFocus())) return;
    for (const w of waiting) {
      if (before.has(w.id)) continue;
      const n = new Notification(`Fo needs you: ${w.name}`, { body: engineText(w.question).slice(0, 180) || "Fo is waiting for your answer.", tag: `cc-${w.id}` });
      n.onclick = () => {
        window.focus();
        location.hash = `lane-${w.id}`;
        n.close();
      };
    }
  }, [waiting]);

  return (
    <p className="sr-only" aria-live="polite">
      {count ? `Fo needs you for ${listJoin(waiting.map((w) => w.name))}.` : ""}
    </p>
  );
}

// a notification and screen reader line the moment a kitchen passes every check, so Book is never missed
export function MatchAlert({ matches }: { matches: { id: string; name: string; review: boolean }[] }) {
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = new Set(matches.map((m) => m.id));
    const before = seen.current;
    seen.current = ids;
    if (!before || getPerm() !== "granted" || (!document.hidden && document.hasFocus())) return;
    for (const m of matches) {
      if (before.has(m.id)) continue;
      const n = new Notification(`All checks passed: ${m.name}`, { body: m.review ? "Read each quote, then tap Book to have Fo call back and reserve." : "Tap Book to have Fo call back and reserve the table.", tag: `cc-match-${m.id}` });
      n.onclick = () => {
        window.focus();
        location.hash = `lane-${m.id}`;
        n.close();
      };
    }
  }, [matches]);
  return (
    <p className="sr-only" aria-live="polite">
      {matches.length ? `All checks passed for ${listJoin(matches.map((m) => m.name))}. Book is ready.` : ""}
    </p>
  );
}
