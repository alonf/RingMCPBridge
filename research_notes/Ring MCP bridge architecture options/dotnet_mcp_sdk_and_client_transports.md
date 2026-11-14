# .NET 10 MCP SDK and client transports for an always-on Ring MCP bridge (state as of 2026-10-24)

Research date: 2026-10-24. Most facts come from primary sources:
- csharp-sdk GitHub releases, docs and source on `main`;
- NuGet;
- code.claude.com and claude.com/docs;
- developers.openai.com;
- the modelcontextprotocol spec repository.

Earlier notes in `research_notes/Ring MCP bridge research/mcp_design_patterns.md` covered the spec changes in 2025-11-25 and 2026-07-28, OpenAI MCP Events, and Claude Code channels. This file verifies and updates those notes, and adds the .NET-specific facts and per-client transport facts. Secondary or unverified items are flagged inline.

## Overall verdict: can one remote (Azure, Streamable HTTP) .NET 10 server serve every target client, including real-time push?

### Takeaway
A remote .NET 10 server can serve **tools, resources, prompts, images, auth and (for ChatGPT) real-time push** to all the target clients. The one exception is **unsolicited push into a running Claude Code session**: Claude Code "channels" still require a **local stdio subprocess** that negotiates the **legacy (pre-2026-07-28) handshake**.

For push, the three client families differ:
- **ChatGPT** push is remote-only, via webhook MCP Events.
- **claude.ai / Claude Desktop / Claude mobile** have **no documented push path**, either for remote connectors or via channels, which are Claude Code-only.
- **Claude Code** has two push-like options:
  - true push needs a stdio channel shim;
  - a remote-only alternative exists: MCP Tasks, public beta. The agent starts a long-running "wait for event" call, and Claude Code picks it up "unprompted" when idle. This is agent-initiated, not unsolicited.

