# Ring MCP Bridge

An MCP bridge that lets AI agents, such as Claude and ChatGPT, read a Ring home: its alarm state, its devices and their health.

> **Work in progress: not ready to use yet.** The first of four planned iterations is built and tested. Its pilot is running for the owner: the core is deployed in Azure, and a home connector is linked to a real Ring account. You're welcome to clone it, read it and run its tests. Full setup instructions for running it at home come in iteration 004. [Connect an agent](#connect-an-agent) covers the step after a deployment.

## Status

| Iteration | What it adds | State |
| --- | --- | --- |
| 001 | Agents sign in and read the home: an overview, the devices, one device, the bridge's health, and how fresh each answer is | Built and tested in CI against stand-ins. In the owner's pilot, the core is deployed in Azure and the home connector runs on a Hyper-V VM. The first agent trials are next |
| 002 | Events: pushed to agents as they happen, read later from a cursor, nothing lost across an outage, and alerts when the bridge itself is down | Planned |
| 003 | Camera media, and control such as arming the alarm or switching a light, with the rest of the reads and events | Planned |
| 004 | The full admin page, disarm with a PIN the model never sees (shipped switched off), shared Ring locations, and a README for running it at home | Planned |

In iteration 001 an agent has four read-only tools: `get_overview`, `list_devices`, `get_device` and `get_health`.

## How it works

It runs in one of two modes, built from the same components:

- **Hybrid (mode H).** A **core** in Azure answers agents over HTTPS. A **home connector** on a machine at home talks to Ring and dials out to the core over a WebSocket, so the home needs no open port. Agents sign in through the bridge's own OAuth issuer, and only the owner can approve a sign-in, with their Microsoft Entra account. This is what lets hosted agents, such as claude.ai and ChatGPT, reach the home.
- **All-in-one (mode A).** Both parts in one process on one PC, for agents on that PC.

```text
AI agent --HTTPS, OAuth--> core (Azure) <--WebSocket, dialled out-- home connector --> Ring
```

In mode H, the Azure resources cost about $21.50 a month (an estimate, from Israel Central list prices read in October 2026), mostly App Service B1 and Azure SQL Basic. Mode A costs nothing to run.

## Set up bridge health alerts

For the Azure deployment (mode H), configure the email address and mobile number where Azure Monitor should send bridge health alerts. Use an account that can manage Actions secrets in your repository’s `production` environment.

From the root of your bridge clone, run this in PowerShell 7.2 or later:

```powershell
pwsh -File infra/bootstrap/set-alert-contacts.ps1
```

The script checks for GitHub CLI, provides installation instructions if needed, and offers to run `gh auth login` when sign-in is required. Confirm the repository shown, or run it with `-GitHubRepo owner/repo` to select your fork. Enter one email address and a phone number with a space after the country code, for example `+1 202-555-0147`. For Israel, use `+972` followed by a space and the mobile number. The script accepts the domestic leading zero for Israel. Both prompts hide your input.

The script sets `BRIDGE_ALERT_EMAIL`, `BRIDGE_ALERT_SMS_COUNTRY_CODE` and `BRIDGE_ALERT_SMS_NUMBER` in GitHub. You can rerun it to change the recipients. The next Azure deployment applies the values to the alert action group.

## Connect an agent

These steps are for mode H. They assume a deployed core and an enrolled home connector, with the admin page's health showing green.

The agent's server URL is `https://<core-host>/mcp`, where `<core-host>` is the host of your admin page (`https://<core-host>/admin`).

