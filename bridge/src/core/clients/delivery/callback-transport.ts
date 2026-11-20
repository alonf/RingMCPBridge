// The bounded fetch for MCP Events callbacks (T048; FR-012): every webhook and verification goes
// out through it.
//
// - **Only the allowed hosts.** The host must be one the configuration names (by default ChatGPT's
//   `connectors.api.openai.com`, which T039 part 2 observed), over HTTPS. A name alone allows only
//   HTTPS's default port; `name:port` allows that port (the tests' local receiver).
// - **Only public addresses.** The name is resolved as the connection is made, and an address that
//   is private, local, link-local or otherwise not on the public internet is refused, so a
//   resolver answer cannot turn a callback inward.
// - **No redirects** (Node's request never follows one), a time limit on the whole exchange, and a
//   size limit on the answer that is read.
// - **Its own connections.** Each transport keeps its own pool of connections, made through its
//   own checked resolver, so a connection it reuses was checked by the same rules. Node's shared
//   agent would reuse a connection made without them.
// - Nothing about the callback is logged here; Delivery logs the host and the status.
import { lookup as dnsLookup } from "node:dns";
import type { LookupAddress } from "node:dns";
import { Agent, request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
import type { LookupFunction } from "node:net";

/** One callback request. */
export interface CallbackRequest {
  readonly url: URL;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

/** The callback's answer: its status, and at most the size limit of its body. */
export interface CallbackResponse {
  readonly status: number;
  readonly body: string;
}

/** Sends one callback request. A refusal or a failure to answer rejects with `CallbackError`. */
export type CallbackTransport = (
  request: CallbackRequest,
  signal: AbortSignal,
) => Promise<CallbackResponse>;

/** Why a callback could not be reached. */
export type CallbackErrorKind =
  "host_not_allowed" | "address_not_allowed" | "timeout" | "unreachable";

/** A callback that could not be reached. Its message never quotes the callback's address. */
export class CallbackError extends Error {
  readonly kind: CallbackErrorKind;

  constructor(kind: CallbackErrorKind, options?: ErrorOptions) {
    super(`The callback could not be reached: ${kind}.`, options);
    this.name = "CallbackError";
    this.kind = kind;
  }
}

/** The bounded fetch's limits. */
export interface CallbackTransportOptions {
  /** The hosts a callback may use, as `name` or `name:port`, compared without case. */
  readonly allowedHosts: readonly string[];
  /** How long one exchange may take. */
  readonly timeoutMs: number;
  /** How much of an answer is read; the rest is dropped. */
  readonly maxResponseBytes: number;
  /** Which resolved addresses may be reached; public ones only unless a test says otherwise. */
  readonly addressAllowed?: (address: string) => boolean;
  /** Certificates to trust in place of Node's own list: a test's throwaway certificate. */
  readonly trustedCertificates?: string;
  /** Resolves a name; the system's resolver unless a test says otherwise. */
  readonly lookup?: LookupFunction;
}

const NOT_PUBLIC = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  NOT_PUBLIC.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
  ["64:ff9b::", 96],
] as const) {
  NOT_PUBLIC.addSubnet(network, prefix, "ipv6");
}
const MAPPED_IPV4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

/** Whether an address is on the public internet: not private, local, link-local or reserved. */
export function isPublicAddress(address: string): boolean {
  const mapped = MAPPED_IPV4.exec(address)?.[1];
  if (mapped !== undefined) {
    return isPublicAddress(mapped);
  }
  const family = isIP(address);
  if (family === 0) {
    return false;
  }
  return !NOT_PUBLIC.check(address, family === 4 ? "ipv4" : "ipv6");
}

// A resolver that answers only with allowed addresses, and refuses the connection otherwise.
function checkedLookup(
  resolve: LookupFunction,
  allowed: (address: string) => boolean,
): LookupFunction {
  return (hostname, options, callback) => {
    resolve(hostname, options, (error, address, family) => {
      if (error !== null) {
        callback(error, address, family);
        return;
      }
      const addresses: readonly LookupAddress[] = Array.isArray(address)
        ? address
        : [{ address, family: family ?? 4 }];
      if (
        addresses.length === 0 ||
        !addresses.every((entry) => allowed(entry.address))
      ) {
        callback(new CallbackError("address_not_allowed"), "", 4);
        return;
      }
      callback(null, address, family);
    });
  };
}

/** The bounded fetch over HTTPS. */
export function httpsCallbackTransport(
  options: CallbackTransportOptions,
): CallbackTransport {
  const hosts = new Set(options.allowedHosts.map((host) => host.toLowerCase()));
  const lookup = checkedLookup(
    options.lookup ?? dnsLookup,
    options.addressAllowed ?? isPublicAddress,
  );
  const agent = new Agent({
    keepAlive: true,
    lookup,
    ...(options.trustedCertificates === undefined
      ? {}
      : { ca: options.trustedCertificates }),
  });
  return (request, signal) => {
    const { url } = request;
    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      !hosts.has(url.host.toLowerCase())
    ) {
      return Promise.reject(new CallbackError("host_not_allowed"));
    }
    return exchange(request, signal, options, agent);
  };
}

function exchange(
  request: CallbackRequest,
  signal: AbortSignal,
  options: CallbackTransportOptions,
  agent: Agent,
): Promise<CallbackResponse> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      outgoing.destroy(new CallbackError("timeout"));
    }, options.timeoutMs);
    const outgoing = httpsRequest(
      request.url,
      {
        method: "POST",
        headers: {
          ...request.headers,
          "content-length": String(Buffer.byteLength(request.body)),
        },
        agent,
        signal,
      },
      (incoming) => {
        const chunks: Buffer[] = [];
        let read = 0;
        incoming.on("data", (chunk: Buffer) => {
          const room = options.maxResponseBytes - read;
          if (room > 0) {
            chunks.push(chunk.subarray(0, room));
            read += Math.min(room, chunk.length);
          }
        });
        incoming.on("end", () => {
          clearTimeout(timer);
          resolve({
            status: incoming.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
        incoming.on("error", (error) => {
          clearTimeout(timer);
          reject(asCallbackError(error));
        });
      },
    );
    outgoing.on("error", (error) => {
      clearTimeout(timer);
      reject(asCallbackError(error));
    });
    outgoing.end(request.body);
  });
}

function asCallbackError(error: unknown): CallbackError {
  if (error instanceof CallbackError) {
    return error;
  }
  const cause = (error as { cause?: unknown }).cause;
  if (cause instanceof CallbackError) {
    return cause;
  }
  return new CallbackError("unreachable", { cause: error });
}
