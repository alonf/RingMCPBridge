// The cookies Web reads and sets (T029). Every one is `Secure`: browsers keep a Secure cookie on
// `http://localhost` as well, where the page checks run. They are `SameSite=Lax`, because the owner
// comes back from Entra by a top-level navigation from another site, which carries no Strict
// cookie; each form is protected by its session's token and an `Origin` check instead.
import { createHash, timingSafeEqual } from "node:crypto";

/** How a cookie is set. */
export interface CookieOptions {
  readonly path: string;
  /** Leave out for a cookie that ends with the browser session. */
  readonly maxAgeS?: number;
  /** Out of the page script's reach. The theme cookie alone is not. */
  readonly httpOnly: boolean;
}

/** The value of one cookie in a `Cookie` header, or `undefined` when it is not there or empty. */
export function readCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  const prefix = `${name}=`;
  const value = (header ?? "")
    .split(";")
    .map((pair) => pair.trim())
    .find((pair) => pair.startsWith(prefix))
    ?.slice(prefix.length);
  return value === "" ? undefined : value;
}

/** A `Set-Cookie` value. */
export function setCookie(
  name: string,
  value: string,
  options: CookieOptions,
): string {
  const parts = [`${name}=${value}`, `Path=${options.path}`];
  if (options.maxAgeS !== undefined) {
    parts.push(`Max-Age=${String(options.maxAgeS)}`);
  }
  if (options.httpOnly) {
    parts.push("HttpOnly");
  }
  parts.push("Secure", "SameSite=Lax");
  return parts.join("; ");
}

/** A `Set-Cookie` value that removes the cookie. */
export function clearCookie(name: string, path: string): string {
  return setCookie(name, "", { path, maxAgeS: 0, httpOnly: true });
}

/** The SHA-256 of a text, as base64url: what is kept of a cookie that binds a sign-in. */
export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("base64url");
}

/** Compares two texts in a time that does not depend on where they differ. */
export function sameText(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return (
    leftBytes.byteLength === rightBytes.byteLength &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}
