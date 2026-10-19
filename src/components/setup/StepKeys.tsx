"use client";

import type { ReactNode } from "react";
import { Disclosure } from "../kit/Disclosure";
import { StateDot } from "../kit/State";
import type { AppStatus } from "../useStatus";

// one row straight on the sheet: the name on the left, a dot and a word on the right
export function StatusRow({ name, line, ok, okWord = "Added", missingWord = "Not added" }: { name: string; line?: ReactNode; ok: boolean; okWord?: string; missingWord?: string }) {
  return (
    <li className="flex flex-col gap-1 py-3.5 sm:flex-row sm:items-start sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-[17px] font-semibold">{name}</p>
        {line && <p className="type-footnote mt-0.5 text-ink-2">{line}</p>}
      </div>
      <span className={`type-callout inline-flex shrink-0 items-center gap-2 sm:pt-0.5 ${ok ? "font-semibold text-ink" : "text-ink-2"}`}>
        {ok ? <StateDot tone="matched" /> : <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-ink-3" />}
        {ok ? okWord : missingWord}
      </span>
    </li>
  );
}

// rows sit on the card itself, hairlines only between them, so no rule ever doubles a card edge
export function Rows({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <ul className={`divide-y divide-hairline ${className}`}>{children}</ul>;
}

const KEYS = [
  { id: "claude", name: "Claude key", env: "ANTHROPIC_API_KEY", where: "platform.claude.com", href: "https://platform.claude.com", why: "Reads every answer Fo brings back." },
  { id: "jev", name: "Jev key", env: "TYPESAFE_API_KEY", where: "the Jev console", href: "https://console.typesafe.ai", why: "Scores how sure it is of each answer." },
  { id: "testPhone", name: "Your phone", env: "FO_TEST_PHONE", where: null, href: null, why: "Test calls and the practice call ring it. You play the kitchen." },
] as const;

// the developer page: each value, its status and where it comes from, with the names behind a disclosure
export function KeysList({ keys }: { keys: AppStatus["keys"] }) {
  return (
    <>
      <Rows>
        {KEYS.map((k) => (
          <StatusRow key={k.id} name={k.name} line={k.why} ok={keys[k.id]} />
        ))}
      </Rows>
      <div>
        <Disclosure summary="Show technical details" className="border-t border-hairline">
          <div className="type-callout space-y-2 text-ink-2">
            <p>
              Copy <code className="font-mono text-[13px] text-ink">.env.example</code> to <code className="font-mono text-[13px] text-ink">.env.local</code> in the crosscheck folder and fill
              in these values, then restart the app.
            </p>
            <ul className="space-y-1">
              {KEYS.map((k) => (
                <li key={k.id}>
                  <code className="font-mono text-[13px] text-ink">{k.env}</code>
                  {k.href && (
                    <>
                      {" "}
                      from{" "}
                      <a href={k.href} target="_blank" rel="noreferrer" className="text-link hover:underline">
                        {k.where}
                      </a>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </Disclosure>
      </div>
    </>
  );
}
