import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "./app.js";
import { personas } from "./db.js";

let app: Awaited<ReturnType<typeof buildApp>>;

before(async () => {
  app = await buildApp({ jwtSecret: "checkout-test-secret-".padEnd(40, "x") });
});
after(() => app.close());

async function login(email: string) {
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { username: email.split("@")[0], email, password: "correct-horse-battery" },
  });
  assert.equal(res.statusCode, 201, res.body);
  return { authorization: `Bearer ${res.json().token}` };
}

const order = { name: "Test User", email: "buyer@example.com" };

test("checkout empties the cart", async () => {
  const headers = await login("buyer1@example.com");
  await app.inject({ method: "POST", url: "/cart", headers, payload: { personaId: "p-001", quantity: 2 } });

  const res = await app.inject({ method: "POST", url: "/checkout", headers, payload: order });
  assert.equal(res.statusCode, 201, res.body);
  assert.equal(res.json().items.length, 1);

  const cart = await app.inject({ method: "GET", url: "/cart", headers });
  assert.deepEqual(cart.json().items, []);
});

test("checkout refuses a partial order when an item is no longer available", async () => {
  const headers = await login("buyer2@example.com");
  const gone = personas.get("p-002")!;
  await app.inject({ method: "POST", url: "/cart", headers, payload: { personaId: "p-001", quantity: 1 } });
  await app.inject({ method: "POST", url: "/cart", headers, payload: { personaId: "p-002", quantity: 1 } });
  personas.delete("p-002");
  try {
    const res = await app.inject({ method: "POST", url: "/checkout", headers, payload: order });
    assert.equal(res.statusCode, 409, res.body);
    assert.equal(res.json().removedItemIds.length, 1);

    // The unavailable entry is gone and the available one is still there.
    const cart = await app.inject({ method: "GET", url: "/cart", headers });
    assert.deepEqual(cart.json().items.map((i: { personaId: string }) => i.personaId), ["p-001"]);

    // Retrying now succeeds with only the available item.
    const retry = await app.inject({ method: "POST", url: "/checkout", headers, payload: order });
    assert.equal(retry.statusCode, 201, retry.body);
    assert.equal(retry.json().items.length, 1);
  } finally {
    personas.set(gone.id, gone);
  }
});
