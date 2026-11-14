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

In Claude Code, run `/mcp`, choose `ring-home` and authenticate. Your browser opens your Entra sign-in, which may finish on its own. From a shell, `claude mcp login ring-home` does the same.

### Ending a link

- **One agent:** remove the connector in that agent.
- **Every link of one kind of agent:** remove the agent from `BRIDGE_AGENTS` and deploy.

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

To try it with no Ring account, `npm run dev:all-in-one` starts mode A over stdio against a simulated home of about 100 devices. An MCP client can start it as its server.

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
