import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { queryClient } from "~/lib/queryClient";
import { cartBadge, registerUser, renderApp, startApi, type Api, type Call } from "./harness";

let api: Api;
let calls: Call[];
let close: () => Promise<void>;

beforeAll(async () => {
  ({ api, calls, close } = await startApi());
});
afterAll(() => close());

const personaLinks = () =>
  screen.getAllByRole("link").filter((a) => a.getAttribute("href")?.startsWith("/personas/"));
const prices = () =>
  personaLinks().map((a) => Number(a.textContent!.match(/\$(\d+\.\d{2})\/mo/)![1]));

describe("browsing", () => {
  test("persona cards show the real monthly price (finding 122)", async () => {
    await renderApp("/");
    await waitFor(() => expect(personaLinks().length).toBeGreaterThan(5));
    const rex = personaLinks().find((a) => a.textContent!.includes("Refactor Rex"))!;
    expect(rex.textContent).toContain("$49.99/mo");
    expect(prices().every((p) => p < 1000)).toBe(true);
  });

  test("changing the price filter refetches the list (findings 141, 120)", async () => {
    const { router } = await renderApp("/?maxPrice=50");
    await waitFor(() => expect(personaLinks().length).toBeGreaterThan(0));
    expect(prices().every((p) => p <= 50)).toBe(true);

    await router.navigate({ to: "/", search: { minPrice: 80 } });
    await waitFor(() => {
      expect(personaLinks().length).toBeGreaterThan(0);
      expect(prices().every((p) => p >= 80)).toBe(true);
    });
  });

  test("a price filter of 0 is honoured (finding 142)", async () => {
    await renderApp("/?maxPrice=0");
    await waitFor(() => expect(screen.getByText(/No personas found/)).toBeTruthy());
  });

  test("signed-out visitors don't request favorites (finding 143)", async () => {
    calls.length = 0;
    await renderApp("/personas/p-001");
    await waitFor(() => expect(screen.getByRole("heading", { name: "Refactor Rex" })).toBeTruthy());
    expect(calls.filter((c) => c.path === "/favorites")).toEqual([]);
    expect(calls.filter((c) => c.path === "/cart")).toEqual([]);
  });
});

describe("signed in", () => {
  test("signing in through the form shows the user in the navbar", async () => {
    const u = await registerUser(api);
    await renderApp("/login");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), u.email);
    await user.type(screen.getByLabelText(/password/i), u.password);
    await user.click(screen.getByRole("button", { name: "Sign In" }));
    await waitFor(() => expect(screen.getByText(u.username)).toBeTruthy());
    expect(localStorage.getItem("auth_token")).toBeTruthy();
  });

  test("adding to cart updates the navbar badge right away (finding 126)", async () => {
    const u = await registerUser(api);
    const { container } = await renderApp("/personas/p-001", u.token);
    await waitFor(() => expect(screen.getByText(u.username)).toBeTruthy());
    expect(cartBadge(container)).toBe(0);

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Add to Cart" }));
    await waitFor(() => expect(cartBadge(container)).toBe(1));
    await user.click(screen.getByRole("button", { name: "Add to Cart" }));
    await waitFor(() => expect(cartBadge(container)).toBe(2));
  });

  test("the favorite button toggles on and off (finding 140)", async () => {
    const u = await registerUser(api);
    await renderApp("/personas/p-002", u.token);
    const user = userEvent.setup();
    const auth = { authorization: `Bearer ${u.token}` };
    const serverFavs = async () =>
      (await api.inject({ method: "GET", url: "/favorites", headers: auth })).json().favorites.map((p: { id: string }) => p.id);

    await user.click(await screen.findByRole("button", { name: "Add to favorites" }));
    const remove = await screen.findByRole("button", { name: "Remove from favorites" });
    expect(remove.getAttribute("aria-pressed")).toBe("true");
    expect(await serverFavs()).toEqual(["p-002"]);

    await user.click(remove);
    await screen.findByRole("button", { name: "Add to favorites" });
    expect(await serverFavs()).toEqual([]);
  });

  test("cart page: quantity can't go below 1, and changes update the badge (findings 125, 144, 126)", async () => {
    const u = await registerUser(api);
    const auth = { authorization: `Bearer ${u.token}` };
    await api.inject({ method: "POST", url: "/cart", headers: auth, payload: { personaId: "p-001" } });
    const { container } = await renderApp("/cart", u.token);
    await waitFor(() => expect(cartBadge(container)).toBe(1));

    const minus = await screen.findByRole("button", { name: "-" });
    expect((minus as HTMLButtonElement).disabled).toBe(true);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "+" }));
    await waitFor(() => expect(cartBadge(container)).toBe(2));
    await waitFor(() => expect((screen.getByRole("button", { name: "-" }) as HTMLButtonElement).disabled).toBe(false));

    await user.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(screen.getByText(/Your cart is empty/)).toBeTruthy());
    expect(cartBadge(container)).toBe(0);
  });

  test("checkout places the order and empties the cart (finding 121)", async () => {
    const u = await registerUser(api);
    const auth = { authorization: `Bearer ${u.token}` };
    await api.inject({ method: "POST", url: "/cart", headers: auth, payload: { personaId: "p-001", quantity: 2 } });
    const { container } = await renderApp("/checkout", u.token);
    await waitFor(() => expect(cartBadge(container)).toBe(2));

    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/name/i), "Jane Doe");
    await user.type(screen.getByLabelText(/email/i), "jane@example.com");
    await user.click(screen.getByRole("button", { name: "Place Order" }));

    await waitFor(() => expect(screen.getByText(/Order ID/)).toBeTruthy());
    expect(screen.getByText("$99.98")).toBeTruthy();
    await waitFor(() => expect(cartBadge(container)).toBe(0));
    const cart = (await api.inject({ method: "GET", url: "/cart", headers: auth })).json();
    expect(cart.items).toEqual([]);
  });

  test("signing out removes the token and the previous user's cached data (findings 124, 143)", async () => {
    const alice = await registerUser(api, "alice");
    const auth = { authorization: `Bearer ${alice.token}` };
    await api.inject({ method: "POST", url: "/cart", headers: auth, payload: { personaId: "p-001", quantity: 3 } });
    await api.inject({ method: "POST", url: "/favorites", headers: auth, payload: { personaId: "p-001" } });

    const { container } = await renderApp("/personas/p-001", alice.token);
    await waitFor(() => expect(cartBadge(container)).toBe(3));
    await screen.findByRole("button", { name: "Remove from favorites" });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy());
    expect(localStorage.getItem("auth_token")).toBeNull();
    expect(queryClient.getQueryData(["cart"])).toBeUndefined();
    expect(queryClient.getQueryData(["favorites"])).toBeUndefined();

    // Bob signs in in the same tab: he never sees Alice's cart count.
    const bob = await registerUser(api, "bob");
    await router_login(bob.email, bob.password);
    await waitFor(() => expect(screen.getByText(bob.username)).toBeTruthy());
    expect(cartBadge(container)).toBe(0);
  });
});

async function router_login(email: string, password: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("link", { name: "Sign in" }));
  const form = (await screen.findByRole("button", { name: "Sign In" })).closest("form")!;
  await user.type(within(form).getByLabelText(/email/i), email);
  await user.type(within(form).getByLabelText(/password/i), password);
  await user.click(within(form).getByRole("button", { name: "Sign In" }));
}
