// Development only (T029): the admin page over stand-in managers and a stand-in Entra, for the
// Playwright checks (`npm run test:pages` starts it) and for looking at the page by hand. It needs
// no database, no Entra and no secrets, and serves on localhost only. Left out of the production
// image, with `bridge/test/`.
// - **Scenarios**: `/dev/start?...` opens a scenario, its own Web over its own stand-ins, chosen
//   by a cookie, so checks run side by side. It then signs in through the stand-in Entra, at once.
//   `health` is ok, offline, ring_lost, store_down, stale, behind or not_linked; `request` is none
//   or waiting; `sign_in` is fresh, stale (6 minutes old) or none.
// - `/dev/newer-request` replaces the waiting request with a newer one, as a second connector would.
// - Each health read is one second later than the last, so a poll shows a new time.
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { getRequestListener } from "@hono/node-server";
import { Web } from "../src/core/clients/web/index.ts";
import type { ConnectorEnrollmentPending } from "../src/core/managers/admin/index.ts";
import { InquiryError } from "../src/core/managers/inquiry/index.ts";
import type { OwnerHealth } from "../src/core/managers/inquiry/index.ts";
import { SystemClock } from "../src/utilities/clock/index.ts";
import { Logger } from "../src/utilities/logging/index.ts";
import type { OwnerSignIn } from "../src/utilities/security/index.ts";

const PORT = Number(process.env.ADMIN_PAGES_PORT ?? "4319");
const BASE = `http://localhost:${String(PORT)}`;
const CORE_VERSION = "0.2.0";
const SCENARIO_COOKIE = "dev_scenario";
const MINUTE_MS = 60_000;
const STALE_SIGN_IN_MS = 6 * MINUTE_MS;
const REQUEST_WAITS_MS = 10 * MINUTE_MS;
const SINCE = "2026-11-10T06:00:00Z";
const FIRST_READ = Date.UTC(2026, 10, 10, 8, 0, 0);
const SECOND_MS = 1_000;
const HTTP_NO_CONTENT = 204;
const HTTP_SEE_OTHER = 303;
const HTTP_NOT_FOUND = 404;

type HealthCase =
  | "ok"
  | "offline"
  | "ring_lost"
  | "store_down"
  | "stale"
  | "behind"
  | "not_linked";

interface Scenario {
  readonly web: Web;
  pending: ConnectorEnrollmentPending | undefined;
}

const clock = new SystemClock();
const scenarios = new Map<string, Scenario>();

function randomText(): string {
  return randomBytes(16).toString("base64url");
}

function healthData(health: HealthCase): OwnerHealth["health"]["data"] {
  const up = { status: "up" as const, since: SINCE };
  return {
    home_link: health === "offline" ? { status: "down", since: SINCE } : up,
    ring_session:
      health === "ring_lost"
        ? { status: "lost", since: SINCE }
        : { status: "ok", since: SINCE },
    database: { status: "ok" },
  };
}

function ownerHealth(health: HealthCase, read: number): OwnerHealth {
  const asOf = new Date(FIRST_READ + read * SECOND_MS).toISOString();
  return {
    health: {
      as_of: asOf,
      as_of_local: asOf,
      freshness: health === "stale" ? "stale" : "cached",
      ...(health === "stale" ? { stale_since: SINCE } : {}),
      data: healthData(health),
    },
    time_zone: "Asia/Jerusalem",
    ...(health === "not_linked"
      ? {}
      : { connector_version: health === "behind" ? "0.1.0" : CORE_VERSION }),
  };
}

function waitingRequest(code: string): ConnectorEnrollmentPending {
  const now = clock.now();
  return {
    key_id: randomText().slice(0, 16),
    enrollment_code: code,
    requested_at: now,
    expires_at: now + REQUEST_WAITS_MS,
  };
}

