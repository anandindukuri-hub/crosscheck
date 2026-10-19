import { fail, ok } from "@/lib/http";
import { removeRestaurant } from "@/lib/restaurants";

// removes a restaurant you added. Quick picks and test kitchens stay
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id.startsWith("custom-")) return Response.json({ error: "Only a restaurant you added can be removed." }, { status: 400 });
    if (!(await removeRestaurant(id))) return Response.json({ error: "Restaurant not found" }, { status: 404 });
    return ok({ removed: id });
  } catch (e) {
    return fail(e);
  }
}
