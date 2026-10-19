import path from "node:path";

// Keys live in .env.local (never committed). Missing keys disable a feature with a clear message.
export const env = {
  anthropicKey: () => process.env.ANTHROPIC_API_KEY?.trim() || null,
  jevKey: () => process.env.TYPESAFE_API_KEY?.trim() || null,
  jevModel: () => process.env.JEV_MODEL?.trim() || "jev-1.13.0",
  claudeModel: () => process.env.CLAUDE_MODEL?.trim() || "claude-opus-5-5",
  testPhone: () => process.env.FO_TEST_PHONE?.trim() || null,
  // only force_unverified pushes back to unverified ("unverified" or empty change nothing). Only a passed calibration verifies (settings.ts)
  forceUnverified: () => process.env.FO_REPORT_FIDELITY?.trim().toLowerCase() === "force_unverified",
  dataDir: () => path.join(process.cwd(), ".data"),
};

export function keyStatus() {
  return {
    claude: !!env.anthropicKey(),
    jev: !!env.jevKey(),
    testPhone: !!env.testPhone(),
  };
}
