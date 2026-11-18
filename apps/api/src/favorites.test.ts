import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { makeApp, newUser, type App } from "./test-helpers.js";

let app: App;
before(async () => { app = await makeApp(); });
after(() => app.close());

type H = { authorization: string };
const list = async (headers: H) =>
  (await app.inject({ method: "GET", url: "/favorites", headers })).json().favorites.map((p: { id: string }) => p.id);

test("add, list and remove a favorite", async () => {
  const u = await newUser(app);
  assert.deepEqual(await list(u.headers), []);
  const add = await app.inject({ method: "POST", url: "/favorites", headers: u.headers, payload: { personaId: "p-003" } });
  assert.ok(add.statusCode === 200 || add.statusCode === 201, add.body);
  assert.deepEqual(await list(u.headers), ["p-003"]);

  // adding twice does not duplicate
  await app.inject({ method: "POST", url: "/favorites", headers: u.headers, payload: { personaId: "p-003" } });
  assert.deepEqual(await list(u.headers), ["p-003"]);

  const del = await app.inject({ method: "DELETE", url: "/favorites/p-003", headers: u.headers });
  assert.equal(del.statusCode, 200);
  assert.deepEqual(await list(u.headers), []);
  assert.equal((await app.inject({ method: "DELETE", url: "/favorites/p-003", headers: u.headers })).statusCode, 404);
});

test("a missing or malformed body is a 400, not a crash (finding 133)", async () => {
  const u = await newUser(app);
  const noBody = await app.inject({ method: "POST", url: "/favorites", headers: u.headers });
  assert.equal(noBody.statusCode, 400, noBody.body);
  const empty = await app.inject({ method: "POST", url: "/favorites", headers: u.headers, payload: {} });
  assert.equal(empty.statusCode, 400);
  const unknown = await app.inject({ method: "POST", url: "/favorites", headers: u.headers, payload: { personaId: "nope" } });
  assert.equal(unknown.statusCode, 404);
});

test("favorites are per user", async () => {
  const a = await newUser(app);
  const b = await newUser(app);
  await app.inject({ method: "POST", url: "/favorites", headers: a.headers, payload: { personaId: "p-001" } });
  assert.deepEqual(await list(b.headers), []);
  assert.equal((await app.inject({ method: "DELETE", url: "/favorites/p-001", headers: b.headers })).statusCode, 404);
  assert.deepEqual(await list(a.headers), ["p-001"]);
});
