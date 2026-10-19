import { fail, jsonBody, ok } from "@/lib/http";
import { isFresh, readLedgerFile, type KitchenMemory } from "@/lib/ledger";
import { AddRestaurant, addRestaurant, listRestaurants, restaurantMeta } from "@/lib/restaurants";

// the restaurants you added first (added: true), then the test kitchens and the Madison quick picks
export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const list = await listRestaurants(u.searchParams.get("q") ?? "", u.searchParams.get("cuisine") || null, 60);
    // newest fresh kitchen memory per restaurant, so the picker can show "answers on file"
    const memory: Record<string, Pick<KitchenMemory, "decidedAt" | "state" | "mode">> = {};
    const now = new Date();
    for (const k of (await readLedgerFile()).kitchens) {
      if (!isFresh(k, now)) continue;
      const cur = memory[k.restaurantId];
      if (!cur || k.decidedAt > cur.decidedAt) memory[k.restaurantId] = { decidedAt: k.decidedAt, state: k.state, mode: k.mode };
    }
    return ok({ restaurants: list, meta: restaurantMeta, memory });
  } catch (e) {
    return fail(e);
  }
}

// add a restaurant anywhere in the US: { name, phone, cuisine? }. The same phone gives back the one already in the list
export async function POST(req: Request) {
  try {
    const restaurant = await addRestaurant(AddRestaurant.parse(await jsonBody(req, "Send the name and phone number again.")));
    // a quick pick with the same phone comes back as itself, so it is never shown as one you added
    return ok({ restaurant: restaurant.source === "custom" ? { ...restaurant, added: true } : restaurant });
  } catch (e) {
    return fail(e);
  }
}
