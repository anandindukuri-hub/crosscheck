"use client";

import { Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useIsClient, usePhone } from "../kit/useMedia";
import { useLiveActive } from "../run/liveStore";
import { StatusBar } from "../StatusBar";
import { useDevMode } from "../useDevMode";
import { setupGaps, useStatus } from "../useStatus";

const NAV = [
  { href: "/new", label: "Start a table" },
  { href: "/run", label: "Your tables" },
  { href: "/ledger", label: "Kitchen answers" },
];

const isOn = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

// On "/" the nav reads the scene under it: dark glass over the dark scenes, light glass over [data-theme="light"]
function useSceneUnderNav(active: boolean) {
  const [light, setLight] = useState(false);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const check = () => {
      raf = 0;
      const y = 26;
      const hit = [...document.querySelectorAll<HTMLElement>('[data-theme="light"]')].some((el) => {
        const r = el.getBoundingClientRect();
        return r.top <= y && r.bottom >= y;
      });
      setLight(hit);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [active]);
  return active && light;
}

export function Nav({ dark: launch, path }: { dark: boolean; path: string }) {
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(path);
  if (lastPath !== path) {
    setLastPath(path);
    setOpen(false);
  }
  const overLight = useSceneUnderNav(launch);
  const dark = launch && !overLight;
  // on phones the Live Activity pill takes the middle of the bar, so the wordmark steps aside first
  const phone = usePhone();
  const live = useLiveActive();
  const yield_ = phone && live && !launch;
  const client = useIsClient();
  const { data: status } = useStatus();
  const dev = useDevMode();
  // setup status is a developer's concern: it shows in the bar only with developer modes on and something left to do.
  // Otherwise the phone bar carries the one action, where the launch page carries Start a table
  const setupLeft = dev && !!status && setupGaps(status).length > 0;

  // the centered pill may grow only until it would reach the links on its right
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const fit = () => {
      const links = el.querySelector<HTMLElement>("nav[aria-label=Main]");
      const slot = el.querySelector<HTMLElement>("#nav-live");
      if (!slot) return;
      const r = links && links.offsetParent ? links.getBoundingClientRect() : null;
      const room = r ? Math.max(160, 2 * (r.left - window.innerWidth / 2) - 24) : 360;
      slot.style.setProperty("--pill-max", `${Math.min(360, room)}px`);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    // the setup chip arriving moves the links without resizing the bar
    const status = el.querySelector("[data-nav-status]");
    if (status) ro.observe(status);
    return () => ro.disconnect();
  }, [setupLeft, path]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      root.style.overflow = prev;
    };
  }, [open]);

  const ink = dark ? "text-dark-ink" : "text-ink";
  const ink2 = dark ? "text-dark-ink-2 hover:text-dark-ink" : "text-ink-2 hover:text-ink";

  return (
    <header
      data-nav
      className={`sticky top-0 z-50 border-b print:hidden ${dark ? "glass-dark border-dark-hairline" : "glass border-hairline"}`}
      style={open ? { background: dark ? "#000000" : "#f5f5f7" } : undefined}
    >
      {/* one global bar on every page: the launch's 1200 column, so the wordmark never jumps on a cut from "/" to the app */}
      <div ref={bar} className="wrap-launch relative flex h-[52px] items-center gap-6">
        <motion.span initial={false} animate={{ opacity: yield_ ? 0 : 1 }} transition={{ duration: 0.15 }} className={yield_ ? "pointer-events-none" : ""}>
          <Link href="/" translate="no" data-nav-mark tabIndex={yield_ ? -1 : undefined} className={`-ml-1 rounded-control px-1 text-[19px] font-semibold tracking-[-0.02em] ${ink}`}>
            CrossCheck
          </Link>
        </motion.span>
        <div id="nav-live" className="pointer-events-none absolute inset-x-0 top-0 flex h-full items-center justify-center" />
        <nav aria-label="Main" className="ml-auto hidden items-center gap-1 lg:flex">
          {(launch ? NAV.filter((n) => n.href !== "/new") : NAV).map((n) => {
            const on = isOn(path, n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={on ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-full px-3 text-[13px] ${on ? `${ink} font-medium` : ink2}`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div
          data-nav-status
          className={`ml-auto flex items-center lg:ml-2 lg:has-[a]:border-l lg:has-[a]:pl-4 ${dark ? "lg:border-dark-hairline" : "lg:border-hairline"}`}
        >
          {launch ? (
            <Link
              href="/new"
              className="inline-flex h-7 items-center rounded-full bg-accent px-3 text-[13px] font-semibold text-white hover:bg-accent-hover"
            >
              Start a table
            </Link>
          ) : (
            <motion.span initial={false} animate={{ opacity: yield_ ? 0 : 1 }} transition={{ duration: 0.15 }} className={yield_ ? "pointer-events-none" : ""}>
              {setupLeft ? (
                <StatusBar />
              ) : (
                path !== "/new" && (
                  <Link
                    href="/new"
                    tabIndex={yield_ ? -1 : undefined}
                    className="inline-flex h-7 items-center rounded-full bg-accent px-3 text-[13px] font-semibold text-white hover:bg-accent-hover lg:hidden"
                  >
                    Start a table
                  </Link>
                )
              )}
            </motion.span>
          )}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="nav-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className={`-mr-2 ml-1 grid h-11 w-11 place-items-center rounded-full lg:hidden ${ink}`}
          >
            {open ? <X size={20} strokeWidth={1.75} aria-hidden /> : <Menu size={20} strokeWidth={1.75} aria-hidden />}
          </button>
        </div>
      </div>
      {client &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.nav
                id="nav-menu"
                aria-label="Main"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-x-0 top-[52px] bottom-0 z-[45] overflow-y-auto lg:hidden"
                style={{ background: dark ? "#000000" : "#f5f5f7" }}
              >
                <ul className="wrap-launch pt-4 pb-10">
                  {/* the same four items on every page; the current one carries an accent dot instead of greying the rest */}
                  {NAV.concat({ href: "/setup", label: "Setup" }).map((n, i) => {
                    const on = isOn(path, n.href);
                    return (
                      <motion.li key={n.href} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i, duration: 0.25 }}>
                        <Link
                          href={n.href}
                          aria-current={on ? "page" : undefined}
                          onClick={() => setOpen(false)}
                          className={`flex min-h-12 items-center gap-3 py-1 text-[28px] leading-[1.2] font-semibold tracking-[-0.02em] ${dark ? "text-dark-ink" : "text-ink"}`}
                        >
                          {n.label}
                          {on && <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dark ? "var(--dark-accent)" : "var(--accent)" }} />}
                        </Link>
                      </motion.li>
                    );
                  })}
                </ul>
              </motion.nav>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </header>
  );
}
