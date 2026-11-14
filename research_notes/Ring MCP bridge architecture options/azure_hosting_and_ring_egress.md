# Azure hosting options for an always-on C#/.NET 10 Ring MCP bridge, and Ring's blocking of cloud egress IPs

Research date: 2026-10-24. Scope is the Azure/topology delta on top of `research_notes/Ring MCP bridge research/unofficial_api_auth_rest.md` (which already covers the Feb-2026 Cloudflare-WAF `406` wave on auth) and `existing_bridges_and_mcp_servers.md`. Where a claim rests on a search-result snippet rather than a fetched page, it is marked "(snippet)".

## 1. Azure compute options for a remote MCP server that also holds 24/7 outbound connections

### Takeaway
Of the options checked, only Azure Container Apps (min replicas >= 1) and App Service (Basic tier or higher with Always On, running an ASP.NET Core app with a `BackgroundService`) can plausibly host one process that serves Streamable HTTP MCP and also holds the Ring Alarm websocket and the FCM/mtalk:5228 socket 24/7. Both cost roughly $13-15 a month for one small instance. Azure Functions, both its MCP extension and the self-hosted-SDK preview, is built around request triggers and stateless servers, so it fits only as an MCP front end. APIM is a governance gateway, not a host, and it supports MCP tools only.

