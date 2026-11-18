// The bounded fetch for callbacks (T048) against a real local HTTPS receiver with a throwaway
// certificate: a host outside the list and a private address are refused before anything is
// sent; an allowed one gets the body and its headers; a redirect is not followed; the answer is
// cut at the size limit; and a receiver that does not answer in time is a timeout.
import { createServer } from "node:https";
import type { Server } from "node:https";
import type { AddressInfo, LookupFunction } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  makeThrowawayCertificate,
  OPENSSL_AVAILABLE,
  requireOpensslInCi,
} from "../../../../test/support/index.ts";
import type { ThrowawayCertificate } from "../../../../test/support/index.ts";
import {
  CallbackError,
  httpsCallbackTransport,
  isPublicAddress,
} from "./index.ts";
import type { CallbackTransportOptions } from "./index.ts";

const never = new AbortController().signal;
const LIMIT_BYTES = 64;
const TIMEOUT_MS = 300;

// Every name resolves to this machine, as a resolver turned inward would answer.
const toLoopback: LookupFunction = (_host, options, callback) => {
  if (options.all === true) {
    callback(null, [{ address: "127.0.0.1", family: 4 }]);
    return;
  }
  callback(null, "127.0.0.1", 4);
};

describe("whether an address is public", () => {
  it.each([
    ["8.8.8.8", true],
    ["20.42.65.92", true],
    ["2606:4700::1111", true],
    ["127.0.0.1", false],
    ["10.1.2.3", false],
    ["172.20.0.1", false],
    ["192.168.77.1", false],
    ["169.254.169.254", false],
    ["100.64.0.1", false],
    ["0.0.0.0", false],
    ["::1", false],
    ["fd00::1", false],
    ["fe80::1", false],
    ["::ffff:10.0.0.1", false],
    ["::ffff:8.8.8.8", true],
    ["not an address", false],
  ])("%s is %s", (address, expected) => {
    expect(isPublicAddress(address)).toBe(expected);
  });
});

requireOpensslInCi();

describe.runIf(OPENSSL_AVAILABLE)("the bounded fetch over HTTPS", () => {
  let certificate: ThrowawayCertificate;
  let server: Server;
  let port: number;
  const received: {
    path: string;
    headers: Record<string, unknown>;
    body: string;
  }[] = [];

  beforeAll(async () => {
    certificate = await makeThrowawayCertificate();
    server = createServer(
      { cert: certificate.cert, key: certificate.key },
      (request, response) => {
        let body = "";
        request.on("data", (chunk: Buffer) => (body += chunk.toString("utf8")));
        request.on("end", () => {
          received.push({
            path: request.url ?? "",
            headers: request.headers,
            body,
          });
          if (request.url === "/redirect") {
            response.writeHead(302, {
              location: "https://localhost/elsewhere",
            });
            response.end();
            return;
          }
          if (request.url === "/silent") {
            return;
          }
          response.writeHead(200, { "content-type": "application/json" });
          response.end(
            request.url === "/large" ? "x".repeat(10_000) : '{"ok":true}',
          );
        });
      },
    );
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  function transport(changes: Partial<CallbackTransportOptions> = {}) {
    return httpsCallbackTransport({
      allowedHosts: [`localhost:${String(port)}`],
      timeoutMs: TIMEOUT_MS,
      maxResponseBytes: LIMIT_BYTES,
      lookup: toLoopback,
      trustedCertificates: certificate.cert,
      addressAllowed: () => true,
      ...changes,
    });
  }

  function url(path: string): URL {
    return new URL(`https://localhost:${String(port)}${path}`);
  }

  async function refusal(work: Promise<unknown>): Promise<unknown> {
    return work.then(
      () => undefined,
      (error: unknown) => error,
    );
  }

  it("posts the body with its headers to an allowed host, and reads the answer", async () => {
    const answer = await transport()(
      {
        url: url("/hook"),
        headers: { "webhook-id": "evt-1" },
        body: '{"a":1}',
      },
      never,
    );

    expect(answer).toEqual({ status: 200, body: '{"ok":true}' });
    expect(received.at(-1)).toMatchObject({
      path: "/hook",
      body: '{"a":1}',
      headers: { "webhook-id": "evt-1" },
    });
  });

  it("refuses a name that resolves to a private address, sending nothing", async () => {
    const before = received.length;

    const error = await refusal(
      transport({ addressAllowed: isPublicAddress })(
        { url: url("/hook"), headers: {}, body: "{}" },
        never,
      ),
    );

    expect(error).toBeInstanceOf(CallbackError);
    expect(error).toMatchObject({ kind: "address_not_allowed" });
    expect(received).toHaveLength(before);
  });

  it.each([
    ["a host outside the list", "https://callbacks.example.test/hook"],
    ["plain HTTP", "http://localhost/hook"],
    ["the allowed name on another port", "https://localhost:1/hook"],
    ["credentials in the address", "https://user:pass@localhost/hook"],
  ])("refuses %s, sending nothing", async (_title, address) => {
    const error = await refusal(
      transport()({ url: new URL(address), headers: {}, body: "{}" }, never),
    );

    expect(error).toMatchObject({ kind: "host_not_allowed" });
  });

  it("does not follow a redirect", async () => {
    const answer = await transport()(
      { url: url("/redirect"), headers: {}, body: "{}" },
      never,
    );

    expect(answer.status).toBe(302);
    expect(received.at(-1)?.path).toBe("/redirect");
  });

  it("reads no more of an answer than the size limit", async () => {
    const answer = await transport()(
      { url: url("/large"), headers: {}, body: "{}" },
      never,
    );

    expect(answer.body).toHaveLength(LIMIT_BYTES);
  });

  it("ends an exchange that takes too long as a timeout", async () => {
    const error = await refusal(
      transport()({ url: url("/silent"), headers: {}, body: "{}" }, never),
    );

    expect(error).toMatchObject({ kind: "timeout" });
  });
});
