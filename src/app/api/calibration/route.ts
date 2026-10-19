import { calibrationLines } from "@/lib/calibration";
import { buildChecks } from "@/lib/checks";
import { HERO } from "@/lib/dev/cases";
import { createCalibrationRun } from "@/lib/engine";
import { fail, ok } from "@/lib/http";
import { fidelityStatus } from "@/lib/settings";

// GET: what Anand will say on the calibration call, plus where fidelity stands now
export async function GET() {
  try {
    return ok({ lines: calibrationLines(buildChecks(HERO, "thai")), ...(await fidelityStatus()) });
  } catch (e) {
    return fail(e);
  }
}

// POST: creates the calibration test run. It still needs the normal approval before Fo calls anyone.
export async function POST() {
  try {
    const run = await createCalibrationRun();
    return ok({ id: run.id });
  } catch (e) {
    return fail(e);
  }
}
