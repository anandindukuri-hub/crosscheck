// Runs once when the server starts. Lanes a restart left mid step wait for a Resume tap, and a saved stop goes out.
// Never during a build, and it never holds up the server: the stops go out in the background
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { recoverAfterRestart } = await import("./lib/engine");
  void recoverAfterRestart().catch((e) => console.error("CrossCheck restart check failed", e));
}
