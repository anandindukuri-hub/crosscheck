"use client";

import { Mic } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api, Button, errText } from "../../ui";

// The join link works once and expires in 10 minutes, so it goes straight into the new tab and nowhere else
export function TalkToFo() {
  const [opening, setOpening] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad: boolean; setup?: boolean } | null>(null);

  async function start() {
    setMsg(null);
    // open the tab inside the click so pop up blockers allow it, then point it at the call
    const w = window.open("about:blank", "_blank");
    if (w) {
      w.opener = null;
      try {
        w.document.title = "Connecting to Fo";
        w.document.body.textContent = "Connecting you to Fo…";
      } catch {}
    }
    setOpening(true);
    try {
      const { joinUrl } = await api<{ joinUrl: string }>("/api/fo/call", {});
      if (w && !w.closed) w.location.href = joinUrl;
      else {
        const w2 = window.open(joinUrl, "_blank");
        if (!w2) throw new Error("Your browser blocked the new tab. Allow pop ups for this site and tap Talk to Fo again.");
        w2.opener = null;
      }
      setMsg({ text: "Your call with Fo opened in a new tab.", bad: false });
    } catch (e) {
      w?.close();
      const text = errText(e);
      const auth = /sign|auth|token|401|unauthor/i.test(text);
      setMsg({ text: auth ? "Fo is not connected yet." : text, bad: true, setup: auth });
    } finally {
      setOpening(false);
    }
  }

  return (
    <>
      <Button variant="plain" onClick={start} disabled={opening} title="Opens a live voice call with Fo in a new tab">
        <Mic size={18} strokeWidth={1.75} aria-hidden />
        {opening ? "Connecting…" : "Talk to Fo"}
      </Button>
      {msg && (
        <p role={msg.bad ? "alert" : "status"} className={`type-footnote basis-full px-2 ${msg.bad ? "text-nomatch" : "text-ink-2"}`}>
          {msg.text}
          {msg.setup && (
            <>
              {" "}
              <Link href="/setup" className="font-semibold text-link hover:underline">
                Connect Fo in Setup
              </Link>
            </>
          )}
        </p>
      )}
    </>
  );
}
