// The owner's browser in tests (T032, moved out of the Issuer's tests): it follows redirects across
// the core and the Entra stand-in, keeping each server's cookies apart, as a browser would. With the
// stand-in signing the owner in at once, it walks an agent's link from the authorization URL to the
// agent's redirect URI.

const MAX_HOPS = 20;

/** Each server's cookies, by origin. */
export type Jars = Map<string, Map<string, string>>;

/**
 * Plays a browser from `start`, following redirects and keeping each server's cookies apart, until
 * a URL that begins with `stopAt`, which it returns without opening.
 */
export async function walk(
  start: URL | string,
  stopAt: string,
  jars: Jars = new Map(),
): Promise<URL> {
  let next = new URL(start);
  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    if (next.href.startsWith(stopAt)) {
      return next;
    }
    const jar = jars.get(next.origin) ?? new Map<string, string>();
    jars.set(next.origin, jar);
    const response = await fetch(next, {
      redirect: "manual",
      headers: {
        cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; "),
      },
    });
    for (const setCookie of response.headers.getSetCookie()) {
      const [pair = ""] = setCookie.split(";");
      const separator = pair.indexOf("=");
      jar.set(pair.slice(0, separator).trim(), pair.slice(separator + 1));
    }
    const location = response.headers.get("location");
    if (location === null) {
      throw new Error(
        `The browser stopped at ${next.pathname} with ${String(response.status)}: ${await response.text()}`,
      );
    }
    await response.body?.cancel();
    next = new URL(location, next);
  }
  throw new Error("The browser never reached where it was going.");
}

/** The `Cookie` header a browser sends to one server. */
export function cookiesOf(jars: Jars, origin: string): string {
  return [...(jars.get(origin) ?? new Map<string, string>())]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

/** Plays the owner's browser to the agent's redirect URI, and returns that URI's query. */
export async function browse(
  start: URL | string,
  redirectUri: string,
  jars?: Jars,
): Promise<URLSearchParams> {
  return (await walk(start, redirectUri, jars)).searchParams;
}
