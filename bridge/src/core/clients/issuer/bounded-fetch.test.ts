// The Issuer's fetch and the provider's response limits (DRIFT-001-86, a review of f3884bb): what
// the provider fetches for a client is bounded in size, and in how many run at once.
import { describe, expect, it } from "vitest";
import {
  boundedFetch,
  FETCH_LIMITS,
  ISSUER_FETCHES_IN_FLIGHT,
} from "./bounded-fetch.ts";
import type { ListedAgents } from "./listed-agents.ts";
import { providerConfiguration } from "./provider-configuration.ts";

const URL_A = "https://agent.example.test/jwks.json";

interface Held {
  readonly calls: string[];
  readonly release: () => void;
  readonly fetch: (url: string, options: RequestInit) => Promise<Response>;
}

// A fetch whose responses wait until `release`.
function held(): Held {
  const calls: string[] = [];
  const waiting: (() => void)[] = [];
  return {
    calls,
    release: () => {
      for (const resolve of waiting.splice(0)) {
        resolve();
      }
    },
    fetch: (url) => {
      calls.push(url);
      return new Promise<Response>((resolve) => {
        waiting.push(() => {
          resolve(new Response("{}"));
        });
      });
    },
  };
}

describe("the Issuer's fetch", () => {
  it(`runs at most ${String(ISSUER_FETCHES_IN_FLIGHT)} at once and refuses one more at once, without fetching it`, async () => {
    const inner = held();
    const fetch = boundedFetch(inner.fetch, ISSUER_FETCHES_IN_FLIGHT);

    const running = Array.from({ length: ISSUER_FETCHES_IN_FLIGHT }, () =>
      fetch(URL_A, {}),
    );
    await expect(fetch(URL_A, {})).rejects.toThrow(
      "Too many fetches for clients at once.",
    );
    expect(inner.calls).toHaveLength(ISSUER_FETCHES_IN_FLIGHT);

    inner.release();
    await Promise.all(
      (await Promise.all(running)).map((response) => response.text()),
    );
    const after = fetch(URL_A, {});
    inner.release();
    await expect(after).resolves.toBeInstanceOf(Response);
  });

  it("frees its place when a fetch fails, and passes the provider's options through", async () => {
    const seen: RequestInit[] = [];
    let fail = true;
    const fetch = boundedFetch((_url, options) => {
      seen.push(options);
      return fail
        ? Promise.reject(new Error("unreachable"))
        : Promise.resolve(new Response("{}"));
    }, 1);
    const signal = AbortSignal.timeout(2_500);

    await expect(fetch(URL_A, { signal })).rejects.toThrow("unreachable");
    fail = false;

    await expect(fetch(URL_A, {})).resolves.toBeInstanceOf(Response);
    expect(seen[0]?.signal).toBe(signal);
  });
});

// A fetch whose replies come with their headers at once and their bodies still open, as a server
// that sends its headers and then trickles the body (co-review round 3, run-20261115-093504126).
interface Streaming {
  readonly bodies: ReadableStreamDefaultController<Uint8Array>[];
  readonly fetch: (url: string, options: RequestInit) => Promise<Response>;
}

function streaming(status = 200): Streaming {
  const bodies: ReadableStreamDefaultController<Uint8Array>[] = [];
  return {
    bodies,
    fetch: () =>
      Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            start: (controller) => {
              bodies.push(controller);
              controller.enqueue(new TextEncoder().encode("{"));
            },
          }),
          { status },
        ),
      ),
  };
}

async function fill(
  fetch: (url: string, options: RequestInit) => Promise<Response>,
  signal?: AbortSignal,
): Promise<Response[]> {
  return Promise.all(
    Array.from({ length: ISSUER_FETCHES_IN_FLIGHT }, () =>
      fetch(URL_A, signal === undefined ? {} : { signal }),
    ),
  );
}

