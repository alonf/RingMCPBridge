import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { html } from "hono/html";
import { bodyLimit } from "hono/body-limit";
import {
  partnerOperation,
  type PartnerOperation,
} from "../connector/clients/core-link/messages/index.ts";
import type { PartnerResult } from "../core/clients/connector-link/messages/index.ts";

type Service = (
  operation: PartnerOperation,
  signal: AbortSignal,
) => Promise<PartnerResult>;
const CONFIRM = "__Host-ring-link-proof";

/** Four stable public Ring URLs. The core renders its own pages and sends only named operations to home. */
export function ringIngress(service: Service) {
  const app = new Hono();
  let active = 0;
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    c.header("Referrer-Policy", "no-referrer");
    c.header("X-Content-Type-Options", "nosniff");
    c.header(
      "Content-Security-Policy",
      "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    );
    if (active >= 16) return c.text("Try again shortly.", 503);
    active++;
    try {
      await next();
      return c.res;
    } finally {
      active--;
    }
  });
  app.use(
    "*",
    bodyLimit({
      maxSize: 65536,
      onError: (c) => c.text("Request too large.", 413),
    }),
  );
  app.onError((_error, c) =>
    c.text("Ring connection temporarily unavailable.", 503),
  );
  async function call(
    input: unknown,
    signal: AbortSignal,
  ): Promise<PartnerResult> {
    const parsed = partnerOperation.safeParse(input);
    return parsed.success ? service(parsed.data, signal) : { status: 400 };
  }
  app.get("/ring/home", (c) => {
    const { time, nonce } = c.req.query();
    if (time || nonce)
      return c.redirect(
        "/ring/link?" +
          new URLSearchParams({
            time: time ?? "",
            nonce: nonce ?? "",
          }).toString(),
        303,
      );
    return c.html(
      html`<!doctype html><title>Ring MCP Bridge</title>
        <h1>Ring MCP Bridge</h1>
        <p>
          Manage camera access in
          <a href="/admin#cameras">household settings</a>. To link or remove
          this integration, open My Apps in Ring.
        </p>`,
    );
  });
  app.get("/ring/link", async (c) => {
    const { time, nonce } = c.req.query();
    if (!time && !nonce) return c.redirect("/ring/home", 303);
    if (!time || !nonce)
      return c.text("Start a fresh connection in Ring.", 403);
    const result = await call({ kind: "begin", time, nonce }, c.req.raw.signal);
    if (result.status !== 200 || !result.accountLabel)
      return c.text(
        "Open the connection from Ring or try again shortly.",
        result.status === 503 ? 503 : 403,
      );
    const proof = randomBytes(32).toString("base64url");
    setCookie(c, CONFIRM, nonce + "." + proof, {
      secure: true,
      httpOnly: true,
      sameSite: "Strict",
      path: "/",
      maxAge: 600,
    });
    return c.html(
      html`<!doctype html><title>Link Ring</title>
        <h1>Connect Ring MCP Bridge</h1>
        <p>
          Connect ${result.accountLabel} to share the devices you selected in
          Ring.
        </p>
        <form action="/ring/link" method="post">
          <input type="hidden" name="time" value="${time}" /><input
            type="hidden"
            name="nonce"
            value="${nonce}"
          /><input type="hidden" name="proof" value="${proof}" /><button>
            Confirm connection
          </button>
        </form>`,
    );
  });
  app.post("/ring/link", async (c) => {
    if (
      c.req.header("content-type")?.split(";")[0] !==
      "application/x-www-form-urlencoded"
    )
      return c.text("Expected form.", 415);
    const form = new URLSearchParams(await c.req.text());
    const proof = form.get("proof"),
      nonce = form.get("nonce");
    if (!proof || !nonce || getCookie(c, CONFIRM) !== nonce + "." + proof)
      return c.text("Start a fresh connection in Ring.", 403);
    const result = await call(
      { kind: "confirm", proof, nonce, time: form.get("time") },
      c.req.raw.signal,
    );
    if (result.status !== 303)
      return c.text(
        "Cannot complete account linking.",
        result.status === 200 ? 502 : result.status,
      );
    deleteCookie(c, CONFIRM, { path: "/", secure: true });
    return c.redirect("/ring/home", 303);
  });
  app.post("/ring/token", async (c) => {
    if (
      c.req.header("content-type")?.split(";")[0] !==
      "application/x-www-form-urlencoded"
    )
      return c.text("Expected form.", 415);
    const form = new URLSearchParams(await c.req.text());
    const result = await call(
      {
        kind: "token",
        clientId: form.get("client_id"),
        code: form.get("code"),
      },
      c.req.raw.signal,
    );
    return c.body(null, result.status);
  });
  app.post("/ring/webhook", async (c) => {
    const signature = c.req.header("x-signature");
    if (!signature || !/^sha256=[a-f0-9]{64}$/.test(signature))
      return c.text("Invalid signature.", 403);
    const payload = Buffer.from(await c.req.arrayBuffer()).toString("base64");
    const result = await call(
      { kind: "webhook", signature, payload },
      c.req.raw.signal,
    );
    return c.body(null, result.status);
  });
  return app;
}
