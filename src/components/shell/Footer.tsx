"use client";

import Link from "next/link";
import { useDevMode } from "../useDevMode";
import { DISCLAIMER } from "@/lib/note";
import { smart } from "../kit/typo";

// The disclaimer shows once per view: the launch page says it under its last call to action, and a table or a
// pass carries it beside the verdict, so the footer only says it on the other pages
export function Footer({ dark, path }: { dark: boolean; path: string }) {
  const ink2 = dark ? "text-dark-ink-2" : "text-ink-2";
  const hover = dark ? "hover:text-dark-ink" : "hover:text-ink";
  const ownDisclaimer = path === "/" || path.startsWith("/run/") || path.startsWith("/card/");
  // developer setup is for whoever runs CrossCheck from source: it shows only with developer modes on, never on "/"
  const dev = useDevMode() && path !== "/";
  return (
    <footer className={`print:hidden ${dark ? "bg-dark-page" : ""}`}>
      <div className={`type-caption py-8 ${ink2} ${dark ? "wrap-launch" : "wrap"}`}>
        <div className={`border-t pt-5 ${dark ? "border-dark-hairline" : "border-hairline"}`}>
          {!ownDisclaimer && <p className="max-w-3xl">{smart(DISCLAIMER)}</p>}
          <div className={`flex flex-wrap items-center gap-x-5 gap-y-1 ${ownDisclaimer ? "" : "mt-3"}`}>
            <span className="flex gap-x-4">
              {[
                ["Privacy", "/privacy"],
                ["Terms", "/privacy#terms"],
                ["Contact", "/privacy#contact"],
              ].map(([label, href]) => (
                <Link key={label} href={href} className={`inline-flex min-h-11 items-center hover:underline sm:min-h-0 ${hover}`}>
                  {label}
                </Link>
              ))}
            </span>
            <span>Restaurant data © OpenStreetMap contributors (ODbL)</span>
            <span className="flex gap-x-4 sm:ml-auto">
              <Link href="/setup" className={`inline-flex min-h-11 items-center hover:underline sm:min-h-0 ${hover}`}>
                Setup
              </Link>
              {dev && (
                <Link href="/setup/developer" className={`inline-flex min-h-11 items-center hover:underline sm:min-h-0 ${hover}`}>
                  Developer setup
                </Link>
              )}
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
