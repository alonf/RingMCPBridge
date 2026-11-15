// What the Issuer lets oidc-provider fetch for a client (DRIFT-001-86, a review of f3884bb). The
// provider fetches a listed agent's metadata document and, at the token endpoint, a client's
// `jwks_uri`, which a self-registered client names itself. It gives each fetch a 2.5 s timeout and
// refuses private addresses. The Issuer adds two bounds: the size of each answer, and how many
// fetches run at once. One more is refused at once, without fetching, and the provider answers its
// caller with an error.

/** The largest answer the provider reads for each purpose, in bytes; every one is finite. */
export const FETCH_LIMITS = {
  "client_id metadata document": 5 * 1024,
  jwks_uri: 16 * 1024,
  sector_identifier_uri: 5 * 1024,
} as const;

/** How many fetches for clients may run at once across the Issuer. */
export const ISSUER_FETCHES_IN_FLIGHT = 4;

type Fetch = (url: string, options: RequestInit) => Promise<Response>;

/** `fetch`, with at most `maxInFlight` waiting for their answers at once. */
export function boundedFetch(fetch: Fetch, maxInFlight: number): Fetch {
  let inFlight = 0;
  return async (url, options) => {
    if (inFlight >= maxInFlight) {
      throw new Error("Too many fetches for clients at once.");
    }
    inFlight += 1;
    try {
      return await fetch(url, options);
    } finally {
      inFlight -= 1;
    }
  };
}
