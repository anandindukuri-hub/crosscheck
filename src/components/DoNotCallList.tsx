"use client";

import { useState } from "react";
import type { DoNotCall } from "@/lib/donotcall";
import { fmtDate } from "@/lib/labels";
import { api, Button, errText } from "./ui";

// Kitchens that asked on a call not to be called again. CrossCheck refuses a real call to them
export function DoNotCallList({ initial }: { initial: DoNotCall[] }) {
  const [list, setList] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  if (!list.length) return null;

  async function remove(phone: string) {
    setError(null);
    try {
      await api("/api/donotcall", { phone });
      setList((l) => l.filter((d) => d.phone !== phone));
    } catch (e) {
      setError(errText(e));
    }
  }

  return (
    <section aria-labelledby="dnc-h" className="mt-12">
      <h2 id="dnc-h" className="type-headline">Asked not to be called</h2>
      <p className="type-callout mt-1 text-ink-2">These kitchens said on a call that they would rather not get calls like this. CrossCheck will not call them. Take one off only if they tell you calls are fine again.</p>
      <ul className="card mt-4 divide-y divide-hairline overflow-hidden">
        {list.map((d) => (
          <li key={d.phone} className="flex min-h-12 items-center gap-3 px-6 py-3 md:px-8">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium">{d.name}</span>
              <span className="type-footnote block text-ink-2">Asked on {fmtDate(d.at)}</span>
            </span>
            <Button variant="plain" size="sm" onClick={() => remove(d.phone)}>
              Take off the list
            </Button>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="type-footnote mt-2 text-nomatch">{error}</p>}
    </section>
  );
}
