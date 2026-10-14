import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import { setDefaultKey } from "../src/key-context.js";

async function connect() {
  const server = createServer();
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return client;
}

const realFetch = globalThis.fetch;

/** Replace globalThis.fetch with a mock returning `body`; restored in afterEach. */
function stubFetch(body: unknown = { status: true }, status = 200) {
  const fn = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
  );
  globalThis.fetch = fn as any;
  return fn;
}

function fetchedUrl(fn: ReturnType<typeof stubFetch>) {
  return String((fn.mock.calls[0] as unknown[])[0]);
}

describe("server tools", () => {
  beforeEach(() => setDefaultKey("test-key"));
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("exposes all 11 tools", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "create_collection",
      "create_template",
      "get_collection",
      "get_exercise_progress",
      "get_template",
      "list_clients",
      "list_collections",
      "list_exercises",
      "list_templates",
      "list_workout_summaries",
      "list_workouts",
    ]);
  });

  it("reports the package.json version", async () => {
    const client = await connect();
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    expect(client.getServerVersion()?.version).toBe(pkg.version);
  });

  it("list_exercises calls the API and returns JSON text", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ status: true, exercises: [{ id: "1" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ) as any;
    const client = await connect();
    const res: any = await client.callTool({ name: "list_exercises", arguments: {} });
    expect(res.content[0].text).toContain('"id": "1"');
  });

  it("returns isError on API failure", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ status: false, message: "boom" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
    ) as any;
    const client = await connect();
    const res: any = await client.callTool({ name: "list_clients", arguments: {} });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("boom");
  });

  it("get_template calls the encoded template URL and passes the body through", async () => {
    const body = {
      status: true,
      data: { id: 5, title: "Push", exercises: [{ exercise_id: 1, excercise_name: "Bench" }] },
    };
    const fetchFn = stubFetch(body);
    const client = await connect();
    const res: any = await client.callTool({
      name: "get_template",
      arguments: { id: "5/x", client_id: "c1" },
    });
    expect(res.isError).toBeFalsy();
    expect(fetchedUrl(fetchFn)).toBe("https://my.lyfta.app/api/v1/templates/5%2Fx?client_id=c1");
    expect(JSON.parse(res.content[0].text)).toEqual(body);
  });

  it("get_template sends the Bearer key for the current request", async () => {
    const fetchFn = stubFetch();
    const client = await connect();
    await client.callTool({ name: "get_template", arguments: { id: "1" } });
    const init = (fetchFn.mock.calls[0] as unknown[])[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    expect(init.method).toBe("GET");
  });

  it("get_template rejects an empty id without calling fetch", async () => {
    const fetchFn = stubFetch();
    const client = await connect();
    const res: any = await client.callTool({ name: "get_template", arguments: { id: "" } });
    expect(res.isError).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("get_collection forwards view and client_id", async () => {
    const fetchFn = stubFetch();
    const client = await connect();
    await client.callTool({
      name: "get_collection",
      arguments: { id: "9", view: "full", client_id: "c1" },
    });
    expect(fetchedUrl(fetchFn)).toBe(
      "https://my.lyfta.app/api/v1/collections/9?view=full&client_id=c1",
    );
  });

  it("get_collection rejects a view outside the enum without calling fetch", async () => {
    const fetchFn = stubFetch();
    const client = await connect();
    const res: any = await client.callTool({
      name: "get_collection",
      arguments: { id: "9", view: "detailed" },
    });
    expect(res.isError).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("list_collections and list_templates forward pagination and client_id", async () => {
    const fetchFn = stubFetch();
    const client = await connect();
    await client.callTool({ name: "list_collections", arguments: { page: 2, limit: 5 } });
    await client.callTool({ name: "list_templates", arguments: { client_id: "c1" } });
    expect(String((fetchFn.mock.calls[0] as unknown[])[0])).toBe(
      "https://my.lyfta.app/api/v1/collections?page=2&limit=5",
    );
    expect(String((fetchFn.mock.calls[1] as unknown[])[0])).toBe(
      "https://my.lyfta.app/api/v1/templates?client_id=c1",
    );
  });
});
