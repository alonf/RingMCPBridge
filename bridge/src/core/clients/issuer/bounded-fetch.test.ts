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
    await Promise.all(running);
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