/** The stand-in Entra: it signs the owner in at once, as fresh or as stale as the scenario says. */
function signIn(stale: boolean): OwnerSignIn {
  return {
    begin: (options) => {
      const state = randomText();
      return Promise.resolve({
        url: `${BASE}/dev/entra?state=${state}`,
        pending: {
          state,
          nonce: randomText(),
          codeVerifier: randomText(),
          startedAt: clock.now(),
          fresh: options.fresh,
        },
      });
    },
    complete: () =>
      Promise.resolve({
        subject: "dev-owner",
        objectId: "dev-owner",
        authenticatedAt: clock.now() - (stale ? STALE_SIGN_IN_MS : 0),
        authenticatedAtSource: "auth_time",
      }),
  };
}

function newScenario(query: URLSearchParams): Scenario {
  const health = (query.get("health") ?? "ok") as HealthCase;
  let reads = 0;
  const scenario: Scenario = {
    pending:
      query.get("request") === "waiting"
        ? waitingRequest("7Q4K-29XM")
        : undefined,
    web: new Web(
      { publicUrl: BASE, coreVersion: CORE_VERSION },
      {
        admin: {
          pendingEnrollment: () => Promise.resolve(scenario.pending),
          approveEnrollment: (keyId) => {
            if (scenario.pending?.key_id !== keyId) {
              return Promise.resolve({ kind: "not_pending" });
            }
            scenario.pending = undefined;
            return Promise.resolve({
              kind: "approved",
              revokedKeyIds: ["older-key-00001"],
            });
          },
        },
        inquiry: {
          getOwnerHealth: () => {
            reads += 1;
            return health === "store_down"
              ? Promise.reject(
                  new InquiryError("unavailable", "The store is down."),
                )
              : Promise.resolve(ownerHealth(health, reads));
          },
        },
        ownerSignIn: signIn(query.get("sign_in") === "stale"),
        serving: () => true,
        clock,
        logger: new Logger({
          sink: () => undefined,
          now: () => clock.now(),
          minLevel: "error",
        }),
      },
    ),
  };
  return scenario;
}

function scenarioOf(request: Request): Scenario | undefined {
  const id = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((pair) => pair.trim())
    .find((pair) => pair.startsWith(`${SCENARIO_COOKIE}=`))
    ?.slice(SCENARIO_COOKIE.length + 1);
  return id === undefined ? undefined : scenarios.get(id);
}

function redirect(location: string, cookie?: string): Response {
  const headers = new Headers({ location });
  if (cookie !== undefined) {
    headers.set("set-cookie", cookie);
  }
  return new Response(null, { status: HTTP_SEE_OTHER, headers });
}

function control(request: Request, url: URL): Response {
  switch (url.pathname) {
    case "/dev/ready":
      return new Response("ready");
    case "/dev/start": {
      const id = randomText();
      scenarios.set(id, newScenario(url.searchParams));
      const then =
        url.searchParams.get("sign_in") === "none"
          ? "/admin"
          : "/admin/sign-in";
      return redirect(then, `${SCENARIO_COOKIE}=${id}; Path=/; SameSite=Lax`);
    }
    case "/dev/entra":
      return redirect(
        `/sign-in/return?state=${url.searchParams.get("state") ?? ""}&code=dev`,
      );
    case "/dev/newer-request": {
      const scenario = scenarioOf(request);
      if (scenario !== undefined) {
        scenario.pending = waitingRequest("H3NB-C8RT");
      }
      return new Response(null, { status: HTTP_NO_CONTENT });
    }
    default:
      return new Response("Not found.", { status: HTTP_NOT_FOUND });
  }
}

const fallback = newScenario(new URLSearchParams());

const listener = getRequestListener(async (incoming) => {
  const url = new URL(incoming.url);
  if (url.pathname.startsWith("/dev/")) {
    return control(incoming, url);
  }
  return (scenarioOf(incoming) ?? fallback).web.fetch(incoming);
});
const server = createServer((incoming, outgoing) => {
  listener(incoming, outgoing).catch((error: unknown) => {
    process.stderr.write(`The dev server failed a request: ${String(error)}\n`);
  });
});
server.listen(PORT, "localhost", () => {
  process.stderr.write(`The admin page's dev server is at ${BASE}/dev/start\n`);
});
