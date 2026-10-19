"use client";

import { useState } from "react";
import { api, errText } from "../ui";

export type Act = (body: Record<string, unknown>) => Promise<boolean>;

// one lane action at a time, with its error kept beside the button that sent it
export function useLaneAct(runId: string, laneId: string, onChange: () => void) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const act: Act = async (body) => {
    setErr(null);
    setBusy(true);
    try {
      await api(`/api/runs/${runId}/lanes/${laneId}`, body);
      onChange();
      return true;
    } catch (e) {
      setErr(errText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { act, busy, err };
}
