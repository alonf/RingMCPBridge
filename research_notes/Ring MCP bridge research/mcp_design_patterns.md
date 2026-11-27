# MCP Design Patterns for a Ring/IoT Bridge (state, events, media, safety-gated control, auth) — as of Oct 2026

Research date: 2026-10-23. Most of the findings come from primary specification pages on modelcontextprotocol.io and from vendor docs (Anthropic Claude Code, OpenAI, Home Assistant). Where a finding rests on a secondary or aggregator source, it is flagged inline.

---

## 1. MCP spec versions as of Oct 2026, and what each changed

### Takeaway
The **current** MCP revision is **2026-07-28**, released on July 28, 2026. It is a breaking redesign. It makes the protocol stateless: no `initialize` handshake and no `Mcp-Session-Id`. Server-to-client requests are replaced by Multi Round-Trip Requests (MRTR). `subscriptions/listen` replaces `resources/subscribe` and the HTTP GET stream. Tasks become an extension. Roots, Sampling, Logging and Dynamic Client Registration (DCR) are deprecated. **2025-11-25** is the last handshake-based revision, and many clients and servers still speak it. A bridge that has to work with "any MCP client" must handle both protocol generations.

### Cited Findings

**Versioning model**
- Versions are `YYYY-MM-DD` strings that mark "the last date backwards incompatible changes were made." Revisions are labeled Draft, Current, or Final. "The **current** protocol version is **2026-07-28**." — [MCP Versioning](https://modelcontextprotocol.io/specification/versioning)
- A new feature-lifecycle policy applies. Deprecated features "remain in the specification for at least twelve months, or at least ninety days under the policy's expedited-removal exception." — [MCP Versioning](https://modelcontextprotocol.io/specification/versioning)
- Version negotiation in 2026-07-28 works per request. "Every request declares the protocol version it is using via the `io.modelcontextprotocol/protocolVersion` key in its `_meta` field." Mismatches return `UnsupportedProtocolVersionError`. The new `server/discover` RPC is mandatory for servers and optional for clients to call. — [MCP Versioning](https://modelcontextprotocol.io/specification/versioning)

**2025-03-26 (vs 2024-11-05)**
- Added an OAuth 2.1 authorization framework (PR #133).
- Replaced HTTP+SSE with the **Streamable HTTP** transport (PR #206).
- Added JSON-RPC batching, which was later removed.
- Added **tool annotations** "like whether it is read-only or destructive" (PR #185).
- Added audio content, a `message` field on progress notifications, and the `completions` capability.
- Source: [2025-03-26 changelog](https://modelcontextprotocol.io/specification/2025-03-26/changelog)

**2025-06-18**
- Removed JSON-RPC batching.
- Added **structured tool output** (`structuredContent`/`outputSchema`, PR #371).
- MCP servers are classified as **OAuth Resource Servers** with protected resource metadata (PR #338).
- Clients are required to implement **Resource Indicators, RFC 8707** (PR #734).
- Added a new security best practices page.
- Added **elicitation** (PR #382) and **resource links** in tool results (PR #603).
- Added the `MCP-Protocol-Version` HTTP header (PR #548) and `title` fields (PR #663).
- Source: [2025-06-18 changelog](https://modelcontextprotocol.io/specification/2025-06-18/changelog)

**2025-11-25**
- Authorization:
  - OpenID Connect Discovery support (PR #797).
  - Incremental scope consent via `WWW-Authenticate` (SEP-835).
  - **OAuth Client ID Metadata Documents (CIMD)** become a recommended registration mechanism (SEP-991).
  - Protected Resource Metadata discovery aligned with RFC 9728, with the `WWW-Authenticate` header optional and a `.well-known` fallback (SEP-985).
- Metadata:
  - **Icons** on tools, resources, templates and prompts (SEP-973).
  - Tool-name guidance (SEP-986).
- Elicitation:
  - **URL-mode elicitation** (SEP-1036).
  - Standards-based enum schemas (SEP-1330).
  - Defaults in elicitation schemas (SEP-1034).
- Sampling with `tools`/`toolChoice` (SEP-1577).
- **Experimental tasks** (SEP-1686).
- Input validation errors should be returned as tool execution errors (SEP-1303).
- **Polling SSE streams / server may disconnect at will** (SEP-1699), with resumption via GET and event IDs.
- HTTP 403 for an invalid `Origin` header (PR #1439).
- JSON Schema 2020-12 becomes the default dialect (SEP-1613).
- SDK tiering (SEP-1730).
- Source: [2025-11-25 changelog](https://modelcontextprotocol.io/specification/2025-11-25/changelog)

**2026-07-28: major changes** (source: [2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog))
- Removed protocol-level sessions and `Mcp-Session-Id`. "Servers that need cross-call state use explicit, server-minted handles passed as ordinary tool arguments" (SEP-2567).
- Removed the `initialize`/`notifications/initialized` handshake. Each request carries protocol version, client capabilities and client info in `_meta`. Added `server/discover` (SEP-2575).
- "Replace the HTTP GET endpoint and `resources/subscribe`/`resources/unsubscribe` with `subscriptions/listen`: a single long-lived POST-response stream for opted-in server-to-client change notifications."
  - Opt-in types are `toolsListChanged`, `promptsListChanged`, `resourcesListChanged` and `resourceSubscriptions`.
  - "Request-scoped notifications such as `notifications/progress` and `notifications/message` continue to flow on the response stream of the request they relate to."
- Removed `ping`, `logging/setLevel` and `notifications/roots/list_changed`. Log level is now set per request, and servers "MUST NOT emit `notifications/message` for requests that did not include this field."
- Tasks moved out of core into the extension `io.modelcontextprotocol/tasks`. The extension polls via `tasks/get`, adds `tasks/update`, removes `tasks/list`, and lets servers return task handles unsolicited (SEP-2663).
- **MRTR replaces server-initiated requests** such as `elicitation/create`, `sampling/createMessage` and `roots/list`. The server returns `resultType: "input_required"` with `inputRequests`, and the client retries the original request with `inputResponses` (SEP-2322).
- Removed SSE stream resumability and redelivery (`Last-Event-ID`, SSE event IDs). "A broken response stream loses the in-flight request; clients MUST re-issue it."

**2026-07-28: minor changes** (same changelog)
- Required `Mcp-Method`/`Mcp-Name` headers, plus `x-mcp-header` for mirroring tool parameters into headers (SEP-2243).
- Required `ttlMs`/`cacheScope` on list and read results (SEP-2549).
- RFC 9207 `iss` validation (SEP-2468).
- `application_type` in DCR (SEP-837).
- Client credentials are bound to their issuer (SEP-2352).
- Resource-not-found error code changed from `-32002` to `-32602`.
- New error-code allocation policy: `-32000`…`-32019` is implementation-defined and `-32020`…`-32099` is reserved for the spec.
- Removed `notifications/elicitation/complete` and `elicitationId`, both introduced in 2025-11-25.
- OpenTelemetry trace context keys in `_meta` (SEP-414).
- An `extensions` field in client and server capabilities.

**2026-07-28: deprecations** (same changelog)
- **Roots, Sampling and Logging** (SEP-2577). Suggested migrations are "integrate directly with LLM provider APIs instead of Sampling; log to `stderr` (stdio) or use OpenTelemetry instead of Logging."
- The legacy HTTP+SSE transport.
- `includeContext` values `thisServer` and `allServers`.
- **OAuth Dynamic Client Registration**, deprecated in favor of CIMD (PR #2858). It remains available for backward compatibility.

**Release announcement**
- The blog post frames the release as "transforming from a bidirectional stateful protocol into a request/response stateless protocol." Requests can hit any instance behind a round-robin load balancer.
- It names **Tasks, MCP Apps and Enterprise Managed Authorization** as extensions.
- "All four Tier 1 SDKs support `2026-07-28`": TypeScript, Python, Go and C#. Rust support is in beta.
- Deprecated features "still work, and they'll keep working for at least twelve months."
- Source: [MCP blog: The 2026-07-28 Specification](https://blog.modelcontextprotocol.io/posts/2026-07-28/)

**Feature status (official sources)**
- **Tool annotations** are defined in the schema with these defaults:
  - `readOnlyHint` — "If true, the tool does not modify its environment. Default: false".
  - `destructiveHint` — "Default: true", meaningful only when `readOnlyHint == false`.
  - `idempotentHint` — "Default: false".
  - `openWorldHint` — "Default: true".
  - These are unchanged between 2025-11-25 and 2026-07-28. — [schema.ts 2026-07-28](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2026-07-28/schema.ts); [schema.ts 2025-11-25](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2025-11-25/schema.ts)
- In 2025-11-25, tools could declare `execution.taskSupport` as `"forbidden"` (the default), `"optional"` or `"required"` for task-augmented execution. — [schema.ts 2025-11-25](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2025-11-25/schema.ts)
- URL-mode elicitation is still flagged in the 2026-07-28 spec: "introduced in the `2025-11-25` version... Its design and implementation may change in future protocol revisions." — [Elicitation 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation)

**Dual-era compatibility (2026-07-28 spec)** — source: [Versioning and Compatibility 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning)
- Terms: "**Modern**" means 2026-07-28 and later. "**Legacy**" means `initialize`-handshake versions (2025-11-25 and earlier). "**Dual-era**" means an implementation that supports both.
- "A server that wishes to support both legacy clients... and modern clients... MAY implement both behaviors." "A dual-era server MAY serve both eras concurrently on the same endpoint or process."
- A dual-era server picks behavior from how the client opens:
  - modern `_meta` is served statelessly;
  - "An `initialize` request selects legacy semantics, scoped to the stdio process (stdio) or the session (HTTP)."
- Compatibility matrix:
  - **Legacy client → Modern-only server: "Fails."** "Legacy clients have no fall-forward mechanism."
  - Legacy client → Dual-era server: "Works."
  - Modern client → Legacy server: "Fails" (on stdio, clients SHOULD send `server/discover` first so it fails deterministically).
- A modern-only server "SHOULD name the protocol versions it supports in any error it returns to an `initialize` request."
- Era detection by clients:
  - On stdio, "probe with `server/discover` and fall back on any error that is not a recognized modern error."
  - On Streamable HTTP, "attempt a modern request and inspect the body of a `400 Bad Request` before falling back."
- The 2026-07-28 changelog also describes `server/discover` as usable "as a backward-compatibility probe on STDIO." — [2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- Extensions: "If one party supports an extension but the other does not, the supporting party MUST either revert to core protocol behavior or reject the request." The identifiers are `io.modelcontextprotocol/ui` (MCP Apps) and `io.modelcontextprotocol/tasks`. — [Versioning and Compatibility 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning)
- Logging: 2025-11-25 clarified that "servers using stdio transport may use stderr for all types of logging." 2026-07-28 recommends stderr or OpenTelemetry in place of the deprecated Logging feature. — [2025-11-25 changelog](https://modelcontextprotocol.io/specification/2025-11-25/changelog); [2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)

### Inferences
- A Ring bridge in late 2026 should be a **dual-era server**, explicitly permitted by the spec ("MAY serve both eras concurrently on the same endpoint or process"). It should target **2026-07-28 as primary** and still answer `initialize` for **2025-11-25-and-earlier** clients.
  - A modern-only server simply "Fails" for legacy clients, which have no fall-forward.
  - Client adoption is split: ChatGPT MCP Events requires 2026-07-28, while Claude Code channels fail under 2026-07-28 and need legacy negotiation (see §2).
- The protocol is now stateless, so there is no per-connection device context. Anything like "selected camera" or "pending arm request" must be a server-minted, user-bound handle passed explicitly as a tool argument.
- Sampling and Logging are deprecated, so the design should not depend on them. Use OpenTelemetry or stderr for logs, and do not have the server call the client's LLM.

### Gaps
- I did not verify which major clients have actually shipped 2026-07-28 support, apart from Claude Code (v2 runtime) and ChatGPT (Events requires it).
- No newer draft revision after 2026-07-28 was found. The draft spec folder was not inspected.

---

## 2. Pushing events to clients: spec mechanisms, client support, practical patterns and proposals

### Takeaway
Core MCP has no "push an event to the agent" primitive. It only has change notifications: list-changed and resource-updated, delivered over `subscriptions/listen` in 2026-07-28. Those tell a client that something changed, not that the model should act. Also, 2026-07-28 removed stream resumability. Real "wake the agent" push exists only through:
- (a) the **draft Events extension SEP-3415**, opened Oct 5, 2026 and still an unmerged draft;
- (b) **ChatGPT's MCP Events implementation**, which is webhook-only and requires 2026-07-28;
- (c) **Claude Code "channels"**, a research preview using a vendor-specific `notifications/claude/channel` over stdio, which is incompatible with 2026-07-28 negotiation.

The only portable baseline is a **cursor-based "events since" tool or resource that the client polls**.

### Cited Findings

**Spec mechanisms (2026-07-28)**
- The `resources` capability has `subscribe` and `listChanged`. "Clients subscribe to change notifications for specific resources by sending a `subscriptions/listen` request with the resource URIs listed in `notifications.resourceSubscriptions`." The server then sends `notifications/resources/updated` carrying `uri` and `_meta.io.modelcontextprotocol/subscriptionId`. — [Resources 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/server/resources)
- `notifications/resources/updated` carries only the URI. The documented flow is "Server--)Client: notifications/resources/updated → Client->>Server: resources/read." — [Resources 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/server/resources)
- `subscriptions/listen` mechanics — [Subscriptions pattern](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/subscriptions):
  - "opens a long-lived notification stream... It replaces the former `resources/subscribe` RPC and the HTTP GET endpoint."
  - "The server MUST NOT send notification types the client has not explicitly requested."
  - The server must first send `notifications/subscriptions/acknowledged`, listing the subset it honors.
  - A client may hold several concurrent subscriptions.
  - Graceful closure is signaled by a completion response. An abrupt drop "MAY" trigger a reconnect.
  - On stdio, "the server holds no subscription state across reconnections."
- The filter admits only four standard types: `toolsListChanged`, `promptsListChanged`, `resourcesListChanged` and `resourceSubscriptions`. — [Subscriptions pattern](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/subscriptions)
- **Durability regression:** 2026-07-28 "Remove[d] SSE stream resumability and message redelivery (the `Last-Event-ID` header and SSE event IDs)." — [2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog). This reverses the 2025-11-25 SEP-1699 work, which had added polling SSE streams with resumption via GET and event IDs. — [2025-11-25 changelog](https://modelcontextprotocol.io/specification/2025-11-25/changelog)
- **Logging and progress are not an event bus.** In 2026-07-28 both `notifications/progress` and `notifications/message` are request-scoped and flow only on the response stream of the related request. Logging is deprecated (SEP-2577). — [2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- `ttlMs`/`cacheScope` on `resources/read` and list results is a "freshness hint... allowing clients to cache responses and reduce polling." — [2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- Tasks (extension) cover long-running operations. Clients poll `tasks/get`, and `tasks/update` sends client-to-server input. — [2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog). The extension is "contributed by AWS." — [MCP blog 2026-07-28](https://blog.modelcontextprotocol.io/posts/2026-07-28/)

**Proposals: Events / Triggers**
- The **Triggers & Events Working Group** repo is an "Incubation space"; its "Contents are exploratory and do not represent official MCP specifications."
  - Goal: "define how MCP servers proactively notify clients of state changes" with "a standardized callback mechanism" and "defined ordering guarantees."
  - Leads: Clare Liguori (AWS) and Peter Alexander (Anthropic).
  - It says it owns the webhook-style task-completion notifications that SEP-1686 deferred.
  - Source: [experimental-ext-triggers-events](https://github.com/modelcontextprotocol/experimental-ext-triggers-events)
- **SEP-3415 "Events Extension"** — [PR #3415](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3415):
  - Opened by pja-ant on **Oct 5, 2026**. Status is **Draft**, not merged, with eight open questions and an official-SDK reference implementation still outstanding.
  - Methods: `events/list`, where each type has `inputSchema`, `payloadSchema` and delivery modes.
  - Three delivery modes, "none mandatory":
    - `events/poll`, stateless with a cursor and a `nextPollMs` hint;
    - `events/stream`, a long-lived stream;
    - webhooks via `events/subscribe`/`events/unsubscribe`, with a refreshed TTL.
  - Cursors: "Opaque cursors let a client resume after a disconnect"; replay is optional per type; `truncated: true` signals skipped events.
  - Heartbeats advance cursors, and `eventId` supports dedup.
  - Webhooks follow Standard Webhooks HMAC signing, with optional ed25519.
  - "Unauthenticated MCP servers may offer poll and push, but not webhook."
  - Error codes `-32023`…`-32027` are "provisional."
- The MCP roadmap lists "server-initiated events (webhooks and channels, so clients aren't left polling for results)" as a priority. — [The New MCP Roadmap](https://blog.modelcontextprotocol.io/posts/mcp-roadmap/). This comes from a search-result excerpt; I did not fetch the page.
- **Conflict:** an earlier Upstash post said there was no formal SEP for events yet. The SEP-3415 PR (Oct 5, 2026) supersedes that. — [Upstash: MCP Tasks and Events](https://upstash.com/blog/mcp-tasks-and-events) (search excerpt) vs [PR #3415](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3415)

**ChatGPT (OpenAI): MCP Events, shipped, webhook-only** — source: [OpenAI: MCP Events](https://developers.openai.com/plugins/build/mcp-events)
- Requirements and availability:
  - "MCP Events in ChatGPT requires MCP 2.0 (protocol version `2026-07-28`)."
  - Available in "Work chats on ChatGPT web," in the desktop app with Cloud selected, and with dots.
  - The server must advertise `events` in `server/discover` and implement `events/list`, `events/subscribe` and `events/unsubscribe` "on the same authenticated MCP endpoint as your tools."
- Not supported: "Polling, streaming, and the draft's `gap` and `terminated` control notifications are not supported."
- Subscription and callback rules:
  - `whsec_` secrets must decode to 24–64 bytes.
  - The server verifies the callback with a signed challenge.
  - Callbacks must be HTTPS only, with private addresses blocked and no redirects.
  - Callback failure returns `-32015` `CallbackEndpointError`.
- Delivery format:
  - One event per POST, with headers `webhook-id`, `webhook-timestamp`, `webhook-signature` and `X-MCP-Subscription-Id`.
  - Body limit: "no larger than 256 KiB (262,144 bytes)."
  - Retry with backoff. Don't retry on 410 or 413. Events may arrive out of order, so write tools should be idempotent.
- Lifecycle: ChatGPT re-calls `events/subscribe` before `refreshBefore`, and may batch events into one task run.
- Safety guidance: "treat user-authored text as data... not embedding model instructions in payloads." For large records, "send a summary and expose a read tool for the full record."
- **Conflict:** OpenAI uses `-32015` for `CallbackEndpointError`, while SEP-3415's provisional codes are `-32023`…`-32027`. — [OpenAI MCP Events](https://developers.openai.com/plugins/build/mcp-events) vs [PR #3415](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3415). Note that `-32015` falls in the implementation-defined range under 2026-07-28's allocation policy. — [2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)

**Claude Code: channels (research preview)** — source: [Claude Code: Channels reference](https://code.claude.com/docs/en/channels-reference)
- "A channel is an MCP server that pushes events into a Claude Code session so Claude can react to things happening outside the terminal."
- How it works:
  - Runs over **stdio** as a local subprocess.
  - Declares `capabilities.experimental['claude/channel']`.
  - Emits `notifications/claude/channel` with `content` (string) and `meta` (string map). These arrive as a `<channel source=...>` tag.
- Delivery behavior:
  - "Claude Code doesn't acknowledge notifications"; events are dropped silently if the channel isn't registered.
  - Events queue and are processed in order. If several arrive while Claude is busy, they are delivered together on the next turn.
- Gating and status:
  - Research preview. Custom channels need `--dangerously-load-development-channels`.
  - Team/Enterprise organizations must enable channels.
  - Flags are ignored in `-p` and Agent SDK runs.
- Security: "An ungated channel is a prompt injection vector... Gate on the sender's identity, not the chat or room identity."
- Optional `claude/channel/permission` relays tool-approval prompts (allow/deny with a 5-letter request ID) to a remote device. Only declare it if the channel authenticates senders.
- **Protocol incompatibility:** "On the v2 runtime, a channel server that negotiates MCP protocol revision 2026-07-28 can't deliver channel messages, so Claude Code doesn't register it as a channel." Setting `MCP_PROTOCOL_NEGOTIATION=legacy` keeps the earlier handshake. — [Claude Code: MCP](https://code.claude.com/docs/en/mcp). This is corroborated in the SEP-3415 PR discussion: "Claude Code refuses to register channel servers that negotiate the 2026-07-28 revision, because `subscriptions/listen` admits only the four standard types." — [PR #3415](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3415)

**Claude Code: other event-relevant behavior** — source: [Claude Code: MCP](https://code.claude.com/docs/en/mcp)
- On `list_changed`, interactive Claude Code "fetches the updated list from that server." In `-p` and Agent SDK runs it "refreshes only the tool list."
- On the v2 runtime, Claude Code holds a notification stream open and reopens it.
- Claude Code also supports a WebSocket transport (`type: "ws"`), described as suiting "remote MCP servers that push events to Claude unprompted." It supports neither OAuth nor `claude mcp add --transport`; authentication is header-only.

**Other client support data**
- **Home Assistant's own MCP server** lists "Notifications: Not supported" and "Sampling: Not supported." — [HA MCP Server](https://www.home-assistant.io/integrations/mcp_server/)
- **VS Code** docs confirm tools, resources ("Add Context > MCP Resources", "MCP: Browse Resources"), prompts and experimental MCP Apps. Subscriptions are not mentioned. — [VS Code MCP servers](https://code.visualstudio.com/docs/copilot/chat/mcp-servers)
- A third-party docs-based matrix of 24 clients reports: tools 24/24, Streamable HTTP 22, OAuth 19, resources 15, elicitation 13, prompts 13, roots 4, and sampling only 2 (VS Code Copilot and Copilot CLI). Resource subscriptions are not broken out. — [developersdigest client matrix](https://www.developersdigest.tech/mcp-servers/clients); [developersdigest post](https://www.developersdigest.tech/blog/mcp-client-features-explained-2026). This is a secondary source and reflects documentation, not tested behavior.
- Search results indicate the Vercel AI SDK and the Everruns runtime have MCP Events support pages. — [AI SDK: MCP events](https://ai-sdk.dev/docs/ai-sdk-core/mcp-events); [Everruns changelog 2026-10-01](https://everruns.com/docs/changelog/2026-10-01-mcp-events-webhooks-triggers/). Search excerpt only; not verified.

### Inferences
A practical, layered event design for a Ring bridge:
1. **Baseline (works with every client):**
   - A read tool `get_events(since_cursor, types[], device_ids[], limit)` returning `structuredContent` (event list plus opaque `next_cursor`, `truncated` flag), with a matching `outputSchema`.
   - A mirror resource, e.g. `ring://events/recent`, and a per-device state resource template, e.g. `ring://devices/{id}/state`.
   - Server-side durable event log with a retention window, so cursors survive client reconnects. This matters because 2026-07-28 removed SSE redelivery.
   - Mirroring SEP-3415's cursor/`truncated`/`eventId` semantics now eases migration later.
2. **Change hints:** advertise `resources.subscribe` and emit `notifications/resources/updated` for device-state URIs, via `subscriptions/listen` on 2026-07-28 or `resources/subscribe` on ≤2025-11-25. Treat these as cache invalidation, not as agent triggers. Few clients surface them to the model, and HA itself doesn't implement notifications.
3. **Host-specific "wake the agent" adapters:**
   - ChatGPT: SEP-3415 webhook events (`ring.doorbell.ding`, `ring.motion.detected`, `ring.alarm.mode_changed`), which needs remote HTTPS, OAuth and persistent subscription storage.
   - Claude Code: a separate stdio **channel** process on legacy negotiation. Expect drift, because both mechanisms are preview or draft.
4. **Out-of-band bus for non-MCP consumers:** e.g. MQTT or signed webhooks to n8n or agent runtimes. MCP stays the query and control plane.
- Event payloads should be small summaries (e.g. ≤256 KiB for ChatGPT), with IDs that the agent dereferences via a read tool (`get_event`, `get_snapshot`). This follows OpenAI's guidance.
- A stateless 2026-07-28 deployment behind a load balancer needs a shared pub/sub (e.g. Redis) so whichever instance holds a `subscriptions/listen` stream sees Ring events received by other instances. This follows from the stateless design; the spec doesn't state it.

### Gaps
- No primary source was found for resource-subscription or notification support in **Cursor, Gemini CLI, LangChain/LangGraph MCP adapters, n8n, Windsurf, Goose or OpenAI Agents SDK/Codex**. Whether these clients surface `notifications/resources/updated` to the model is unknown.
- VS Code docs don't say whether it supports subscriptions or elicitation.
- I did not establish whether Claude Desktop or claude.ai support resource subscriptions or any push mechanism beyond Claude Code channels.
- SEP-3415 is a draft: method names, error codes, and the coalescing semantics for state-like events (discussed in the PR) may still change.

---

## 3. Media: images, audio, video and live streams

### Takeaway
MCP natively supports **base64 `image` and `audio` content blocks**, **embedded resources** (text or base64 `blob`), and **`resource_link`s** (URI plus optional `size`). It has **no video content type and no streaming-media primitive**. Practical client limits are token or byte caps, which favors downscaled JPEG snapshots inline and resource links (or MCP Apps UI) for clips and live view.

### Cited Findings
- Image content: `{"type":"image","data":"base64-encoded-data","mimeType":"image/png","annotations":{...}}`. Audio content: `{"type":"audio","data":"base64-encoded-audio-data","mimeType":"audio/wav"}`. All content types support `audience`/`priority`/`lastModified` annotations. — [Tools 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
- In the schema, `ImageContent.mimeType` is documented as "Different providers may support different image types." There is no size limit in either definition. `ResourceLink.size` is "The size of the raw resource content, in bytes (i.e., before base64 encoding or any tokenization)... used by Hosts to... estimate context window usage." — [schema.ts 2026-07-28](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2026-07-28/schema.ts)
- Resource links: "A tool MAY return links to Resources... the tool will return a URI that can be subscribed to or fetched by the client." "Resource links returned by tools are not guaranteed to appear in the results of a `resources/list` request." Embedded resources (`type: "resource"`) carry `text` or `blob`. — [Tools 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
- Resource contents can be `{"uri","mimeType","blob":"base64-encoded-data"}`. For an `https://` URI, "Servers SHOULD use this scheme only when the client is able to fetch and load the resource directly from the web on its own." Custom URI schemes are allowed under RFC 3986. — [Resources 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/server/resources)
- For backward compatibility, a tool returning `structuredContent` "SHOULD also return the serialized JSON in a TextContent block." — [Tools 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
- **Claude Code limits:** "displays a warning when MCP tool output exceeds 10,000 tokens and limits output to 25,000 tokens by default". This is configurable with `MAX_MCP_OUTPUT_TOKENS`. "Successful text results longer than 50,000 characters are saved to a file." — [Claude Code: MCP](https://code.claude.com/docs/en/mcp)
- User-reported Claude Code issues:
  - Base64 screenshots exceeded the 25,000-token cap. — [claudeissues #9152](https://claudeissues.com/issue/9152-bug-claude-code-mcp-image-responses-token-exceeds-25000-tokens)
  - ImageContent was reportedly handled as text, costing about 15–25k tokens per image vs about 1.6k when pasted natively. — [claudeissues #31208](https://claudeissues.com/issue/31208-bug-mcp-imagecontent-returned-as-text-in-tool-results-instead-of-native-image-bl)
  - These are user bug reports, not vendor documentation, and the behavior may be version-specific.
- A **"1 MB" tool-result cap in Claude Desktop** (error "result exceeds maximum length of 1048576") is claimed only in a third-party server README. Unverified. — [openai-gpt-image-mcp README](https://glama.ai/mcp/servers/@SureScaleAI/openai-gpt-image-mcp/blob/558265a1c92d4ab51efdd03135286b727487204c/README.md)
- ChatGPT MCP Events webhook bodies are capped at 256 KiB, so media cannot ride inside event payloads. — [OpenAI MCP Events](https://developers.openai.com/plugins/build/mcp-events)
- **MCP Apps** (official extension):
  - Tools declare `_meta.ui.resourceUri` pointing to a `ui://` HTML resource, which is rendered in a sandboxed iframe.
  - `_meta.ui.csp` controls the external origins it can load, and `_meta.ui.permissions` can request e.g. camera or microphone.
  - Listed use cases include "Viewing rich media" and "Real-time monitoring... maintains a persistent connection."
  - The examples include a **`video-resource-server`**.
  - Supported by Claude, Claude Desktop, VS Code GitHub Copilot, Microsoft 365 Copilot, Goose, Postman, MCPJam and Archestra.AI.
  - Source: [MCP Apps overview](https://modelcontextprotocol.io/extensions/apps/overview); [ext-apps video-resource-server example](https://github.com/modelcontextprotocol/ext-apps/tree/main/examples/video-resource-server)
- Existing camera servers use URLs or tools, not inline video:
  - The Frigate MCP server's `get_snapshot` returns "a URL to a snapshot image." `get_event_details` returns zones, thumbnails, clips and timeline. — [dedsxc/mcp-frigate (Glama)](https://glama.ai/mcp/servers/dedsxc/mcp-frigate). Directory listing, not the source repo.
  - The community Ring MCP server "grabs camera snapshots." — [jpcors/ring-mcp (Glama)](https://glama.ai/mcp/servers/jpcors/ring-mcp)

### Inferences
- **Snapshots:** return a downscaled JPEG `image` block (e.g. ≤1280px, quality ~70) so it stays well under the 25k-token and 1 MB-class limits. Also return a `resource_link` (`ring://snapshots/{id}`, `mimeType: image/jpeg`, `size`) so a client or user can fetch the full-resolution image.
- **Recorded clips:** return a `resource_link` with `mimeType: video/mp4` and `size`, plus `structuredContent` metadata (duration, timestamps). The resource can serve a `blob` if the client asks for it.
  - Provide **frame-sampling tools**, e.g. `get_clip_frames(event_id, n=4)` returning images. LLMs can't consume video natively through MCP.
  - Optionally offer a short-lived, user-bound signed `https` URL. Note that such URLs then land in LLM context and logs. The elicitation section's ban on "pre-authenticated" URLs is specific to URL-mode elicitation, but the same exposure logic applies.
- **Live view:** there is no MCP-native way to hand a live RTSP/HLS/WebRTC stream to an agent. Options:
  - (a) an **MCP App** with an embedded player for clients that render Apps;
  - (b) a tool returning a short-lived stream session handle or URL for a human-facing player;
  - (c) "watch" tools that return periodic still frames, or a task (via the Tasks extension) that samples frames and reports.
- Audio content blocks could carry doorbell audio snippets, but no client-support data was found.

### Gaps
- No official per-client image or payload limits were found for ChatGPT, Claude Desktop/claude.ai, Cursor, VS Code or Gemini CLI.
- No MCP-specific pattern or SEP for live-stream handoff (RTSP/HLS/WebRTC) was found.
- Client support for `audio` content and for `resource_link` dereferencing was not verified.
- I did not check whether the MCP Apps video example supports live streams or only recorded files.

---

## 4. Safety for physical-world control: confirmation, annotations, policy, audit, prompt injection, auth anti-patterns

### Takeaway
The spec gives **hints** (tool annotations, which clients must treat as untrusted), **SHOULD-level** human-in-the-loop guidance for clients, and **elicitation** (form and URL mode, delivered via MRTR in 2026-07-28). Neither guarantees that a human confirms. A bridge controlling alarms, sirens or locks must enforce safety **server-side**:
- scopes or policy per action;
- explicit confirmation flows that fail closed;
- idempotency;
- rate limits;
- audit logs.

It must also treat device names, event text and camera frames (including OCR-able text) as untrusted input.

### Cited Findings

**Spec guidance on human-in-the-loop and annotations**
- "For trust & safety and security, there SHOULD always be a human in the loop with the ability to deny tool invocations." Applications "SHOULD... Present confirmation prompts to the user for operations." — [Tools 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
- "Clients MUST consider tool annotations to be untrusted unless they come from trusted servers." — [Tools 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
- Annotation defaults — [schema.ts](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2026-07-28/schema.ts):
  - `readOnlyHint` defaults to false;
  - `destructiveHint` defaults to true and applies only when not read-only;
  - `idempotentHint` defaults to false;
  - `openWorldHint` defaults to true.
- Server MUSTs: "Validate all tool inputs; Implement proper access controls; Rate limit tool invocations; Sanitize tool outputs." Client SHOULDs: "Prompt for user confirmation on sensitive operations; Show tool inputs to the user...; Validate tool results before passing to LLM...; Log tool usage for audit purposes." — [Tools 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
- Input-validation failures should be tool execution errors (`isError: true`) so the model can self-correct (SEP-1303). — [2025-11-25 changelog](https://modelcontextprotocol.io/specification/2025-11-25/changelog); [Tools 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)

**Elicitation (confirmation and credentials)**
- Elicitation via MRTR: the server returns `InputRequiredResult` with `elicitation/create`, and the client retries `tools/call` with `inputResponses` and an opaque `requestState`. "The JSON-RPC `id` MUST be different between the initial request and the retry." — [Tools 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
- Form-mode schemas are flat primitives only: string, number, boolean and enum. Responses are `accept`, `decline` or `cancel`. Servers "MUST handle cases where the user declines or cancels... or where the client fails to process the request." — [Elicitation 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation)
- "Servers MUST NOT use form mode elicitation to request sensitive information such as passwords, API keys, access tokens, or payment credentials. Servers MUST use URL mode for interactions involving such sensitive information." — [Elicitation 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation)
- URL mode:
  - The URL must not contain user credentials or PII, and "MUST NOT provide a URL which is pre-authenticated."
  - Clients must show the full URL, get consent, and not pre-fetch it.
  - The server "MUST ensure that the user who started the elicitation request... is the same user who completes the authorization flow" (anti-phishing).
  - "Third-party credentials MUST NOT transit through the MCP client."
  - "The MCP server MUST NOT use the client's credentials for the third-party service" (token passthrough).
  - "The MCP server is responsible for storing and managing the third-party tokens."
  - Source: [Elicitation 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation)
- A third-party docs survey reports 13 of 24 clients document elicitation support. — [developersdigest](https://www.developersdigest.tech/mcp-servers/clients) (secondary)

**Security best practices (official)** — source: [Security Best Practices 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/security_best_practices)
- **Token passthrough:** "MCP servers MUST NOT accept any tokens that were not explicitly issued for the MCP server."
- **Confused deputy:** MCP proxy servers using a static client ID to a third-party API "MUST implement per-client consent." This includes consent UI showing the client name, scopes and redirect URI, exact redirect-URI matching, and single-use `state`.
- **State handle hijacking (new in the stateless model):** "MCP servers MUST NOT treat possession of a state handle as authentication." Servers should use random handles bound server-side to the authenticated user (`<user_id>:<handle>`), with expiry.
- **Local server compromise:** locally run servers "SHOULD" use stdio, or restrict HTTP with an auth token or Unix sockets.
- **Scope minimization:** "Minimal initial scope set... Incremental elevation via targeted `WWW-Authenticate` `scope="..."` challenges when privileged operations are first attempted."
- The page also covers SSRF, OAuth URL validation, mix-up attacks (RFC 9207 `iss`), localhost redirect impersonation and CIMD trust policies.

**Client-side auth realities (relevant to remote deployment)**
- Claude Code: "supports OAuth 2.0 for secure connections" and "supports servers that use a Client ID Metadata Document (CIMD)." However, OAuth "isn't available for `claude -p` or Agent SDK runs, which must sign in from an interactive session first." Non-OAuth schemes can use `headersHelper`. — [Claude Code: MCP](https://code.claude.com/docs/en/mcp)
- Streamable HTTP servers must answer an invalid `Origin` with HTTP 403 (PR #1439). — [2025-11-25 changelog](https://modelcontextprotocol.io/specification/2025-11-25/changelog)

**OWASP MCP Top 10 (beta)** — source: [OWASP MCP Top 10](https://owasp.org/www-project-mcp-top-10/)
- Status: "Beta," Phase 3. Entries are labeled 2025.
- Entries:
  - MCP01 Token Mismanagement & Secret Exposure
  - MCP02 Privilege Escalation via Scope Creep
  - MCP03 Tool Poisoning
  - MCP04 Supply Chain
  - MCP05 Command Injection
  - MCP06 "Prompt Injection via Contextual Payloads", explicitly including "OCR-extracted content"
  - MCP07 Insufficient AuthN/AuthZ
  - MCP08 Lack of Audit and Telemetry
  - MCP09 Shadow MCP Servers
  - MCP10 Context Injection & Over-Sharing
- **Conflict:** the MCP06 roadmap title differs from its linked file name ("Intent-Flow-Subversion").

**Prompt-injection evidence relevant to cameras**
- Typographic instructions "on physical objects like signs, packaging, clothing, or screens, within the field of view of camera-equipped agents, can hijack behavior." "No current defense fully neutralizes all image-based injection variants." The note cites a 64% peak black-box attack success rate. — [CSA research note: image prompt injection (2026)](https://labs.cloudsecurityalliance.org/research/csa-research-note-image-prompt-injection-multimodal-llm-2026/). Secondary source; the figure should be checked against the cited study.
- AgentTypo reports that image-only typographic attacks raised success on GPT-4o agents from 23% to 45%, and to 68% in image+text settings. — [AgentTypo (arXiv 2510.04257)](https://arxiv.org/html/2510.04257v1)

**Vendor guidance on untrusted inputs**
- Claude Code: "An ungated channel is a prompt injection vector. Anyone who can reach your endpoint can put text in front of Claude." Permission relay fields are sanitized, and Claude Code masks credentials in them. — [Claude Code channels reference](https://code.claude.com/docs/en/channels-reference)
- OpenAI: treat user-authored text in event payloads as data, don't embed model instructions, and recheck user access on every delivery. — [OpenAI MCP Events](https://developers.openai.com/plugins/build/mcp-events)

**Existing smart-home safety posture**
- Home Assistant's MCP server:
  - "Clients can only control or provide information about entities that are exposed to them" (Assist exposure).
  - "Require an administrator account" is on by default.
  - Source: [HA MCP Server](https://www.home-assistant.io/integrations/mcp_server/)
- The community Go `ha-mcp` advertises "read-only mode and whitelists." — [zorak1103/ha-mcp (mcpservers.org)](https://mcpservers.org/servers/zorak1103/ha-mcp). Directory listing.

### Inferences
**Tool design**
- Split **read tools** (`readOnlyHint: true`, `openWorldHint: false` where accurate) from **control tools**. Set annotations explicitly on control tools: `readOnlyHint: false`, `destructiveHint: true` for disarm, siren and unlock; `idempotentHint: true` for set-mode-style calls.
- Clients may ignore hints, so annotations only improve UX and are not a safety control.

**Safety-critical actions** (disarm alarm, siren on/off, lock or unlock, turning lights off while armed)
- Use a **server-enforced two-step pattern**:
  1. `propose_<action>` returns a human-readable summary plus a short-lived, user-bound `confirmation_id`.
  2. `confirm_<action>(confirmation_id)` executes.
- Where the client declares elicitation, fold the confirmation into an MRTR form elicitation (boolean or enum "Confirm disarm of 'Home' alarm"). **Fail closed** on decline, cancel or no-elicitation-capability.
- A model can call both tools itself, so pair this with policy: an allowlist of actions and devices per OAuth scope, quiet hours, and requiring URL-mode or out-of-band confirmation (e.g. Ring app or PIN page) for disarm or unlock.

**Scopes and auth**
- Model scopes as `ring:read`, `ring:media`, `ring:control` and `ring:security-critical`, with step-up via `WWW-Authenticate` per the scope-minimization guidance.
- Rate-limit control calls. Make control idempotent and keyed by request ID, since ChatGPT events may arrive out of order and MRTR retries re-send calls.

**Ring credentials**
- The Ring login (email, password and 2FA, yielding a refresh token) must **never** go through form elicitation or tool arguments.
- Use **URL-mode elicitation** to a bridge-hosted page, or a one-time local CLI setup. Store the Ring refresh token server-side, bound to the MCP user (`sub`).
- Never accept the MCP client's token for Ring calls, and never return Ring tokens to the client (token passthrough and confused deputy rules).

**Prompt-injection hardening**
- Return device names, event labels and any user-generated text as **structured fields**, not prose. Escape or neutralize control and bidi characters, and cap their length.
- Annotate camera images with `audience` and add a fixed caveat that image text is untrusted.
- Never let event payloads or image content directly trigger control. Require a human-confirmed path for safety-critical tools.

**Audit**
- Keep an append-only audit log of every control proposal, confirmation, decline and execution (who, which client, args, result). This is OWASP MCP08 and the spec's "Log tool usage" guidance.

### Gaps
- I found no MCP-spec or vendor guidance specific to physical-world or IoT actuation, e.g. "safety-critical" annotations or mandatory confirmation semantics.
- Which clients render form-mode elicitation as a true blocking confirmation dialog, and how each client uses `readOnlyHint`/`destructiveHint` for auto-approval, was not verified for Claude, ChatGPT, Cursor, VS Code or Gemini CLI.
- The original March 2026 study behind the CSA 64% figure was not located.
- The Microsoft tool-poisoning mitigations (signed manifests, metadata scanning) came only via secondary summaries and are omitted.

---

## 5. Existing IoT/smart-home and camera MCP servers: tools vs resources vs events

### Takeaway
Existing smart-home MCP servers are **overwhelmingly tool-centric request/response**. Home Assistant's official server exposes intent-style tools plus a single read-only context-snapshot resource, uses OAuth with CIMD, and **does not support notifications**. Community servers (HA, Homey, Hubitat, Tuya, Frigate, Ring) expose dozens of CRUD and control tools, and few or none implement push. Events are typically **queried** ("get_events" with filters), not pushed.

### Cited Findings

**Home Assistant: official MCP Server integration** — source: [HA MCP Server](https://www.home-assistant.io/integrations/mcp_server/)
- Introduced in **HA 2025.2**.
- Tools and prompts: "The tools used by the configured LLM API are exposed" (the Assist API by default). "The MCP Prompts provided inform LLMs how to call the tools."
- Resources (Assist only): when `GetLiveContext` is present, a read-only resource `homeassistant://assist/context-snapshot` returns "a plain-text snapshot" equal to that tool's output.
- Endpoint and auth:
  - Endpoint `/api/mcp`.
  - "OAuth 2.0 with PKCE"; supports **CIMD**. The client ID must be the client's base URL (e.g. `https://claude.ai`). No client secret is used.
  - "RFC 7591 Dynamic Client Registration is not supported."
  - Admin-only by default.
- Feature support: Prompts, Tools and Resources (Assist only) are supported. "Sampling: Not supported; Notifications: Not supported."
- A comparison listing describes the official server as having "~10 intent-based tools" and says it is the better choice "if you need entity-level security or no external infrastructure." — [mcpservers.org ha-mcp listing](https://mcpservers.org/servers/zorak1103/ha-mcp). Secondary.

**Community Home Assistant servers**
- `homeassistant-ai/ha-mcp` (Python/FastMCP): "The Unofficial and Awesome Home Assistant MCP Server." Recommended install is a HACS custom component that runs in-process. A listing claims 95+ tools. — [ha-mcp on PyPI](https://pypi.org/project/ha-mcp/)
- `zorak1103/ha-mcp` (Go):
  - About 38–40 tools across entities, automations, scripts, devices and dashboards.
  - Uses "WebSocket for most operations, REST API for automation/script/scene CRUD," with auto-reconnect.
  - Has "read-only mode and whitelists."
  - Source: [mcpservers.org](https://mcpservers.org/servers/zorak1103/ha-mcp). Tool counts vary across listings.

**Other hubs and platforms**
- Homey (community): list and control devices, set capabilities, zones, trigger flows. Needs a Homey Pro with the local API, an API key and the local IP. — [allistera/homey-mcp-server (Glama)](https://glama.ai/mcp/servers/allistera/homey-mcp-server)

**Spec interaction model (why state must also be reachable by a tool)**
- "Resources in MCP are designed to be **application-driven**, with host applications determining how to incorporate context based on their needs." — [Resources 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/server/resources)
- "Tools in MCP are designed to be **model-controlled**, meaning that the language model can discover and invoke tools automatically." — [Tools 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
- Tuya: about 10 tools for device control (on/off, brightness, color, temperature, custom commands) using Tuya IoT Platform credentials. — [mcp-server-tuya (Glama)](https://glama.ai/mcp/servers/juanmartinsantos/mcp-server-tuya)
- Hubitat: a TypeScript server with 12 tools (devices, modes, HSM, hub variables), supporting stdio and remote HTTP. — [Hubitat MCP Server (Glama)](https://glama.ai/mcp/servers/gfhk9sdvdv)

**Cameras / NVR**
- Frigate (`dedsxc/mcp-frigate`): tools `get_events` (camera, label, limit filters; records include `has_snapshot`), `get_event_details` (zones, thumbnails, clips, timeline) and `get_snapshot` (returns a URL). — [Glama](https://glama.ai/mcp/servers/dedsxc/mcp-frigate); [get_snapshot tool page](https://glama.ai/mcp/servers/dedsxc/mcp-frigate/tools/get_snapshot)

**Ring**
- `jpcors/ring-mcp`, unofficial and built on `ring-client-api`:
  - "lists devices, arms and disarms alarms, grabs camera snapshots, toggles lights, and watches for doorbell presses and motion."
  - Node 18+.
  - First run prompts for Ring email, password and 2FA, then "saves a refresh token locally in `ring-config.json`."
  - "not affiliated with or endorsed by Ring/Amazon."
  - Source: [jpcors/ring-mcp (Glama)](https://glama.ai/mcp/servers/jpcors/ring-mcp). Directory listing; repo not inspected.

### Inferences
- **Patterns worth copying:**
  - HA's **dual exposure of the live state snapshot as both a tool and a resource**. Many clients don't auto-read resources, so state must also be reachable by a tool.
  - HA's **exposure allowlist**: only explicitly exposed entities are controllable.
  - HA's **CIMD-only OAuth**, which aligns with DCR's deprecation in 2026-07-28.
- **Gaps in the prior art that a Ring bridge can fill:**
  - durable event cursors;
  - SEP-3415/ChatGPT webhook events;
  - inline image content in addition to URLs;
  - explicit two-step confirmation for alarm disarm.
- `jpcors/ring-mcp`'s interactive local credential capture and plaintext refresh-token file is a reasonable local-only pattern. It doesn't carry over to a remote multi-user deployment, which needs URL-mode or out-of-band credential capture and encrypted per-user token storage.
- Prefer a modest number of **intent-level tools** (HA style: `arm_alarm(mode)`, `get_device_state`, `get_events`, `get_snapshot`) over many raw API-mirroring tools. Tool counts in the 40–95 range (community HA servers) increase context and tool-selection cost. This is inferred from the contrast between the official and community servers; no measured evidence was gathered.

### Gaps
- **UniFi Protect, Blue Iris, SmartThings, Philips Hue and MQTT-generic MCP servers** were not researched; searches returned nothing for SmartThings or Hue.
- A second Frigate server (`jakekeeys/frigate-mcp`, said to cover recordings, review, exports and classification, with no PTZ) surfaced only in a search summary and is unverified.
- A search summary claimed "Homey now offer their own MCP Server" (an official Athom/Homey server). No primary source was found, so this is unverified.
- The details of the HA **MCP client** integration (HA consuming external MCP servers) were not fetched.
- Whether HA restricts locks, alarms or cameras via MCP beyond Assist exposure is not stated on the integration page.
- No community server was found that implements MCP resource subscriptions or SEP-3415 events for devices.

---

## 6. SDK choice: TypeScript vs Python (FastMCP) vs C#/.NET vs others

### Takeaway
As of July 28, 2026, the **Tier 1** SDKs are **TypeScript, Python, Go and C#**, and all support 2026-07-28; Rust support is in beta. Tier 1 means 100% conformance, full non-experimental features, and new spec features shipped before release. Extensions (Tasks, MCP Apps, Events) are **not required** for any tier. **TypeScript** has the strongest ecosystem fit for a Ring bridge: `ring-client-api` is TypeScript, Claude Code channels are documented against `@modelcontextprotocol/sdk`, and Claude Code itself runs on TS SDK 2.0. Python (with `python-ring-doorbell`) is a credible Tier 1 alternative.

### Cited Findings
- Tier definitions — [SDK Tiering System](https://modelcontextprotocol.io/community/sdk-tiers):
  - Tier 1 = "complete protocol implementation, including all non-experimental features and optional capabilities like sampling and elicitation."
  - Conformance requirements: 100% for Tier 1, 80% for Tier 2, none for Tier 3.
  - New features: Tier 1 ships them "Before new spec version release"; Tier 2 within 6 months.
  - Triage: within 2 business days for Tier 1. Critical bugs: within 7 days for Tier 1.
  - Dates: conformance tests available Jan 23, 2026; tiering published Feb 23, 2026.
  - "Experimental features and protocol extensions (such as Tasks and MCP Apps) are not required for any tier."
- "All four Tier 1 SDKs support `2026-07-28` as of July 28, 2026": **TypeScript, Python, Go, C#**. "The Rust SDK supports the new spec in beta." The post notes migration costs "especially for code that depended on session identifiers." — [MCP blog 2026-07-28](https://blog.modelcontextprotocol.io/posts/2026-07-28/)
- Claude Code channels: "The only hard requirement is the `@modelcontextprotocol/sdk` package and a Node.js-compatible runtime" (Bun, Node or Deno). — [Claude Code channels reference](https://code.claude.com/docs/en/channels-reference)
- Claude Code's MCP runtime: "The v1 runtime is built on MCP TypeScript SDK 1.x. The v2 runtime is the same code on MCP TypeScript SDK 2.0, which adds MCP protocol revision 2026-07-28." Negotiation is controlled with `MCP_SDK_GENERATION` and `MCP_PROTOCOL_NEGOTIATION` (`auto`/`legacy`). — [Claude Code: MCP](https://code.claude.com/docs/en/mcp)
- SEP-3415 (Events) still lacks a reference implementation in an official SDK. Third-party implementations (Mastra, mcpkit) are linked from the PR. — [PR #3415](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/3415)
- MCP Apps ships an `@modelcontextprotocol/ext-apps` package (`App` class, AppBridge). — [MCP Apps overview](https://modelcontextprotocol.io/extensions/apps/overview)
- The community Ring MCP server is built on `ring-client-api` on Node 18+. — [jpcors/ring-mcp (Glama)](https://glama.ai/mcp/servers/jpcors/ring-mcp)
- The leading community HA server uses Python/FastMCP. — [ha-mcp on PyPI](https://pypi.org/project/ha-mcp/)

### Inferences
- **TypeScript** is the natural choice:
  - It shares a language with `ring-client-api`.
  - It is the reference for Claude Code channels.
  - The MCP Apps tooling is TS-first.
  - It has the most third-party SEP-3415 experiments.
  - The spec permits a dual-era server ([Versioning 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning)). On the client side, TS SDK 2.0 handles both eras in Claude Code. I did not verify how ergonomically each **server** SDK (TS, Python, C#) supports dual-era serving on one endpoint.
- **Python** is viable if the team prefers `python-ring-doorbell`, and it is Tier 1. **C#/.NET** is Tier 1 but has no Ring library advantage.
- Whatever the SDK, plan to **hand-implement** these pieces, since they are extensions or preview features:
  - the SEP-3415 `events/*` methods (or the ChatGPT subset);
  - Claude Code channel notifications;
  - the durable event store.
- Architecture: a **core Ring adapter** (auth, device model, event ingestion, policy and audit) plus **thin MCP front-ends**:
  - a remote Streamable HTTP server with OAuth (CIMD) for ChatGPT, claude.ai and IDEs;
  - a local stdio server or channel for Claude Code and desktop.
  - This isolates protocol churn from the Ring logic.

### Gaps
- Per-SDK support matrices for `subscriptions/listen`, MRTR-based elicitation, the Tasks extension and OAuth resource-server helpers were not collected for TS, Python, C# or Go.
- The relationship between the official Python SDK's bundled FastMCP and the standalone FastMCP project in Oct 2026 was not researched, including which one supports 2026-07-28.
- I did not verify which Tier 2 or Tier 3 SDKs exist (Java, Kotlin, Swift, Ruby, PHP) or their tiers; the tiering page fetched did not list current assignments.
- `ring-client-api` and `python-ring-doorbell` capabilities (push-event mechanism, live-stream protocol) are out of scope here and were not researched.
