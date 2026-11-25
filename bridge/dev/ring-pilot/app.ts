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
import { InvalidRingGrant, type ringClient } from "./client.ts";
import type { PilotLinks, SavedLink } from "./links.ts";
import { SnapshotError, type Snapshot } from "./snapshot.ts";
import { recordingCallback } from "./camera-callback.ts";

const LINK_WINDOW = 600_000;
const GRANT_WINDOW = 30 * 86_400_000;
const RENEW_EARLY = 60_000;
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
  refresh?: string | undefined;
  sessionExpiry?: number;
  tokenExpiry?: number;
  linkedAt?: number;
  account?: string;
  masked?: string;
  postedNonce?: string;
  session?: string;
  snapshotProof?: string;
  snapshotMessage?: string;
  snapshotSaved?: boolean;
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
  ring: Pick<
    ReturnType<typeof ringClient>,
    "exchange" | "identity" | "activate" | "devices" | "snapshot" | "refresh"
  >,
  now = Date.now,
  snapshotTarget?: { name: string; save: (image: Snapshot) => Promise<void> },
  store?: PilotLinks,
) {
  const app = new Hono();
  const tickets = new Map<string, Ticket>();
  const claimed = new Map<string, number>();
  let sequence = 0;
  for (const link of store?.load() ?? []) {
    tickets.set("linked:" + digest(link.account), {
      ...link,
      // Earlier renewable grants set primary session expiry to exactly 30 days after confirmation.
      linkedAt:
        link.linkedAt ??
        (link.refresh ? link.sessionExpiry - GRANT_WINDOW : now()),
      order: ++sequence,
      busy: false,
      snapshotProof: random(),
    });
  }
  function persist(
    ticket: Ticket,
    confirmation?: { nonce: string; deadline: number },
  ) {
    if (!store) return;
    const {
      account,
      masked,
      access,
      refresh,
      session,
      sessionExpiry,
      expires,
      tokenExpiry,
    } = ticket;
    if (
      !account ||
      !masked ||
      !access ||
      !session ||
      !sessionExpiry ||
      !tokenExpiry
    )
      throw new Error("Incomplete confirmed Ring link.");
    const grant: SavedLink = {
      linkedAt: ticket.linkedAt,
      account,
      masked,
      access,
      refresh,
      session,
      sessionExpiry,
      expires,
      tokenExpiry,
    };
    if (confirmation)
      store.confirm(grant, confirmation.nonce, confirmation.deadline, now());
    else store.save(grant);
  }
  const renewing = new Map<Ticket, Promise<void>>();
  function active(ticket: Ticket) {
    return [...tickets.values()].includes(ticket) && ticket.expires > now();
  }
  function forget(key: string, ticket: Ticket) {
    if (ticket.session && ticket.account) store?.remove(ticket.account);
    tickets.delete(key);
  }
  function forgetTicket(ticket: Ticket) {
    for (const [key, current] of tickets)
      if (current === ticket) forget(key, ticket);
  }
  async function renew(ticket: Ticket) {
    if (!ticket.refresh) return;
    try {
      const tokens = await ring.refresh(ticket.refresh);
      if (!active(ticket)) return;
      ticket.access = tokens.access_token;
      ticket.refresh = tokens.refresh_token ?? ticket.refresh;
      ticket.tokenExpiry = now() + tokens.expires_in * 1000;
      ticket.expires = now() + GRANT_WINDOW;
      persist(ticket);
    } catch (error) {
      if (error instanceof InvalidRingGrant) forgetTicket(ticket);
      throw error;
    }
  }
  async function usableAccess(ticket: Ticket) {
    if (ticket.refresh && (ticket.tokenExpiry ?? 0) <= now() + RENEW_EARLY) {
      let work = renewing.get(ticket);
      if (!work) {
        work = renew(ticket).finally(() => renewing.delete(ticket));
        renewing.set(ticket, work);
      }
      await work;
    }
    if (!active(ticket) || !ticket.access)
      throw new Error("No current Ring grant.");
    return ticket.access;
  }
  function sessionTicket(session: string | undefined) {
    if (!session) return;
    const key = digest(session);
    const owner = store?.browserOwner(key, now());
    return [...tickets.values()].find(
      (ticket) =>
        ticket.session &&
        ((ticket.session === key && (ticket.sessionExpiry ?? 0) > now()) ||
          (owner && ticket.account && digest(ticket.account) === owner)),
    );
  }
  async function saveImage(ticket: Ticket) {
    if (
      !snapshotTarget ||
      !ticket.access ||
      ticket.linkedAt === undefined ||
      ticket.snapshotSaved
    )
      return;
    try {
      const image = await ring.snapshot(
        await usableAccess(ticket),
        snapshotTarget.name,
        now(),
        ticket.linkedAt,
      );
      if (!active(ticket)) return;
      await snapshotTarget.save(image);
      ticket.snapshotSaved = true;
      ticket.snapshotMessage =
        "Snapshot saved on the home computer. Captured " + image.time;
    } catch (error) {
      ticket.snapshotMessage =
        error instanceof SnapshotError
          ? error.message
          : "Snapshot download or save failed. You can retry here.";
    }
  }
  function expire() {
    for (const [key, ticket] of tickets)
      if (ticket.expires <= now()) forget(key, ticket);
    for (const [key, expiry] of claimed)
      if (expiry <= now()) claimed.delete(key);
  }
  function match(time: string, nonce: string) {
    if (
      !/^\d{13}$/.test(time) ||
      !/^[\w-]{43}$/.test(nonce) ||
      claimed.has(nonce) ||
      store?.usedNonce(nonce, now())
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
  app.onError((error, c) =>
    error instanceof InvalidRingGrant
      ? c.text(
          "Ring has expired or revoked this authorization. Open the pilot in the Ring Appstore to authorize it again.",
          401,
        )
      : c.text(
          "The pilot could not complete the request. Try again shortly.",
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
        if (token.refresh_token) ticket.refresh = token.refresh_token;
        ticket.tokenExpiry = now() + token.expires_in * 1000;
        ticket.expires = Math.min(ticket.expires, ticket.tokenExpiry);
      }
      const identity = await ring.identity(ticket.access);
      ticket.account = identity.id;
      ticket.masked = mask(identity.attributes.email);
      for (const [otherKey, other] of tickets) {
        if (other.account !== ticket.account || other === ticket) continue;
        if (other.order < ticket.order && !other.session)
          tickets.delete(otherKey);
        if (other.order > ticket.order) tickets.delete(key);
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
    if (!time && !nonce) return c.redirect("/ring/home", 303);
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
          ${snapshotTarget ? html`<button name="snapshot" value="save">Confirm and save latest ${snapshotTarget.name} snapshot</button>` : ""}
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
      const browser = random();
      const linkedAt = now();
      const expires = ticket.refresh
        ? linkedAt + GRANT_WINDOW
        : ticket.tokenExpiry;
      const completed = {
        ...ticket,
        linkedAt,
        session: digest(browser),
        sessionExpiry: expires,
        expires,
      };
      persist(completed, { nonce, deadline: Number(time) + LINK_WINDOW });
      Object.assign(ticket, completed);
      for (const [key, other] of tickets) {
        if (other !== ticket && other.account === ticket.account)
          tickets.delete(key);
      }
      claimed.set(nonce, Number(time) + LINK_WINDOW);
      if (snapshotTarget) ticket.snapshotProof = random();
      setCookie(c, "__Host-ring-session", browser, {
        ...COOKIE,
        sameSite: "Lax",
        maxAge: Math.floor((ticket.expires - now()) / 1000),
      });
      if (body.get("snapshot") === "save") await saveImage(ticket);
      return c.redirect("/ring/home", 303);
    } finally {
      ticket.busy = false;
    }
  });
  app.get("/ring/home", async (c) => {
    const nonce = c.req.query("nonce");
    const time = c.req.query("time");
    if (nonce && time)
      return c.redirect(
        "/ring/link?" + new URLSearchParams({ nonce, time }).toString(),
        303,
      );
    const ticket = sessionTicket(getCookie(c, "__Host-ring-session"));
    if (!ticket?.access) {
      if (![...tickets.values()].some((candidate) => candidate.session)) {
        return c.html(
          html`<!doctype html><title>Connect the Ring pilot</title>
            <h1>No saved Ring connection on this pilot</h1>
            <p>
              Open Ring MCP Bridge Pilot in the
              <a href="https://ring.com/appstore">Ring Appstore</a> and complete
              account linking. On your return here, choose
              <strong>Confirm connection</strong> to save the connection on the
              home computer.
            </p>
            <p>
              If Ring still shows an active connection from the earlier pilot,
              disconnect this private app once and connect it again. That
              version kept the authorization only until the pilot stopped.
            </p>`,
        );
      }
      const proof = random();
      setCookie(c, "__Host-ring-signin", proof, { ...COOKIE, maxAge: 600 });
      return c.html(
        html`<!doctype html><title>Ring pilot sign-in</title>
          <h1>Sign in to this browser</h1>
          <p>
            Use a one-time browser code from the pilot on your home computer.
          </p>
          <form method="post" action="/ring/sign-in">
            <input type="hidden" name="proof" value="${proof}" />
            <label
              >Browser code <input name="code" required autocomplete="off"
            /></label>
            <button>Sign in</button>
          </form>
          <p>
            To get a code, run the home launcher with the existing credentials
            CSV and <code>-BrowserCode</code>. If it reports no saved
            authorization, open the private app in the
            <a href="https://ring.com/appstore">Ring Appstore</a> to authorize
            it once.
          </p>`,
      );
    }
    const names = await ring.devices(await usableAccess(ticket));
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
        ${ticket.snapshotMessage ? html`<p>${ticket.snapshotMessage}</p>` : ""}
        ${
          snapshotTarget && ticket.snapshotProof && !ticket.snapshotSaved
            ? html`<form method="post" action="/ring/snapshot">
                <input
                  type="hidden"
                  name="proof"
                  value="${ticket.snapshotProof}"
                />
                <button>
                  Save latest ${snapshotTarget.name} snapshot on the home
                  computer
                </button>
              </form>`
            : ""
        }
        <p>You can remove this connection in Ring.</p>`,
    );
  });
  app.post("/ring/sign-in", async (c) => {
    const data = new URLSearchParams(await c.req.text());
    const proof = getCookie(c, "__Host-ring-signin");
    if (!proof || !equal(proof, data.get("proof") ?? ""))
      return c.text("Open the pilot homepage to sign in.", 403);
    const browser = random();
    if (
      !store?.redeem(
        (data.get("code") ?? "").trim(),
        now(),
        digest(browser),
        now() + GRANT_WINDOW,
      )
    )
      return c.text(
        "Invalid or expired browser code. Request a new code on the home computer.",
        403,
      );
    setCookie(c, "__Host-ring-session", browser, {
      ...COOKIE,
      sameSite: "Lax",
      maxAge: GRANT_WINDOW / 1000,
    });
    return c.redirect("/ring/home", 303);
  });
  app.post("/ring/snapshot", async (c) => {
    const ticket = sessionTicket(getCookie(c, "__Host-ring-session"));
    const proof = new URLSearchParams(await c.req.text()).get("proof") ?? "";
    if (!ticket?.snapshotProof || !equal(ticket.snapshotProof, proof))
      return c.text("Linked pilot session required.", 403);
    if (ticket.busy) return c.text("Snapshot in progress.", 409);
    ticket.busy = true;
    try {
      await saveImage(ticket);
      return c.redirect("/ring/home", 303);
    } finally {
      ticket.busy = false;
    }
  });
  app.post("/ring/webhook", async (c) => {
    const raw = Buffer.from(await c.req.arrayBuffer());
    const signature =
      "sha256=" + createHmac("sha256", signingKey).update(raw).digest("hex");
    if (!equal(signature, c.req.header("X-Signature") ?? ""))
      return c.text("Invalid signature", 403);
    let event;
    let payload: unknown;
    try {
      payload = JSON.parse(raw.toString("utf8"));
      event = webhook.parse(payload);
    } catch {
      return c.text("Invalid event", 400);
    }
    if (
      event.data.type === "motion_detected" ||
      event.data.type === "button_press"
    ) {
      const recording = recordingCallback(payload);
      if (!recording) return c.text("Invalid recording notification", 400);
      store?.receiveRecording(recording, now());
    }
    if (event.data.type === "app_integration_removed") {
      const account = event.meta?.account_id ?? event.data.attributes?.source;
      if (!account) return c.text("Missing account", 400);
      for (const [key, ticket] of tickets)
        if (ticket.account === account) forget(key, ticket);
    }
    return c.body(null, 200);
  });
  async function maintain() {
    expire();
    store?.expireWatches(now());
    await Promise.allSettled(
      [...tickets.values()]
        .filter(
          (ticket) =>
            ticket.session &&
            ticket.refresh &&
            (ticket.tokenExpiry ?? 0) <= now() + RENEW_EARLY,
        )
        .map(usableAccess),
    );
  }
  return { app, expire, maintain };
}
