/**
 * Full-stack test harness: renders the real web app in jsdom and answers its
 * fetch() calls with the real Fastify API, in-process via app.inject().
 */
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { expect, vi } from "vitest";
import { AuthProvider } from "~/lib/auth";
import { queryClient } from "~/lib/queryClient";
import { routeTree } from "~/routeTree.gen";
import { buildApp } from "../../api/src/app";

export type Api = Awaited<ReturnType<typeof buildApp>>;
export interface Call { method: string; path: string }

export async function startApi() {
  const api = await buildApp({ jwtSecret: "web-test-secret-".padEnd(48, "x") });
  const calls: Call[] = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = (init.method ?? "GET").toUpperCase();
    calls.push({ method, path: url.pathname });
    const res = await api.inject({
      method: method as "GET",
      url: url.pathname + url.search,
      headers: init.headers as Record<string, string>,
      payload: init.body as string | undefined,
    });
    const headers = new Headers();
    for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) headers.set(k, String(v));
    const empty = res.statusCode === 204 || res.statusCode === 304;
    return new Response(empty ? null : res.body, { status: res.statusCode, headers });
  });
  vi.stubGlobal("fetch", fetchMock);

  return { api, calls, close: () => { vi.unstubAllGlobals(); return api.close(); } };
}

let seq = 0;
export async function registerUser(api: Api, name = "user") {
  const username = `${name}${++seq}`;
  const email = `${username}@example.com`;
  const res = await api.inject({
    method: "POST",
    url: "/auth/register",
    payload: { username, email, password: "correct-horse-battery" },
  });
  if (res.statusCode !== 201) throw new Error(res.body);
  return { username, email, password: "correct-horse-battery", token: res.json().token as string };
}

/** Render the whole app at `path`. Pass a token to start signed in. */
export async function renderApp(path = "/", token?: string) {
  queryClient.clear();
  if (token) localStorage.setItem("auth_token", token);
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getAllByText("Agentic Personas").length).toBeGreaterThan(0));
  return { ...utils, router };
}

/** The number on the navbar cart badge, or 0 when no badge is shown. */
export function cartBadge(container: HTMLElement): number {
  const link = container.querySelector('nav a[href="/cart"]');
  if (!link) throw new Error("cart link not rendered (signed out?)");
  const text = link.textContent?.trim() ?? "";
  return text ? Number(text) : 0;
}
