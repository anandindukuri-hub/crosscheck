import type { Metadata } from "next";
import { whenText } from "@/components/kit/typo";
import { loadRun } from "@/lib/store";

// the tab says the table's time, the same words as the page heading, so it never flips while the page polls
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const run = await loadRun(id).catch(() => null);
  if (!run) return { title: "Your table" };
  return { title: run.purpose === "calibration" ? "Practice call" : whenText(run.when) };
}

export default function RunLayout({ children }: { children: React.ReactNode }) {
  return children;
}
