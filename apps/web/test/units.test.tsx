import { afterEach, describe, expect, test, vi } from "vitest";
import { render } from "@testing-library/react";
import { api, ApiError } from "~/lib/api";
import { StarRating } from "~/components/StarRating";
import { Route as IndexRoute } from "~/routes/index";

describe("api client (finding 132)", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch(response: Response) {
    const spy = vi.fn(async (_url: string, _init?: RequestInit) => response);
    vi.stubGlobal("fetch", spy);
    return spy;
  }
  const headersOf = (spy: ReturnType<typeof stubFetch>) => spy.mock.calls[0][1]!.headers as Record<string, string>;

  test("GET and DELETE send no Content-Type; POST with a body does", async () => {
    let spy = stubFetch(new Response("{}", { status: 200 }));
    await api.get("/x");
    expect(headersOf(spy)["Content-Type"]).toBeUndefined();

    spy = stubFetch(new Response("{}", { status: 200 }));
    await api.delete("/x");
    expect(headersOf(spy)["Content-Type"]).toBeUndefined();

    spy = stubFetch(new Response("{}", { status: 200 }));
    await api.post("/x", { a: 1 });
    expect(headersOf(spy)["Content-Type"]).toBe("application/json");
  });

  test("sends the bearer token when signed in", async () => {
    localStorage.setItem("auth_token", "tok");
    const spy = stubFetch(new Response("{}", { status: 200 }));
    await api.get("/x");
    expect(headersOf(spy).Authorization).toBe("Bearer tok");
  });

  test("204 and empty responses resolve to undefined instead of throwing", async () => {
    stubFetch(new Response(null, { status: 204 }));
    await expect(api.delete("/x")).resolves.toBeUndefined();
    stubFetch(new Response("", { status: 200, headers: { "content-length": "0" } }));
    await expect(api.post("/x")).resolves.toBeUndefined();
  });

  test("errors become ApiError with the status and server message", async () => {
    stubFetch(new Response(JSON.stringify({ error: "nope" }), { status: 409 }));
    const err = await api.get("/x").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.message).toBe("nope");
  });
});

describe("StarRating (finding 127)", () => {
  test("each partial star references its own gradient, even with several ratings on a page", () => {
    const { container } = render(
      <>
        <StarRating rating={3.5} />
        <StarRating rating={4.2} />
      </>,
    );
    const gradients = [...container.querySelectorAll("linearGradient")].map((g) => g.id);
    expect(gradients.length).toBe(2);
    expect(new Set(gradients).size).toBe(2);

    const refs = [...container.querySelectorAll("svg[fill^='url(']")].map(
      (s) => s.getAttribute("fill")!.slice(5, -1),
    );
    expect(refs.sort()).toEqual([...gradients].sort());
  });
});

describe("browse search params (finding 142)", () => {
  const validate = IndexRoute.options.validateSearch as (s: Record<string, unknown>) => Record<string, unknown>;

  test("keeps 0, drops empty and non-numeric prices", () => {
    expect(validate({ minPrice: 0, maxPrice: "0" })).toMatchObject({ minPrice: 0, maxPrice: 0 });
    expect(validate({ minPrice: "", maxPrice: "abc" })).toMatchObject({ minPrice: undefined, maxPrice: undefined });
    expect(validate({ minPrice: "12.5" })).toMatchObject({ minPrice: 12.5 });
  });
});
