import type { Metadata } from "next";
import { SetupFlow } from "@/components/setup/SetupFlow";

export const metadata: Metadata = { title: "Setup" };

export default function SetupPage() {
  return (
    <div className="wrap py-10 md:py-16">
      <SetupFlow />
    </div>
  );
}