### Cited Findings
- The C# SDK is stable at **v2.3.0 (2026-10-20)**. It targets net8.0, net9.0 and net10.0. **v2.0.0 (2026-07-28)** "brings the C# SDK into stable alignment with the MCP 2026-07-28 specification" and keeps "down-level interoperability for peers negotiating 2025-11-25 and earlier." — [v2.0.0 release](https://github.com/modelcontextprotocol/csharp-sdk/releases/tag/v2.0.0); [NuGet ModelContextProtocol.AspNetCore](https://www.nuget.org/packages/ModelContextProtocol.AspNetCore)
- **Claude Code channel requirements:** "A channel is an MCP server that runs on the same machine as Claude Code. Claude Code spawns it as a subprocess and communicates over stdio." Requirement #3 is "Connect over stdio transport". — [Claude Code: Channels reference](https://code.claude.com/docs/en/channels-reference)
- **Channels on the v2 runtime:** "a channel server that negotiates MCP protocol revision 2026-07-28 can't deliver channel messages, so Claude Code doesn't register it as a channel. A channel server that doesn't support that revision connects on the earlier handshake and registers as before." — [Claude Code: MCP](https://code.claude.com/docs/en/mcp)
- **claude.ai and Desktop:** "Claude doesn't yet support these MCP features, so don't build a feature that depends on them: Resource subscriptions; Sampling; Advanced or draft capabilities." — [Build an MCP server for Claude](https://claude.com/docs/connectors/building)
- **ChatGPT:** "MCP Events in ChatGPT requires MCP 2.0 (protocol version `2026-07-28`)." It is webhook-only: "Polling, streaming, and the draft's `gap` and `terminated` control notifications are not supported." — [OpenAI: MCP Events](https://developers.openai.com/plugins/build/mcp-events)
- **Claude Code MCP tasks:** "If Claude is idle when the result arrives, Claude starts on it unprompted." MCP tasks are "in public beta in the Claude Code CLI and require Claude Code v2.1.304 or later." — [Claude Code: MCP](https://code.claude.com/docs/en/mcp). v2.1.304 was released 2026-10-19 — [release v2.1.304](https://github.com/anthropics/claude-code/releases/tag/v2.1.304)

### Inferences
- **Recommended topology:** one Azure-hosted ASP.NET Core (.NET 10) dual-era Streamable HTTP server as the system of record. It handles tools/resources, OAuth resource-server duties, the durable event log, ChatGPT webhook subscriptions, and Tasks. Add an **optional thin local stdio "channel shim"** only for Claude Code users who want true push.
  - The shim can itself be C#. Pin it to `ProtocolVersion = "2025-11-25"` (see the Claude Code section). It needs an outbound connection to the Azure bridge, for example its own MCP client using `subscriptions/listen`, or SSE/SignalR. It re-emits events as `notifications/claude/channel`.
  - A "local stdio process" is required for **no other target client**. claude.ai and Desktop cannot receive push even from a local process, because channels are a Claude Code feature.
- **What to build for claude.ai and Desktop:** a cursor-based `get_events(since)` tool plus MCP Apps UI. "Push" there means the user asking.
- **Claude Code MCP Tasks** (remote, no shim) is a usable "wake the agent" fallback with constraints:
  - the CLI only;
  - 2026-07-28 negotiation;
  - sessions that fetch feature flags, so not Bedrock or Vertex;
  - main conversation only;
  - one armed wait per event.
  It works on the same Azure server via `ModelContextProtocol.Extensions.Tasks`.

### Gaps
- No primary source says whether a **WebSocket (`type: "ws"`) remote server can register as a Claude Code channel**.
  - The MCP doc says ws "suits remote MCP servers that push events to Claude unprompted".
  - But the channels reference requires stdio.
  - The v2 runtime negotiates 2026-07-28 only with "HTTP, stdio, and claude.ai connector servers", so ws stays on the legacy handshake.
  - This is ambiguous. Do not assume a ws channel works without testing.
  - Even if a ws server could be a channel, the C# SDK ships no WebSocket server transport ([transports.md](https://github.com/modelcontextprotocol/csharp-sdk/blob/main/docs/concepts/transports/transports.md)), so a C# version would need a custom transport.
- I did not verify whether the Claude Desktop app's embedded Claude Code (Code tab) supports `--channels`.
- I did not check whether local Desktop extensions (MCPB) handle any server notifications. Only remote-connector docs were read for Desktop.
- **Shim pinning vs env var:** using the global `MCP_PROTOCOL_NEGOTIATION=legacy` for a channel would also disable MCP Tasks and 2026-07-28 features for the Azure server (see section 4 Inferences). Pinning the shim's `ProtocolVersion` avoids this, if it works.

## 1. Official C# MCP SDK: latest versions, dates, GA status, .NET 10 support

### Takeaway
The official SDK (`modelcontextprotocol/csharp-sdk`) has been **GA since v1.0.0 (2026-02-25)**. It reached **v2.0.0 GA on the day the 2026-07-28 spec shipped**, and the **latest is v2.3.0 (2026-10-20)**. All core packages ship **net10.0** builds, plus net8.0, net9.0 and netstandard2.0. The extension packages are versioned in lockstep at 2.3.0.

### Cited Findings
**GitHub release timeline** — [releases](https://github.com/modelcontextprotocol/csharp-sdk/releases)

| Version | Date | Status |
|---|---|---|
| v2.3.0 | 2026-10-20 | stable |
| v2.2.0 | 2026-08-13 | stable |
| v2.1.0 | 2026-08-05 | stable |
| v2.0.0 | 2026-07-28 | stable |
| v2.0.0-rc.2 | 2026-07-28 | prerelease |
| v2.0.0-rc.1 | 2026-07-25 | prerelease |
| v2.0.0-preview.3 | 2026-07-15 | prerelease |
| v2.0.0-preview.2 | 2026-07-09 | prerelease |
| v2.0.0-preview.1 | 2026-06-26 | prerelease |
| v1.4.1 | 2026-07-09 | stable |
| v1.4.0 | 2026-06-04 | stable |
| v1.3.0 | 2026-05-08 | stable |
| v1.2.0 | 2026-03-27 | stable |
| v1.1.0 | 2026-03-06 | stable |
| v1.0.0 | 2026-02-25 | stable (first GA) |
| v1.0.0-rc.1 | 2026-02-24 | prerelease |
| 0.x previews | 2025-04 to 2026-02 | all prerelease |

**NuGet packages and targets**
- `ModelContextProtocol.AspNetCore` 2.3.0 (10/20/2026) targets net8.0, net9.0 and net10.0. It depends on `ModelContextProtocol` (= 2.3.0). — [NuGet: ModelContextProtocol.AspNetCore](https://www.nuget.org/packages/ModelContextProtocol.AspNetCore)
- These packages are all at 2.3.0 and target .NETStandard2.0, net8.0, net9.0 and net10.0 (per the nuspec on the NuGet flat container):
  - `ModelContextProtocol.Core`
  - `ModelContextProtocol`
  - `ModelContextProtocol.Extensions.Apps`
  - `ModelContextProtocol.Extensions.Tasks`
  - Sources: [NuGet: ModelContextProtocol.Core](https://www.nuget.org/packages/ModelContextProtocol.Core); [NuGet: ModelContextProtocol](https://www.nuget.org/packages/ModelContextProtocol)
- `src/` contains these packages: `ModelContextProtocol.Core`, `ModelContextProtocol`, `ModelContextProtocol.AspNetCore`, `ModelContextProtocol.Extensions.Apps`, `ModelContextProtocol.Extensions.Skills`, `ModelContextProtocol.Extensions.Tasks` and `ModelContextProtocol.Analyzers`. — [csharp-sdk src](https://github.com/modelcontextprotocol/csharp-sdk/tree/main/src)

**v2.x release contents**
- v2.3.0 (2026-10-20):
  - **Breaking:** `McpClient.ServerInfo` became nullable, because on 2026-07-28 `server/discover` identity is optional.
  - "Make modern Streamable HTTP status mapping deterministic": "Modern responses wait for the first protocol message before sending headers; long-running silent handlers may need progress output or an appropriate HTTP timeout."
  - It also documents "standing support for new MCP specification revisions" (#1826).
  - Dependencies aligned to Microsoft.Extensions.AI 10.11.0 and System 10.0.13.
  - Source: [v2.3.0 release](https://github.com/modelcontextprotocol/csharp-sdk/releases/tag/v2.3.0)
- v2.2.0 (2026-08-13) "adds hybrid stateful/stateless HTTP serving so clients using the 2025-11-25 and 2026-07-28 protocol revisions can share an endpoint" (`HttpServerSessionMode`, #1796). — [v2.2.0 release](https://github.com/modelcontextprotocol/csharp-sdk/releases/tag/v2.2.0)
- v2.1.0 (2026-08-05) "adds an opt-in `subscriptions/listen` handler for custom server-side notification streams" (#1775), plus an Application Insights telemetry example. — [v2.1.0 release](https://github.com/modelcontextprotocol/csharp-sdk/releases/tag/v2.1.0)

**Tiering (from prior notes)**
- "All four Tier 1 SDKs support `2026-07-28`" (TypeScript, Python, Go, C#). — [MCP blog: 2026-07-28](https://blog.modelcontextprotocol.io/posts/2026-07-28/)

### Inferences
- .NET 10 is a first-class target with dedicated net10.0 assets, not just forward compatibility. A .NET 10 ASP.NET Core host on Azure is fully supported.
- The cadence is about one minor release every 1–2 months, with breaking changes allowed in minors when "corrective" (the 2.3.0 `ServerInfo` change). Pin exact versions and read release notes on upgrade.

### Gaps
- I did not check the `ModelContextProtocol.Extensions.Skills` package (an extension for "skills").
- I did not look up the published versioning-policy page (csharp.sdk.modelcontextprotocol.io/v2/versioning.html).

## 2. Spec revisions supported and dual-era (2025-11-25 + 2026-07-28) serving in C#

### Takeaway
The C# server supports protocol versions **2024-11-05, 2025-03-26, 2025-06-18, 2025-11-25 and 2026-07-28**. It can serve **both eras on one endpoint**, and the mode is chosen with `HttpServerTransportOptions.SessionMode`:
- **`Stateless`** (the v2 default): modern requests are stateless, and `initialize` clients are served per-POST without sessions.
- **`Stateful`**: refuses 2026-07-28 with `-32022`, which forces dual-path clients to downgrade.
- **`StatefulForInitializeClients`** (hybrid, v2.2.0): legacy clients get full sessions, and modern clients are stateless.

Legacy SSE is off by default. SSE resumability (`EventStreamStore`) survives only as a legacy-session feature.

### Cited Findings
**Supported versions and pinning**
- `McpServerOptions.ProtocolVersion` docs: "Supported values are `2024-11-05`, `2025-03-26`, `2025-06-18`, `2025-11-25`, and `2026-07-28`."
  - "If null, the server supports all of the versions listed above."
  - For initialize clients it returns the requested version, or otherwise `2025-11-25`.
  - For discover clients it advertises `2026-07-28`.
  - "Setting it to `2026-07-28` makes the server reject `initialize` handshakes; setting it to an earlier value makes the server reject `2026-07-28` per-request metadata."
  - Source: [McpServerOptions.cs](https://github.com/modelcontextprotocol/csharp-sdk/blob/main/src/ModelContextProtocol.Core/Server/McpServerOptions.cs)

**Session modes** — source: [Stateless and stateful mode](https://github.com/modelcontextprotocol/csharp-sdk/blob/main/docs/concepts/stateless/stateless.md)
- `Stateless` is "the current default and the forward-compatible choice."
  - Stateless servers "still respond to clients on `2025-11-25` and earlier — the SDK keeps the `initialize` + `Mcp-Session-Id` handshake available for those clients".
  - However, those clients "cannot use the session-dependent features (unsolicited notifications, resource subscriptions, per-client isolation)."
- `Stateful`: "a `2026-07-28` request is refused with `UnsupportedProtocolVersion`; the stateful path activates only when a client falls back to an initialize-capable revision."
- `StatefulForInitializeClients` "serves both eras on a single endpoint":
  - `initialize` clients get a "Full stateful session, `Mcp-Session-Id` issued and echoed, `GET` and `DELETE` available, server-to-client requests supported".
  - `2026-07-28` clients are "Served per request with no session ID minted or echoed; `GET` and `DELETE` return `405`".
- **2026-07-28 restrictions on a hybrid endpoint:** "no unsolicited notifications, no resource subscriptions, no server-initiated ping, and no per-client isolation. Use MRTR for elicitation."

**Obsolete options and legacy SSE** — same source
- Stateful-only knobs are `[Obsolete]` with `MCP9006` ("only apply to initialize-handshake back-compat"): `IdleTimeout`, `MaxIdleSessionCount`, `EventStreamStore`, `SessionMigrationHandler` and `PerSessionExecutionContext`.
- Legacy `/sse` and `/message` endpoints are "disabled by default" (`EnableLegacySse` is `[Obsolete]`, `MCP9004`) and are "always disabled in stateless mode."
- Stateful defaults: idle timeout **2 hours**, max idle sessions **10,000**. Stateful mode "Requires session affinity (sticky sessions)".

**Client-side era detection** — same source
- "HTTP: the client sends its first request with the `2026-07-28` `MCP-Protocol-Version` header. If the server returns HTTP `400` with anything other than a structured `-32022`/`-32021`/`-32020` JSON-RPC error, the client switches to the `initialize` flow."
- stdio: a `server/discover` probe with a 5-second timeout.

**v2.0.0 wire-level changes** — [v2.0.0 release](https://github.com/modelcontextprotocol/csharp-sdk/releases/tag/v2.0.0)
- Implemented:
  - SEP-2243 headers (`Mcp-Method`/`Mcp-Name`, `x-mcp-header`);
  - SEP-2549 caching hints (`TimeToLive`/`CacheScope`);
  - MRTR (#1458);
  - SEP-2663 Tasks extension;
  - MCP Apps extension;
  - SEP-990 Enterprise Managed Authorization;
  - RFC 9207 issuer validation;
  - mandatory PKCE S256 in the OAuth client;
  - `application_type` in DCR.
- Deprecated: Roots, Sampling and Logging (`MCP9005`).

**Spec basis (from prior notes)**
- "A dual-era server MAY serve both eras concurrently on the same endpoint or process." Legacy client to modern-only server: "Fails." — [Versioning 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning)

### Inferences
- For a bridge that also needs legacy push (e.g. `resources/subscribe` for 2025-11-25 clients), use **`StatefulForInitializeClients`** with sticky sessions (ARR affinity on App Service, or session affinity on Container Apps). This closes the prior-notes gap on "how ergonomically each server SDK supports dual-era serving".
- Plain `Stateless` is simpler and scales out. Its cost is that legacy clients get no notifications.
- Explicitly set `SessionMode` (and optionally `ProtocolVersion`), as the SDK docs recommend, so default changes do not silently alter behavior.

### Gaps
- I found no C# SDK statement on support for any post-2026-07-28 draft revision.
- I did not check how `Stateless` mode handles a legacy client that sends `resources/subscribe` (rejected, or accepted and ignored).

## 3. C# SDK feature matrix relevant to the bridge (notifications, subscriptions, elicitation, OAuth, CIMD, annotations, content, MCP Apps, Tasks, custom methods)

### Takeaway
The SDK covers almost everything the bridge needs:
- stateless `subscriptions/listen` streaming, through a custom handler;
- MRTR elicitation in form and URL modes;
- tool annotations;
- image, audio, `resource_link` and embedded-resource content;
- MCP Apps (experimental);
- Tasks (stateless-capable);
- arbitrary custom JSON-RPC methods (experimental).

It does **not** include:
- an OAuth **authorization server**: it is resource-server-only, plus a full OAuth client;
- any **MCP Events (SEP-3415)** support;
- any WebSocket transport.

Several SDK docs pages contradict each other or lag 2026-07-28.

### Cited Findings
**Server-to-client notifications over Streamable HTTP**
- Stateless mode: "Unsolicited server-to-client notifications (for example, resource update notifications, logging messages) are not supported. Every notification must be part of a direct response to a client `POST`." — [stateless.md](https://github.com/modelcontextprotocol/csharp-sdk/blob/main/docs/concepts/stateless/stateless.md)
- Stateful mode supports them via the `GET` stream. "If the client hasn't opened one, the server has no delivery path for unsolicited messages and silently drops them." — [stateless.md](https://github.com/modelcontextprotocol/csharp-sdk/blob/main/docs/concepts/stateless/stateless.md)
- **2026-07-28 `subscriptions/listen` (v2.1.0+):**
  - `WithSubscriptionsListenHandler(...)`/`McpServerHandlers.SubscriptionsListenHandler` lets a server "fully own a long-lived `subscriptions/listen` stream".
  - The handler must send `notifications/subscriptions/acknowledged` first and tag notifications with `_meta.subscriptionId`.
  - It "does not advertise capabilities automatically."
  - Source: [resources.md](https://github.com/modelcontextprotocol/csharp-sdk/blob/main/docs/concepts/resources/resources.md)
- PR #1775 (merged 2026-08-04) states the custom handler "can stream notifications over the request response stream even under stateless Streamable HTTP, where the held-open POST is the only solicited server-to-client channel." It also says "Protocol-version gating (2026-07-28+) is enforced by the SDK" and that the built-in handling covers `*/list_changed`. — [PR #1775](https://github.com/modelcontextprotocol/csharp-sdk/pull/1775); [issue #1662](https://github.com/modelcontextprotocol/csharp-sdk/issues/1662)
- Batched change notifications: `DeferChangedEvents()` (v2.0.0, #1689). — [v2.0.0 release](https://github.com/modelcontextprotocol/csharp-sdk/releases/tag/v2.0.0)

**Resource subscriptions**
- Legacy `resources/subscribe` uses `WithSubscribeToResourcesHandler`/`WithUnsubscribeFromResourcesHandler`, and the sample requires `SessionMode = Stateful`.
- `server.SendNotificationAsync(NotificationMethods.ResourceUpdatedNotification, ...)`.
- Source: [resources.md](https://github.com/modelcontextprotocol/csharp-sdk/blob/main/docs/concepts/resources/resources.md)
- Protocol types include `SubscriptionsListenRequestParams` and `SubscriptionsAcknowledgedNotificationParams`. — [Protocol folder](https://github.com/modelcontextprotocol/csharp-sdk/tree/main/src/ModelContextProtocol.Core/Protocol)

**Elicitation**
- Form and URL modes are both supported. URL mode sets `Mode = "url"` with `Url` and `ElicitationId`.
- `ElicitAsync` "throws `InvalidOperationException("Elicitation is not supported in stateless mode.")` whenever the server is running stateless — including every Streamable HTTP request served under `2026-07-28`." Instead, "throw `InputRequiredException`... It works across both protocol eras and all three HTTP `SessionMode` configurations."
- `server.IsMrtrSupported` checks support. `UrlElicitationRequiredException` is JSON-RPC `-32042`.
- Source: [elicitation.md](https://github.com/modelcontextprotocol/csharp-sdk/blob/main/docs/concepts/elicitation/elicitation.md)
- URL-mode elicitation (SEP-1036) was implemented under an issue closed 2025-12-05. — [issue #750](https://github.com/modelcontextprotocol/csharp-sdk/issues/750)

**OAuth roles**
- Resource server:
  - `AddAuthentication().AddJwtBearer(...).AddMcp(options => options.ResourceMetadata = new() { AuthorizationServers = {...}, ScopesSupported = ["mcp:tools"] })`, plus `RequireAuthorization()`.
  - The sample points at a separate in-memory test OAuth server.
  - Source: [ProtectedMcpServer/Program.cs](https://github.com/modelcontextprotocol/csharp-sdk/blob/main/samples/ProtectedMcpServer/Program.cs)
- Per-primitive `[Authorize]`/`[Authorize(Roles=...)]` via `AddAuthorizationFilters()`. Unauthorized items are removed from list results. — [identity.md](https://github.com/modelcontextprotocol/csharp-sdk/blob/main/docs/concepts/identity/identity.md)
- Client-side OAuth (`ClientOAuthProvider`) supports:
  - CIMD via `ClientOAuthOptions.ClientMetadataDocumentUri`;
  - DCR with `application_type`;
  - RFC 9207 `iss` validation;
  - PKCE S256 enforcement;
  - scope step-up;
  - `offline_access` (SEP-2207);
  - Enterprise Managed Authorization.
  - Sources: [ClientOAuthOptions.cs](https://github.com/modelcontextprotocol/csharp-sdk/blob/main/src/ModelContextProtocol.Core/Authentication/ClientOAuthOptions.cs); [v2.0.0 release](https://github.com/modelcontextprotocol/csharp-sdk/releases/tag/v2.0.0)
- **No authorization-server implementation** was found in `src/`. The test OAuth server lives under `tests/ModelContextProtocol.TestOAuthServer`. — [csharp-sdk tree](https://github.com/modelcontextprotocol/csharp-sdk/tree/main/tests)
- **Open auth issues:**
  - #1446 "[Auth] OAuth proxy / DCR facade for non-DCR providers (e.g. Entra ID + Claude Code)", open, updated 2026-08-27 — [issue #1446](https://github.com/modelcontextprotocol/csharp-sdk/issues/1446)
  - #648 "OAuth authentication request fails with MS Entra-ID", open, updated 2026-10-23 — [issue #648](https://github.com/modelcontextprotocol/csharp-sdk/issues/648)
  - #1050 "WWW-Authenticate header does not contain a resource metadata params", open, updated 2026-07-20; title only, content not read — [issue #1050](https://github.com/modelcontextprotocol/csharp-sdk/issues/1050)

**Tool annotations**
- `[McpServerTool]` exposes `Title`, `ReadOnly`, `Destructive`, `Idempotent`, `OpenWorld`, `UseStructuredContent` and `IconSource`. — [McpServerToolAttribute.cs](https://github.com/modelcontextprotocol/csharp-sdk/blob/main/src/ModelContextProtocol.Core/Server/McpServerToolAttribute.cs)

**Content blocks**
- `TextContentBlock`, `ImageContentBlock` (`"image"`), `AudioContentBlock`, `EmbeddedResourceBlock` and `ResourceLinkBlock` (`"resource_link"`), plus `tool_use`/`tool_result` for sampling. — [ContentBlock.cs](https://github.com/modelcontextprotocol/csharp-sdk/blob/main/src/ModelContextProtocol.Core/Protocol/ContentBlock.cs)
- Non-object structured results are emitted raw (`structuredContent: 72`) from v2.0.0. — [v2.0.0 release](https://github.com/modelcontextprotocol/csharp-sdk/releases/tag/v2.0.0)

**MCP Apps**
- Package `ModelContextProtocol.Extensions.Apps`. "MCP Apps support is experimental. All types are marked with `[Experimental("MCPEXP003")]`."
- Usage: `[McpAppUi(ResourceUri = "ui://...")]` plus `.WithMcpApps()`. The MIME type is `text/html;profile=mcp-app`, and capability negotiation goes through `extensions["io.modelcontextprotocol/ui"]`.
- Source: [apps.md](https://github.com/modelcontextprotocol/csharp-sdk/blob/main/docs/concepts/apps/apps.md)

**Tasks**
- `ModelContextProtocol.Extensions.Tasks` registers with `WithTasks(...)`. "Tasks are supported — the task store is shared across ephemeral server instances" in stateless mode. Task-augmented elicitation is disabled statelessly. — [stateless.md](https://github.com/modelcontextprotocol/csharp-sdk/blob/main/docs/concepts/stateless/stateless.md); [v2.0.0 release](https://github.com/modelcontextprotocol/csharp-sdk/releases/tag/v2.0.0)

**Custom JSON-RPC methods and capabilities (needed for Events and channels)**
- `McpServerOptions.RequestHandlers` takes `McpServerRequestHandler { Method, Handler: Func<JsonRpcRequest, CancellationToken, ValueTask<JsonNode?>> }`, "to handle arbitrary JSON-RPC methods".
  - It is marked `[Experimental(Experimentals.Extensibility_DiagnosticId)]` (the release notes refer to "MCPEXP002 extensibility constants").
  - Built-in methods cannot be overridden.
  - Sources: [McpServerRequestHandler.cs](https://github.com/modelcontextprotocol/csharp-sdk/blob/main/src/ModelContextProtocol.Core/Server/McpServerRequestHandler.cs); [CustomRequestHandlerCollisionTests.cs](https://github.com/modelcontextprotocol/csharp-sdk/blob/main/tests/ModelContextProtocol.Tests/Server/CustomRequestHandlerCollisionTests.cs); [v2.0.0 release](https://github.com/modelcontextprotocol/csharp-sdk/releases/tag/v2.0.0)
- `ServerCapabilities` has typed members plus `Experimental` (`"experimental"`) and `Extensions` (`"extensions"`) dictionaries. No `[JsonExtensionData]` catch-all was found. — [ServerCapabilities.cs](https://github.com/modelcontextprotocol/csharp-sdk/blob/main/src/ModelContextProtocol.Core/Protocol/ServerCapabilities.cs)
- `DiscoverResult` has `SupportedVersions`, `Capabilities`, `Instructions`, `TimeToLive` and `CacheScope`. — [DiscoverResult.cs](https://github.com/modelcontextprotocol/csharp-sdk/blob/main/src/ModelContextProtocol.Core/Protocol/DiscoverResult.cs)
- Low-level `WithMessageFilters(f => f.AddIncomingFilter(...)/AddOutgoingFilter(...))` intercepts all JSON-RPC messages. — [filters.md](https://github.com/modelcontextprotocol/csharp-sdk/blob/main/docs/concepts/filters.md)

**Missing items**
- No SEP-3415/Events issue or PR exists in the csharp-sdk repo. GitHub issue search for "SEP-3415" returned nothing, and "events extension" in titles returned nothing.
- The only webhook item is a 2025 "Prototype a webhook transport implementation" (#34, closed 2025-03-24). — [issue #34](https://github.com/modelcontextprotocol/csharp-sdk/issues/34)
- The transport comparison lists stdio, Streamable HTTP (stateless and stateful) and legacy SSE only, with no WebSocket. — [transports.md](https://github.com/modelcontextprotocol/csharp-sdk/blob/main/docs/concepts/transports/transports.md)

**Docs contradictions (flagged)**
- **transports.md vs stateless.md:**
  - [transports.md](https://github.com/modelcontextprotocol/csharp-sdk/blob/main/docs/concepts/transports/transports.md) still marks stateless server-to-client requests "✗ (see MRTR proposal)".
  - [stateless.md](https://github.com/modelcontextprotocol/csharp-sdk/blob/main/docs/concepts/stateless/stateless.md) says MRTR makes elicitation work statelessly on 2026-07-28, and MRTR shipped in v2.0.0.
  - transports.md is stale.
- **Subscriptions in stateless mode:**
  - [stateless.md](https://github.com/modelcontextprotocol/csharp-sdk/blob/main/docs/concepts/stateless/stateless.md) says 2026-07-28 requests get "no resource subscriptions".
  - [PR #1775](https://github.com/modelcontextprotocol/csharp-sdk/pull/1775) streams `subscriptions/listen` statelessly over the held-open POST.
  - The stateless.md statement holds only for legacy `resources/subscribe` and the GET stream.
- **Elicitation doc lag:**
  - [elicitation.md](https://github.com/modelcontextprotocol/csharp-sdk/blob/main/docs/concepts/elicitation/elicitation.md) still documents `ElicitationId` and `notifications/elicitation/complete`.
  - The 2026-07-28 changelog removed both ("Removed `notifications/elicitation/complete` and `elicitationId`") — [2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog).
  - Treat them as legacy-era only.

### Inferences
- **Event push on 2026-07-28 clients:** register a custom `subscriptions/listen` handler. It reads from a shared bus (Azure Service Bus, Event Grid or Redis), because any instance may hold the stream, and emits `notifications/resources/updated` for `ring://devices/{id}/state` URIs. On legacy clients the same push needs `StatefulForInitializeClients` plus sticky sessions.
- **ChatGPT MCP Events in C#** is buildable but hand-rolled:
  - implement `events/list`, `events/subscribe` and `events/unsubscribe` with `McpServerOptions.RequestHandlers`;
  - store subscriptions durably (Table Storage or Cosmos DB);
  - sign deliveries with Standard Webhooks HMAC via `System.Security.Cryptography.HMACSHA256`.
- **Blocker for ChatGPT Events:** OpenAI wants a **top-level `capabilities.events`** key, and typed `ServerCapabilities` has no catch-all. The likely workaround is an **outgoing message filter that patches the `server/discover` result JSON**. This is unverified and should be prototyped early.
- **Authorization server:** an external one is required, for example Entra ID, Auth0, Keycloak or Duende. The bridge's AS must satisfy both ChatGPT and Claude requirements (see sections 5–6).
  - Issue #1446 frames Entra as a "non-DCR provider".
  - Without DCR (or CIMD), each client still has a documented pre-registered-client path:
    - Claude Code: `--client-id`/`--client-secret`/`--callback-port`;
    - claude.ai: a customer-entered client ID on custom connectors, or `oauth_anthropic_creds` for directory listings;
    - ChatGPT: a "predefined OAuth client".
  - So the real cost of a non-DCR AS is manual per-client registration, not a hard blocker. A CIMD-capable AS (or an OAuth facade) removes that cost.
- **Control-tool UX:** use annotations (`ReadOnly`/`Destructive`/`Idempotent`) and `ImageContentBlock` snapshots plus `ResourceLinkBlock` clip links. These map directly to SDK types.

### Gaps
- I did not verify that an outgoing message filter can modify a `server/discover` response on the stateless HTTP path, or whether the SDK's built-in discover handling bypasses filters.
- I did not verify whether a NuGet Standard Webhooks library is maintained.
- I did not check whether Microsoft Entra ID supports CIMD (`client_id_metadata_document_supported`). No source on that was read.
- I did not check how Extensions.Tasks is configured with a distributed task store (e.g. which `IDistributedCache` implementations it supports).
- The content of issue #1050 was not read. It is unknown whether the C# `AddMcp` handler emits `resource_metadata` in `WWW-Authenticate` on 2.3.0, which matters because Claude requires a `401` carrying that pointer or falls back to `.well-known` probing.

## 4. Claude Code: remote HTTP for tools, auth options, channels (push), legacy negotiation, alternatives

### Takeaway
Claude Code consumes **remote Streamable HTTP servers for tools** with full OAuth support:
- CIMD, DCR, pre-registered client ID/secret, static headers and `headersHelper`;
- 2026-07-28 negotiated by default on the v2 runtime.

**Channels (true push) are still a research preview** (since v2.1.80, 2026-03-19). They **require a local stdio subprocess** that **does not negotiate 2026-07-28**. Two ways to meet that:
- set `MCP_PROTOCOL_NEGOTIATION=legacy`, which applies globally;
- or use a server that does not offer 2026-07-28 (for a C# shim, pin `ProtocolVersion = "2025-11-25"`).

So stdio is needed **only for push**. A remote-only partial alternative is **MCP Tasks** (public beta, v2.1.304+), which wakes an idle Claude when a server-side task completes.

### Cited Findings
**Remote HTTP and authentication** — source: [Claude Code: MCP](https://code.claude.com/docs/en/mcp)
- "HTTP servers are the recommended option for connecting to remote MCP servers": `claude mcp add --transport http <name> <url>`. SSE is deprecated.
- Auth options:
  - "Claude Code supports OAuth 2.0"; "also supports servers that use a Client ID Metadata Document (CIMD) instead of Dynamic Client Registration, and discovers these automatically";
  - pre-configured `--client-id`/`--client-secret`/`--callback-port`;
  - static `--header`;
  - `headersHelper` for "Kerberos, short-lived tokens, or an internal SSO".
- In "`claude -p` or Agent SDK run... Claude Code can't run the OAuth flow there"; sign in interactively first.
- On v2, Claude Code "Fails an MCP OAuth sign-in whose authorization response names an unexpected issuer". It "Sends MCP OAuth credentials only to a token endpoint served over HTTPS or at `localhost`".
- Claude Code's CIMD declares loopback redirects `http://localhost/callback` and `http://127.0.0.1/callback`, so the AS must match them port-agnostically. — [Claude connectors: Authentication](https://claude.com/docs/connectors/building/authentication)

**Runtimes and protocol negotiation**
- "The v1 runtime is built on MCP TypeScript SDK 1.x. The v2 runtime is the same code on MCP TypeScript SDK 2.0, which adds MCP protocol revision 2026-07-28."
- v2 is the default from v2.1.232 for feature-flag sessions, and from v2.1.274 for others.
- On v2, Claude Code "Asks HTTP, stdio, and claude.ai connector servers whether they support the newer revision... connects to every other server as v1 does."
- "Anthropic can keep a specific server on the earlier protocol, or off that stream, with a feature flag."
- Source: [Claude Code: MCP](https://code.claude.com/docs/en/mcp)

**Changelog dates** — [Claude Code CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md); dates from GitHub releases [v2.1.232](https://github.com/anthropics/claude-code/releases/tag/v2.1.232), [v2.1.274](https://github.com/anthropics/claude-code/releases/tag/v2.1.274), [v2.1.281](https://github.com/anthropics/claude-code/releases/tag/v2.1.281), [v2.1.292](https://github.com/anthropics/claude-code/releases/tag/v2.1.292), [v2.1.295](https://github.com/anthropics/claude-code/releases/tag/v2.1.295)

| Version (date) | Change |
|---|---|
| 2.1.232 (2026-08-13) | v2 runtime is the default for feature-flag sessions |
| 2.1.274 (2026-09-17) | Bedrock, Vertex, Foundry and telemetry-disabled installs move to v2 plus 2026-07-28 with direct HTTP servers |
| 2.1.281 (2026-09-23) | "Added MCP URL-mode elicitation on 2026-07-28 protocol connections" |
| 2.1.292 (2026-10-06) | "Changed local (stdio) MCP server connections to negotiate protocol version 2026-07-28 by default on every install... `MCP_PROTOCOL_NEGOTIATION=legacy` opts out" |
| 2.1.295 (2026-10-08) | claude.ai connectors negotiate 2026-07-28 by default |
| 2.1.302 | Fixed servers on 2026-07-28 "omit[ting] `resultType`, `ttlMs` or `cacheScope`" |

The latest release is v2.1.310 (2026-10-23). — [release v2.1.310](https://github.com/anthropics/claude-code/releases/tag/v2.1.310)

**Channels**
- Status and access: "Channels are in research preview." They "require Anthropic authentication through claude.ai or a Console API key, and are not available on Amazon Bedrock, Google Cloud's Agent Platform, or Microsoft Foundry. Team and Enterprise organizations must explicitly enable them." — [Claude Code: Channels](https://code.claude.com/docs/en/channels)
- Preview gating:
  - "`--channels` only accepts plugins from an Anthropic-maintained allowlist, or from your organization's allowlist (`allowedChannelPlugins`)".
  - Custom channels need `--dangerously-load-development-channels server:<name>` or `plugin:<name>@<marketplace>`.
  - "the `--channels` flag syntax and protocol contract may change."
  - The flags don't appear in `claude --help`.
  - Source: [Claude Code: Channels](https://code.claude.com/docs/en/channels)
- Enterprise controls: `channelsEnabled` is the master switch. claude.ai Team/Enterprise: "channels are blocked until an Owner enables them". "Pro and Max users without an organization skip these checks entirely." — [Claude Code: Channels](https://code.claude.com/docs/en/channels)
- "Events only arrive while the session is open, so for an always-on setup you run Claude in a background process or persistent terminal." — [Claude Code: Channels](https://code.claude.com/docs/en/channels)
- Contract:
  - `capabilities.experimental['claude/channel']: {}`;
  - the notification `notifications/claude/channel` with `content` (string) and `meta` (`Record<string,string>`; keys must be identifiers, and other keys are "silently dropped");
  - "The only hard requirement is the `@modelcontextprotocol/sdk` package and a Node.js-compatible runtime";
  - "Claude Code doesn't acknowledge notifications... drops the events silently";
  - the dev flag is ignored in `-p` and Agent SDK runs;
  - optional `claude/channel/permission` relay, with v2.1.234+ semantics.
  - Source: [Claude Code: Channels reference](https://code.claude.com/docs/en/channels-reference)
- Changelog: "Added `--channels` (research preview) — allow MCP servers to push messages into your session" in **v2.1.80 (2026-03-19)**, and permission relay in v2.1.81 (2026-03-20). — [CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md); [release v2.1.80](https://github.com/anthropics/claude-code/releases/tag/v2.1.80)
- **Legacy negotiation still required** (current docs): "Claude Code asks stdio servers for that revision by default. To keep a stdio channel server on the earlier handshake, set `MCP_PROTOCOL_NEGOTIATION` to `legacy`, which keeps every server on it." "A channel server that doesn't support that revision connects on the earlier handshake and registers as before." — [Claude Code: MCP](https://code.claude.com/docs/en/mcp)
- This is corroborated in the SEP-3415 PR by mib00038 (2026-10-16): on 2026-07-28 the channel notification "has no conforming path (`subscriptions/listen` admits only the four standard types)". — [PR #3415](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3415)

**WebSocket transport**
- "WebSocket servers hold a persistent bidirectional connection, which suits remote MCP servers that push events to Claude unprompted. Use HTTP instead when your server only responds to requests, since HTTP supports OAuth and the `claude mcp add --transport` flag, while WebSocket supports neither."
- The config is `{"type":"ws","url":"wss://...","headers":{...}}`, and auth is header-only.
- A message over 16 MiB closes the connection (v2.1.295).
- Sources: [Claude Code: MCP](https://code.claude.com/docs/en/mcp); [CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)

**Notification streams and timeouts on v2** — source: [Claude Code: MCP](https://code.claude.com/docs/en/mcp)
- Claude Code "receives `list_changed` notifications from servers on the newer revision over a stream it holds open".
- Reopen limits:
  - if the stream closes within 10 seconds, it "reopens it up to three times";
  - if it "stays open longer than 10 seconds, then closes, as streams to serverless hosts commonly do: after five reopens in an hour, Claude Code waits about six hours before the next one."
- Timeouts:
  - HTTP per-request timer to the first response byte = max(60 s, tool timeout, `MCP_TIMEOUT`);
  - idle timeout 5 min for HTTP/ws and 30 min for stdio;
  - default `MCP_TOOL_TIMEOUT` is about 28 hours.

**Other client features** — source: [Claude Code: MCP](https://code.claude.com/docs/en/mcp)
- Elicitation:
  - "On connections that use protocol revision 2026-07-28, Claude Code declares `elicitation: {form: {}, url: {}}`."
  - URL-mode URLs cap at about 8,000 characters.
  - `elicitation/create` is served only in interactive terminal sessions.
- MCP Apps: "MCP Apps UI resources... don't appear in the `@` suggestions or in the resource list tool's results". There is no in-terminal rendering.
- Images: "When an MCP tool returns a PNG, JPEG, GIF, or WebP image, Claude sees the image inline". The original is saved to a file (requires v2.1.283, 2026-09-25).
- Output limits: a warning at 10k tokens, and a 25k-token cap (`MAX_MCP_OUTPUT_TOKENS`).

**MCP Tasks (remote "wake" alternative)** — source: [Claude Code: MCP](https://code.claude.com/docs/en/mcp)
- "MCP tasks are in public beta in the Claude Code CLI and require Claude Code v2.1.304 or later."
- "If Claude is idle when the result arrives, Claude starts on it unprompted."
- Requirements:
  - the server supports tasks;
  - an HTTP, stdio or claude.ai connector "connected on protocol revision 2026-07-28" (`MCP_PROTOCOL_NEGOTIATION=legacy` "rules that out");
  - the session fetches feature flags ("not on a third-party provider such as Amazon Bedrock");
  - terminal CLI, Agent SDK or GitHub Actions only ("VS Code extension and the desktop app don't have MCP tasks");
  - the main conversation, not subagents.
- Mechanics:
  - `pollIntervalMs` is clamped to 250–30000 ms, with a 2000 ms default;
  - "A task on a remote server keeps running after you exit";
  - "the task answer has to start within the per-request timer, so accept the job and answer first, then do the work."

### Inferences
- **Tools for Claude Code:** the Azure server over HTTP with OAuth (CIMD preferred) is sufficient. Stdio is not needed for tools.
- **Push into Claude Code:** a local stdio channel process is still required as of 2026-10-24. Two C# options, one of them unverified:
  - **(a)** A C# stdio shim built on `ModelContextProtocol` 2.3.0 with `McpServerOptions.ProtocolVersion = "2025-11-25"` (rejects 2026-07-28 metadata) and `Capabilities.Experimental["claude/channel"] = new {}`. It emits `notifications/claude/channel` via `SendNotificationAsync`. This should register without the global `MCP_PROTOCOL_NEGOTIATION=legacy`, per Claude Code's "doesn't support that revision... registers as before". The docs name only the TS SDK, so this is undocumented: test it, including how Claude Code's discover probe handles the C# rejection error.
  - **(b)** A TypeScript shim, which is the documented path.
  - Either way, the shim needs outbound connectivity to the Azure bridge and a sender gate.
- **The env-var route conflicts with the remote features.** `MCP_PROTOCOL_NEGOTIATION=legacy` "keeps every server on it" ([Claude Code: MCP](https://code.claude.com/docs/en/mcp)). That also forces the Azure bridge onto the legacy handshake in that session, which turns off:
  - MCP Tasks ("Setting `MCP_SDK_GENERATION=v1` or `MCP_PROTOCOL_NEGOTIATION=legacy` rules that out");
  - 2026-07-28 URL-mode elicitation (v2.1.281);
  - the v2 `list_changed` stream.
  - So channels via the env var and Tasks as a wake path cannot coexist in one session. Pinning the shim itself to 2025-11-25 is the only route that keeps both, if Claude Code's probe accepts it (untested). This is the strongest reason to pin the shim rather than use the env var.
- **MCP Tasks as a fallback:** a remote tool such as `ring_wait_for_event(types, since_cursor)` answered as a task. It completes when a Ring event arrives, and Claude acts on it if idle. Weaknesses:
  - each wait must be re-armed by the agent;
  - it works only in CLI sessions with feature flags;
  - it is beta.
  - The `pollIntervalMs` floor (250 ms) makes the latency acceptable.
- **Hosting caution for list_changed streams:** if Azure (or a proxy) cuts held-open POSTs, Claude Code's reopen backoff (about 6 h after five reopens/hour) can silently stall `list_changed`. The host must allow long-lived responses. The C# 2.3.0 change that withholds headers until the first protocol message makes the immediate `acknowledged` notification on listen streams important.

### Gaps
- Whether a `ws` server can be a channel is not documented (see the overall verdict).
- It is untested whether a C# stdio server pinned to 2025-11-25 is cleanly detected as legacy by Claude Code's v2 discover probe. The C# client docs say a non-modern error triggers fallback, but Claude Code uses the TS SDK 2.0 client.
- No statement was found on when channels will leave research preview, or on a 2026-07-28-compatible channel contract (e.g. via SEP-3415).

## 5. Claude Desktop, claude.ai and mobile (remote connectors): consumption and push

### Takeaway
claude.ai (web), Claude Desktop and Claude mobile all consume **remote MCP servers as connectors**, over Streamable HTTP or legacy HTTP+SSE.
- Auth options are OAuth (DCR or CIMD), Anthropic-held client credentials, static headers (beta) or none.
- They do **not support resource subscriptions, sampling or draft capabilities**, and there is **no push or event mechanism**.
- MCP Apps render on claude.ai web.
- Connections originate from Anthropic's cloud (`160.79.104.0/21`), so a local-only server cannot be a remote connector. Desktop can also run local MCPB extensions.

### Cited Findings
**Transports, auth versions and features** — source: [Build an MCP server for Claude](https://claude.com/docs/connectors/building)
- "Claude connects to your server from claude.ai, Claude Desktop, Claude mobile, Cowork, and Claude Code, and the same connector infrastructure backs all of them."
- Transport: "Use Streamable HTTP... Claude also supports the legacy HTTP+SSE transport, which is being deprecated."
- Auth specs: "Claude follows the 2025-03-26, 2025-06-18, and 2025-11-25 authorization specifications."
- Supported: tools, prompts and resources; text and image tool results; text and binary resources.
- Not supported: "Resource subscriptions; Sampling; Advanced or draft capabilities."
- Limits:

  | Limit | claude.ai and Desktop | Claude Code |
  |---|---|---|
  | Maximum tool result size | ~150,000 characters | 25,000 tokens |
  | Tool call timeout | 240 seconds per tool call | — |

**Where connectors work** — [Get started with connectors](https://claude.com/docs/connectors)
- "claude.ai on the web: remote connectors, including MCP Apps that display interactive content in the conversation."
- "Claude desktop app: remote connectors, plus local connectors installed as desktop extensions."
- "Claude mobile app: remote connectors."
- Connectors added in claude.ai are available in Claude Code when it is signed in with a Claude account.

**Auth types** — source: [Authentication for connectors](https://claude.com/docs/connectors/building/authentication)
- Types: `oauth_dcr` and `oauth_cimd` (both "Supported by default"), `oauth_anthropic_creds`, `custom_connection`, `static_headers` (beta, limited orgs) and `none`.
- CIMD is used "only when your authorization server metadata advertises both `client_id_metadata_document_supported: true` and `none` in `token_endpoint_auth_methods_supported`... otherwise falls back to DCR."
- "A `401` is required to start sign-in, and Claude ignores a `WWW-Authenticate` header on a `200`." Claude uses only the first `authorization_servers` entry.
- Endpoint latency: 10 s for discovery, registration and token endpoints, 30 s for refresh.
- No `client_credentials` grant.
- Hosted redirect URI: `https://claude.ai/api/mcp/auth_callback`.
- Token endpoint must accept form-urlencoded requests, and refresh tokens should rotate for public clients.
- Egress: "Anthropic's outbound traffic to your server originates from `160.79.104.0/21`."
- Entra caveat: "you must also register the MCP server URL as an Application ID URI... an MCP server on a platform hostname such as `*.azurewebsites.net` needs a custom domain first" (error `AADSTS9010010`).

**Protocol revision**
- Claude Code changed "claude.ai connectors to negotiate MCP protocol version 2026-07-28 by default" (v2.1.295, 2026-10-08). That applies when Claude Code proxies connectors. — [CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
- Push: channels are a Claude Code-only feature (the channel docs live under Claude Code). I found nothing in the connectors docs about events, notifications or channels. — [Claude Code: Channels](https://code.claude.com/docs/en/channels); [Build an MCP server for Claude](https://claude.com/docs/connectors/building)

**Conflict**
- An older Anthropic support article (seen only as a search excerpt) said Claude "supports the 3/26 auth spec and (as of July) the 6/18 auth spec" and listed DCR only. — [support article 11503834](https://support.anthropic.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers) (now 404 at support.claude.com)
- The current claude.com docs list the 2025-11-25 auth spec and CIMD "Supported by default". Prefer claude.com.

### Inferences
- For these clients, the remote Azure server is the right and only meaningful topology. Local stdio adds nothing for push, because no push path exists.
- The event UX is pull-based: a `get_events` tool and resources, plus an MCP App (claude.ai web) showing a live-updating Ring dashboard. The MCP App iframe can poll the server through the app bridge. This is inferred from MCP Apps' "Real-time monitoring" use case in prior notes and has not been verified for Claude.
- Keep tool results under about 150k characters and 240 s. Use small JPEG snapshots and `resource_link`s.

### Gaps
- I did not determine which MCP protocol revision claude.ai's hosted connector infrastructure negotiates (2025-11-25 vs 2026-07-28) outside Claude Code.
- Whether claude.ai and Desktop support **elicitation** (form or URL mode) and `list_changed` is not stated in the pages fetched.
- Plan availability for custom connectors was not confirmed from a current primary page. Secondary sources conflict on whether Free is included.

## 6. ChatGPT: MCP connector requirements and MCP Events (webhook push); C# implementability

### Takeaway
ChatGPT connectors require a **public HTTPS MCP server** with **OAuth 2.1** for user data:
- CIMD preferred, or DCR, or a predefined client;
- S256 PKCE, RFC 9728 protected resource metadata, and RFC 9207 `iss` for the stable redirect.

**MCP Events** (real push) **requires protocol 2026-07-28** and is **webhook-only** (Standard Webhooks HMAC). Its constraints:
- a signed challenge to verify the callback;
- a **256 KiB** body cap;
- persistent subscription state;
- available in **Work chats** (web, desktop with Cloud selected, and "dots").

The C# SDK has no Events support, but it can be **implemented** with custom request handlers. Advertising the top-level `events` capability needs a workaround.

### Cited Findings
**MCP Events requirements** — source: [OpenAI: MCP Events](https://developers.openai.com/plugins/build/mcp-events)
- Protocol: "MCP 2.0 (protocol version `2026-07-28`)".
- Surfaces: Work chats on ChatGPT web, the desktop app in Work chats with "Cloud" selected, and dots. "Workspace controls for plugins and event-triggered tasks apply." No plan names are given.
- Capability and methods:
  - "Add `events` to the capabilities returned by its `server/discover` response". The example shows a top-level `"events": {}` next to `"tools": {}`, not under `extensions`.
  - Methods are `events/list`, `events/subscribe` and `events/unsubscribe` "on the same authenticated MCP endpoint as your tools".
- Subscriptions:
  - Subscription state must persist across restarts.
  - Fields: `name`, `arguments`, `delivery {mode,url,secret}` and `cursor`. The response carries `id`, `refreshBefore`, `cursor` and `truncated`.
  - "Require a `whsec_` signing secret whose base64 value decodes to 24–64 bytes."
  - Callbacks are HTTPS only, with private addresses blocked and no redirects.
- Verification and delivery:
  - A signed single-use challenge must be echoed with a 2xx.
  - Delivery headers: `webhook-id` (= `eventId`), `webhook-timestamp`, `webhook-signature` and `X-MCP-Subscription-Id`.
  - Body "no larger than 256 KiB (262,144 bytes)".
  - Retries keep the event ID but get a fresh timestamp and signature. "Do not retry deliveries that return `410` or `413`."
- Errors: `-32015` `CallbackEndpointError`.
- Not supported: "Polling, streaming, and the draft's `gap` and `terminated` control notifications".
- Status: the page follows "the draft MCP Events specification" and carries no beta label. Its sample is Node.js with the `standardwebhooks` npm package.

**Connector authentication** — source: [OpenAI Apps SDK: Authentication](https://developers.openai.com/apps-sdk/build/auth)
- "Implement an OAuth 2.1 flow that conforms to the MCP authorization spec."
- "MCP servers are unsupported" without `S256` in `code_challenge_methods_supported`.
- Protected resource metadata at `/.well-known/oauth-protected-resource` or via `WWW-Authenticate`.
- "Use Client ID Metadata Documents (CIMD) as the preferred client registration method" (`client_id_metadata_document_supported: true`; `none` or `private_key_jwt`). DCR and predefined clients are alternatives.
- `resource` is sent on authorization and token requests and should map to `aud`.
- Redirect URIs: `https://chatgpt.com/connector_platform_oauth_redirect` (stable, which requires RFC 9207 `iss` in every authorization response) or `https://chatgpt.com/connector/oauth/{callback_id}`.
- ChatGPT presents an OpenAI-managed mTLS client certificate, and its egress IPs can be allowlisted.
- ChatGPT "does not support machine-to-machine OAuth grants".
- Anonymous read-only servers are allowed (`noauth`/`oauth2` per tool).

**C# SDK side**
- No Events support. Custom-method and capability facilities are covered in section 3. — [McpServerRequestHandler.cs](https://github.com/modelcontextprotocol/csharp-sdk/blob/main/src/ModelContextProtocol.Core/Server/McpServerRequestHandler.cs); [ServerCapabilities.cs](https://github.com/modelcontextprotocol/csharp-sdk/blob/main/src/ModelContextProtocol.Core/Protocol/ServerCapabilities.cs)
- `StatefulForInitializeClients` or `Stateless` mode serves ChatGPT's 2026-07-28 requests statelessly. — [stateless.md](https://github.com/modelcontextprotocol/csharp-sdk/blob/main/docs/concepts/stateless/stateless.md)

**Conflict (from prior notes)**
- OpenAI's `-32015` vs SEP-3415's provisional `-32023`…`-32027`. — [OpenAI MCP Events](https://developers.openai.com/plugins/build/mcp-events); [PR #3415](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3415)

### Inferences
- ChatGPT push works fully remote and needs no shim.
- Required build items on Azure:
  - **(1)** an outgoing-filter patch (or equivalent) to add top-level `capabilities.events` to `server/discover`;
  - **(2)** `RequestHandlers` for `events/*`;
  - **(3)** durable subscription storage;
  - **(4)** an outbound HTTPS webhook sender with HMAC signing, challenge verification and retries, e.g. a background `IHostedService` or Azure Functions/Queue;
  - **(5)** per-delivery user-access rechecks.
- Payloads should be small, with `get_event(id)` tools for detail. The 256 KiB cap rules out inline media.
- Codes and names are draft-dependent, so isolate the Events module behind an adapter. It should switch to an official C# extension if one ships, or follow SEP-3415 changes.
- One AS can satisfy both ChatGPT and Claude if it supports CIMD with `none` (Claude needs `none`; ChatGPT accepts `none` or `private_key_jwt`), S256, RFC 9207 `iss`, form-urlencoded token requests, and both redirect URIs plus loopback.

### Gaps
- No ChatGPT plan list (Business, Enterprise, Edu, Pro) for "Work chats" or MCP Events was found on the fetched pages.
- I did not determine whether ChatGPT connectors still accept 2025-11-25 servers for plain tools (non-Events). Not stated on the pages fetched.
- No maximum subscription count, rate limit, or maximum TTL is stated.
- **Routing headers:** v2.0.0 of the C# SDK enforces SEP-2243 routing headers, and `McpServerRequestHandler.RoutingNameParameter` makes the server require a matching `Mcp-Name` header ([McpServerRequestHandler.cs](https://github.com/modelcontextprotocol/csharp-sdk/blob/main/src/ModelContextProtocol.Core/Server/McpServerRequestHandler.cs)). I did not verify whether ChatGPT sends `Mcp-Name` on `events/*` calls, or which parameter it mirrors. A mismatch could make subscribes fail, so leave `RoutingNameParameter` unset until this is tested.

## 7. Status of MCP Events (SEP-3415) and standard push in the spec

### Takeaway
As of 2026-10-24, **SEP-3415 "Events Extension" is still an open Draft PR**: created 2026-10-05, last updated 2026-10-23, not merged. The only **standard** server-to-client push in the 2026-07-28 core spec is **`subscriptions/listen`**, limited to four change-notification types. ChatGPT ships a webhook subset of the draft. No official SDK, C# included, ships the Events extension.

### Cited Findings
- PR #3415 "SEP-3415: Events Extension": state open, draft = true, merged_at null, created 2026-10-05T19:39:35Z, updated 2026-10-23T15:02:05Z. — [PR #3415](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3415)
- PR discussion:
  - On 2026-10-14 a commenter (lmaccherone) thanked the author for continuing "after the Transports WG ruled webhooks out of scope, along with my WebSockets SEP".
  - On 2026-10-16 the author (pja-ant) moved coalescing/"state vs message" semantics discussion "to the WG".
  - Source: [PR #3415](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3415)
- SEP-3415 design (from prior notes): poll, stream and webhook delivery modes, "none mandatory"; cursors; Standard Webhooks HMAC; "Unauthenticated MCP servers may offer poll and push, but not webhook". — [PR #3415](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3415)
- Core spec 2026-07-28: `subscriptions/listen` replaces `resources/subscribe` and the GET stream. The opt-in types are `toolsListChanged`, `promptsListChanged`, `resourcesListChanged` and `resourceSubscriptions`. "The server MUST NOT send notification types the client has not explicitly requested." — [Subscriptions pattern](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/subscriptions); [2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- The C# SDK implements `subscriptions/listen`: built-in `*/list_changed` handling, plus a custom handler since v2.1.0. — [PR #1775](https://github.com/modelcontextprotocol/csharp-sdk/pull/1775)

### Inferences
- There is no vendor-neutral "wake the agent" standard to target yet. Build three adapters over one internal event log:
  - a cursor tool/resource for everyone;
  - SEP-3415-shaped webhooks for ChatGPT;
  - Claude Code channel or Tasks.
- The PR's remark that the Transports WG ruled out WebSockets suggests a standard WebSocket transport is unlikely soon. This is from a single PR comment and is unconfirmed.

### Gaps
- I did not read the Transports WG decision record or the Triggers & Events WG notes directly.
- No timeline for SEP-3415 acceptance was found.

## 8. Official or quasi-official samples of C#/.NET MCP servers on Azure (Functions, Container Apps, App Service)

### Takeaway
The maintained official .NET Azure sample is **`Azure-Samples/remote-mcp-functions-dotnet`** (Azure Functions, .NET 10, Entra built-in auth, `azd up`, last pushed 2026-08-12). It uses the **Azure Functions MCP extension** (`Microsoft.Azure.Functions.Worker.Extensions.Mcp` 1.5.0 in the sample; 1.6.0 is latest, 2026-07-31), **not** the C# SDK's ASP.NET Core host directly. The older App Service sample (.NET 9, 2025-06) is stale, and a self-hosted SDK-on-Functions repo is archived. I found no official .NET Container Apps sample; the Container Apps sample is TypeScript. The C# SDK itself ships Docker deployment guidance.

### Cited Findings
**Azure Functions sample**
- `Azure-Samples/remote-mcp-functions-dotnet`:
  - It is a "collection of samples... build and deploy a custom remote MCP server to the cloud using Azure functions... `azd up`".
  - "All sample MCP servers are configured with built-in authentication using Microsoft Entra as the identity provider." API Management and VNET are optional.
  - Prerequisites include the .NET 10 SDK.
  - Last pushed 2026-08-12.
  - Source: [remote-mcp-functions-dotnet](https://github.com/Azure-Samples/remote-mcp-functions-dotnet)
- Its `FunctionsMcpTool.csproj` targets `net10.0` and references `Microsoft.Azure.Functions.Worker.Extensions.Mcp` 1.5.0 and `Microsoft.Azure.Functions.Worker.Extensions.Mcp.Sdk` 1.0.0-preview.4. — [FunctionsMcpTool.csproj](https://github.com/Azure-Samples/remote-mcp-functions-dotnet/blob/main/src/FunctionsMcpTool/FunctionsMcpTool.csproj)
- `Microsoft.Azure.Functions.Worker.Extensions.Mcp` is at 1.6.0 (stable, 7/31/2026); earlier: 1.5.1 (6/23/2026), 1.5.0 (5/7/2026), 1.0.0 (10/9/2025). It targets net8.0 and does not list `ModelContextProtocol` as a direct dependency. — [NuGet: Extensions.Mcp](https://www.nuget.org/packages/Microsoft.Azure.Functions.Worker.Extensions.Mcp)

**Other Azure samples**
- `Azure-Samples/remote-mcp-webapp-dotnet` is for "Azure App Service", uses the MCP csharp-sdk and requires the .NET 9 SDK. Last pushed 2025-06-13, so stale. — [remote-mcp-webapp-dotnet](https://github.com/Azure-Samples/remote-mcp-webapp-dotnet)
- `Azure-Samples/mcp-sdk-functions-hosting-dotnet`, "remote hosting of MCP servers built with the official... MCP SDKs on Azure Functions", is **archived** (last push 2025-11-18). — [mcp-sdk-functions-hosting-dotnet](https://github.com/Azure-Samples/mcp-sdk-functions-hosting-dotnet)
- `Azure-Samples/foundry-agent-service-remote-mcp-dotnet` exists (updated 2026-09-01). Not inspected. — [foundry-agent-service-remote-mcp-dotnet](https://github.com/Azure-Samples/foundry-agent-service-remote-mcp-dotnet)
- Container Apps official sample is Node.js/TypeScript (`mcp-container-ts`). — [Microsoft Learn: Remote MCP with Azure Container Apps](https://learn.microsoft.com/en-us/samples/azure-samples/mcp-container-ts/mcp-container-ts/)

**SDK deployment guidance**
- The C# SDK added "Docker-based MCP server deployment guidance" (#1423) in v2.0.0, with docs at `docs/concepts/deployment/docker.md`. — [v2.0.0 release](https://github.com/modelcontextprotocol/csharp-sdk/releases/tag/v2.0.0); [docker.md](https://github.com/modelcontextprotocol/csharp-sdk/blob/main/docs/concepts/deployment/docker.md)
- The SDK also added an Application Insights telemetry example in v2.1.0. — [v2.1.0 release](https://github.com/modelcontextprotocol/csharp-sdk/releases/tag/v2.1.0)
- The SDK recommends stateless mode for "serverless environments (Azure Functions, AWS Lambda, etc.)", and stateful mode "Requires session affinity". — [stateless.md](https://github.com/modelcontextprotocol/csharp-sdk/blob/main/docs/concepts/stateless/stateless.md)
- Secondary: a July 2026 Dev Leader article compares Functions vs Container Apps for C# MCP servers (`ModelContextProtocol.AspNetCore`, `MapMcp("/mcp")`). — [devleader.ca](https://www.devleader.ca/2026/07/25/deploying-your-c-mcp-server-to-azure-functions-vs-container-apps)

**Entra constraints**
- Entra as Claude's AS needs a custom domain for the Application ID URI. — [Claude connectors: Authentication](https://claude.com/docs/connectors/building/authentication)
- The C# SDK has an open request for a DCR facade for Entra + Claude Code. — [issue #1446](https://github.com/modelcontextprotocol/csharp-sdk/issues/1446)

### Inferences
- For an always-on bridge, the best fit is **Azure Container Apps (min replicas ≥ 1) or App Service (Always On)** running a plain ASP.NET Core .NET 10 app with `ModelContextProtocol.AspNetCore` 2.3.0. Reasons it beats the Functions MCP extension:
  - the Ring ingestion side needs a persistent connection (Ring push or websocket client);
  - the bridge needs held-open `subscriptions/listen` POSTs;
  - it needs a background webhook sender;
  - it needs full control of `SessionMode`, custom `RequestHandlers` and outgoing filters. The Functions extension's coverage of these is unverified.
- Put the MCP endpoint and the OAuth AS metadata behind a custom domain. That is needed for Entra Application ID URIs and simplifies `/.well-known` routing.
- Hybrid mode with legacy sessions needs sticky sessions, which Container Apps and App Service both offer (affinity). Pure stateless mode does not.

### Gaps
- I did not verify whether the Azure Functions MCP extension 1.6.0 supports 2026-07-28, `subscriptions/listen`, custom methods or MCP Events.
- Azure host idle and response timeouts for long-held POST/SSE responses were not researched in primary sources:
  - App Service's front-end timeout;
  - the Container Apps ingress timeout;
  - Functions' HTTP timeout.
  These matter for `subscriptions/listen` and Claude Code's stream-reopen backoff.
- No official Microsoft Learn article on hosting `ModelContextProtocol.AspNetCore` 2.x on Container Apps or App Service was found.
