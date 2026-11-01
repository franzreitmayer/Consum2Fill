import { vi } from "vitest";

export type RouteHandler = (body: unknown) => Response;

export function json(body: unknown, status = 200): RouteHandler {
  return () => Response.json(body, { status });
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

/** Replaces fetch; routes are keyed like "POST /api/auth/login". Handlers can be swapped. */
export function stubApi(routes: Record<string, RouteHandler>) {
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    const handler = routes[`${init?.method ?? "GET"} ${path}`];
    if (!handler) {
      return Response.json({ message: `Keine Testroute für ${path}` }, { status: 404 });
    }
    return handler(typeof init?.body === "string" ? JSON.parse(init.body) : undefined);
  });
  vi.stubGlobal("fetch", fetchMock);

  return {
    routes,
    /** The parsed request bodies of all calls to a route. */
    bodies(route: string): unknown[] {
      return fetchMock.mock.calls
        .filter(([path, init]) => `${init?.method ?? "GET"} ${path}` === route)
        .map(([, init]) => (typeof init?.body === "string" ? JSON.parse(init.body) : undefined));
    },
  };
}
