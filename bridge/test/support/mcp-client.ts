// MCP SDK client helpers for end-to-end tests (T010, I4): the agent's side of the MCP Endpoint,
// through @modelcontextprotocol/client 2.4.0, the same SDK the agents' hosts use.
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

/** The client the tests act as. */
const CLIENT_INFO = { name: "bridge-tests", version: "0.0.0" } as const;

/**
 * The protocol era a client speaks: `legacy`, the SDK client's default (2025-11-25 and earlier), or
 * `modern`, pinned to 2026-07-28 (T024).
 */
export type ProtocolEra = "legacy" | "modern";

/** The client options that make a client speak `era`. */
export function eraOptions(
  era: ProtocolEra,
): ConstructorParameters<typeof Client>[1] {
  return era === "modern"
    ? { versionNegotiation: { mode: { pin: "2026-07-28" } } }
    : {};
}

/** A connected MCP client. */
export interface ConnectedClient {
  readonly client: Client;
  close(): Promise<void>;
}

/** Something an in-memory client can be connected to: an MCP server's `connect`. */
export interface InMemoryServer {
  connect(transport: InMemoryTransport): Promise<void>;
}

/** Connects a client to `server` in the same process, with no network between them. */
export async function connectInMemory(
  server: InMemoryServer,
): Promise<ConnectedClient> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client(CLIENT_INFO);
  await client.connect(clientSide);
  return { client, close: () => client.close() };
}

/**
 * Connects a client to an MCP endpoint over Streamable HTTP, sending `accessToken` as a bearer
 * token when given, as a signed-in agent does, in the legacy era unless `era` says otherwise.
 */
export async function connectOverHttp(
  endpoint: URL,
  options: { readonly accessToken?: string; readonly era?: ProtocolEra } = {},
): Promise<ConnectedClient> {
  const headers: Record<string, string> =
    options.accessToken === undefined
      ? {}
      : { authorization: `Bearer ${options.accessToken}` };
  const transport = new StreamableHTTPClientTransport(endpoint, {
    requestInit: { headers },
  });
  const client = new Client(CLIENT_INFO, eraOptions(options.era ?? "legacy"));
  await client.connect(transport);
  return { client, close: () => client.close() };
}
