# Operate the Ring MCP Bridge

The hybrid installation runs an Azure core for hosted MCP clients and a home connector on an Ubuntu Hyper-V VM. Run the PowerShell examples from the repository root. Replace values in angle brackets with the values for your own deployment.

## How it works

| Component | Responsibility |
| --- | --- |
| Azure core | Serves MCP, OAuth, the owner admin page and Ring's HTTPS callbacks. Azure SQL holds event history and bridge state. Private Blob Storage holds staged camera media. |
| Home connector | Reads alarm and sensor state using the community Ring library. For paired cameras, the official Ring app supplies signed detections and access to the corresponding recordings. Ring credentials stay at home. |
| MCP client | Signs in through the bridge using the owner's Entra account. It reads the home, receives eligible event notifications and, with media consent, requests a photo or clip for an approved service. |
| Receiving service | Downloads an item using a short-lived URL and its own credential. One household and camera approval covers photos and clips for that receiver. |

The VM opens an outbound connection to `wss://<core-host>/link`. Ring sends callbacks to Azure, which forwards them over the enrolled connection for verification at home. The Windows dev tunnel is only for the standalone local pilot.

## First deployment

1. Install PowerShell 7, Azure CLI, GitHub CLI, OpenSSH and Node 24. Sign in with `az login` and `gh auth login`, select the Azure subscription, and run `npm ci --ignore-scripts`. Have an Azure container registry and a GitHub repository with Actions enabled.
2. Follow the owner's bootstrap runbook. Register the Entra app, restrict sign-in to the owner, create the SQL admin group, preview the first bootstrap stage and then apply it. Configure the allowed clients and redirects using the GitHub production environment's `BRIDGE_AGENTS`. Use `read` for monitoring and allow `read` and `media` for a client intended to request recorded media. Configure Azure Monitor's email and SMS contacts with `pwsh -File infra/bootstrap/set-alert-contacts.ps1`. [Bootstrap commands and order](bootstrap/entra-app-registration.md)
3. Preview and deploy a commit with passing CI using the release commands below. Finish the `after-deploy` bootstrap stage, including creation of the core's database user when prompted. Run the Deploy workflow with `action=smoke`. It checks core liveness, readiness and the MCP sign-in challenge.
4. In elevated PowerShell on the Hyper-V host, preview the home VM with the following command. Verify the switch, SSH public key, image and core URL. Rerun with `-Apply` to create the VM. [VM provisioning script](home/new-connector-vm.ps1)

   ```powershell
   ./infra/home/new-connector-vm.ps1 -SwitchName '<switch>' -SshPublicKeyPath "$HOME/.ssh/id_ed25519.pub" -Image 'ghcr.io/<owner>/ring-mcp-bridge:<deployed-full-SHA>' -CoreUrl 'wss://<core-host>/link'
   ```

5. SSH to the VM as `bridge`. Run `ring-bridge-setup` and complete Ring sign-in and 2FA. Run `ring-bridge-start`, then read the enrollment code privately with `docker logs ring-bridge-connector`. Sign in to `https://<core-host>/admin`, compare the code and approve the connector. Approving a replacement revokes the previous connector key.
6. For ordinary monitoring, set the client's URL to `https://<core-host>/mcp`, choose OAuth and complete owner sign-in. Check `get_health` and `get_overview`. [ChatGPT and Claude setup](../README.md#connect-an-agent)

## Deploy, upgrade and roll back

Run the Azure preview from the repository root after CI passes. Keep the chosen branch at the reviewed commit through deployment.

```powershell
$branch = '<release-branch>'
gh workflow run deploy.yml --ref $branch -f action=preview
gh run list --workflow deploy.yml --branch $branch --event workflow_dispatch --limit 5
```

Open the matching run and check the commit, conclusion and Azure what-if output. Then deploy:

```powershell
gh workflow run deploy.yml --ref $branch -f action=deploy
```

Wait for the deployment and smoke test to pass. The workflow builds and tests both CPU architectures, publishes the home image to GHCR and deploys the core image to App Service. A branch push by itself runs checks.

Match the home connector to the configured Azure image. The updater reads the full tag from App Service in your active Azure CLI subscription, connects to the VM by SSH and runs `ring-bridge-update <tag>` when needed. It checks Docker health afterward. A healthy matching image keeps running. [PowerShell updater](home/update-home-connector.ps1)

```powershell
$app = '<app-service-name>'
./infra/home/update-home-connector.ps1 -AppName $app -CheckOnly
./infra/home/update-home-connector.ps1 -AppName $app
```

On the Hyper-V host the updater discovers the current IPv4 address for VM `ring-bridge` when it can read Hyper-V. Use `-VMName` for another name. DHCP can change the address after reboot. From another PC, supply a stable DNS name or reserved address with `-SshHost`. SSH checks the trusted VM host key. A private launcher can supply these settings for a no-argument update.

After an upgrade, check `/readyz`, then call authenticated `get_health`. Wait for fresh home data before testing a device and a new event. To roll back, select a known-good full image SHA present in both registries and compatible with the current schema and infrastructure template:

```powershell
gh workflow run deploy.yml --ref $branch -f action=deploy -f image_tag='<previous-full-SHA>'
```

Wait for smoke to pass and rerun the home updater. Database recovery is a separate operation.

## Configure official Ring callbacks

Open the private app's **Account linking** page, enter the four URLs and save. [Ring Developer Console](https://developer.amazon.com/ring/console/apps)

| Field | Production URL |
| --- | --- |
| Account Link URL | `https://<core-host>/ring/link` |
| App Homepage URL | `https://<core-host>/ring/home` |
| Token Exchange URL | `https://<core-host>/ring/token` |
| Webhook URL | `https://<core-host>/ring/webhook` |

Allow the tester account in the private app, select devices in Ring and complete linking. Keep the credentials CSV, account database and camera IDs outside Git. Install the private camera-pairing configuration on the VM and choose a UTC switchover time. When migrating a pilot, preserve the encrypted linked-account database and keep one process renewing its grant. Verify an actual signed detection for the paired camera. [Pairing and migration procedure](../specs/001-ring-mcp-bridge/quickstart.md#pair-an-official-ring-camera-with-the-connector)

## Manage the running bridge

| Task | Where and what to check |
| --- | --- |
| Health | Open `/admin` or call `get_health`. Check the home link, Ring session, push reception, database, backlog and data freshness. Use `/livez` and `/readyz` for HTTP monitoring. |
| Client access | Maintain client IDs, allowed redirects and scopes in `BRIDGE_AGENTS`, then deploy. Removing an agent from the listing revokes its access on subsequent checks. |
| Camera permissions | Open `/admin#cameras` to see all households and cameras. On the camera card, choose the person-detection action, enable recorded media, and check or clear each receiving service. Select **Save permissions** on that camera. **Include sound in clips** is a separate choice. |
| Event rules | Configure household rules in the core and connector. `push` stores and forwards, `store_only` makes events queryable without a push, and `drop` discards them. The camera page also offers a person-detection preference. [Rule examples](../README.md#events-from-shared-households) |
| Monitoring tools | Use `get_overview`, `list_devices`, `get_device`, `get_events` and `get_health`. Keep the returned cursor to resume a paged read. ChatGPT can also expose event subscription actions. Alarm mode is available as a status read. |
| Operator alerts | Use Azure Monitor's **Test action group** and check receipt on each configured channel. Verify a real fired/resolved rule evaluation separately. |

## Find and test the media tool

Ordinary sign-in at `/mcp` requests only `read`. Use the opt-in URL `https://<core-host>/mcp/media` for agents that need recorded event photos and clips. It requests `read media`. The URL selects the sign-in flow. Access still requires a listed client, the owner's explicit consent and owner authentication.

1. **Obtain a media grant.** In ChatGPT, configure a custom MCP connection with the opt-in URL and OAuth. A separate connection lets you keep the ordinary monitoring connection. Start authorization. On the bridge page check the client identity, select **Allow camera media and sign in** and complete owner sign-in. Close the page to decline. The client must be listed for both scopes. A 401 challenge and protected-resource metadata show what can be requested.
2. **Verify authenticated discovery.** Inspect the new connection's authenticated MCP `tools/list` reply. Look for `share_event_media` in `result.tools[].name`. Use the connected server's tool scan when it exposes the discovery result. If the client hides the result, record this check as pending until you have protocol evidence for that client. Keep the token inside the client. A diagnostic client's grant proves only that client's access.
3. **Refresh ChatGPT's actions.** Refresh the app's tool list. Where the workspace offers **Action control**, open **Workspace settings → Apps → the Ring app → … → Action control**, review the new action and enable it. Start a new chat with the media connection and check that ChatGPT can select the tool. [ChatGPT app management](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt)
4. **Test the approved camera and receiver.** Set their permission in `/admin#cameras`. Trigger a fresh detection and read it with `get_events`. Call `share_event_media` using the event's `location_id`, `device.id` (as `device_id`), `event_id`, the approved `receiver_id` and `kind` of `photo` or `clip`. For `pending`, retry after `retry_after_s`. For `ready`, have the receiver fetch the returned `uri` with its own credential. Verify the JPEG opens and the MP4 plays, including audio when enabled.

The owner page shows **Effective access** for each receiving service on the selected camera. Expand **Recent denied media handoffs** to compare the UTC timestamp, source IDs and receiver with the request. An older row may have no recorded reason. A denied share from the signed-in requester means its token passed the tool's media-scope check.

To check ChatGPT image delivery, call `test_media_image` on the approved household and camera. It returns a synthetic JPEG with three colored shapes and reads no camera footage. Then call `share_event_media` for a fresh recorded photo with ChatGPT itself as the approved receiver. For photos up to 1 MiB the MCP reply includes image content. Larger photos, clips and shares addressed to another receiver use the authenticated item URL. A browser opening the URL on its own does not supply the receiving service's credential.

Record those four results independently. If an operation returns HTTP 403, record whether it came from MCP authorization, a share call, a receiver download or Ring's upstream media request. Each checks different credentials or permissions. Keep tokens, item URLs and household data out of shared logs.