describe("the Issuer's fetch, while a body is still coming", () => {
  it("holds a fetch's place until its body ends, so a trickled body still counts", async () => {
    const inner = streaming();
    const fetch = boundedFetch(inner.fetch, ISSUER_FETCHES_IN_FLIGHT);
    const responses = await fill(fetch);

    await expect(fetch(URL_A, {})).rejects.toThrow(
      "Too many fetches for clients at once.",
    );

    const [first] = responses;
    const reading = first?.text();
    inner.bodies[0]?.enqueue(new TextEncoder().encode("}"));
    inner.bodies[0]?.close();
    await expect(reading).resolves.toBe("{}");
    await expect(fetch(URL_A, {})).resolves.toBeInstanceOf(Response);
  });

  it("frees the place when the reader cancels the body, as the provider does past its size limit", async () => {
    const fetch = boundedFetch(streaming().fetch, ISSUER_FETCHES_IN_FLIGHT);
    const responses = await fill(fetch);

    await responses[0]?.body?.cancel();

    await expect(fetch(URL_A, {})).resolves.toBeInstanceOf(Response);
  });

  it("frees the place when the body fails", async () => {
    const inner = streaming();
    const fetch = boundedFetch(inner.fetch, ISSUER_FETCHES_IN_FLIGHT);
    const responses = await fill(fetch);

    const reading = responses[0]?.text();
    inner.bodies[0]?.error(new Error("connection reset"));
    await expect(reading).rejects.toThrow("connection reset");

    await expect(fetch(URL_A, {})).resolves.toBeInstanceOf(Response);
  });

  it("frees the place when the request's signal aborts, for a reply the provider drops unread", async () => {
    // The provider refuses a metadata document's 404 without reading its body; its 2.5 s timeout
    // then ends the request. Without this, four such replies would refuse every later fetch.
    const fetch = boundedFetch(streaming(404).fetch, ISSUER_FETCHES_IN_FLIGHT);
    const timeout = new AbortController();
    await fill(fetch, timeout.signal);

    timeout.abort(new Error("The operation was aborted due to timeout"));

    await expect(fetch(URL_A, {})).resolves.toBeInstanceOf(Response);
  });

  it("frees the place at once for a reply with no body, and keeps the status and headers", async () => {
    const fetch = boundedFetch(
      () =>
        Promise.resolve(
          new Response(null, { status: 304, headers: { etag: '"a"' } }),
        ),
      1,
    );

    const response = await fetch(URL_A, {});
    expect(response.status).toBe(304);
    expect(response.headers.get("etag")).toBe('"a"');
    await expect(fetch(URL_A, {})).resolves.toBeInstanceOf(Response);
  });

  it("passes the body's bytes, status and headers through unchanged", async () => {
    const fetch = boundedFetch(
      () =>
        Promise.resolve(
          new Response('{"keys":[]}', {
            status: 200,
            headers: { "cache-control": "max-age=60" },
          }),
        ),
      1,
    );

    const response = await fetch(URL_A, {});

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("max-age=60");
    await expect(response.text()).resolves.toBe('{"keys":[]}');
  });
});

describe("the provider's response limits", () => {
  it("bounds every document the provider fetches for a client", () => {
    expect(FETCH_LIMITS).toEqual({
      "client_id metadata document": 5 * 1024,
      jwks_uri: 16 * 1024,
      sector_identifier_uri: 5 * 1024,
    });
    for (const limit of Object.values(FETCH_LIMITS)) {
      expect(Number.isFinite(limit)).toBe(true);
    }
  });

  it("are the provider's own, which leaves `jwks_uri` and `sector_identifier_uri` unbounded by default", () => {
    const configuration = providerConfiguration({
      basePath: "/oauth",
      resource: "https://bridge.example.test/mcp",
      keys: { keys: [], cookieKeys: ["cookie-key"] },
      agents: {} as ListedAgents,
      adapter: () => {
        throw new Error("No storage in this test.");
      },
      fetch: () => Promise.reject(new Error("No fetch in this test.")),
      signal: () => new AbortController().signal,
    });

    expect(configuration.fetchResponseBodyLimits).toEqual(FETCH_LIMITS);
  });
});
