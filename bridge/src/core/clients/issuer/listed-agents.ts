// Which clients may link (PT-18, FR-030, DRIFT-001-39): listed agents only, never one the owner has
// revoked, and only to redirect URIs listed for it.
// - An agent with a client ID metadata document (CIMD) is listed under its document's URL. Its
//   document is fetched only after that check, and its redirect URIs must all be listed ones.
// - An agent that registers itself (DCR) gets a new client id each time, so the listing cannot name
//   it. Its listed client id is only a name; it is accepted when every redirect URI it registers is
//   listed for one agent, and it is that agent from then on. The match is made again each time the
//   client is used, so revoking or unlisting the agent ends it.
// - An agent on the owner's machine, such as Claude Code, gets its sign-in back on a loopback port it
//   picks each time (RFC 8252 section 7.3), so a loopback redirect URI matches with the port ignored.
//   Nothing else about it may differ (T033, DRIFT-001-65).
import type {
  AgentScope,
  ListedAgent,
  SettingsStore,
} from "../../access/settings/index.ts";

/** The part of Settings the Issuer reads. */
export type AgentListing = Pick<SettingsStore, "agent" | "agents">;

/** The scopes the Issuer grants in iteration 001: `read` only (FR-030). */
const GRANTABLE: readonly AgentScope[] = ["read"];

/** The listed agents, as the Issuer checks clients against them. */
export class ListedAgents {
  readonly #listing: AgentListing;

  constructor(listing: AgentListing) {
    this.#listing = listing;
  }

  /** The agent listed under this CIMD client id, unless it is not listed or is revoked. */
  async byDocument(
    clientId: string,
    signal: AbortSignal,
  ): Promise<ListedAgent | undefined> {
    const agent = await this.#listing.agent(clientId, signal);
    return agent === undefined || isRevoked(agent) ? undefined : agent;
  }

  /** Whether a CIMD client is listed, not revoked, and asks only for its listed redirect URIs. */
  async allowsDocumentClient(
    clientId: string,
    redirectUris: readonly string[],
    signal: AbortSignal,
  ): Promise<boolean> {
    const agent = await this.byDocument(clientId, signal);
    return agent !== undefined && covers(agent, redirectUris);
  }

  /**
   * The agent a self-registered client belongs to: the first, in client-id order, that is not
   * revoked and lists every one of its redirect URIs.
   */
  async byRedirectUris(
    redirectUris: readonly string[],
    signal: AbortSignal,
  ): Promise<ListedAgent | undefined> {
    if (redirectUris.length === 0) {
      return undefined;
    }
    const agents = await this.#listing.agents(signal);
    return agents.find(
      (agent) => !isRevoked(agent) && covers(agent, redirectUris),
    );
  }
}

/** The scopes an agent may be granted now: its listed ones that iteration 001 grants. */
export function grantableScopes(agent: ListedAgent): readonly AgentScope[] {
  return GRANTABLE.filter((scope) => agent.scopes.includes(scope));
}

function isRevoked(agent: ListedAgent): boolean {
  return agent.revoked_at !== undefined;
}

function covers(agent: ListedAgent, redirectUris: readonly string[]): boolean {
  return redirectUris.every((uri) =>
    agent.redirect_uris.some((listed) => sameRedirect(listed, uri)),
  );
}

/** The hosts a native app's loopback redirect may name (RFC 8252 sections 7.3 and 8.3). */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
]);

/** Whether this redirect URI is plain `http:` to the machine the agent runs on. */
export function isLoopbackRedirect(uri: string): boolean {
  const url = URL.parse(uri);
  return (
    url !== null && url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname)
  );
}

/** The same redirect URI, or the same loopback one on another port. */
function sameRedirect(listed: string, asked: string): boolean {
  if (listed === asked) {
    return true;
  }
  if (!isLoopbackRedirect(listed) || !isLoopbackRedirect(asked)) {
    return false;
  }
  return withoutPort(listed) === withoutPort(asked);
}

function withoutPort(uri: string): string {
  const url = new URL(uri);
  url.port = "";
  return url.href;
}
