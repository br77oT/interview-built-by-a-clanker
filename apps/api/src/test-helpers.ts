import assert from "node:assert/strict";
import { buildApp } from "./app.js";

export type App = Awaited<ReturnType<typeof buildApp>>;

export const TEST_SECRET = "api-test-secret-".padEnd(48, "x");

export function makeApp() {
  return buildApp({ jwtSecret: TEST_SECRET });
}

let n = 0;

/** Register a fresh user and return its id, token and an auth header. */
export async function newUser(app: App, prefix = "user") {
  const email = `${prefix}${++n}-${Date.now()}@example.com`;
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { username: `${prefix}${n}`.padEnd(3, "_"), email, password: "correct-horse-battery" },
  });
  assert.equal(res.statusCode, 201, res.body);
  const body = res.json();
  return {
    id: body.user.id as string,
    email,
    token: body.token as string,
    headers: { authorization: `Bearer ${body.token}` },
  };
}
