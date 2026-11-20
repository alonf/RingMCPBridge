// What the Issuer lets oidc-provider fetch for a client (DRIFT-001-86, a review of f3884bb). The
// provider fetches a listed agent's metadata document and, at the token endpoint, a client's
// `jwks_uri`, which a self-registered client names itself. It gives each fetch a 2.5 s timeout and
// refuses private addresses. The Issuer adds two bounds: the size of each answer, and how many
// fetches run at once. One more is refused at once, without fetching, and the provider answers its
// caller with an error.
//
// A fetch holds its place until its body is done, not only until its headers come (DRIFT-001-88):
// a server can send its headers at once and trickle the body. The place is freed when the body
// ends, fails or is cancelled, and when the request's signal aborts, since the provider drops some
// replies unread (a metadata document's 404) and its timeout then ends the request.

/** The largest answer the provider reads for each purpose, in bytes; every one is finite. */
export const FETCH_LIMITS = {
  "client_id metadata document": 5 * 1024,
  jwks_uri: 16 * 1024,
  sector_identifier_uri: 5 * 1024,
} as const;

/** How many fetches for clients may run at once across the Issuer. */
export const ISSUER_FETCHES_IN_FLIGHT = 4;

type Fetch = (url: string, options: RequestInit) => Promise<Response>;

/** `fetch`, with at most `maxInFlight` fetches, their bodies included, running at once. */
export function boundedFetch(fetch: Fetch, maxInFlight: number): Fetch {
  let inFlight = 0;
  return async (url, options) => {
    if (inFlight >= maxInFlight) {
      throw new Error("Too many fetches for clients at once.");
    }
    inFlight += 1;
    const release = once(() => {
      inFlight -= 1;
      options.signal?.removeEventListener("abort", release);
    });
    options.signal?.addEventListener("abort", release, { once: true });
    try {
      return heldUntilRead(await fetch(url, options), release);
    } catch (error) {
      release();
      throw error;
    }
  };
}

function once(action: () => void): () => void {
  let done = false;
  return () => {
    if (!done) {
      done = true;
      action();
    }
  };
}

/** The same reply, whose body calls `release` when it ends, fails or is cancelled. */
function heldUntilRead(response: Response, release: () => void): Response {
  const body: ReadableStream<Uint8Array> | null = response.body;
  if (body === null) {
    release();
    return response;
  }
  const reader = body.getReader();
  const held = new ReadableStream<Uint8Array>({
    pull: async (controller) => {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          release();
          controller.close();
        } else {
          controller.enqueue(chunk.value);
        }
      } catch (error) {
        release();
        controller.error(error);
      }
    },
    cancel: async (reason) => {
      release();
      await reader.cancel(reason);
    },
  });
  return new Response(held, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
