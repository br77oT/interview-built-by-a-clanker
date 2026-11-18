import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { buildApp } from "./app.js";

const SECRET = "test-secret-".padEnd(40, "x");
let app: Awaited<ReturnType<typeof buildApp>>;

before(async () => {
  app = await buildApp({ jwtSecret: SECRET });
});
after(() => app.close());

const PROTECTED: Array<{ method: "GET" | "POST" | "PUT" | "DELETE"; url: string }> = [
  { method: "GET", url: "/cart" },
  { method: "POST", url: "/cart" },
  { method: "PUT", url: "/cart/any" },
  { method: "DELETE", url: "/cart/any" },
  { method: "GET", url: "/favorites" },
  { method: "POST", url: "/favorites" },
  { method: "DELETE", url: "/favorites/any" },
  { method: "POST", url: "/checkout" },
  { method: "GET", url: "/auth/me" },
];

function hs256(payload: object, secret: string) {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}`;
  return `${head}.${createHmac("sha256", secret).update(head).digest("base64url")}`;
}

async function register(email: string) {
  const res = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { username: email.split("@")[0], email, password: "correct-horse-battery" },
  });
  assert.equal(res.statusCode, 201, res.body);
  return res.json().token as string;
}

test("protected routes reject requests without a token", async () => {
  for (const { method, url } of PROTECTED) {
    const res = await app.inject({ method, url });
    assert.equal(res.statusCode, 401, `${method} ${url}`);
  }
});

test("protected routes reject forged, unsigned and expired tokens", async () => {
  const now = Math.floor(Date.now() / 1000);
  const bad = {
    "wrong secret": hs256({ id: "user-1", email: "x@y.z", iat: now }, "agentic-personas-dev-secret"),
    "alg none": `${Buffer.from('{"alg":"none","typ":"JWT"}').toString("base64url")}.${Buffer.from('{"id":"user-1"}').toString("base64url")}.`,
    expired: hs256({ id: "user-1", email: "x@y.z", iat: now - 7200, exp: now - 3600 }, SECRET),
    garbage: "not-a-jwt",
  };
  for (const [name, token] of Object.entries(bad)) {
    for (const { method, url } of PROTECTED) {
      const res = await app.inject({ method, url, headers: { authorization: `Bearer ${token}` } });
      assert.equal(res.statusCode, 401, `${name}: ${method} ${url}`);
    }
  }
});

test("issued tokens expire", async () => {
  const token = await register("expiry@example.com");
  const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  assert.equal(typeof payload.exp, "number");
  assert.ok(payload.exp - payload.iat <= 3600, "token lifetime should be at most 1h");
});

test("a valid token reaches the handler", async () => {
  const token = await register("valid@example.com");
  const headers = { authorization: `Bearer ${token}` };
  assert.equal((await app.inject({ method: "GET", url: "/cart", headers })).statusCode, 200);
  assert.equal((await app.inject({ method: "GET", url: "/favorites", headers })).statusCode, 200);
  const me = await app.inject({ method: "GET", url: "/auth/me", headers });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().email, "valid@example.com");
});

test("/auth/me returns 401 when the token's user no longer exists", async () => {
  const token = app.jwt.sign({ id: "user-does-not-exist", email: "ghost@example.com" });
  const res = await app.inject({ method: "GET", url: "/auth/me", headers: { authorization: `Bearer ${token}` } });
  assert.equal(res.statusCode, 401);
});

test("public routes stay public", async () => {
  assert.equal((await app.inject({ method: "GET", url: "/personas" })).statusCode, 200);
  assert.equal((await app.inject({ method: "GET", url: "/health" })).statusCode, 200);
});

test("buildApp refuses a short secret", async () => {
  await assert.rejects(buildApp({ jwtSecret: "too-short" }), /at least 32/);
});
