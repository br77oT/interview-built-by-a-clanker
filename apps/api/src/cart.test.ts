import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { makeApp, newUser, type App } from "./test-helpers.js";

let app: App;
before(async () => { app = await makeApp(); });
after(() => app.close());

type H = { authorization: string };
const add = (headers: H, personaId: string, quantity?: number) =>
  app.inject({ method: "POST", url: "/cart", headers, payload: quantity === undefined ? { personaId } : { personaId, quantity } });
const get = async (headers: H) => (await app.inject({ method: "GET", url: "/cart", headers })).json();

test("add, merge, update and remove items; total follows", async () => {
  const u = await newUser(app);
  assert.equal((await add(u.headers, "p-001")).statusCode, 200);       // default quantity 1
  assert.equal((await add(u.headers, "p-001", 2)).statusCode, 200);    // merges into one line
  let cart = await get(u.headers);
  assert.equal(cart.items.length, 1);
  assert.equal(cart.items[0].quantity, 3);
  assert.equal(cart.total, Math.round(cart.items[0].persona.price * 3 * 100) / 100);

  const id = cart.items[0].id;
  const put = await app.inject({ method: "PUT", url: `/cart/${id}`, headers: u.headers, payload: { quantity: 1 } });
  assert.equal(put.statusCode, 200);
  assert.equal(put.json().items[0].quantity, 1);

  const del = await app.inject({ method: "DELETE", url: `/cart/${id}`, headers: u.headers });
  assert.equal(del.statusCode, 200);
  assert.deepEqual(del.json(), { items: [], total: 0 });
});

test("quantity below 1 is rejected (findings 125/144)", async () => {
  const u = await newUser(app);
  await add(u.headers, "p-001");
  const id = (await get(u.headers)).items[0].id;
  for (const quantity of [0, -1, 1.5]) {
    const res = await app.inject({ method: "PUT", url: `/cart/${id}`, headers: u.headers, payload: { quantity } });
    assert.equal(res.statusCode, 400, `quantity ${quantity}`);
  }
  assert.equal((await add(u.headers, "p-001", 0)).statusCode, 400);
  assert.equal((await get(u.headers)).items[0].quantity, 1);
});

test("adding an unknown persona is a 404", async () => {
  const u = await newUser(app);
  assert.equal((await add(u.headers, "nope")).statusCode, 404);
});

test("users cannot see, change or delete each other's cart items (finding 138)", async () => {
  const alice = await newUser(app, "alice");
  const bob = await newUser(app, "bob");
  await add(alice.headers, "p-002", 2);
  const id = (await get(alice.headers)).items[0].id;

  assert.deepEqual((await get(bob.headers)).items, []);
  const put = await app.inject({ method: "PUT", url: `/cart/${id}`, headers: bob.headers, payload: { quantity: 9 } });
  const del = await app.inject({ method: "DELETE", url: `/cart/${id}`, headers: bob.headers });
  assert.equal(put.statusCode, 404);
  assert.equal(del.statusCode, 404);

  const after = await get(alice.headers);
  assert.equal(after.items.length, 1);
  assert.equal(after.items[0].quantity, 2);
});
