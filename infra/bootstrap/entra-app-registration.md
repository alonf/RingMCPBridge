# The owner's runbook: Entra, SQL and the first deploy

**Task**: T031 (PT-05, PT-06, DRIFT-001-39, DRIFT-001-62, DRIFT-001-63). You do these steps once, yourself, from your own PC. Nothing here goes into git: the IDs you note go into the GitHub environment, never into a file in the repository. The repository's workflow logs are public, and GitHub hides only secrets in them, so the bootstrap sets the IDs and your registry's name as secrets, and the resource group and the SQL group's name as variables.

The agent never signs in to your Azure or Entra, and never runs the bootstrap with `-Apply`.

## Before you start

- PowerShell 7, the Azure CLI (`az`) and the GitHub CLI (`gh`), each signed in as you.
- This repository, with Node 24 and its packages installed (`npm ci --ignore-scripts`): the bootstrap's last step runs the repository's own code to write the first signing key.
- Your container registry in the same subscription as the bridge: the bootstrap looks for it there.
- In a private repository, GitHub environments and their variables need GitHub Pro or Team. You can see your plan at <https://github.com/settings/billing>.

## The order

The first deploy creates the core's managed identity, so whatever is granted to that identity comes after it. The core migrates its database before it listens, and stops if it cannot, so its container restarts until its database user exists.

1. **Part A** below: the Entra app registration, the SQL break-glass group, and your object ID.
2. **The bootstrap's first stage**, with the IDs from part A:

   ```powershell
   pwsh infra/bootstrap/bootstrap.ps1 -SubscriptionName '<subscription>' -GitHubRepo '<owner>/<repo>' -RegistryName '<registry>' `
     -EntraAppClientId '<app-client-id>' -OwnerObjectId '<your-object-id>' `
     -SqlAdminGroupName '<group-name>' -SqlAdminGroupObjectId '<group-object-id>'
   ```

   It only prints its plan. Read it, then run it again with `-Apply`.
3. **Part B** below: the listed agents.
4. **The first deploy** (T032): run the Deploy workflow with **preview**, read the what-if, then run it again with **deploy**. Until the workflow is on main, GitHub shows no "Run workflow" button for it, so start it with the GitHub CLI:

   ```powershell
   gh workflow run deploy.yml --repo '<owner>/<repo>' --ref '<branch>' -f action=preview
   ```

   Afterwards the core cannot yet pull its image or reach its database, so the first deploy skips its smoke test.
5. **The bootstrap's second stage**:

   ```powershell
   pwsh infra/bootstrap/bootstrap.ps1 -Stage after-deploy -SubscriptionName '<subscription>' -GitHubRepo '<owner>/<repo>' `
     -RegistryName '<registry>' -EntraAppClientId '<app-client-id>' -Apply
   ```

   It does the following:
   - grants the core's identity AcrPull on your registry;
   - makes the core's identity the app's federated credential, and adds the redirect URI;
   - gives you Key Vault Secrets Officer on the vault;
   - prints the T-SQL for part C, and restarts the core only after you say the database user exists;
   - last, writes the first signing key. Key Vault takes several minutes to honour your new role, which part C usually covers. If it still refuses, wait a few minutes and run the stage again: it repeats only what is missing.
6. **Part C** below, while the bootstrap waits: the core's database user.
7. **The smoke test**: run the Deploy workflow with **smoke**. It checks that `/livez` answers, that `/readyz` answers ready, and that `/mcp` asks for a sign-in. `get_health` needs an agent's sign-in, so you check it at the first agent trial (T033).

## Part A: before the first deploy

### The bridge's Entra app registration

In the Microsoft Entra admin center, in your organization's tenant:

1. **App registrations**, **New registration**:
   - Name: anything you like, for example "Ring MCP Bridge".
   - Supported account types: **this organizational directory only**.
   - Redirect URI: leave it empty for now. The bootstrap's second stage adds `https://<core-host>/sign-in/return`, because the host is known only after the first deploy.
