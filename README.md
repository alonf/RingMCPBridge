# Ring MCP Bridge

An MCP bridge that lets AI agents, such as Claude and ChatGPT, read a Ring home: its alarm state, its devices and their health.

> **Work in progress: not ready to use yet.** The first of four planned iterations is built and tested, but it has not yet run against a real Ring account or a real Azure deployment. You're welcome to clone it, read it and run its tests. Setup instructions for running it at home come once it works end to end.

## Status

| Iteration | What it adds | State |
| --- | --- | --- |
| 001 | Agents sign in and read the home: an overview, the devices, one device, the bridge's health, and how fresh each answer is | Built and tested in CI against stand-ins. The owner's first real deployment and trial are next |
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
