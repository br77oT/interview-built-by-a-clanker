import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { makeApp, type App } from "./test-helpers.js";
import type { Persona } from "@acme/shared";

let app: App;
before(async () => { app = await makeApp(); });
after(() => app.close());

async function search(qs: string): Promise<Persona[]> {
  const res = await app.inject({ method: "GET", url: `/personas${qs}` });
  assert.equal(res.statusCode, 200, res.body);
  return res.json();
}

test("lists every persona without filters", async () => {
  const all = await search("");
  assert.ok(all.length >= 10);
  for (const p of all) assert.ok(p.price > 0 && p.price < 1000, `${p.id} price looks like cents/dollars mixup: ${p.price}`);
});

test("minPrice keeps personas at or above the price (finding 120/123)", async () => {
  const res = await search("?minPrice=60");
  assert.ok(res.length > 0);
  assert.ok(res.every((p) => p.price >= 60), JSON.stringify(res.map((p) => p.price)));
  const all = await search("");
  assert.equal(res.length, all.filter((p) => p.price >= 60).length);
});

test("maxPrice keeps personas at or below the price", async () => {
  const res = await search("?maxPrice=50");
  assert.ok(res.length > 0);
  assert.ok(res.every((p) => p.price <= 50));
});

test("minPrice and maxPrice combine into a range", async () => {
  const res = await search("?minPrice=50&maxPrice=60");
  assert.ok(res.length > 0);
  assert.ok(res.every((p) => p.price >= 50 && p.price <= 60));
});

test("a price filter of 0 is applied, not ignored (finding 142)", async () => {
  assert.equal((await search("?maxPrice=0")).length, 0);
  assert.equal((await search("?minPrice=0")).length, (await search("")).length);
});

test("a non-numeric price filter is ignored rather than emptying the list", async () => {
  assert.equal((await search("?minPrice=abc")).length, (await search("")).length);
});

test("filters by specialty, tier and text", async () => {
  assert.ok((await search("?specialty=Security")).every((p) => p.specialty === "Security"));
  assert.ok((await search("?tier=Starter")).every((p) => p.tier === "Starter"));
  const q = await search("?q=rex");
  assert.ok(q.some((p) => p.name === "Refactor Rex"));
});

test("sorts by price, rating and name", async () => {
  const asc = (await search("?sort=price-asc")).map((p) => p.price);
  assert.deepEqual(asc, [...asc].sort((a, b) => a - b));
  const desc = (await search("?sort=price-desc")).map((p) => p.price);
  assert.deepEqual(desc, [...desc].sort((a, b) => b - a));
  const rating = (await search("?sort=rating-desc")).map((p) => p.rating);
  assert.deepEqual(rating, [...rating].sort((a, b) => b - a));
  const names = (await search("?sort=name-asc")).map((p) => p.name);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
});

test("GET /personas/:id returns one persona or 404", async () => {
  const one = await app.inject({ method: "GET", url: "/personas/p-001" });
  assert.equal(one.statusCode, 200);
  assert.equal(one.json().id, "p-001");
  assert.equal((await app.inject({ method: "GET", url: "/personas/nope" })).statusCode, 404);
});
