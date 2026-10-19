"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

// a terminal command with a copy button
export function Command({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-input bg-ink py-1.5 pr-1.5 pl-4 text-white">
      <span aria-hidden className="font-mono text-[15px] text-white/45">
        $
      </span>
      <code className="flex-1 font-mono text-[15px]">{text}</code>
      <button
        type="button"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-control px-3 text-[13px] font-medium text-white/80 hover:bg-white/10 hover:text-white"
        onClick={() =>
          navigator.clipboard
            ?.writeText(text)
            .then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
            .catch(() => undefined)
        }
      >
        {copied ? <Check size={16} strokeWidth={2} aria-hidden /> : <Copy size={16} strokeWidth={1.75} aria-hidden />}
        <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
      </button>
    </div>
  );
}
