import type { FastifyInstance } from "fastify";
import { checkoutSchema, type Order, type CartItem } from "@acme/shared";
import { db, cartItems as cartItemsStore, personas as personasStore } from "../db.js";
import { authenticate } from "../middleware/auth.js";

export async function checkoutRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.post("/checkout", async (request, reply) => {
    const { id: userId } = request.user as { id: string };
    const parsed = checkoutSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const cartEntries = Array.from(cartItemsStore.values()).filter(
      (item) => item.userId === userId
    );
    if (cartEntries.length === 0) {
      return reply.status(400).send({ error: "Cart is empty" });
    }

    const items: CartItem[] = [];
    const unavailable: string[] = [];
    let total = 0;

    for (const entry of cartEntries) {
      const persona = personasStore.get(entry.personaId);
      if (!persona) {
        unavailable.push(entry.id);
        continue;
      }

      items.push({
        id: entry.id,
        personaId: entry.personaId,
        persona,
        quantity: entry.quantity,
      });

      total += persona.price * entry.quantity;
    }

    // Never place a partial order. Drop the unavailable entries (the cart view
    // already hides them, so the user could not remove them) and let the user
    // review the new total before trying again.
    if (unavailable.length > 0) {
      for (const id of unavailable) db.cart.remove(id);
      return reply.status(409).send({
        error: `${unavailable.length} item(s) in your cart are no longer available and were removed. Review your cart and try again.`,
        removedItemIds: unavailable,
      });
    }

    const order: Order = {
      id: db._nextOrderId(),
      userId,
      items,
      total: Math.round(total * 100) / 100,
      customerName: parsed.data.name,
      customerEmail: parsed.data.email,
      createdAt: new Date().toISOString(),
    };

    db.orders.create(order);
    db.cart.clearForUser(userId);

    return reply.status(201).send(order);
  });
}