- **Only listed agents can link.** The list is the `BRIDGE_AGENTS` variable (see [the runbook's Part B](infra/bootstrap/entra-app-registration.md#part-b-the-listed-agents)). The list given there holds ChatGPT, Claude (claude.ai, Desktop and mobile) and Claude Code.
- **Each agent is listed by its published client metadata document.** So when an agent asks how to identify itself, choose that document. An agent that registers itself instead is refused.
- **Every link is your own sign-in.** The bridge sends you to your Microsoft Entra sign-in, and only the configured owner gets through. If your browser is already signed in to Microsoft with that account, Entra may finish without showing you a screen.
- **The tools are read-only.**

> The owner's pilot (T033) is trying these steps now, agent by agent. This section is corrected as each agent is tried.

A description for the connector form:

> Read-only view of my Ring home: the alarm mode, open contacts, active motion, offline devices and low batteries, each device's room, battery, power and online status, and the bridge's own health (the home link, the Ring session, and how fresh the data is). It can't arm, disarm or control anything.

### ChatGPT

1. Open [chatgpt.com/plugins](https://chatgpt.com/plugins). Select **+**, then **Add custom MCP server**. If it isn't there, your plan may need **Developer mode** first, under Settings, then Apps or Connectors, then Advanced.
2. Enter a name, such as `Ring home`, and the description above.
3. **Server URL**: `https://<core-host>/mcp`.
4. **Authentication**: **OAuth**. If ChatGPT asks how to register, choose its client metadata document (CIMD).
5. Accept the warning, then select **Create as a plugin**. Install it, and turn it on in a chat.
6. When ChatGPT sends you to the bridge, sign in with your Entra account, if asked.

### Claude: claude.ai, Claude Desktop and Claude mobile

They share one connector, so add it once, on claude.ai.

1. Go to **Customize > Connectors**, select **Add**, then **Add custom connector**. On a Team or Enterprise plan, an Owner adds it instead, under **Organization settings > Connectors**.
2. Enter a name, such as `Ring home`, and the **MCP server URL**: `https://<core-host>/mcp`. Then select **Continue**.
3. **Authentication**: **Sign in now**. **OAuth client**: **Use Claude's published identity**. Claude may mark these **Detected**.
4. Select **Add**, then **Connect**, and sign in with your Entra account, if asked.
5. In a chat, turn it on under **+ > Connectors**.

### Claude Code

```sh
claude mcp add --transport http --scope user ring-home https://<core-host>/mcp
```

Then start a new Claude Code session: one already running doesn't see the new server. Run `/mcp`, choose `ring-home` and authenticate. Your browser opens your Entra sign-in, which may finish on its own. From a shell, `claude mcp login ring-home` does the same.

If you added the connector on claude.ai, Claude Code signed in with the same account may list it already, as a claude.ai connector. Either one works.

### Ending a link

- **One agent:** remove the connector in that agent.
- **Every link of one kind of agent:** remove the agent from `BRIDGE_AGENTS` and deploy.

### Events from shared households

Ring sharing grants read access. Shared camera and doorbell events are dropped by default. Sensor events, including flood detections, are available through `get_events` without notifications. The alarm panel follows the usual owned-home priority rules. Use the household's `location_id` with `get_overview` for its alarm status or with `get_events` for its history. Each returned event and webhook carries that same source ID.

To override a default, set `BRIDGE_EVENT_RULES` to the same JSON array on the connector and core (once in all-in-one mode) and restart the affected processes. The Azure deployment reads the production GitHub environment secret of that name. On a newly provisioned VM, set it in `/etc/ring-bridge/bridge.env`. Keep real household IDs in deployment settings. Each rule targets one household and one camera ID, sensor type, or alarm panel. An optional event kind takes precedence over the rule for the whole source. A push rule includes storage. Late events still follow the recovery path.

```json
[
  {"location_id":"example-home","camera_id":"42","action":"store_only"},
  {"location_id":"example-home","sensor_type":"contact","kind":"contact.open","action":"push"},
  {"location_id":"example-home","alarm":true,"kind":"mode.changed","action":"drop"}
]
```

## Not affiliated with Ring

This project is not affiliated with, endorsed by or supported by Ring or Amazon. It uses Ring's unofficial API through the community library [ring-client-api](https://github.com/dgreif/ring), which can change or stop working at any time, and its use may conflict with Ring's terms of service. Use it at your own risk.

## For people who clone it

You need Node 24. Docker is optional, for the tests against SQL Server.

```sh
npm ci --ignore-scripts
npm run typecheck
npm run lint
npm test
```

The tests use SQLite by default. They also run against SQL Server when `TEST_MSSQL_HOST`, `TEST_MSSQL_PORT` and `TEST_MSSQL_PASSWORD` are set.

For the hybrid media tests, start SQL Server and Azurite with the repository's Docker Compose file. Set `TEST_AZURITE_BLOB_URL=http://127.0.0.1:10010/devstoreaccount1` alongside the SQL test settings. The tests create their own private containers and use synthetic media.

The core keeps staged event media for seven days from capture. Set `BRIDGE_MEDIA_RETENTION_DAYS` to change the retention for newly staged items. All-in-one mode uses the `media` folder under `BRIDGE_DATA_DIR`. The hybrid core uses the private `media` container in `BRIDGE_STORAGE_ACCOUNT` through its managed identity.

On the hybrid admin page, select a household and camera to manage which services can receive its photos and clips. Save applies the checked removals, the selected addition, and the camera settings together. Cancel discards unsaved edits. The person-detection preference applies to events the home connector forwards. Under **Cached camera media**, the owner can confirm deletion of cached photos and clips across all households.

The hybrid core limits media requests per agent per hour. Set `BRIDGE_CLIPS_PER_HOUR` (default 20) and `BRIDGE_FRAMES_PER_HOUR` (default 60) independently of ordinary reads. A cache-only core can serve previously staged items. A missing source, an expired recording, or a representation over the size limit returns a terminal miss. Retry a temporary provider failure or pending event.

To try it with no Ring account, `npm run dev:all-in-one` starts mode A over stdio against a simulated home of about 100 devices. An MCP client can start it as its server.

## Trying an official Ring private app

The account-linking pilot runs separately on your Windows home computer. It lets you see which devices Ring returns for the account and permissions you select. With Node 24, the repository dependencies and PowerShell 7 installed, start it from the project root. Keep the credentials CSV you downloaded from Ring outside the checkout.

```powershell
pwsh -File ./infra/home/start-ring-pilot.ps1 -CredentialCsv 'C:\private\ring-app.csv'
```

The pilot listens at `127.0.0.1:43821`. Forward only that port through an HTTPS tunnel reachable by Ring. Under **Account linking** in the Ring developer console, use the public HTTPS origin of your tunnel followed by the path below.

| Ring console field | Path |
| --- | --- |
| Account Link URL | `/ring/link` |
| App Homepage URL | `/ring/home` |
| Token Exchange URL | `/ring/token` |
| Webhook URL | `/ring/webhook` |

Save the settings. In the developer console, use **Connect Ring account** to add the tester's Ring account to the private app's allowlist. This makes the app visible to that account in the Ring Appstore. [Private app setup](https://developer.amazon.com/docs/ring/publish.html#private-use-apps)

Sign in to the Ring Appstore with that same account and select the private app. Choose **Connect App**, select devices and follow Ring's link to the pilot. On the pilot page, check the masked account and select **Confirm connection**. The next page lists the devices returned by Ring. You can return to the pilot homepage from Ring using the same browser. [Ring Appstore](https://ring.com/appstore) · [Ring's device-sharing instructions](https://ring.com/support/articles/e2sg9/Ring-appstore-third-party-integrations)

The pilot encrypts each confirmed account�s tokens in a SQLite file beside the private credentials CSV. Keep that directory private and reuse the same CSV and directory across restarts. When Ring supplies a refresh token, the pilot renews access while it runs. A browser sign-in lasts up to 30 days. To open the same connection on a different phone or browser, run this on the home computer and enter the single-use code on the pilot homepage within ten minutes.

```powershell
pwsh -File ./infra/home/start-ring-pilot.ps1 -CredentialCsv 'C:\private\ring-app.csv' -BrowserCode
```

If the pilot lists multiple accounts, repeat the command with `-AccountHint` and the desired account identifier shown locally. If upgrading from the earlier memory-only pilot, authorize the private app once to create its first saved connection. If Ring still shows the old connection as active and offers only the homepage, disconnect that private app and connect it again. When finished testing, remove the private integration in Ring while the pilot and tunnel are still running so its signed removal notification clears the saved grant and browser sessions. Then close the tunnel and stop the launcher with Ctrl+C. [Ring account-linking documentation](https://developer.amazon.com/docs/ring/api-documentation.html)

To try one stored camera snapshot, add `-SnapshotDevice 'Camera name'` to the launcher. Use the exact name from your shared inventory. In the linked browser, choose the button to save the latest snapshot. The pilot searches from the later of account-link confirmation or 24 hours ago and saves one JPEG beside the private credentials CSV, with Ring's UTC capture time in its filename. For a device with several lenses it uses the first lens Ring lists.

## Where things are

- `bridge/`: the bridge itself, with the core, the home connector, the all-in-one host and their tests.
- `shim/`: a stdio relay that brings pushed events into Claude Code. It arrives in iteration 002.
- `infra/`: the Bicep for the Azure core, the owner's one-time bootstrap and runbook, and a script that creates the home connector's VM on Hyper-V.
- `schemas/`: the JSON schemas of the tools' inputs, replies and errors.
- `specs/001-ring-mcp-bridge/`: the specification (`spec.md`), the plan (`plan.md`), the tasks and the iteration records.
- `research_notes/` and `reports/`: the research done before the design.

This project is built with [Specrew](https://github.com/alonf/specrew), a spec-governed process for AI-assisted development. The `.specify`, `.specrew`, `.squad`, `.agents`, `.claude`, `.cursor`, `.copilot` and `.github/agents` folders hold its process files and records. The bridge doesn't need them to run.

## License

[MIT](LICENSE)
