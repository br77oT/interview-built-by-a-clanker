import Fastify, { type FastifyServerOptions } from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { personaRoutes } from "./routes/personas.js";
import { authRoutes } from "./routes/auth.js";
import { cartRoutes } from "./routes/cart.js";
import { favoriteRoutes } from "./routes/favorites.js";
import { checkoutRoutes } from "./routes/checkout.js";

export const MIN_JWT_SECRET_LENGTH = 32;
export const TOKEN_TTL = "1h";

export interface AppOptions {
  jwtSecret: string;
  logger?: FastifyServerOptions["logger"];
}

export async function buildApp({ jwtSecret, logger = false }: AppOptions) {
  if (jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters`
    );
  }

  const app = Fastify({ logger });

  await app.register(cors, {
    origin: "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  });
  await app.register(jwt, {
    secret: jwtSecret,
    sign: { expiresIn: TOKEN_TTL },
  });

  await app.register(personaRoutes);
  await app.register(authRoutes);
  await app.register(cartRoutes);
  await app.register(favoriteRoutes);
  await app.register(checkoutRoutes);

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
