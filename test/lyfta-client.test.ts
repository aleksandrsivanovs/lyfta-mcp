import { describe, it, expect, vi } from "vitest";
import { LyftaClient } from "../src/lyfta-client.js";

function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  return vi.fn(
    async () =>
      new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json", ...headers },
      }),
  );
}

describe("LyftaClient", () => {
  it("builds URL, query, and auth header for GET", async () => {
    const fetchImpl = mockFetch(200, { status: true, workouts: [] });
    const client = new LyftaClient("k", { baseUrl: "https://api.test", fetchImpl });
    await client.listWorkoutSummaries({ page: 2, limit: 50 });
    const [url, init] = fetchImpl.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe("https://api.test/api/v1/workouts/summary?page=2&limit=50");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer k");
  });

  it("omits undefined query params", async () => {
    const fetchImpl = mockFetch(200, { status: true });
    const client = new LyftaClient("k", { baseUrl: "https://api.test", fetchImpl });
    await client.listWorkouts({ page: undefined, limit: 10 });
    expect(String(fetchImpl.mock.calls[0][0])).toBe("https://api.test/api/v1/workouts?limit=10");
  });

  it("sends JSON body for POST", async () => {
    const fetchImpl = mockFetch(200, { status: true, id: "1" });
    const client = new LyftaClient("k", { baseUrl: "https://api.test", fetchImpl });
    await client.createCollection({ collection: { title: "A" } });
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ collection: { title: "A" } });
  });

  it("throws LyftaApiError on HTTP error", async () => {
    const fetchImpl = mockFetch(400, { status: false, message: "bad" });
    const client = new LyftaClient("k", { baseUrl: "https://api.test", fetchImpl });
    await expect(client.listExercises()).rejects.toMatchObject({ status: 400, message: "bad" });
  });

  it("throws on status:false even with HTTP 200", async () => {
    const fetchImpl = mockFetch(200, { status: false, message: "nope" });
    const client = new LyftaClient("k", { baseUrl: "https://api.test", fetchImpl });
    await expect(client.listClients()).rejects.toMatchObject({ message: "nope" });
  });

  it("maps 429 with retry-after", async () => {
    const fetchImpl = mockFetch(429, "", { "retry-after": "30" });
    const client = new LyftaClient("k", { baseUrl: "https://api.test", fetchImpl });
    await expect(client.listExercises()).rejects.toMatchObject({ status: 429, retryAfter: "30" });
  });

  it("aborts and throws 408 when the upstream hangs past the timeout", async () => {
    const fetchImpl = vi.fn(
      (_url: URL, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const client = new LyftaClient("k", {
      baseUrl: "https://api.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 10,
    });
    await expect(client.listExercises()).rejects.toMatchObject({ status: 408 });
  });
});

describe("LyftaClient read endpoints", () => {
  function setup() {
    const fetchImpl = mockFetch(200, { status: true });
    const client = new LyftaClient("k", { baseUrl: "https://api.test", fetchImpl });
    const url = () => String(fetchImpl.mock.calls[0][0]);
    return { client, fetchImpl, url };
  }

  it("listCollections sends page, limit, client_id", async () => {
    const { client, url } = setup();
    await client.listCollections({ page: 2, limit: 5, client_id: "c1" });
    expect(url()).toBe("https://api.test/api/v1/collections?page=2&limit=5&client_id=c1");
  });

  it("listCollections with no args has no query string", async () => {
    const { client, url } = setup();
    await client.listCollections();
    expect(url()).toBe("https://api.test/api/v1/collections");
  });

  it("getCollection encodes the id and sends view/client_id", async () => {
    const { client, fetchImpl, url } = setup();
    await client.getCollection("a/b c", { view: "full", client_id: "c1" });
    expect(url()).toBe("https://api.test/api/v1/collections/a%2Fb%20c?view=full&client_id=c1");
    expect((fetchImpl.mock.calls[0][1] as RequestInit).method).toBe("GET");
  });

  it("getCollection omits undefined params", async () => {
    const { client, url } = setup();
    await client.getCollection("7", { view: undefined, client_id: undefined });
    expect(url()).toBe("https://api.test/api/v1/collections/7");
  });

  it("encodes path-traversal-looking ids instead of resolving them", async () => {
    const { client, url } = setup();
    await client.getCollection("../clients");
    expect(url()).toBe("https://api.test/api/v1/collections/..%2Fclients");
  });

  it.each(["", ".", ".."])("rejects id %j without calling fetch", async (id) => {
    const { client, fetchImpl } = setup();
    await expect(client.getCollection(id)).rejects.toMatchObject({ status: 400 });
    await expect(client.getTemplate(id)).rejects.toMatchObject({ status: 400 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("listTemplates sends page, limit, client_id and omits undefined", async () => {
    const { client, url } = setup();
    await client.listTemplates({ limit: 3, client_id: undefined });
    expect(url()).toBe("https://api.test/api/v1/templates?limit=3");
  });

  it("getTemplate encodes the id and sends client_id", async () => {
    const { client, url } = setup();
    await client.getTemplate("a/b c", { client_id: "c 1" });
    expect(url()).toBe("https://api.test/api/v1/templates/a%2Fb%20c?client_id=c+1");
  });

  it("getTemplate with no options has no query string", async () => {
    const { client, url } = setup();
    await client.getTemplate("42");
    expect(url()).toBe("https://api.test/api/v1/templates/42");
  });
});
