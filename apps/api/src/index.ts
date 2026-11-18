import { buildApp } from "./app.js";

// Load apps/api/.env when present; variables already in the environment win.
try {
  process.loadEnvFile();
} catch {
  // no .env file
}

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error(
    "JWT_SECRET environment variable is required (see apps/api/.env.example)"
  );
}

const app = await buildApp({ jwtSecret, logger: true });

try {
  await app.listen({ port: 3001, host: "0.0.0.0" });
  console.log("API server running on http://localhost:3001");
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
