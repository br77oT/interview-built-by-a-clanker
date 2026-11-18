import type { FastifyInstance } from "fastify";
import { db } from "../db.js";

/** A price filter, or undefined when absent or not a number (so it is ignored, not NaN). */
function toPrice(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export async function personaRoutes(app: FastifyInstance) {
  app.get("/personas", async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const filters = {
      q: query.q,
      specialty: query.specialty,
      tier: query.tier,
      minPrice: toPrice(query.minPrice),
      maxPrice: toPrice(query.maxPrice),
      sort: query.sort,
    };

    return db.personas.search(filters);
  });

  app.get<{ Params: { id: string } }>("/personas/:id", async (request, reply) => {
    const persona = db.personas.getById(request.params.id);
    if (!persona) {
      return reply.status(404).send({ error: "Persona not found" });
    }
    return persona;
  });
}
