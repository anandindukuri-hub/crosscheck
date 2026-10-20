// Real Fo work runs one lane at a time (parallel calls are unproven). A lane is pending from before its
// first await until its turn comes, then active while it runs, so no button or Resume can queue it twice.
// stopping: lanes Stop all calls reached mid turn. Their turn ends at the next poll and Fo is told to stop
export type Registry = { active: Set<string>; pending: Set<string>; stopping: Set<string>; chain: Promise<unknown>; locks: Map<string, Promise<unknown>> };

export const newRegistry = (): Registry => ({ active: new Set(), pending: new Set(), stopping: new Set(), chain: Promise.resolve(), locks: new Map() });

export const busy = (reg: Registry, laneId: string) => reg.active.has(laneId) || reg.pending.has(laneId);

export function enqueue(reg: Registry, job: () => Promise<void>) {
  reg.chain = reg.chain.then(job).catch(() => undefined);
}

export class BusyError extends Error {
  constructor() {
    super("Fo is still busy with this restaurant");
  }
}

// prepare saves what the job needs (the message or the queued status); a failed save frees the lane again.
// A lane already queued or running is refused, so one request never reaches Fo twice. claimed: the caller took
// the lane with its own busy check first and still holds it
export async function hold(reg: Registry, laneId: string, prepare: () => Promise<unknown>, job: () => Promise<void>, claimed = false) {
  if (!claimed && busy(reg, laneId)) throw new BusyError();
  reg.pending.add(laneId);
  try {
    await prepare();
  } catch (e) {
    reg.pending.delete(laneId);
    throw e;
  }
  enqueue(reg, async () => {
    // active before it leaves pending, so a Resume tap in between never finds the lane idle
    reg.active.add(laneId);
    reg.pending.delete(laneId);
    try {
      await job();
    } finally {
      reg.active.delete(laneId);
    }
  });
}
