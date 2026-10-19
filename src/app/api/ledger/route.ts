import { fail, ok } from "@/lib/http";
import { isFresh, readLedgerFile } from "@/lib/ledger";

export async function GET() {
  try {
    const led = await readLedgerFile();
    const now = new Date();
    return ok({
      records: led.records.map((r) => ({ ...r, fresh: isFresh(r, now) })),
      kitchens: led.kitchens.map((k) => ({ ...k, fresh: isFresh(k, now) })),
    });
  } catch (e) {
    return fail(e);
  }
}
