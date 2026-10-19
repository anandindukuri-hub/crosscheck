"use client";

import { MotionConfig } from "motion/react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Footer } from "./Footer";
import { Nav } from "./Nav";

// "/" is the dark launch page: dark glass nav, dark footer and a transparent page area it paints itself.
// Everywhere else is the light app on #f5f5f7.
export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname() ?? "";
  const dark = path === "/";
  return (
    <MotionConfig reducedMotion="user">
      <div data-surface={dark ? "dark" : "light"} className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className={`sr-only z-[70] rounded-full px-4 py-2 text-sm font-semibold focus:not-sr-only focus:fixed focus:left-3 focus:top-3 ${dark ? "bg-dark-panel text-dark-ink" : "bg-surface text-ink shadow-card"}`}
        >
          Skip to content
        </a>
        <Nav dark={dark} path={path} />
        <main id="main" tabIndex={-1} className={`flex-1 outline-none ${dark ? "bg-transparent" : ""}`}>
          {children}
        </main>
        <Footer dark={dark} path={path} />
      </div>
    </MotionConfig>
  );
}
