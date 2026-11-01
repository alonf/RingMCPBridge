# Azure AI Foundry / Microsoft Foundry: MCP hosting, registration, and consumption options for an always-on Ring MCP bridge (as of 2026-10-24)

## 1. Does Foundry let you deploy and run your own custom MCP server code, or only connect to remote MCP servers hosted elsewhere?

These notes cover Foundry-specific capabilities only. General Azure hosting and Ring firewall risk are covered by another researcher. Doc dates are the `ms.date` / `updated_at` values on the pages as fetched on 2026-10-24.

### Takeaway
No. Foundry has no hosting option for a custom MCP server. Its MCP role is consumer (agents call remote MCP servers), aggregator/proxy (Toolboxes expose Foundry-managed tools plus remote MCP servers through one MCP endpoint), and registry (through Azure API Center). Foundry's own docs tell you to host custom MCP servers on Azure Functions or Azure Container Apps. "Hosted agents" do run arbitrary C# containers, but they are session-scoped agent runtimes behind fixed, Entra-authenticated platform endpoints. They are not a general-purpose, always-on MCP server host.

### Cited Findings
- Foundry tells you to host custom MCP servers elsewhere: "The Agent Service runtime only accepts a remote MCP server endpoint. If you want to add tools from a local MCP server, you need to self-host it on Azure Container Apps or Azure Functions to get a remote MCP server endpoint." — [Foundry MCP tool doc, 2026-09-29 (updated 2026-10-23)](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/model-context-protocol)
- The same instruction appears on the auth page: "If you developed a custom MCP server ... you need to host it in the cloud before connecting it to Agent Service ... deploy the server as a remote endpoint by hosting it on Azure Container Apps or Azure Functions." It links to "Choose an Azure service for your MCP server" in the Container Apps docs. — [Foundry MCP authentication doc, 2026-09-29](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/mcp-authentication)
- Foundry's own "Build and register an MCP server" article hosts the server outside Foundry: "This article shows you how to create a remote MCP server using Azure Functions, register it in a private organizational tool catalog using Azure API Center, and connect it to Foundry Agent Service." It also says: "MCP is an open protocol that works with any HTTP server. You can host an MCP server using ASP.NET Core ..." — [Foundry: Build and register an MCP server, 2026-09-21](https://learn.microsoft.com/en-us/azure/foundry/mcp/build-your-own-mcp-server)
- For a private MCP endpoint, Foundry again points to Container Apps: "To use a private MCP endpoint, host the MCP server on Azure Container Apps with internal-only ingress and a dedicated MCP subnet." The doc also says: "Azure Container Apps on a dedicated MCP subnet is the tested configuration for private MCP servers. Function Apps or App Services ... might work but aren't internally validated." — [Build your own MCP server](https://learn.microsoft.com/en-us/azure/foundry/mcp/build-your-own-mcp-server); [Foundry MCP tool doc, Known limitations](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/model-context-protocol)
- The request flow described is "When an agent needs a tool, Agent Service calls your MCP server endpoint." This is client-to-server only. — [Build your own MCP server](https://learn.microsoft.com/en-us/azure/foundry/mcp/build-your-own-mcp-server)
- Hosted agents do run your own code: "Hosted agents are containerized agentic AI applications that run on Agent Service ... Hosted agents are your own code packaged as a container image." Supported languages are "Python and C#". — [Hosted agents concept, 2026-10-19](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/hosted-agents)
- Hosted-agent endpoints are fixed platform paths under the project host:
  - Responses: `{project_endpoint}/agents/{name}/endpoint/protocols/openai/responses`
  - Invocations: `.../protocols/invocations`
  - Invocations (WebSocket): `wss://{account}.services.ai.azure.com/api/projects/{project}/agents/{name}/endpoint/protocols/invocations_ws?api-version=v1`
  - A2A: `.../protocols/a2a`

  The architecture diagram caption says clients call these endpoints "authenticated with Microsoft Entra ID". — [Hosted agents concept](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/hosted-agents)
- The documented hosted-agent protocols are Responses, Invocations (arbitrary JSON/SSE), Invocations (WebSocket), Activity (Teams/M365), and A2A. MCP is not one of them. Hosted agents *consume* MCP through a "Toolbox MCP endpoint". — [Hosted agents concept](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/hosted-agents)
- Microsoft's own webhook sample does not expose the hosted-agent endpoint directly. The Agent Framework "Foundry-hosted Telegram sample ... places API Management in front of the hosted agent webhook and uses managed identities, Key Vault, and Cosmos DB for durable conversation history." — [Agent Framework: Foundry Hosted Agents, 2026-10-08](https://learn.microsoft.com/en-us/agent-framework/hosting/foundry-hosted-agent)
- Toolboxes provide a Foundry-managed MCP endpoint, but only for curated tools. "Foundry Toolboxes let you bundle multiple tools - such as Web Search, Code Interpreter, File Search, Azure AI Search, MCP servers, OpenAPI tools, and Agent-to-Agent connections - into a single MCP-compatible endpoint." The endpoint is `{project_endpoint}/toolboxes/{name}/mcp?api-version=v1`. Agents authenticate to it with Microsoft Entra credentials. — [Foundry MCP tool doc](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/model-context-protocol)
- Naming trap: the "Foundry MCP Server" is something else. It is Microsoft's own cloud-hosted MCP server for *operating Foundry* (managing models, agents and evaluations from VS Code or Copilot), with Entra auth. It is not a service for hosting your MCP server. It was announced in public preview on 2025-12-03 (Ignite 2025), and its predecessor was an experimental local server from Build 2025. — [Foundry devblog, 2025-12-03](https://devblogs.microsoft.com/foundry/announcing-foundry-mcp-server-preview-speeding-up-ai-dev-with-microsoft-foundry/); [Learn: Foundry MCP Server get started](https://learn.microsoft.com/en-us/azure/foundry/mcp/get-started); [Visual Studio Magazine, 2025-12-04](https://visualstudiomagazine.com/Articles/2025/12/04/Microsoft-Previews-Cloud-Hosted-Foundry-MCP-Server-for-AI-Agent-Development.aspx)

### Inferences
- A hosted agent cannot stand in for the bridge's MCP server, for four reasons:
  - **No always-on compute.** Compute follows the session and is released after the idle timeout, which can be at most 240 minutes (see Q4).
  - **No public surface you control.** The endpoint sits on the shared `*.services.ai.azure.com` project host at fixed paths, with Entra auth, so you can't serve a custom domain, `/.well-known/oauth-protected-resource`, or your own OAuth authorization server. Without these, Claude Code and ChatGPT cannot complete standard MCP OAuth discovery against it. (This is an inference from the endpoint format and the Entra caption. No doc explicitly says "you cannot serve MCP here".)
  - **No shared process.** Each session runs in its own VM-isolated sandbox, so no single process is shared across MCP clients.
  - **Microsoft's own webhook sample needs APIM in front.** That suggests the raw endpoint isn't meant as a public third-party ingress.
- A Toolbox is the only Foundry construct that *serves* an MCP endpoint. It proxies Foundry-managed tools and remote MCP servers, but it does not run your code, and it is Entra-authenticated. It is therefore not a hosting option for the bridge.
- For this project, the bridge's MCP server, Ring websocket, FCM listener, and durable event log belong on general Azure compute (the other researcher's scope). Foundry can only sit on the *client* side.

### Gaps
- I found no Microsoft statement that explicitly says "custom MCP servers cannot be hosted as hosted agents". The conclusion rests on the documented protocol list, the endpoint shape, and the explicit "self-host on Container Apps or Functions" guidance.
- I didn't verify whether hosted-agent endpoints accept any non-Entra inbound auth scheme. The Routines doc mentions endpoint auth schemes "`AzureRbac` or its `Entra` alias" and a preview "`AgentBlueprint` scheme" ([Routines concept](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/routines)), but I didn't find a full list.

## 2. Foundry Agent Service MCP tool: how agents consume remote MCP servers (auth, private networking, approval, transports, spec revision, notifications)

### Takeaway
Foundry agents consume remote MCP servers through an `mcp` tool or a Toolbox. Supported auth options are:
- key/header
- Entra agent identity or project managed identity
- Entra user delegation
- OAuth identity passthrough (custom OAuth app: client ID/secret, auth, token and refresh URLs; same tenant only)
- unauthenticated

Private MCP endpoints need Standard setup with a VNet and an ACA MCP subnet. Approval defaults to `always`. Non-streaming tool calls time out at 100 s. The docs describe tool listing and calling only, and say nothing about server-initiated notifications, resources, prompts or sampling.

### Cited Findings
- Tool definition fields:
  - `server_url`, `server_label`, and `allowed_tools`: "If you don't provide this value, the default value includes all of the tools in the MCP server."
  - `require_approval`: "The default value is `always`." Supported values are `always`, `never`, `{"never":[...]}` and `{"always":[...]}`.
  - `project_connection_id`, which stores auth.

  Approval surfaces as an `mcp_approval_request` output item, and you continue "by using `previous_response_id` and setting `approve` to `true`." — [Foundry MCP tool doc, 2026-09-29](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/model-context-protocol)
- Supported SDKs: Python, C#, JavaScript, Java and REST, in both Basic and Standard agent setup. "The .NET SDK is currently in preview" (MCP tool page). The MCP authentication page installs "GA packages" `Azure.AI.Projects --version 2.0.1` and `Azure.AI.Extensions.OpenAI --version 2.0.0`. — [MCP tool doc](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/model-context-protocol); [MCP authentication doc](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/mcp-authentication). (Contradiction: one page calls the .NET SDK preview and the other uses GA package versions. The July–Aug 2026 roundup says "`Azure.AI.Projects` `2.0.1` [is] the stable Projects package" and "the .NET `3.0.0` line remained in preview" — [Foundry What's new Jul–Aug 2026](https://devblogs.microsoft.com/foundry/whats-new-in-microsoft-foundry-july-august-2026/).)
- Auth method table, quoted:

  | Method | Description |
  | --- | --- |
  | Key-based | "Provide an API key or access token" |
  | Microsoft Entra - agent identity | — |
  | Microsoft Entra - project managed identity | — |
  | Microsoft Entra client user delegation | "Use `UserEntraToken` or `AgentOnBehalfOfUser`" |
  | OAuth identity passthrough | "Prompt users interacting with your agent to sign in" |
  | Unauthenticated access | — |

  Key-based credentials are stored as a header name and value, for example `Authorization: Bearer <token>`. — [MCP authentication doc, 2026-09-29](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/mcp-authentication)
- OAuth identity passthrough constraints:
  - Custom OAuth requires "Client ID: required; Client secret: optional; Auth URL: required; Refresh URL: required ...; Token URL: required; Scopes: optional (include `offline_access`...)". You "receive a redirect URL after configuration. Add the redirect URL to your OAuth app."
  - Consent is per user per connection: the first call returns an `oauth_consent_request` item with a `consent_link`.
  - Users "need at least the Foundry Agent Consumer role", and "The user's Microsoft Entra tenant must match the tenant of your Foundry project. Cross-tenant token exchange isn't supported."
  - With managed OAuth, Foundry blocks Microsoft-audience tokens from reaching custom servers ("Cannot pass Microsoft token to untrusted MCP endpoint"). The doc says "Your custom MCP server must be registered with an audience that you control."

  — [MCP authentication doc](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/mcp-authentication)
- OAuth passthrough is "available for authentication to Microsoft and non-Microsoft MCP servers and underlying services that are compliant with OAuth, including Microsoft Entra." — [MCP authentication doc](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/mcp-authentication)
- Private networking: "Private MCP requires private networking setup and a dedicated MCP subnet within your virtual network ... deploy your MCP server on Azure Container Apps with internal-only ingress on a dedicated MCP subnet delegated to `Microsoft.App/environments`" (template `19-private-network-agent-tools`). "Private MCP server connectivity is only available with Standard Agent Setup with private networking (BYO VNet). Basic agent setup doesn't support private MCP endpoints." — [MCP tool doc](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/model-context-protocol)
- Timeout: "Non-streaming MCP tool calls have a timeout of 100 seconds. If your MCP server takes longer than 100 seconds to respond, the call fails." — [MCP tool doc, Known limitations](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/model-context-protocol)
- Long-running operations are in preview. Background mode plus MCP tasks: the server must "Implement the Model Context Protocol tasks capability" and "Return a related task identifier in the tool result metadata (the `io.modelcontextprotocol/related-task` field with a `taskId`)". The doc says "Long-running MCP operations are in preview." The Toolbox endpoint "supports long-running operations through MCP tasks [spec 2025-11-25], which is in preview." — [MCP tool doc](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/model-context-protocol)
- Schema restriction: "'Invalid tool schema': This error usually happens if your MCP server definition includes `anyOf` or `allOf`, or if a parameter accepts multiple types of values." — [MCP tool doc](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/model-context-protocol)
- Transport evidence:
  - Catalog example: "Azure DevOps hosts the remote MCP endpoint and exposes it over streamable HTTP."
  - Hosting table: Functions need "HTTP streamable required (responses must support chunked transfer encoding for SSE-style streaming)". Container Apps need "HTTP POST/GET endpoints required". Both say "State: Stateless only."

  — [MCP tool doc](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/model-context-protocol); [MCP authentication doc](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/mcp-authentication)
- Security guidance: "Use an allow list of tools by using `allowed_tools`", "Treat tool descriptions, annotations, and results from remote MCP servers as untrusted input", and "Require approval for high-risk operations, especially tools that write data or change resources." — [MCP tool doc](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/model-context-protocol)
- Preview vs GA labeling conflicts:
  - The current MCP tool page title has no "(preview)".
  - The build-your-own page links to it as "Connect to Model Context Protocol servers (preview)".
  - The classic page is titled "... Foundry Agent Service (Preview) (classic)".
  - The July–Aug 2026 roundup lists "Toolboxes — generally available (GA)".

  — [Build your own MCP server](https://learn.microsoft.com/en-us/azure/foundry/mcp/build-your-own-mcp-server); [classic MCP page](https://learn.microsoft.com/en-us/azure/foundry-classic/agents/how-to/tools-classic/model-context-protocol?view=foundry-classic); [What's new Jul–Aug 2026](https://devblogs.microsoft.com/foundry/whats-new-in-microsoft-foundry-july-august-2026/)
- Rebrand: "Azure AI Foundry" became "Microsoft Foundry". Learn URLs moved from `/azure/ai-foundry/...` to `/azure/foundry/...`, and the old portal docs now sit under "Foundry (classic)" (`/azure/foundry-classic/...`). Some cross-links still use the old path, for example the API Center page links to `/azure/ai-foundry/agents/how-to/private-tool-catalog`. — [API Center MCP doc](https://learn.microsoft.com/en-us/azure/api-center/register-discover-mcp-server); [Foundry classic MCP page](https://learn.microsoft.com/en-us/azure/foundry-classic/agents/how-to/tools-classic/model-context-protocol?view=foundry-classic)
- RBAC rename: "Foundry User, Foundry Owner, Foundry Account Owner, and Foundry Project Manager were previously named Azure AI User, Azure AI Owner, Azure AI Account Owner, and Azure AI Project Manager ... The role IDs and core permissions are unchanged by the rename." — [Foundry MCP tool doc](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/model-context-protocol)

### Inferences
- **Notifications.** Foundry agents can't receive server-initiated MCP notifications or events. They act only inside a Responses/Invocations run and call tools on demand. Nothing in the Foundry MCP docs mentions notifications, resource subscriptions, prompts, sampling or elicitation, and the hosting table says "Stateless only". Real-time Ring events must reach a Foundry agent some other way (see Q6).
- **Design constraints for the bridge's MCP surface if Foundry is a client:**
  1. Avoid `anyOf`/`allOf` and multi-type parameters such as `"type": ["string","null"]`. Check what the C# MCP SDK emits for nullable or optional .NET parameters. Nullable reference types may generate a multi-type schema that Foundry rejects.
  2. No long-poll tools like "wait for next event". With the 100 s timeout, expose `get_events_since(cursor)` or similar, or adopt MCP tasks (preview).
  3. Don't depend on MCP session state or subscriptions for Foundry callers.
- **OAuth fit.** Foundry's custom OAuth expects a static, pre-registered client (client ID, secret and redirect URL). There is no mention of Dynamic Client Registration. The bridge's OAuth authorization server would need a pre-registered "Foundry" client alongside whatever DCR or CIMD flow Claude Code and ChatGPT use. Same-tenant-only applies when the identity provider is Entra.
- **Unattended runs.** Agent-identity or routine-triggered runs have no interactive user to click a consent link, so OAuth passthrough suits only interactive use. For unattended Ring-event reactions, use key-based auth (a bridge-issued API key stored in the project connection) or Entra agent identity/project MI. Entra requires the bridge to validate Entra tokens for an audience it controls.
- **Approval.** The default `always` will stall unattended runs. Set read-only tools (status, event history) to `never`, and keep state-changing tools (arm/disarm, siren) on `always`. This deliberately means an unattended Foundry agent cannot arm or disarm. That is the safe posture.

### Gaps
- No Foundry doc states which MCP spec revision (2025-03-26, 2025-06-18, 2025-11-25) the Agent Service MCP client negotiates. Only the MCP tasks link points at 2025-11-25.
- No explicit statement on whether legacy HTTP+SSE transport is still accepted by the Agent Service client. API Center still generates an "SSE definition" (see Q3).
- No statement on whether the MCP tool uses `Mcp-Session-Id` or keeps sessions across calls.

## 3. Foundry's MCP registry/catalog features (and Azure API Center MCP registry): can a private MCP server be registered for an organization's agents?

### Takeaway
Yes, as metadata only. You register the bridge's URL in Azure API Center (Inventory > Assets > MCP server). It then appears in Foundry's "organizational/private tool catalog" with configured auth (API key, OAuth or bearer) and per-user access control. API Center also exposes an MCP-registry-format endpoint for VS Code and Copilot. This is discovery and governance, not hosting. For one personal bridge it is optional: adding the URL as a "Custom > MCP" tool in Foundry works without API Center.

### Cited Findings
- "When you register your MCP server in Azure API Center, you create a private organizational tool catalog. This step is optional but recommended for sharing MCP servers across your organization ... After registration, your MCP server appears in the Foundry tool catalog with the governance and authentication settings you configured." — [Build your own MCP server, 2026-09-21](https://learn.microsoft.com/en-us/azure/foundry/mcp/build-your-own-mcp-server)
- Auth schemes configurable in API Center Governance > Authorization: "API Key: Developers provide the API key during tool configuration in Foundry; OAuth: Configure OAuth 2.0 authentication parameters; HTTP: Configure bearer token authorization." Also: "If you choose API Key authentication, the key you store in Azure Key Vault isn't automatically used in Foundry." Access management is "Details > Versions > Manage Access (preview)". — [Build your own MCP server](https://learn.microsoft.com/en-us/azure/foundry/mcp/build-your-own-mcp-server)
- No-registry path: "If you don't register your MCP server in the organizational catalog, add it directly as a custom tool: ... Select Connect a tool. On the Custom tab, select MCP." Another quote: "The same MCP server can be reused by multiple clients (such as Foundry Agent Service and developer tools like Visual Studio Code) provided authentication is configured appropriately." — [Build your own MCP server](https://learn.microsoft.com/en-us/azure/foundry/mcp/build-your-own-mcp-server)
- API Center is an inventory of remote or local MCP servers ("maintain an inventory (or registry) of remote or local model context protocol (MCP) servers"). For remote servers it auto-generates an "SSE definition" and a "Streamable definition". It exposes an MCP registry endpoint at `https://<your-api-center-name>.data.<region>.azure-apicenter.ms/workspaces/default/v0.1/servers` that "you can configure in Visual Studio Code, GitHub Copilot, or other tools to discover and connect to the MCP servers in your inventory". The API Center portal includes a "test console" for running tools. — [API Center: Inventory and discover MCP servers, 2026-05-29 (updated 2026-10-20)](https://learn.microsoft.com/en-us/azure/api-center/register-discover-mcp-server)
- Two status details come from search-result snippets only (I didn't fetch either page), so treat them as unverified:
  - **Preview status.** Microsoft's private tool catalog page reportedly says: "This feature is currently in public preview. This preview is provided without a service-level agreement." — [Private tool catalog (search snippet)](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/private-tool-catalog)
  - **Role requirement.** Developers need the "Azure API Center Data Reader" role at API Center scope. This guidance came from the sibling *skill* catalog page. — [Private skill catalog (search snippet)](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/private-skill-catalog)

### Inferences
- For a single-user personal deployment, API Center adds governance overhead with little benefit. Connecting the bridge as a Custom MCP tool (or through a Toolbox) is simpler.
- The API Center registry endpoint (`/v0.1/servers`, matching the MCP registry API shape) could also advertise the bridge to VS Code and Copilot. That is a convenience, not a requirement.

### Gaps
- API Center tier pricing (Free vs Standard) and whether the Free tier supports MCP registry and Foundry catalog integration: not checked.
- I didn't fetch the GA/preview status of the private tool catalog directly (snippet only).

## 4. "Hosted agents" in Foundry: can they run custom code long-running (background loops, outbound websockets)? Pricing model and limits.

### Takeaway
Hosted agents are GA (announced 2026-07-09 per Microsoft's Foundry blog) and run your C# (.NET 10) or Python container. Compute is per session and request-driven:
- A sandbox is provisioned on the first request.
- It is deprovisioned after an idle timeout configurable from 2 to 240 minutes (default 15).
- There is no replica count and no warm pool.
- Sizes go up to 2 vCPU / 4 GiB.

This model can't keep a Ring websocket or an FCM TCP 5228 connection open 24/7. "Background" and "resilient" modes extend a single request's work. They don't create a daemon. Billing is per vCPU-hour ($0.0994) and GiB-hour ($0.0118) in East US.

### Cited Findings
- How it works: "At runtime, Agent Service provisions compute for the session and routes requests to your container ... The platform automatically manages the container lifecycle based on activity, provisioning resources when you create a version and deprovisioning when the idle timeout is reached." — [Hosted agents concept, 2026-10-19](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/hosted-agents)
- Idle and scaling behavior: "You can configure the idle timeout per agent version from 2 through 240 minutes (4 hours), with a 15-minute default. If no request arrives within that window, the platform deprovisions the compute and persists the session state. The platform permanently deletes a session after 30 days of inactivity." Also: "Compute follows the session, not the individual request." And: "Hosted agents scale per session, not per replica ... There's no replica count to configure and no warm pool to size." — [Hosted agents concept](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/hosted-agents)
- Isolation and state: "Hosted agents run in per-session VM-isolated sandboxes. Each session gets a dedicated sandbox with a persistent filesystem (`$HOME` and `/files`), enabling scale-to-zero with stateful resume." Each session has "up to 20 GiB at 1 vCPU or larger" disk, with about 20% reserved. A durable key-value "state store" persists items "independently of compute state, so they survive container crashes, restarts, and idle eviction" (default 30-day idle expiry, configurable to never expire). — [Hosted agents concept](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/hosted-agents)
- Background and long-running: "Background mode lets work continue after the initiating request returns. Resilient execution preserves work after the hosting process stops." The Responses protocol offers "`background: true` with platform-managed polling and cancellation." — [Hosted agents concept](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/hosted-agents)
- Sandbox sizes: 0.5 vCPU / 1 GiB, 1 vCPU / 2 GiB, 2 vCPU / 4 GiB. — [Hosted agents concept](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/hosted-agents)
- Versioning and routing: "An agent endpoint serves one version at a time and routes 100% of its traffic to that version. Traffic splitting between versions isn't supported." Environment variables "are immutable once the version is created". — [Hosted agents concept](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/hosted-agents)
- Networking: "Hosted agents support deployment within network-isolated Foundry resources and can use a customer-provided Azure Virtual Network for outbound traffic." Projects created after 2026-06-25 support a private ACR. — [Hosted agents concept](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/hosted-agents)
- An inbound WebSocket protocol exists, positioned for real-time voice and two-way streaming clients: "Real-time voice agent (microphone in, speech out) | Invocations (WebSocket) | Bidirectional streaming over a single persistent connection." The protocol decision tree says: "If the client needs real-time voice or two-way streaming, choose Invocations (WebSocket)." — [Hosted agents concept](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/hosted-agents)
- Self-scheduling: "A hosted agent can also schedule itself to run again later by calling a built-in reminder tool that you expose through a toolbox ... the service re-invokes the agent on the same conversation when the delay elapses." — [Routines concept, 2026-10-04](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/routines)
- Pricing model: "Managed hosting runtime billing is based on consumption of CPU and memory resources during active sessions." Another quote: "Billing is based on cpu + memory consumed across all active sessions, so oversizing multiplies cost by your concurrency." — [Hosted agents concept](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/hosted-agents). The public pricing page shows "$-" placeholders for hosted-agent rates. It says hosted agents are "billed based on the underlying container compute consumed per hour" and that there is "no additional charge for creating or running Foundry-native agents using prompts and workflows" (model tokens are billed separately). — [Foundry Agent Service pricing page](https://azure.microsoft.com/en-us/pricing/details/foundry-agent-service/)
- Actual rates from the Azure Retail Prices API (productName "Foundry Agents", East US, USD, effective 2026-02-01):

  | Meter | Price |
  | --- | --- |
  | "Hosted vCPU Usage" | 0.0994 per 1 Hour |
  | "Hosted Memory Usage" | 0.0118 per 1 Hour |
  | "Skills Execution Container" (effective 2026-04-01) | 0.033 per 1 Hour |

  Note: the API's unit for both hosted meters is just "1 Hour". Reading the memory meter as per GiB-hour follows the usual Azure pattern, and secondary sources say "$0.0118 per GiB-hour", but the API response doesn't state the GiB unit. — [Azure Retail Prices API query](https://prices.azure.com/api/retail/prices?$filter=contains(productName,'Agent')%20and%20armRegionName%20eq%20'eastus')
- GA timeline: a Foundry devblog post dated 2026-04-22 announced hosted agents in public preview. — [Foundry devblog, 2026-04-22 (search snippet only)](https://devblogs.microsoft.com/foundry/?p=2168). The Build 2026 recap (2026-06-02) said GA was expected in early July. The July–Aug 2026 roundup says "We announced general availability for Hosted Agents on July 9." — [Foundry What's new Jul–Aug 2026](https://devblogs.microsoft.com/foundry/whats-new-in-microsoft-foundry-july-august-2026/); [Foundry What's new Build 2026 (search snippet)](https://devblogs.microsoft.com/foundry/whats-new-in-microsoft-foundry-build-2026/). Conflict: the Azure Updates item AZ563596 ("Generally Available: Hosted agents in Foundry Agent Service") is reported, through the aggregator mc.merill.net, with a June 2026 timeline. — [mc.merill.net AZ563596 (aggregator)](https://mc.merill.net/message/AZ563596). Learn also says "Microsoft Foundry Hosted Agents, the managed hosting service, is generally available." — [Agent Framework: Foundry Hosted Agents, 2026-10-08](https://learn.microsoft.com/en-us/agent-framework/hosting/foundry-hosted-agent)
- One third-party review (secondary, not Microsoft) cautions that "scale to zero is not zero cost between requests" because sessions stay active during the idle window. — [hermes-agent.ai review (secondary)](https://hermes-agent.ai/blog/microsoft-foundry-agent-service-review)
- One community blog (secondary) says source/zip deploy supports `python_3_13`, `python_3_14` and `dotnet_10`. I didn't confirm this in Microsoft docs. The Agent Service overview does say "Foundry builds the image for you when you bring a .zip file." — [Agent Service overview (search snippet)](https://learn.microsoft.com/en-us/azure/foundry/agents/overview); [Nanddeep Nachan blog, 2026-04-18 (secondary)](https://nanddeepnachanblogs.com/posts/2026-04-18-hosted-agents-foundry/)

### Inferences
- A hosted agent is the wrong host for the bridge's 24/7 duties: the Ring Alarm websocket, the FCM listener on 5228, and continuous event-log ingestion. With no requests, the sandbox is deprovisioned within 2–240 minutes. Keeping it alive with self-reminders or periodic pings would be an unsupported hack. It would still not guarantee one stable process, because each session is its own sandbox and versions are immutable.
- "Resilient execution ... after the hosting process stops" implies the platform expects to interrupt processes. That is the opposite of what a long-lived outbound socket needs.
- The useful part of hosted agents for this project is narrow: a C# Agent Framework agent that *reacts* to a Ring event the bridge pushes to it (Q6). A plain prompt agent (no container, no hosting charge) usually covers that too.

### Gaps
- No Microsoft doc states whether arbitrary outbound internet connections are allowed from a hosted sandbox without a VNet, or whether there are limits on long-lived outbound TCP (for example to port 5228).
- No primary source states whether the idle window (after the last request, before deprovisioning) is billed. Only the secondary review says it is.
- No published quotas on agents per project or concurrent sessions were found in the fetched pages.
- The docs don't say whether a held-open inbound Invocations (WebSocket) connection counts as activity that resets the idle timer. Even if it did, Entra-only auth, per-session sandboxes and immutable versions would still rule hosted agents out as the bridge host.

## 5. Does the official C# MCP SDK or Microsoft Agent Framework (.NET) have samples for Foundry integration?

### Takeaway
On the Agent Framework / Azure SDK side, yes. There is a .NET 10 hosting package (prerelease) with Responses and Invocations snippets, C# hosted-agent samples in `microsoft-foundry/foundry-samples`, .NET MCP-tool samples in `azure-sdk-for-net`, and `AddFoundryToolboxes` for consuming Toolboxes. I didn't verify any Foundry-specific sample in the `modelcontextprotocol/csharp-sdk` repo. The bridge itself would use the C# MCP SDK on ordinary ASP.NET Core, which Foundry consumes like any remote MCP server.

### Cited Findings
- Requirements: ".NET 10 SDK or later". Install with `dotnet add package Microsoft.Agents.AI.Foundry.Hosting --prerelease`. Responses hosting uses `AgentHost.CreateBuilder(args)`, `builder.Services.AddFoundryResponses(agent)` and `builder.RegisterProtocol("responses", endpoints => endpoints.MapFoundryResponses())`. Invocations hosting uses `Azure.AI.AgentServer.Invocations` with `AddInvocationsServer()` and a custom `InvocationHandler`. C# samples: `github.com/microsoft-foundry/foundry-samples/tree/main/samples/csharp/hosted-agents/agent-framework`. — [Agent Framework: Foundry Hosted Agents, 2026-10-08](https://learn.microsoft.com/en-us/agent-framework/hosting/foundry-hosted-agent)
- The .NET blog "From dotnet run to Foundry hosted agent in 3 lines of C#" (2026-08-24, Bruno Capuano) calls hosted agents "generally available" and the hosting package prerelease. It also says Activity protocol (M365 Copilot) "isn't a built-in channel yet in C#" (author's reply in comments). — [.NET Blog, 2026-08-24](https://devblogs.microsoft.com/dotnet/from-dotnet-run-to-foundry-hosted-agent-in-3-lines-of-csharp/)
- C# MCP-tool samples for prompt agents: `Azure/azure-sdk-for-net/.../Azure.AI.Extensions.OpenAI/samples/Sample19_MCP.md` and `Sample20_MCP_Connection.md` (authenticated connection). The MCP tool page shows C# code with `serverLabel`, `serverUri` and approval handling. Hosted agents use "the Microsoft Agent Framework `AddFoundryToolboxes` integration". — [Foundry MCP tool doc](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/model-context-protocol); [Sample19_MCP.md](https://github.com/Azure/azure-sdk-for-net/blob/main/sdk/ai/Azure.AI.Extensions.OpenAI/samples/Sample19_MCP.md); [Sample20_MCP_Connection.md](https://github.com/Azure/azure-sdk-for-net/blob/main/sdk/ai/Azure.AI.Extensions.OpenAI/samples/Sample20_MCP_Connection.md)
- The C# OAuth-consent flow appears on the MCP authentication page, using `OAuthConsentRequestResponseItem` with `Azure.AI.Projects 2.0.1` and `Azure.AI.Extensions.OpenAI 2.0.0`. — [MCP authentication doc](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/mcp-authentication)
- The Agent Framework docs warn about MCP connections in hosted agents: "create MCP connections, Toolboxes ... inside the factory when they use the current platform call or user context. Reusing a process-wide MCP connection can retain the identity of the request that opened it." (This appears in the Python section.) — [Agent Framework: Foundry Hosted Agents](https://learn.microsoft.com/en-us/agent-framework/hosting/foundry-hosted-agent)
- Foundry's "Build your own MCP server" walkthrough is Python only (template `remote-mcp-functions-python`). It says ASP.NET Core works but provides no C# template there. — [Build your own MCP server](https://learn.microsoft.com/en-us/azure/foundry/mcp/build-your-own-mcp-server)

### Inferences
- The preferred .NET 10 stack is supported end to end on the Foundry *client* side: Azure.AI.Projects for prompt agents, and Microsoft.Agents.AI.Foundry.Hosting for a C# hosted agent. The hosting package is still prerelease even though the service is GA.

### Gaps
- I didn't check the `modelcontextprotocol/csharp-sdk` repo for a Foundry-specific sample. I don't know whether one exists.
- I didn't open or verify the contents of the `samples/csharp/hosted-agents` folder (link from Learn only).

## 6. Practical verdict: is Foundry (a) a hosting platform, (b) one more MCP client, or (c) not relevant? What would a Foundry agent reacting to Ring events look like (trigger mechanism)?

### Takeaway
(b). Treat Foundry as one more MCP *client* of the bridge, which is optional and not required for the MVP. It is not a hosting platform for the bridge. Foundry's native triggers (Routines) can't receive custom webhooks or Event Grid events. Real-time reaction to Ring events therefore needs the bridge to push. On each significant event, the bridge calls a Foundry agent's endpoint (Responses API for a prompt agent, or Invocations for a hosted agent) with an Entra token. The agent then calls back into the bridge's MCP tools for context, and for gated actions when a human approves.

### Cited Findings
- Routines' only action is invoking an agent: "A routine has one trigger and one action ... The action invokes one prompt agent or hosted agent." Supported trigger types are timer (one-shot), recurring (cron, "minimum interval of five minutes"), and event. "Supported event triggers are GitHub issue events and Microsoft Teams channel messages." — [Routines concept, 2026-10-04](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/routines)
- Routine limits: "Routine delivery makes up to five attempts for transient failures. Each downstream agent request has a 30-second timeout. For Responses API actions, the timeout covers acceptance of the background request, not completion of the agent's work." Routines "aren't available in UK West, Switzerland West, Japan West, UAE North, or Norway East" and "don't support customer-managed key (CMK) encryption." — [Routines concept](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/routines)
- Routines identity: "Every routine invokes its agent by using agent identity by default, regardless of the trigger type." — [Routines concept](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/routines)
- Routines GA: a Microsoft Foundry devblog post is titled "From Chatbots to Automated Agents: Routines in Microsoft Foundry Are Now Generally Available". A secondary source dates it to 2026-09-24. Older Learn pages still say "(preview)". — [Foundry devblog: Routines GA (search snippet)](https://devblogs.microsoft.com/foundry/from-chatbots-to-automated-assistants-routines-in-microsoft-foundry-are-now-generally-available/); [WindowsForum (secondary)](https://windowsforum.com/news/microsoft-foundry-routines-reach-ga-for-scheduled-agent-runs.445822/)
- Hosted agents accept external payloads through Invocations: "Webhook receiver (GitHub, Stripe, Jira, etc.) | Invocations | The external system sends its own payload format." — [Hosted agents concept](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/hosted-agents)
- Prompt agents are invoked programmatically through the Responses API (`GetProjectResponsesClientForAgent(agentName)` in C#), including `Background = true` with polling. — [Foundry MCP tool doc](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/model-context-protocol)
- Microsoft says Routines replace glue: "Without routines, teams often build this trigger layer themselves by combining technologies such as schedulers, Logic Apps, Azure Functions, queues..." — [Routines concept](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/routines)
- Unattended agents are also a security concern: "Treat tool descriptions, annotations, and results from remote MCP servers as untrusted input" and "Require approval for high-risk operations". — [Foundry MCP tool doc](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/model-context-protocol)

### Inferences
- Verdict: (b) optional MCP client. Foundry is not (a). Leaving Foundry out entirely (c) is acceptable for the MVP, because the core requirements (24/7 outbound connections, durable log, public OAuth MCP endpoint for Claude Code and ChatGPT, real-time push to clients) are all met outside Foundry.
- Trigger mechanism, push model (recommended if a Foundry "reactor" is wanted):
  1. The bridge (on ACA or App Service) detects a significant Ring event, such as an alarm triggered, motion while armed, or a doorbell press.
  2. The bridge's managed identity, given the Foundry Agent Consumer / Foundry User role on the project, gets an Entra token for `https://ai.azure.com`.
  3. The bridge calls the agent with the event JSON as input: the Responses API for a prompt agent (background mode), or a hosted agent's Invocations endpoint for a C# Agent Framework agent.
  4. The agent calls the bridge's MCP tools (`get_events_since`, `get_device_status`, snapshot links), connected with key-based or Entra agent-identity auth.
  5. The agent posts a summary to Teams or e-mail through other Foundry tools.
  6. State-changing tools stay at `require_approval: always`, so a human must approve.
- Trigger mechanism, poll model (digests only): a recurring Routine (5-minute minimum) invokes an agent that calls `get_events_since(lastCursor)`. This suits "every morning, summarize overnight Ring activity", not alarms.
- Inference (unconfirmed): a Teams-channel-message routine could be used as an indirect event trigger if the bridge posts to a Teams channel. This is Rube-Goldberg and adds latency. The push model is simpler.
- Foundry agents are also *alternative consumers* to Claude Code and ChatGPT. The same public MCP endpoint serves all of them, provided the tool schemas avoid `anyOf`/`allOf` and multi-type parameters (Q2).

### Gaps
- No primary source for end-to-end latency of a Responses-API invocation or of a hosted-agent cold start (snapshots claimed "fast session starts").
- I didn't verify whether Foundry Workflows (as opposed to Routines) offer an HTTP or webhook trigger.

## 7. Approximate costs for a tiny personal deployment, and region availability

### Takeaway
For the client-side role (b), Foundry costs are mostly model tokens: prompt agents have no hosting charge. A C# hosted-agent "reactor" costs about $0.06–$0.25 per sandbox-hour, depending on size, while a session is active. Each event burst holds a sandbox until the idle timeout expires, so set the timeout low (2 minutes). Hosted agents are available in 31 regions, including East US, West Europe and Sweden Central. Israel Central isn't on the list.

### Cited Findings
- Hosted rates (East US, USD, effective 2026-02-01): vCPU $0.0994/hour, memory $0.0118/GiB-hour. — [Azure Retail Prices API](https://prices.azure.com/api/retail/prices?$filter=contains(productName,'Agent')%20and%20armRegionName%20eq%20'eastus')
- The official pricing page displays "$-" placeholders for these rates (fetched 2026-10-24). — [Foundry Agent Service pricing page](https://azure.microsoft.com/en-us/pricing/details/foundry-agent-service/)
- "No additional charge for creating or running Foundry-native agents using prompts and workflows." Model inference is billed separately. — [Foundry Agent Service pricing page](https://azure.microsoft.com/en-us/pricing/details/foundry-agent-service/)
- Billing is "based on consumption of CPU and memory resources during active sessions"; idle timeout is 2–240 minutes (default 15). — [Hosted agents concept](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/hosted-agents)
- Hosted agents region list (31): Australia East, Brazil South, Canada Central, Canada East, Central US, East US, East US 2, France Central, Germany West Central, Italy North, Japan East, Japan West, Korea Central, North Central US, Norway East, Poland Central, South Africa North, South Central US, South India, Southeast Asia, Spain Central, Sweden Central, Switzerland North, Switzerland West, UAE North, UK South, UK West, West Central US, West Europe, West US, West US 3. — [Hosted agents concept, 2026-10-19](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/hosted-agents)
- Routines are excluded in UK West, Switzerland West, Japan West, UAE North and Norway East. — [Routines concept](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/routines)

### Inferences
- Hourly sandbox cost, computed from the retail rates:

  | Size | Calculation | Per active sandbox-hour |
  | --- | --- | --- |
  | 0.5 vCPU / 1 GiB | 0.5×0.0994 + 1×0.0118 | ~$0.0615 |
  | 1 vCPU / 2 GiB | 0.0994 + 2×0.0118 | ~$0.123 |
  | 2 vCPU / 4 GiB | 2×0.0994 + 4×0.0118 | ~$0.246 |
- Per-event cost at 0.5 vCPU/1 GiB, *assuming* the idle window is billed (unconfirmed; see Q4 gaps): about $0.015 per event with the 15-minute default timeout, and about $0.002 per event plus run time with a 2-minute timeout. At about 10 significant events per day and a 2-minute timeout, hosted compute is under $1/month, and model tokens dominate.
- For comparison only: keeping a 0.5 vCPU sandbox continuously active would cost about $45/month (730 h × $0.0615). That doesn't make hosted agents viable for the bridge's 24/7 role. The platform doesn't offer always-on compute.
- A prompt-agent reactor (no container) costs only model tokens, plus the bridge's own hosting, which is out of scope here. This is the cheapest Foundry option for a personal deployment.
- Region: Israel Central isn't on the hosted agents list. If the deployment must be near Israel, the closest listed regions are probably Italy North, Germany West Central, Poland Central, West Europe or Sweden Central. Prompt agents and the MCP tool may have different region coverage.
- The cost table assumes the memory meter is per GiB-hour (see the unit note under Cited Findings).

### Gaps
- Model token prices (for example `gpt-5-mini` or `gpt-5.4`) were not researched, so per-run model cost isn't quantified.
- No cost data for Routines (none found), API Center tiers, or Standard agent setup with BYO VNet. Private networking adds VNet, private endpoints and possibly Cosmos DB, AI Search and Storage for Standard setup, none of which were priced.
- I didn't check regional price variation, only East US.
- I didn't check region availability for prompt agents and the MCP tool specifically, only hosted agents and routines.
