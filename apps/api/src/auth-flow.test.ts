import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { makeApp, newUser, type App } from "./test-helpers.js";
import { db } from "./db.js";

let app: App;
before(async () => { app = await makeApp(); });
after(() => app.close());

const login = (email: string, password: string) =>
  app.inject({ method: "POST", url: "/auth/login", payload: { email, password } });

test("register returns a token and the user without the password hash", async () => {
  const u = await newUser(app);
  const me = await app.inject({ method: "GET", url: "/auth/me", headers: u.headers });
  assert.equal(me.statusCode, 200);
  assert.deepEqual(Object.keys(me.json()).sort(), ["email", "id", "username"]);
});

test("login and register return the same user shape (finding 129)", async () => {
  const u = await newUser(app);
  const res = await login(u.email, "correct-horse-battery");
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json();
  assert.equal(typeof body.token, "string");
  assert.deepEqual(Object.keys(body.user).sort(), ["email", "id", "username"]);
  assert.equal(body.user.id, u.id);
});

test("login rejects a wrong password and an unknown email with the same message", async () => {
  const u = await newUser(app);
  const wrong = await login(u.email, "not-the-password");
  const unknown = await login("nobody@example.com", "whatever-pass");
  assert.equal(wrong.statusCode, 401);
  assert.equal(unknown.statusCode, 401);
  assert.deepEqual(wrong.json(), unknown.json());
});

test("passwords are stored salted (finding 137)", async () => {
  const a = await newUser(app);
  const b = await newUser(app);
  const ha = db.users.getById(a.id)!.passwordHash;
  const hb = db.users.getById(b.id)!.passwordHash;
  assert.match(ha, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.notEqual(ha, hb, "same password must not produce the same hash");
  assert.ok(!ha.includes("correct-horse-battery"));
});

test("register rejects duplicates and invalid input", async () => {
  const u = await newUser(app);
  const dup = await app.inject({
    method: "POST", url: "/auth/register",
    payload: { username: "dupe", email: u.email, password: "another-password" },
  });
  assert.equal(dup.statusCode, 409);
  for (const payload of [
    { username: "ab", email: "x@example.com", password: "long-enough" },
    { username: "valid", email: "not-an-email", password: "long-enough" },
    { username: "valid", email: "y@example.com", password: "123" },
    {},
  ]) {
    const res = await app.inject({ method: "POST", url: "/auth/register", payload });
    assert.equal(res.statusCode, 400, JSON.stringify(payload));
  }
});

test("a token from login works on protected routes", async () => {
  const u = await newUser(app);
  const { token } = (await login(u.email, "correct-horse-battery")).json();
  const res = await app.inject({ method: "GET", url: "/cart", headers: { authorization: `Bearer ${token}` } });
  assert.equal(res.statusCode, 200);
});
