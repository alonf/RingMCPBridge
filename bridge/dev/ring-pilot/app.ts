import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { getCookie, setCookie } from "hono/cookie";
import { html } from "hono/html";
import { z } from "zod";
import type { ringClient } from "./client.ts";

const LINK_WINDOW = 600_000;
const SESSION_WINDOW = 3_600_000;
const COOKIE = {
  secure: true,
  httpOnly: true,
  sameSite: "Strict",
  path: "/",
} as const;
const webhook = z.object({
  data: z.object({
    type: z.string(),
    attributes: z.object({ source: z.string().optional() }).optional(),
  }),
  meta: z.object({ account_id: z.string().optional() }).optional(),
});
interface Ticket {
  order: number;
  expires: number;
  busy: boolean;
  access?: string;
  tokenExpiry?: number;
  account?: string;
  masked?: string;
  postedNonce?: string;
  session?: string;
}
function equal(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
function mask(email: string) {
  const at = email.lastIndexOf("@");
  return (
    email.slice(0, 1) +
    "***" +
    (at > 2 ? email.slice(at - 1, at) : "") +
    email.slice(at)
  );
}
const random = () => randomBytes(32).toString("base64url");
const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");

export function pilotApp(
  clientId: string,
  signingKey: string,
  ring: ReturnType<typeof ringClient>,
  now = Date.now,
) {
  const app = new Hono();
  const tickets = new Map<string, Ticket>();
  const claimed = new Map<string, number>();
  let sequence = 0;
  function expire() {
    for (const [key, ticket] of tickets)
      if (ticket.expires <= now()) tickets.delete(key);
    for (const [key, expiry] of claimed)
      if (expiry <= now()) claimed.delete(key);
  }
  function match(time: string, nonce: string) {
    if (
      !/^\d{13}$/.test(time) ||
      !/^[\w-]{43}$/.test(nonce) ||
      claimed.has(nonce)
    )
      return;
    const age = now() - Number(time);
    if (age < 0 || age >= LINK_WINDOW) return;
    return [...tickets.values()].find((ticket) => {
      if (
        !ticket.account ||
        ticket.session ||
        (ticket.postedNonce && ticket.postedNonce !== nonce)
      )
        return false;
      const mac = createHmac("sha256", signingKey).update(
        time + ":" + ticket.account,
      );
      return equal(mac.digest("base64url"), nonce);
    });
  }
  app.use("*", async (c, next) => {
    expire();
    c.header("Cache-Control", "no-store");
    c.header("Referrer-Policy", "no-referrer");
    c.header(
      "Content-Security-Policy",
      "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    );
    c.header("X-Content-Type-Options", "nosniff");
    await next();
  });
  app.use(
    "*",
    bodyLimit({
      maxSize: 64 * 1024,
      onError: (c) => c.text("Request too large", 413),
    }),
  );
  app.onError((_, c) =>
    c.text(
      "The pilot could not complete this request. Retry the Ring connection.",
      502,
    ),
  );
  app.post("/ring/token", async (c) => {
    if (
      !c.req
        .header("content-type")
        ?.startsWith("application/x-www-form-urlencoded")
    )
      return c.text("Expected a form", 415);
    const body = new URLSearchParams(await c.req.text());
    const code = body.get("code");
    if (body.get("client_id") !== clientId || !code || code.length > 4096)
      return c.text("Invalid callback", 400);
    const key = digest(code);
    const previous = tickets.get(key);
    if (previous?.account) return c.body(null, 200);
    if (previous?.busy || (!previous && tickets.size >= 16))
      return c.text("Retry later", 503);
    const ticket: Ticket = previous ?? {
      order: ++sequence,
      expires: now() + LINK_WINDOW,
      busy: false,
    };
    tickets.set(key, ticket);
    ticket.busy = true;
    try {
      if (!ticket.access) {
        const token = await ring.exchange(code);
        ticket.access = token.access_token;
        ticket.tokenExpiry = now() + token.expires_in * 1000;
        ticket.expires = Math.min(ticket.expires, ticket.tokenExpiry);
      }
      const identity = await ring.identity(ticket.access);
      ticket.account = identity.id;
      ticket.masked = mask(identity.attributes.email);
      for (const [otherKey, other] of tickets) {
        if (other.account === ticket.account && other !== ticket)
          tickets.delete(other.order < ticket.order ? otherKey : key);
      }
      return c.body(null, 200);
    } catch (error) {
      if (!ticket.access) tickets.delete(key);
      throw error;
    } finally {
      ticket.busy = false;
    }
  });
  app.get("/ring/link", (c) => {
    const time = c.req.query("time") ?? "";
    const nonce = c.req.query("nonce") ?? "";
    const ticket = match(time, nonce);
    if (!ticket) return c.text("Start a fresh connection in Ring.", 403);
    const proof = random();
    setCookie(c, "__Host-ring-confirm", proof, {
      ...COOKIE,
      maxAge: LINK_WINDOW / 1000,
    });
    return c.html(
      html`<!doctype html><title>Link Ring</title>
        <h1>Link Ring MCP Bridge Pilot</h1>
        <p>
          Connect ${ticket.masked} to view the devices you selected in Ring.
        </p>
        <form method="post" action="/ring/link">
          <input type="hidden" name="time" value="${time}" />
          <input type="hidden" name="nonce" value="${nonce}" /><input
            type="hidden"
            name="proof"
            value="${proof}"
          />
          <button>Confirm connection</button>
        </form>`,
    );
  });
  app.post("/ring/link", async (c) => {
    const body = new URLSearchParams(await c.req.text());
    const nonce = body.get("nonce") ?? "";
    const time = body.get("time") ?? "";
    const ticket = match(time, nonce);
    const proof = getCookie(c, "__Host-ring-confirm");
    if (
      !proof ||
      !equal(proof, body.get("proof") ?? "") ||
      !ticket?.access ||
      !ticket.masked ||
      !ticket.tokenExpiry
    )
      return c.text("Start a fresh connection in Ring.", 403);
    if (ticket.busy) return c.text("Confirmation in progress", 409);
    ticket.busy = true;
    try {
      if (!ticket.postedNonce) {
        await ring.activate(ticket.access, "POST", ticket.masked, nonce);
        ticket.postedNonce = nonce;
      }
      await ring.activate(ticket.access, "PATCH", ticket.masked, nonce);
      if (match(time, nonce) !== ticket)
        return c.text("Start a fresh connection in Ring.", 403);
      ticket.session = random();
      ticket.expires = Math.min(ticket.tokenExpiry, now() + SESSION_WINDOW);
      claimed.set(nonce, Number(time) + LINK_WINDOW);
      setCookie(c, "__Host-ring-session", ticket.session, {
        ...COOKIE,
        maxAge: Math.floor((ticket.expires - now()) / 1000),
      });
      return c.redirect("/ring/home", 303);
    } finally {
      ticket.busy = false;
    }
  });
  app.get("/ring/home", async (c) => {
    const session = getCookie(c, "__Host-ring-session");
    const ticket =
      session &&
      [...tickets.values()].find((value) => value.session === session);
    if (!ticket || !ticket.access)
      return c.text(
        "Ring MCP Bridge Pilot. Open Connect in Ring to see your shared devices.",
      );
    const names = await ring.devices(ticket.access);
    return c.html(
      html`<!doctype html><title>Ring pilot devices</title>
        <h1>Shared devices</h1>
        <p>
          Connected as ${ticket.masked}. Devices returned by Ring on this page:
          ${names.length}.
        </p>
        <ul>
          ${names.map((name) => html`<li>${name}</li>`)}
        </ul>
        <p>You can remove this connection in Ring.</p>`,
    );
  });
  app.post("/ring/webhook", async (c) => {
    const raw = Buffer.from(await c.req.arrayBuffer());
    const signature =
      "sha256=" + createHmac("sha256", signingKey).update(raw).digest("hex");
    if (!equal(signature, c.req.header("X-Signature") ?? ""))
      return c.text("Invalid signature", 403);
    let event;
    try {
      event = webhook.parse(JSON.parse(raw.toString("utf8")));
    } catch {
      return c.text("Invalid event", 400);
    }
    if (event.data.type === "app_integration_removed") {
      const account = event.meta?.account_id ?? event.data.attributes?.source;
      if (!account) return c.text("Missing account", 400);
      for (const [key, ticket] of tickets)
        if (ticket.account === account) tickets.delete(key);
    }
    return c.body(null, 200);
  });
  return { app, expire };
}