### Cited Findings
**Azure Container Apps (ACA)**
- Replica limits: the minimum per revision defaults to 0. "If you want to ensure that an instance of your revision is always running, set the minimum number of replicas to 1 or higher." The default scale rule is HTTP, min 0 and max 10. "Make sure you create a scale rule or set `minReplicas` to 1 or more if you don't enable ingress… your container app scales to zero and has no way of starting back up." (page dated 2026-05-19). — [Learn: Scaling in ACA](https://learn.microsoft.com/en-us/azure/container-apps/scale-app)
- Known limitations: "Replica quantities are a target amount, not a guarantee." "During platform upgrades or maintenance, you might temporarily see more replicas than expected… by pre-warming new replicas before shifting traffic." — [Learn: Scaling in ACA](https://learn.microsoft.com/en-us/azure/container-apps/scale-app)
- .NET apps on ACA need data protection enabled. — [Learn: Scaling in ACA](https://learn.microsoft.com/en-us/azure/container-apps/scale-app)
- Egress control: "Consider using Workload Profiles with a NAT Gateway or User Defined Route (UDR) to send traffic to a network appliance, where you can inspect or proxy traffic." — [Learn: Scaling in ACA](https://learn.microsoft.com/en-us/azure/container-apps/scale-app)
- Consumption billing (page dated 2025-12-09): usage is billed per second in vCPU-seconds and GiB-seconds. The free grant per subscription per month is 180,000 vCPU-s, 360,000 GiB-s and 2 million HTTP requests. A replica at the minimum count is billed at a reduced "idle" rate only when all of these hold: it "isn't processing any HTTP requests", it uses "less than 0.01 vCPU cores", and it receives "less than 1,000 bytes per second of network traffic". Otherwise the active rate applies. A Dedicated plan adds a management fee. — [Learn: Billing in ACA](https://learn.microsoft.com/en-us/azure/container-apps/billing)
- Unit prices: the official pricing page rendered without numbers. A third-party comparison (March 2026) lists active Consumption pricing at about $0.000024 per vCPU-second and $0.000003 per GiB-second. Third-party sources disagree on the idle ratio (one says about 1/8, another about 1/10). (snippet) — [devzero](https://www.devzero.io/blog/azure-container-apps-pricing); [nOps](https://www.nops.io/blog/azure-container-apps-cost-optimization-guide); official page: [Azure pricing: Container Apps](https://azure.microsoft.com/en-ca/pricing/details/container-apps/)
- ACA MCP guidance: the ACA MCP overview describes a standalone container app with HTTP ingress running a server built with an official MCP SDK (.NET included). It recommends a minimum of one replica for interactive use. (snippet) — [Learn: ACA MCP overview](https://learn.microsoft.com/azure/container-apps/mcp-overview)

**App Service**
- Always On is needed for continuous WebJobs and background work to run reliably, and it is available "only in the Basic, Standard, and Premium pricing tiers". (snippet) Without it, an app can be unloaded after a period of inactivity. Microsoft's mirror states 20 minutes; that figure was not seen on the en-us page. (snippet) — [Learn: How WebJobs run](https://learn.microsoft.com/en-us/azure/app-service/webjobs-execution); [docs.azure.cn mirror](https://docs.azure.cn/en-us/app-service/webjobs-execution)
- Price: Basic B1 Linux is about $13.14/month (1 core, 1.75 GB). This comes from a Microsoft Q&A community answer (Nov 2025) because the official page did not render. (snippet) — [Microsoft Q&A](https://learn.microsoft.com/en-us/answers/a/12322935)
- Built-in MCP server authorization: App Service Authentication can make an MCP server comply with the MCP authorization spec (2025-06-18) and also applies to Azure Functions. Protected Resource Metadata (PRM) support is **preview**; it is set with the `WEBSITE_AUTH_PRM_DEFAULT_WITH_SCOPES` app setting. "MCP server authorization defines access to the server, and it doesn't provide granular control to individual MCP tools." Entra ID doesn't support Dynamic Client Registration, so "the client needs to be preconfigured with a client ID." Preauthorizing known client apps is recommended. Forwarding the MCP token downstream is a vulnerability; use OBO instead (page dated 2025-11-04). — [Learn: Configure MCP server authorization](https://learn.microsoft.com/en-us/azure/app-service/configure-authentication-mcp)

**Azure Functions**
- MCP extension: tool, resource and prompt triggers, plus MCP Apps. Streamable HTTP is at `/runtime/webhooks/mcp`; SSE is at `/runtime/webhooks/mcp/sse` and is deprecated. The SSE transport relies on Azure Queue storage. By default the endpoints require the `mcp_extension` system key; the setting can be "Anonymous", with built-in MCP authorization layered on. C# supports only the isolated worker model and needs `Microsoft.Azure.Functions.Worker` >= 2.1.0 (page dated 2026-08-25). — [Learn: MCP bindings for Azure Functions](https://learn.microsoft.com/en-us/azure/azure-functions/functions-bindings-mcp)
- Status: the MCP tool trigger extension went GA at Ignite 2025 (C#, Java, JS, Python, TS) (snippet). — [Tech Community](https://techcommunity.microsoft.com/blog/appsonazureblog/-/4469815). The Build 2026 post (2026-06-24) adds resource and prompt triggers, MCP Apps, and built-in MCP auth with Entra by default in the samples (one-click portal configuration is in preview). Streaming output and pagination are "top items in our backlog". Sessions and server push notifications are not described as supported. MCP Tasks (SEP-1686, async long-running) is "under consideration". — [devblogs: Functions MCP updates, Build 2026](https://devblogs.microsoft.com/azure-sdk/functions-mcp-updates-build-2026/)
- Self-hosted official-SDK servers on Functions (public preview): they run as custom handlers with no code changes. They must be "Stateless servers that use the streamable-http transport. If you need your server to be stateful, consider using the Functions MCP extension." C#, Python, TypeScript and Java SDKs are supported. "Servers must be hosted as Flex Consumption plan apps." The .NET sample is `azd init --template mcp-sdk-functions-hosting-dotnet`. (snippet) — [Learn: Self-hosted MCP servers](https://learn.microsoft.com/en-my/azUre/azure-functions/self-hosted-mcp-servers); [Learn: Host MCP SDK servers quickstart](https://learn.microsoft.com/en-au/azure/Azure-functions/scenario-host-mcp-server-sdks); [M365 message center AZ525505](https://mc.merill.net/message/AZ525505)

**Azure API Management (APIM) as an MCP gateway**
- Applies to the Developer, Basic, Basic v2, Standard, Standard v2, Premium and Premium v2 tiers. Consumption is not listed. The self-hosted gateway is also supported. There are two modes: "REST API as MCP server" (each operation becomes a tool) and "Existing MCP server" (pass-through to, for example, Functions). Policies cover JWT validation with Entra or other IdPs, rate limits, IP filtering and caching. "API Management currently supports MCP server tools, but doesn't support MCP resources or prompts." Workspaces are not supported (page dated 2026-09-11). — [Learn: MCP servers in APIM](https://learn.microsoft.com/en-us/azure/api-management/mcp-server-overview)
- A Microsoft Q&A thread (May 2026) reports GitHub Copilot failing to connect to an APIM-exposed MCP server because it expected an OAuth flow the tutorial didn't cover. The accepted answer is AI-generated and suggests subscription keys. (snippet) — [Microsoft Q&A](https://learn.microsoft.com/en-in/answers/questions/5902047/how-to-do-the-oauth-authentication-for-the-mcp-exp)

**Third-party comparison**
- A July 2026 article compares the two C# routes: the Functions MCP extension versus an ASP.NET Core app using `ModelContextProtocol.AspNetCore` on ACA. It warns that package versions change quickly. (snippet) — [devleader.ca](https://www.devleader.ca/2026/07/25/deploying-your-c-mcp-server-to-azure-functions-vs-container-apps)

### Inferences
- **Functions is a poor host for the Ring connector.** The extension is trigger-driven and the SDK preview requires stateless servers on Flex Consumption. Neither describes a supported pattern for a process that holds a websocket and an FCM socket for days. Functions could host only the MCP front end, with the Ring connector elsewhere. This is an inference; no Microsoft page explicitly forbids background sockets on Flex always-ready instances.
- **ACA min=1 is the closest fit for "single container, always on."** One ASP.NET Core app could host the MCP endpoint (`ModelContextProtocol.AspNetCore`), an `IHostedService` for the Ring websocket, FCM and a reconnect loop, and an outbound event fan-out. Two caveats follow from the docs:
  - "Replica quantities are a target… not a guarantee", and pre-warmed replicas appear during upgrades. Two replicas could briefly run Ring sessions with the same token and hardware ID. Refresh tokens rotate and must be saved after every refresh (prior notes, [unofficial_api_auth_rest.md](../Ring%20MCP%20bridge%20research/unofficial_api_auth_rest.md)), so the second instance ends up retrying a stale token. "Access using an invalid token being attempted over and over" is a documented trigger for temporary IP blocks ([#1580](https://github.com/dgreif/ring/issues/1580)), and #1493 calls same-hardware-ID use from two systems "undefined". The connector therefore needs a singleton lock, such as a blob lease, and should set `maxReplicas = 1`.
  - Idle-rate billing will rarely apply. A websocket and an FCM socket with heartbeats, plus any open MCP GET/SSE stream, likely break the "no HTTP requests and under 1,000 B/s" idle conditions, so budget for the active rate.
- **Rough ACA cost** (my arithmetic, using the unofficial third-party rates). A 0.25 vCPU / 0.5 GiB replica running 30 days uses 648,000 vCPU-s and 1,296,000 GiB-s. After the free grant that leaves 468,000 vCPU-s × $0.000024 ≈ $11.2 and 936,000 GiB-s × $0.000003 ≈ $2.8, about **$14/month** at the active rate. Logs, a container registry and storage are extra. Verify these unit prices on the official calculator.
- **App Service B1 with Always On** (about $13/month) is equivalent in cost and simpler for .NET: a long-running `BackgroundService`, websockets, and built-in MCP auth (Easy Auth with PRM, in preview) on the same app. Its built-in MCP authorization is documented for App Service and Functions. The ACA built-in auth page was not checked for PRM support.
- **APIM is optional governance.** Its documented limit of tools only, with no MCP resources or prompts, conflicts with an event-centric bridge that wants resources, subscriptions or notifications. If APIM is used, the "existing MCP server" pass-through mode is the relevant one, and it should be tested to confirm that streaming GET/notifications pass through.
- **Entra and MCP clients:** Entra lacks DCR. MCP clients that rely on DCR may need a preconfigured client ID, or a different IdP or authorization server in front.

### Gaps
- **AKS:** not researched with sources. It is likely overkill for one instance, and its cost was not verified.
- **Azure AI Foundry** agent/MCP integrations: no source found or fetched in this pass.
- Official current prices (ACA rates, App Service B1, APIM Basic v2, Functions Flex always-ready) could not be confirmed; the pricing pages rendered placeholders.
- Whether ACA ingress or App Service front ends impose idle or maximum timeouts on long-lived Streamable HTTP GET (SSE) streams was not verified. ACA's 240 s request timeout was asked of the scale page, which doesn't mention it.
- Which hosting plans the Functions MCP *extension* supports (Flex, Premium, Dedicated) is not listed on the bindings page.
- Whether ACA's built-in authentication supports MCP PRM like App Service does was not verified.

## 2. Official Microsoft guidance and samples for C# MCP SDK servers on Azure

### Takeaway
Microsoft has official .NET guidance for three hosting routes:
- the Functions MCP extension (GA, with the aka.ms/remote-mcp samples);
- self-hosting an official-SDK server on Functions Flex (preview, stateless; azd template `mcp-sdk-functions-hosting-dotnet`);
- an App Service tutorial that adds `ModelContextProtocol.AspNetCore` with Streamable HTTP to an ASP.NET Core app and deploys with `azd up`.

No official Azure-Samples C# azd template for Container Apps was found; the official ACA sample is TypeScript.

### Cited Findings
- App Service tutorial, "Integrate an App Service app as an MCP Server for GitHub Copilot Chat (.NET)": it adds the `ModelContextProtocol.AspNetCore` NuGet package (prerelease at writing), puts tools in a class marked `[McpServerToolType]`, uses the Streamable HTTP transport, and deploys with `azd up` from a Codespaces sample. (snippet) — [Learn: App Service MCP tutorial (.NET)](https://learn.microsoft.com/en-my/azUre/app-service/tutorial-ai-model-context-protocol-server-dotnet)
- Functions extension samples: the Build 2026 post points to the aka.ms/remote-mcp samples repo, which enables built-in MCP auth with Entra ID by default and shows OBO token exchange. — [devblogs Build 2026](https://devblogs.microsoft.com/azure-sdk/functions-mcp-updates-build-2026/). The .NET quickstart sample is "Remote MCP with Azure Functions (.NET/C#)". — [Learn samples: remote-mcp-functions-dotnet](https://learn.microsoft.com/zh-cn/samples/azure-samples/remote-mcp-functions-dotnet/remote-mcp-functions-dotnet)
- Self-hosted SDK on Functions: `azd init --template mcp-sdk-functions-hosting-dotnet`. One localized page says samples are "Not yet available", so the link may have moved. (snippet) — [Learn: scenario-host-mcp-server-sdks](https://learn.microsoft.com/en-au/azure/Azure-functions/scenario-host-mcp-server-sdks)
- Container Apps: the official Azure-Samples template is TypeScript (`mcp-container-ts`, `azd up`). — [Learn samples: mcp-container-ts](https://learn.microsoft.com/en-us/samples/azure-samples/mcp-container-ts/mcp-container-ts/). A community C# azd template, `powergentic/azd-mcp-csharp`, deploys to ACA using the older **SSE** transport. — [azd-mcp-csharp README](https://cdn.jsdelivr.net/gh/powergentic/azd-mcp-csharp@main/README.md)
- Learn's "intro to agents and MCP" points to an MCP Container App template as an example of building your own remote server. (snippet) — [Learn: intro-agents-mcp](https://learn.microsoft.com/azure/developer/ai/intro-agents-mcp)

### Inferences
- For a .NET 10 bridge whose core is a stateful background connector, the App Service tutorial pattern (plain ASP.NET Core with `ModelContextProtocol.AspNetCore`) is the most transferable official guidance. The same code containerizes for ACA or runs at home unchanged, which keeps all three topologies open.
- The community C# ACA template uses deprecated SSE and should not be the starting point.

### Gaps
- I didn't verify whether the App Service tutorial targets .NET 10, or which `ModelContextProtocol.AspNetCore` version it pins.
- I didn't find an official Learn .NET tutorial specific to ACA.

## 3. Durable storage for a small event log and state (brief)

### Takeaway
No storage sources were fetched in this pass. The points below are design reasoning to verify, not cited facts.

### Cited Findings
- Functions' SSE transport uses Azure Queue storage on the host storage account. This is the only storage fact verified this session. — [Learn: MCP bindings](https://learn.microsoft.com/en-us/azure/azure-functions/functions-bindings-mcp)

### Inferences
- An append-mostly event log at this scale needs only a key/partition store: PartitionKey = location/day, RowKey = inverted timestamp. A relational or document database would be justified only if rich queries or a change feed are needed for client push.
- In a hybrid topology, the home connector would keep a local SQLite outbox on local disk and forward events to Azure storage.
- Blob Storage leases could double as the singleton lock for the Ring connector (see §1).

### Gaps
None of the following were verified this session (background knowledge only):
- Azure Table Storage (or Cosmos DB for Table) costs only cents a month at this scale.
- Cosmos DB serverless offers a change feed useful for pushing events.
- Azure SQL serverless auto-pause adds a cold-start delay on the first query.
- SQLite on Azure Files (SMB) is unsafe for writes, because SQLite locking is unreliable on network filesystems (sqlite.org guidance, not re-fetched).
- Current pricing and limits for Table Storage, Cosmos DB serverless and Azure SQL serverless were not fetched.

## 4. KEY RISK: Ring/Cloudflare blocking of cloud, datacenter and VPN egress IPs

### Takeaway
Dated maintainer statements from 2024-09 through 2026-02 consistently say Ring blocks "most" IP blocks belonging to cloud/VPS hosts and VPNs. The error is HTTP `406`. In the 2025 VPS reports Ring's origin returned it as JSON (`{"error":"Not Acceptable","status_code":406}`, #1571). In the 2026 reports Cloudflare's WAF returned it as `text/plain` (#1712, #1717). It hits all REST calls (device enumeration and event `/subscribe`), not just login. The named providers are DigitalOcean, Ionos and Mullvad. **No report names Azure, AWS or GCP, either blocked or working.** Azure being blocked is a strong inference, not a confirmed fact. The WAF also scores headers together with IP reputation, so blocking is probabilistic rather than a clean ban by network.

### Cited Findings
Chronological, primary sources are GitHub threads; "maintainer" means tsightler, the ring-mqtt author and a ring-client-api collaborator:
- **2024-09-11**, ring-client-api on a **DigitalOcean** AMS3 droplet: the auth CLI gets `406`, and a fresh droplet gives the same result. Maintainer: "Ring has large amounts of IP blocks in place from various cloud services and VPNs. Digital Ocean IP blocks are on tons of blacklists in general and Ring would have no reason to expect connections from those services." Also: "Plenty of people use the ring-client-api from 'a server', but you are not using 'a server', you are using droplets from Digital Ocean which leverage a pool of IPs well known for being the source of abuse." — [dgreif/ring #1493](https://github.com/dgreif/ring/issues/1493)
- **2024-09-11**, same thread, on tokens and hardware IDs: "Tokens contain not just the refresh token, but also encode information about the hardware ID… Attempting to use a token generated from one hardware ID on another system will likely lead to the token be rejected and can lead to the system in question being blocked from authentication as it is seen by Ring as a nefarious access attempt." — [dgreif/ring #1493](https://github.com/dgreif/ring/issues/1493)
- **2024-12-15**, Home Assistant Ring integration: `406` on setup when the whole home network ran through a VPN client. Excluding the HA host from the VPN fixed it. The reporter also saw the official Ring app's "Control Center" refuse to load behind the VPN, while other parts loaded. — [home-assistant/core #133250](https://github.com/home-assistant/core/issues/133250)
- **2025-01-11**, homebridge-ring on an **Ionos VPS**: `406` on `clients_api/doorbots/{id}/subscribe`. Maintainer: "it is not just subscriptions that are failing, there are also 406 error on calls to basic device enumeration API endpoints… Ring bans connections from most IP blocks on those cheap hosting services… there's no legitimate reason that any official Ring API consumer would come from those IP blocks… it is not possible to use the Ring plugin from these servers and such use is not supported." — [dgreif/ring #1571](https://github.com/dgreif/ring/issues/1571)
- **2025-01-30**, maintainer: "The 406 error generally means that your IP has been blocked. Usually this is caused by use of VPN or running the code in some service where Ring has banned entire IP blocks." Temporary blocks also come from many accounts on one IP, frequent token requests, or repeated invalid tokens, and they usually clear after 24 h. (quoted in the prior notes) — [dgreif/ring #1580](https://github.com/dgreif/ring/issues/1580)
- **2025-11-09**, maintainer: "My experience is that 95% of reports about this issue are people using VPNs or VPS servers in the cloud, which Ring blocks." — [dgreif/ring #1676](https://github.com/dgreif/ring/issues/1676)
- **2026-02-12**, maintainer: "the 406 error is, almost always, an indication that the IP is blocked. This is commonly caused by use of VPN on the host or by using a cloud VPS host like Digital Ocean or other similar services. For security reasons Ring blocks connections from most of these services since they wouldn't expect to find their apps running there." The reporter was exiting via **Mullvad** (a commercial VPN) on a tailnet. — [dgreif/ring #1712](https://github.com/dgreif/ring/issues/1712)
- **2026-03 to 2026-05**, the Feb-2026 wave: `406` from Cloudflare's WAF on auth for residential users too. Maintainer: the WAF decision weighs headers together with IP reputation, and sending the full versioned app User-Agent fixed it for many users. (detailed in the prior notes) — [dgreif/ring #1717](https://github.com/dgreif/ring/issues/1717)
- **Ring's own statement** (support article, "last updated 2 months ago", about Aug 2026): "our security systems block IP addresses used to exploit or attack our systems… occasionally VPN IP addresses fall into that category." "As of December 2019, we no longer support the use of VPNs while accessing the Ring app." It lists "406 - Not Acceptable" as a symptom. It says nothing about cloud or data-center IPs. — [Ring support: Ring App and VPNs](https://ring.com/au/en/support/articles/c23si/Understanding-the-Ring-App-and-Virtual-Private-Networks-VPN)

**Which endpoints and channels are affected** (from prior notes):
- Auth uses `oauth.ring.com`, and REST uses `api.ring.com/clients_api/*`.
- The Alarm websocket ticket comes from `prd-api-us.prd.rings.solutions/api/v1/clap/tickets`, followed by `wss://{host}/ws?authcode=…`.
- FCM registration PATCHes `api.ring.com/clients_api/device`, then holds a socket to Google's `mtalk.google.com:5228`.
- WebRTC signalling uses `api.prod.signalling.ring.devices.a2z.com`.

— [prior notes: realtime_events_and_video.md](../Ring%20MCP%20bridge%20research/realtime_events_and_video.md), citing [location.ts](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/location.ts#L232-L240) and [webrtc-connection.ts](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/streaming/webrtc-connection.ts#L49)

### Inferences
- **Scope of a block.** The block covers all REST (#1571), so on a blocked IP the alarm websocket and push are effectively unusable. Both need REST calls first: the ticket request and the FCM token PATCH. The mtalk:5228 socket itself goes to Google, not Ring's Cloudflare, so an already-registered push channel might keep delivering. I found no evidence either way. It is also unverified whether `prd-api-us.prd.rings.solutions` and the a2z signalling host sit behind the same WAF.
- **Azure is probably in the high-risk class.** As background knowledge, not sourced this session: Azure's public IP ranges are published (service tags) and appear in common datacenter-ASN lists. The maintainer's reasoning, "no legitimate reason… official Ring API consumer would come from those IP blocks", applies equally to Azure. This is an inference; there is no Azure-specific evidence.
- **Blocking is probabilistic.** It depends on IP reputation plus headers (#1717), so Azure might work at first and fail later, or fail only for auth. Any all-Azure design must treat a sudden fleet-wide `406` as a likely failure mode.
- **Token and hardware-ID affinity.** Per #1493, a token is bound to the hardware ID of the machine that created it. Never generate a token at home and move it to Azure, or the reverse. Whichever box talks to Ring should own its token and hardware ID for life, and only one process should use it at a time.
- **Cheap empirical test.** Before choosing, run a test from the intended Azure region and service (ACA or App Service) with the bridge's real headers:
  - an unauthenticated request to `api.ring.com/clients_api/*`. Per the prior notes, `clients_api/session` is a POST endpoint, so a GET may return 404 or 405 rather than 401.
  - a token request against `oauth.ring.com`.

  **Treat any `406` as a block**, whether the body is Ring-origin JSON or Cloudflare `text/plain`. Any non-406 response (401, 404, 405, 412 and so on) means the IP reached Ring's API.

  Do this with a throwaway account or a single attempt to avoid triggering auth-retry blocks. It costs minutes and settles the question for that IP pool, at that moment.

### Gaps
- On 2026-10-24, GitHub issue searches `repo:dgreif/ring azure` and `repo:tsightler/ring-mqtt azure` returned no results, and a web search found no AWS EC2 or GCP-specific reports.
- There is no first-hand report, positive or negative, of ring-client-api, ring-mqtt, python-ring-doorbell, Scrypted or Homebridge running from **Azure**, AWS EC2 or GCP. HA community forum, Reddit and Scrypted/Homebridge Discords were not searched within this pass's budget.
- Ring has published nothing on blocking cloud/datacenter IPs; its statement covers only VPN and abusive IPs.
- I found no evidence on whether an already-established FCM/mtalk channel or an open alarm websocket keeps working after the IP is later flagged.

## 5. Workarounds and hybrid patterns: residential egress, tunnels, static IP

### Takeaway
The cleanest hybrid is a small .NET "Ring connector" at home on the residential IP. It owns the Ring token and hardware ID, holds the websocket and FCM sockets, and keeps a local outbox. It connects outbound to Azure, for example through Azure Relay Hybrid Connections, a websocket or queue to the Azure front, or a Tailscale tailnet. The Azure side hosts the public OAuth-protected MCP endpoint and the durable log.

Routing Azure's Ring traffic out through home (Tailscale exit node or app connector) also works in principle. It is more fragile, because the Ring session then lives in Azure but depends on the home link anyway. A static Azure IP via NAT Gateway does not change reputation. Commercial residential proxies conflict with Ring's ToS anti-bypass language.

### Cited Findings
- **Tailscale exit node:** "By default, exit nodes capture all your network traffic that isn't already directed to a subnet router or app connector." It requires Linux, macOS, Windows, Android, iOS or tvOS, and v1.20+. Linux needs IP forwarding, and Windows and macOS exit nodes are userspace-only. The page does not discuss containers or cloud container services (last validated 2025-12-15). — [Tailscale: Exit nodes](https://tailscale.com/kb/1103/exit-nodes)
- **Tailscale app connectors** route traffic for chosen domains through a tagged node "before egressing over the internet to the target domains, even when an exit node is enabled". The domains are configured under `nodeAttrs` → `tailscale.com/app-connectors`. The connector must run Linux, "have a public IP address" and have IP forwarding enabled. The feature is listed as **beta**, available since v1.54. (snippet) — [Tailscale: App connectors](https://tailscale.com/kb/1281/app-connectors); [Tailscale: Set up an app connector](https://tailscale.com/kb/1342/app-connectors-setup)
- **Azure Relay Hybrid Connections** is WebSocket-based and billed per listener-hour plus data over the 5 GB included per month. "A relay is considered open when at least one relay listener is connected." The number of senders doesn't affect relay hours. Egress data transfer is billed separately. (snippet) — [Learn: Azure Relay FAQ](https://learn.microsoft.com/en-gb/azure/azure-relay/relay-faq); [Azure pricing: Service Bus/Relay](https://azure.microsoft.com/en-us/pricing/details/service-bus/). App Service also has a built-in Hybrid Connections feature for reaching on-prem endpoints. — [Learn: App Service Hybrid Connections](https://learn.microsoft.com/azure/app-service/app-service-hybrid-connections)
- **Cloudflare Tunnel** (`cloudflared`) creates "a secure, outbound-only connection between your server and the Cloudflare network". It works behind CGNAT, requires the domain's DNS on Cloudflare, and uses outbound port 7844 TCP/UDP. The core service is free. These are third-party guides, not Cloudflare docs. (snippet) — [flaviocopes](https://flaviocopes.com/cloudflare-tunnel/); [itsfoss](https://itsfoss.com/cloudflare-tunnels.md)
- **ACA egress control:** NAT Gateway or UDR via workload profiles "to send traffic to a network appliance, where you can inspect or proxy traffic". — [Learn: Scaling in ACA](https://learn.microsoft.com/en-us/azure/container-apps/scale-app)
- **ToS:** Ring Terms §2(h): "You may not reverse engineer, decompile or disassemble, tamper with, or bypass any security" of the Software (consumer ToS effective 2025-11-06; summarized in the prior legal notes). — [Ring Terms](https://ring.com/terms)
- **VPN policy:** Ring says to "disable your VPN or configure your VPN to exclude Ring traffic". — [Ring support: VPNs](https://ring.com/au/en/support/articles/c23si/Understanding-the-Ring-App-and-Virtual-Private-Networks-VPN)
- **#1712 caveat:** that failure was a tailnet exiting via Mullvad, a commercial VPN IP, not a home residential exit node. It is not evidence against a home exit node. — [dgreif/ring #1712](https://github.com/dgreif/ring/issues/1712)

### Inferences
**Pattern A: home connector, recommended to evaluate first.**
- A .NET 10 worker runs at home on a NUC, NAS or Pi, on the residential IP that the user's Ring app already uses.
- It owns the token, hardware ID and refresh-token rotation, holds the websocket and FCM sockets, and does WebRTC snapshots when needed.
- It writes events to a local SQLite outbox and pushes them outbound to Azure. Inbound commands from Azure, such as arm/disarm or snapshot, arrive over the same outbound channel. The channel can be an Azure Relay Hybrid Connection with the connector as listener, a persistent websocket or SignalR connection to the Azure app, or Service Bus or Storage queues.
- The home router needs no inbound ports.
- This matches the maintainer advice exactly: one long-lived device and hardware ID on a residential IP.

**Pattern B: all-Azure logic with Ring egress via home.** Two ways to do it:
- *Tailscale exit node or app connector at home.* Running tailscaled inside ACA or App Service would need userspace networking. This is not documented on the exit-node page and is unverified here.
- *Azure VPN Gateway site-to-site plus forced tunneling, or WireGuard to the home router.* VPN Gateway is likely far more expensive than the compute; its cost was not verified.

Pattern B keeps the Ring session in Azure but still depends on the home uplink. It adds failure modes (the tunnel goes down and the Ring session breaks) without removing the home dependency. On that reasoning Pattern A dominates Pattern B. A partial variant routes only auth through home; that is fragile because REST calls are also blocked (#1571).

**Pattern C: all at home,** with the public MCP endpoint via Cloudflare Tunnel or Tailscale Funnel.
- This is the cheapest option and avoids the egress question entirely.
- It loses Azure's managed auth, storage and uptime. OAuth for MCP would be self-implemented or delegated to Cloudflare Access or Entra.

**Static IP via NAT Gateway.** A static Azure IP is still inside Azure's published ranges. It does not improve reputation, and if Cloudflare flags it, it stays flagged. Its only benefit is a stable identity that Ring sees for that hardware ID, which makes it a small help for consistency and no help for the block.

**Commercial residential proxies.** These evade an explicit security control, which sits close to the §2(h) "bypass any security" wording. They also share exit IPs with other users, which risks the many-accounts-per-IP temporary blocks noted in #1580. And many residential-proxy pools source their IPs from consumer devices whose owners may not have meaningfully consented. Not recommended. The ethics point is an inference; no source was fetched on proxy-pool sourcing.

**The official Ring Partner API is a different path.** Its "Private Use Apps" track (2026-07-21, up to 5 allowlisted accounts) delivers to a public HTTPS endpoint, which would be cloud-friendly, but it documents no alarm or lock control. — [prior notes: legal_tos_privacy_risk.md](../Ring%20MCP%20bridge%20research/legal_tos_privacy_risk.md), citing [Ring developer release notes](https://developer.amazon.com/docs/ring/release-notes.html)

### Gaps
- Azure VPN Gateway S2S forced-tunneling cost and setup for ACA or App Service egress were not researched.
- I didn't verify whether Tailscale works inside ACA or App Service containers (userspace mode, no TUN device) as an exit-node *client*.
- Whether a home node behind ISP NAT satisfies Tailscale's app-connector "public IP address" requirement is ambiguous in the snippet.
- No source was fetched on Tailscale Funnel limits, Cloudflare's own Tunnel docs, or Azure Relay .NET listener samples.

## 6. Latency and reliability: hybrid versus all-cloud for a home-alarm event path

### Takeaway
No measured latency data was found. On reasoning: the extra Azure-to-home hop adds tens of milliseconds, which is negligible next to Ring's own push pipeline (Ring cloud, then FCM, then the client, typically "within seconds"). Reliability is the real trade-off. A home connector goes deaf during a home internet or power outage. A cloud connector could, in principle, keep receiving Ring cloud events during that outage, but only if Ring does not block it, and the evidence in §4 says it probably will.

### Cited Findings
- Ring pushes go from Ring's cloud via FCM to a persistent `mtalk.google.com:5228` socket, "usually within seconds". The socket is fragile under ad-blocking DNS, IDS/IPS and DoH. — [prior notes: realtime_events_and_video.md](../Ring%20MCP%20bridge%20research/realtime_events_and_video.md); [dgreif wiki: Notification Troubleshooting](https://github.com/dgreif/ring/wiki/Notification-Troubleshooting)
- ring-client-api re-creates the session every 12 hours, because outside the US (data-residency regions) Ring clears session info after about 24 hours, which breaks push. This is relevant because the account is in Israel. — [prior notes: unofficial_api_auth_rest.md](../Ring%20MCP%20bridge%20research/unofficial_api_auth_rest.md), citing [rest-client.ts L486-L503](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/rest-client.ts#L486-L503)
- The alarm websocket ticket request sets `enableExtendedEmergencyCellUsage=true`, which suggests the Ring Alarm base station can reach Ring's cloud over cellular backup. — [location.ts L232-L240](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/location.ts#L232-L240) (via prior alarm notes)
- ACA replicas are a target, not a guarantee, and extra replicas appear during platform maintenance. — [Learn: Scaling in ACA](https://learn.microsoft.com/en-us/azure/container-apps/scale-app)

### Inferences
**All-cloud (if Ring permits it):**
- It survives home ISP and power outages. If the base station falls back to cellular, the cloud connector could still see alarm events and report them to MCP clients. That is the scenario where an alarm notification matters most.
- It carries the ongoing §4 risk that a WAF reputation change silently kills the bridge.

**Hybrid:**
- The event path is Ring cloud → (FCM or websocket) → home connector → outbound channel → Azure log and MCP push → client.
- The added hop is small, but there are more moving parts: the home box, the home uplink, and the relay or tunnel.
- When the home link drops, the connector loses Ring and Azure at the same moment, so events during the outage are missed unless Ring's history API is back-filled on reconnect. The connector should back-fill from Ring event history and the alarm history on every reconnect.
- The Azure side should expose connector health (last heartbeat or "connector offline since…") as an MCP resource or tool, so agents don't read silence as "all quiet".
- Mitigations are a UPS or LTE failover for the home box and router, Ring's own app notifications as the primary alarm channel, and the bridge positioned as a secondary path, not a safety-critical one. The prior legal notes say the Ring Partner terms ban safety-critical use.

**Region choice:** host the Azure side in a region near Israel to minimize the client-to-MCP hop. The alarm-ticket host is `prd-api-us…`, which hints at US hosting for at least that service. Data-residency handling for non-US accounts makes Ring's backend location for an Israeli account uncertain, so where the cloud-to-Ring latency comes from is unknown.

**Singleton discipline matters in every topology.** ACA or App Service restarts and upgrade pre-warm can briefly start a second instance. That instance would share a rotating refresh token, end up retrying a stale one, and risk the invalid-token temporary block (#1580; see §1). Use a lease-based lock and `maxReplicas = 1`.

### Gaps
- I found no measured latency figures: Ring push delivery, home-to-Azure relay round-trip, or Israel-to-US Ring API round-trip.
- I didn't confirm whether Ring's cloud still emits alarm events to third-party clients while the base station runs on cellular backup.
- I didn't find whether Azure has a nearby region or availability-zone options relevant to the Israel deployment; region availability was not checked.