2. **Note the Application (client) ID**: it is `-EntraAppClientId`.
3. **Token configuration**, **Add optional claim**: ID token, `auth_time`. The admin page always asks for a fresh sign-in and checks it against `auth_time`; without the claim, you cannot sign in to it.
4. **API permissions**: keep Microsoft Graph's `User.Read`. The sign-in asks for `openid profile`, since Entra sends your object ID only with `profile`.
5. **No client secret and no certificate.** The core's managed identity becomes the app's federated credential in the second stage, so there is nothing to leak or renew.
6. **Only you may sign in.** Open the app's **Enterprise application**, then:
   - under **Properties**, set **Assignment required** to **Yes**;
   - under **Users and groups**, assign only yourself.

   The bridge also checks your object ID on every sign-in, and refuses everyone while it is not set.

### Your object ID

In Entra ID, **Users**, open yourself and note the **Object ID**: it is `-OwnerObjectId`.

### The SQL break-glass group

The SQL server's only admin is a security group that stays empty, except while you run part C.

1. In Entra ID, **Groups**, **New group**: a Security group, for example "Ring MCP Bridge SQL admins", with **no members**.
2. Note its **display name** (`-SqlAdminGroupName`) and **Object ID** (`-SqlAdminGroupObjectId`).

## Part B: the listed agents

The agents that may link are a GitHub environment variable, `BRIDGE_AGENTS`, set as JSON (PT-18). Each entry has:

- the agent's client ID: its metadata document's URL, or a name for an agent that registers itself;
- its redirect URIs. A loopback one (`http://localhost/...` or `http://127.0.0.1/...`) matches on any port, since an agent on your machine picks its port at each sign-in;
- its scopes: `read` in iteration 001.

The pilot's three agents (T033, DRIFT-001-65), from each agent's own metadata document, read 2026-11-12. claude.ai, Claude Desktop and mobile share one client, which may sign in as either of its two documents, so both are listed:

```json
[
  {"client_id":"https://claude.ai/oauth/claude-code-client-metadata","platform":"Claude Code","redirect_uris":["http://localhost/callback","http://127.0.0.1/callback"],"scopes":["read"]},
  {"client_id":"https://claude.ai/oauth/mcp-oauth-client-metadata","platform":"Claude","redirect_uris":["https://claude.ai/api/mcp/auth_callback"],"scopes":["read"]},
  {"client_id":"https://claude.ai/oauth/mcp-oauth-client-metadata/confidential_client","platform":"Claude","redirect_uris":["https://claude.ai/api/mcp/auth_callback"],"scopes":["read"]},
  {"client_id":"https://chatgpt.com/oauth/client.json","platform":"ChatGPT","redirect_uris":["https://chatgpt.com/connector_platform_oauth_redirect"],"scopes":["read"]}
]
```

Save it as a file outside the repository, for example `agents.json`, then:

```powershell
Get-Content agents.json -Raw | gh variable set BRIDGE_AGENTS --env production --repo '<owner>/<repo>'
```

An agent you leave out cannot link. Removing one later ends its links.

Two more variables are optional, set the same way:

- `BRIDGE_REGISTRATIONS_PER_HOUR`: how many new agent registrations the core accepts an hour, from 1 to 1000. Unset, 10.
- `BRIDGE_LOG_LEVEL`: `debug`, `info`, `warn` or `error`. Unset, `info`.

A change takes effect at the next deploy.

## Part C: the core's database user

The core signs in to Azure SQL with its own identity, and needs a user that can read, write and change the schema, since it migrates the database when it starts. Only the break-glass group can create one.

1. **Join the group for now.** In Entra ID, add yourself to the SQL break-glass group.
2. **Allow your PC for now.** Only the core's subnet reaches the database. Open the SQL server's **Networking** page and add your current IP address as a firewall rule. The portal's query editor offers the same with one click.
3. **Run the T-SQL the bootstrap printed**, in the database `bridge`, signed in with Microsoft Entra. The portal's query editor will do. It has this form:

   ```sql
   CREATE USER [<core-identity-name>] FROM EXTERNAL PROVIDER;
   ALTER ROLE db_datareader ADD MEMBER [<core-identity-name>];
   ALTER ROLE db_datawriter ADD MEMBER [<core-identity-name>];
   ALTER ROLE db_ddladmin ADD MEMBER [<core-identity-name>];
   ```

4. **Remove your IP rule, and leave the group.** Both go back to how they were.
5. **Answer the bootstrap's question** with `y`: it restarts the core, which now migrates the database and starts.

## Costs

The resource group, managed identities, role assignments, the app registration, the group, federated credentials and GitHub variables are all free. The deployed resources cost about $23 a month (research.md "Cost", agent-derived).
