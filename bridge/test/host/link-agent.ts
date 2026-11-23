import {
  discoverAuthorizationServerMetadata,
  exchangeAuthorization,
  registerClient,
  startAuthorization,
} from "@modelcontextprotocol/client";
import { expect } from "vitest";
import { json, OTHER_AGENT } from "./core-fixture.ts";
import { browse } from "../support/index.ts";
export async function linkAgent(
  mcpUrl: URL,
  redirectUri = String(OTHER_AGENT.redirect_uris[0]),
  scope = "read",
): Promise<string> {
  const unauthorized = await fetch(mcpUrl, { method: "POST" });
  expect(unauthorized.status).toBe(401);
  const challenge = unauthorized.headers.get("www-authenticate") ?? "";
  const resourceMetadataUrl = /resource_metadata="([^"]+)"/.exec(
    challenge,
  )?.[1];
  expect(resourceMetadataUrl).toBeDefined();
  const resourceMetadata = (await json(String(resourceMetadataUrl))).body as {
    readonly resource: string;
    readonly authorization_servers: readonly string[];
  };
  expect(resourceMetadata.resource).toBe(mcpUrl.href);
  const [issuerUrl = ""] = resourceMetadata.authorization_servers;
  const metadata = await discoverAuthorizationServerMetadata(issuerUrl);
  if (metadata === undefined) {
    throw new Error("The Issuer's metadata was not found.");
  }
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- an agent with no metadata document registers itself
  const clientInformation = await registerClient(issuerUrl, {
    metadata,
    clientMetadata: {
      client_name: "End-to-end agent",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
  });
  const { authorizationUrl, codeVerifier } = await startAuthorization(
    issuerUrl,
    {
      metadata,
      clientInformation,
      redirectUrl: redirectUri,
      scope,
      resource: mcpUrl,
    },
  );
  const reply = await browse(authorizationUrl, redirectUri);
  const code = reply.get("code");
  if (code === null) {
    throw new Error(`The link failed: ${reply.get("error") ?? "no code"}`);
  }
  const tokens = await exchangeAuthorization(issuerUrl, {
    metadata,
    clientInformation,
    authorizationCode: code,
    iss: reply.get("iss") ?? "",
    codeVerifier,
    redirectUri,
    resource: mcpUrl,
  });
  expect(tokens.scope).toEqual(scope);
  return tokens.access_token;
}
