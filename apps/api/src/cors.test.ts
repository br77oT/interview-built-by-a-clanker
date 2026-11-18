import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { makeApp, type App } from "./test-helpers.js";

let app: App;
before(async () => { app = await makeApp(); });
after(() => app.close());

const preflight = (method: string, origin = "http://localhost:5173") =>
  app.inject({
    method: "OPTIONS",
    url: "/cart/cart-1",
    headers: { origin, "access-control-request-method": method, "access-control-request-headers": "authorization,content-type" },
  });

test("the web app's origin may use every method the UI calls (finding 131)", async () => {
  for (const method of ["GET", "POST", "PUT", "DELETE"]) {
    const res = await preflight(method);
    assert.ok(res.statusCode < 300, `${method} preflight ${res.statusCode}`);
    assert.equal(res.headers["access-control-allow-origin"], "http://localhost:5173");
    assert.match(String(res.headers["access-control-allow-methods"]), new RegExp(`\\b${method}\\b`));
  }
});

test("other origins are not allowed", async () => {
  const res = await preflight("GET", "http://evil.example");
  assert.notEqual(res.headers["access-control-allow-origin"], "http://evil.example");
});
