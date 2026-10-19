"use client";

import { Moon, Printer, Sun } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { PassGuest } from "./launch/WalletPass";
import { useIsClient } from "./kit/useMedia";
import { Button } from "./ui";

type WakeLock = { release: () => Promise<void> };
type WakeNav = Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLock> } };

const SEV_LIGHT: Record<string, string> = { "Life threatening": "#d70015", Severe: "#b25000", Mild: "#6e6e73" };
const SEV_DARK: Record<string, string> = { "Life threatening": "#ff453a", Severe: "#ff9f0a", Mild: "#a1a1a6" };

// "Show to server": its own view for the one moment a server reads the phone at arm's length. The life
// threatening guest first on a tinted row, each allergy as big as a headline, nothing else. The screen stays awake.
export function ServerView({ restaurant, time, guests, sample }: { restaurant: string; time: string; guests: PassGuest[]; sample?: boolean }) {
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const client = useIsClient();

  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    let lock: WakeLock | null = null;
    let alive = true;
    (navigator as WakeNav).wakeLock
      ?.request("screen")
      .then((l) => (alive ? (lock = l) : void l.release()))
      .catch(() => undefined);
    return () => {
      alive = false;
      root.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
      void lock?.release().catch(() => undefined);
    };
  }, [open]);

  const ink = dark ? "#f5f5f7" : "#1d1d1f";
  const ink2 = dark ? "#a1a1a6" : "#6e6e73";
  const line = dark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.1)";
  const sev = dark ? SEV_DARK : SEV_LIGHT;

  return (
    <>
      <Button size="lg" onClick={() => setOpen(true)} className="w-full print:hidden">
        Show to server
      </Button>
      {client &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-label={`Allergies for ${restaurant}`}
                className="fixed inset-0 z-[80] overflow-y-auto overscroll-contain"
                style={{ background: dark ? "#000000" : "#ffffff", color: ink }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="mx-auto max-w-[880px] px-5 pt-3 pb-16 md:px-12 md:pt-6">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setDark((d) => !d)}
                      aria-pressed={dark}
                      aria-label={dark ? "Use a white background" : "Use a black background"}
                      className="grid h-11 w-11 place-items-center rounded-full"
                      style={{ color: ink2 }}
                    >
                      {dark ? <Sun size={20} strokeWidth={1.75} aria-hidden /> : <Moon size={20} strokeWidth={1.75} aria-hidden />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      autoFocus
                      className="-mr-2 inline-flex min-h-11 items-center rounded-control px-3 text-[17px] font-semibold"
                      style={{ color: dark ? "#2997ff" : "#0066cc" }}
                    >
                      Done
                    </button>
                  </div>

                  <motion.div initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 380, damping: 32 }}>
                    <p className="mt-4 text-[15px] leading-[1.4]" style={{ color: ink2 }}>
                      {sample ? "Sample · " : ""}
                      {restaurant} · {time}
                    </p>
                    <ul className="mt-6">
                      {guests.map((g) => {
                        const life = g.needs.some((n) => n.severity === "Life threatening");
                        return (
                        // every guest is a card; only a life threatening allergy gets the tint
                        <li
                          key={g.name}
                          className="mb-4 rounded-[20px] p-4 md:p-6"
                          style={life ? { background: dark ? "rgba(255,69,58,0.16)" : "#fdecec" } : { background: dark ? "#1c1c1e" : "#ffffff", boxShadow: `inset 0 0 0 1px ${line}` }}
                        >
                          <p className="text-[15px] font-medium md:text-[17px]" style={{ color: ink2 }}>
                            {g.name}
                          </p>
                          {g.needs
                            .filter((n) => !n.diet)
                            .map((n) => (
                              <div key={n.text} className="mt-3">
                                {n.severity && (
                                  <p className="flex items-center gap-2 text-[17px] leading-[1.3] font-semibold" style={{ color: sev[n.severity] ?? ink2 }}>
                                    <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: sev[n.severity] ?? ink2 }} />
                                    {n.severity}
                                  </p>
                                )}
                                <p className="text-[40px] leading-[1.05] font-bold tracking-[-0.02em] [text-wrap:balance] md:text-[56px]">{n.text}</p>
                              </div>
                            ))}
                          {g.needs
                            .filter((n) => n.diet)
                            .map((n) => (
                              <div key={n.text} className="mt-4">
                                <p className="text-[17px] leading-[1.3] font-semibold" style={{ color: ink2 }}>
                                  {n.diet!.label}
                                </p>
                                <p className="text-[24px] leading-[1.2] font-semibold tracking-[-0.01em] md:text-[32px]">{n.diet!.line}</p>
                              </div>
                            ))}
                          {/* the match holds only for the dishes the kitchen suggested, so that is what the server rings in */}
                          {g.dish && (
                            <div className="mt-4">
                              <p className="text-[13px] leading-[1.38] font-semibold" style={{ color: ink2 }}>
                                Will order only
                              </p>
                              <p className="mt-0.5 text-[24px] leading-[1.2] font-semibold tracking-[-0.01em] md:text-[28px]">{g.dish.charAt(0).toUpperCase() + g.dish.slice(1)}</p>
                            </div>
                          )}
                        </li>
                        );
                      })}
                    </ul>
                    <p className="border-t pt-6 text-[17px] leading-[1.4] font-medium md:text-[21px]" style={{ borderColor: line, color: ink2 }}>
                      Please confirm with the chef before cooking.
                    </p>
                  </motion.div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}

export function PrintIcon() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      aria-label="Print the pass"
      className="grid h-11 w-11 place-items-center rounded-full text-ink-2 hover:bg-fill hover:text-ink"
    >
      <Printer size={20} strokeWidth={1.75} aria-hidden />
    </button>
  );
}
