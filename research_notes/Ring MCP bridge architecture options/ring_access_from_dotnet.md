# Accessing the unofficial Ring cloud API from C#/.NET 10: existing library vs. own port vs. polyglot sidecar (live video/WebRTC excluded)

Research date: 2026-10-24. Method: I cloned the repos below and read the source directly, then used the GitHub API (repos, issues, code search), the NuGet search and registration APIs, the npm registry, and one Microsoft Learn page. These notes cover only what is new compared with the earlier notes (`Ring MCP bridge research/unofficial_api_auth_rest.md`, `alarm_and_device_control.md`, `realtime_events_and_video.md`, `existing_bridges_and_mcp_servers.md`). Wire-protocol details documented there are not repeated here.

Pinned commits. Short prefixes used in citations below:
- `T/` = dgreif/ring (ring-client-api) @ `925a3aa` (2026-10-22). Base: https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/
- `K/` = KoenZomers/RingApi @ `452e1b7` (2024-11-02). Base: https://github.com/KoenZomers/RingApi/blob/452e1b788b7785f62d53713ff2094b65f43a2da8/
- `V/` = rsperry79/VideoForensics @ `7508a00` (pushed 2026-10-23). Base: https://github.com/rsperry79/VideoForensics/blob/7508a00cac4556a305e853558c36fa59481f9dea/
- `R/` = HandyS11/RustPlusApi @ `f61d403` (pushed 2026-10-22). Base: https://github.com/HandyS11/RustPlusApi/blob/f61d403280c656addd103a09238e270e867cdc7e/
- `E/` = ekalchev/push-notificator-csharp @ `b63de60` (2022-07-26). Base: https://github.com/ekalchev/push-notificator-csharp/blob/b63de60d475a0f05dc868dff5a96fef127d8d097/
- `PR/` = Eneris/push-receiver (`@eneris/push-receiver`) @ `590d6d9` (2026-09-24). Base: https://github.com/Eneris/push-receiver/blob/590d6d95f92193f7a320ba556208b3f948f52ddc/
- `M6/` = tsightler/ring-mqtt `dev` branch @ `996be5b` ("Release v6.0.0", 2026-10-19). Base: https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/

All line counts (LOC) below are raw `wc -l` counts, comments and blank lines included, with test files excluded.

---

## 1. Which C#/.NET Ring libraries exist, and what do they support?

### Takeaway
No maintained, packaged C# Ring library covers what this project needs.
- **KoenZomers.Ring.Api**, the only real NuGet package, is stale (last release 2024-10-23). It is broken by the 2026 auth 406 errors (issue #37, open and unanswered). It is REST-only: doorbells, chimes, history, recordings and snapshots. It has no Alarm websocket, push, modes or device control. Its license is **EPL-2.0** on NuGet, even though the README shows an MIT badge.
- **rsperry79/VideoForensics** has the most complete C# Ring client: MIT, net10.0, REST plus Alarm websocket plus modes, lights, intercom and live-view signalling. But it is embedded in an application, is two months old with 0 stars, its own comments label much of it "inferred" or "best-effort", it has **no FCM push receiver**, and its provenance is unclear.
- Everything else is a downloader app or dead.

### Cited Findings

**KoenZomers.Ring.Api (NuGet `KoenZomers.Ring.Api`)**
- NuGet versions and dates: 0.5.1 (2023-07-03), 0.5.2/0.5.3 (2023), 0.5.4 (2024-04-05), 1.0.0 (2024-10-23) is the latest. 26,373 total downloads. — [NuGet KoenZomers.Ring.Api](https://www.nuget.org/packages/KoenZomers.Ring.Api/1.0.0); NuGet search API (`azuresearch-usnc.nuget.org/query?q=ring`)
- **License: NuGet declares `EPL-2.0` for 0.5.2 through 1.0.0**, via `<PackageLicenseExpression> EPL-2.0</PackageLicenseExpression>`. The README shows an MIT badge that links to `LICENSE.md`, but **no LICENSE file exists** in the repo at HEAD or in its history. The GitHub API reports `license: null`. — [K/Api/Api.csproj L20](https://github.com/KoenZomers/RingApi/blob/452e1b788b7785f62d53713ff2094b65f43a2da8/Api/Api.csproj#L20); [NuGet 1.0.0 license page](https://www.nuget.org/packages/KoenZomers.Ring.Api/1.0.0/license); [K/README.md](https://github.com/KoenZomers/RingApi/blob/452e1b788b7785f62d53713ff2094b65f43a2da8/README.md); [GitHub repo API](https://api.github.com/repos/KoenZomers/RingApi). This corrects the earlier note, which called the license "unclear (MIT badge; no license in GitHub API)".
- Activity: 43 stars, 20 forks, last push 2024-11-02, which was the .NET 8 upgrade PR #36 by a contributor. — [KoenZomers/RingApi](https://github.com/KoenZomers/RingApi); [commits](https://github.com/KoenZomers/RingApi/commits/master)
- Target framework: `net8.0`. — [K/Directory.Build.props L3](https://github.com/KoenZomers/RingApi/blob/452e1b788b7785f62d53713ff2094b65f43a2da8/Directory.Build.props#L3)
- Open issues include **#37 "OAuth call returns 406 - Not Acceptable" (2026-03-09)**: "Ring returns 406 which in turn blows up the deserialization of the result". The only reply is from another user (2026-03-29): "around this time my integrations stopped working completely". There is no maintainer response. — [KoenZomers/RingApi #37](https://github.com/KoenZomers/RingApi/issues/37)
- Its own history shows earlier Ring-side breaks:
  - 0.5.1.0 (2023-07-03): "Updated default clientId from Windows to Android to restore the service to the Ring API"
  - 0.5.4.0 (2024-04-05): "Fixed 406 Http Response issue due to missing headers"
  - — [K/README.md Version History](https://github.com/KoenZomers/RingApi/blob/452e1b788b7785f62d53713ff2094b65f43a2da8/README.md)
- Auth [code]:
  - Form POST to `https://oauth.ring.com/oauth/token` with `grant_type=password`, `client_id=ring_official_android` and `scope=client`.
  - 2FA is sent as `2fa-support`/`2fa-code` headers. HTTP 412 maps to `TwoFactorAuthenticationRequiredException` and HTTP 400 to `...IncorrectException`.
  - Session is created with a form POST to `clients_api/session` using `device[hardware_id]`.
  - **Refresh sends `hardware_id: "unspecified"`** rather than the stable ID.
  - — [K/Api/Session.cs L30-L35, L150-L200, L240-L260](https://github.com/KoenZomers/RingApi/blob/452e1b788b7785f62d53713ff2094b65f43a2da8/Api/Session.cs#L150-L200); [K/Api/HttpUtility.cs L155-L170](https://github.com/KoenZomers/RingApi/blob/452e1b788b7785f62d53713ff2094b65f43a2da8/Api/HttpUtility.cs#L155-L170)
- Public surface:
  - Methods: `GetSessionByRefreshToken`, `Authenticate`, `RefreshSession`, `EnsureSessionValid`, `GetRingDevices`, `GetDoorbotsHistory` (`doorbots/{id}/history?older_than=`), `GetDoorbotHistoryRecording` (`dings/{id}/share/download`), `ShareRecording`, `GetLatestSnapshot` (`snapshots/image/{id}`), `UpdateSnapshot` (`snapshots/update_all`) and `GetDoorbotSnapshotTimestamp`.
  - Only one base host is used (`api.ring.com/clients_api/`).
  - **There is no app-API host, websocket, alarm, location modes, push, device control (lights, siren) or refresh-token rotation callback.**
  - — [K/Api/Session.cs L97-L790](https://github.com/KoenZomers/RingApi/blob/452e1b788b7785f62d53713ff2094b65f43a2da8/Api/Session.cs)
- Size: 2,474 LOC of C# in `Api/`, of which `Session.cs` is 791 and `HttpUtility.cs` is 295. — local `wc -l` at `452e1b7`
- Companion apps: KoenZomers/RingSnapshotDownload and RingRecordingDownload are **Apache-2.0** and were last pushed 2025-04-01. — [RingSnapshotDownload](https://github.com/KoenZomers/RingSnapshotDownload); [RingRecordingDownload](https://github.com/KoenZomers/RingRecordingDownload)

**rsperry79/VideoForensics (Ring provider; not a NuGet library)**
- An app that "aggregates video recordings and device information from multiple camera and doorbell providers (Ring, Wyze, Uniview)". It was created 2026-08-27, last pushed 2026-10-23, and has 0 stars and 0 forks. The GitHub API license is `NOASSERTION`, but the repo `LICENSE` is MIT ("applies only to this repository's own source code"; Syncfusion UI components are proprietary). — [rsperry79/VideoForensics](https://github.com/rsperry79/VideoForensics); [V/LICENSE](https://github.com/rsperry79/VideoForensics/blob/7508a00cac4556a305e853558c36fa59481f9dea/LICENSE)
- Provenance is unclear:
  - `CREDITS.md` says the repo "originated as a fork and derivative of the open-source Ring.Api project (https://github.com/Ring/Ring.Api)", licensed MIT. **That GitHub repo returns 404.**
  - The repo also ships `KoenZomers.RingApi.snk` (KoenZomers' strong-name key) and a `Session.cs`/`HttpUtility.cs` structure that mirrors KoenZomers, whose package is EPL-2.0.
  - — [V/CREDITS.md L29-L33](https://github.com/rsperry79/VideoForensics/blob/7508a00cac4556a305e853558c36fa59481f9dea/CREDITS.md); `gh api repos/Ring/Ring.Api` → 404; [V/ repo root listing](https://github.com/rsperry79/VideoForensics/tree/7508a00cac4556a305e853558c36fa59481f9dea)
- Target framework is **`net10.0`**. — [V/src/providers/ring/core/src/VideoForensics.Providers.Ring.Core.csproj](https://github.com/rsperry79/VideoForensics/blob/7508a00cac4556a305e853558c36fa59481f9dea/src/providers/ring/core/src/VideoForensics.Providers.Ring.Core.csproj)
- Scope of `core/src` (partial-class `Session.*.cs` files): Account, ActiveDings, **Alarm**, AppHistory, CredentialAuth, DeviceControl, DingRecording, DingSharePlay, Events, EventSubscriptions, Health, Intercom, LightGroups, LiveView, **LocationMode**, Monitoring, MotionZones, SharedUsers, SnapshotsExtra and VideoSearch. It also has `Alarm/RingAssetSocket.cs`, `Sockets/ClientWebSocketTransport.cs` and `Streaming/RingSignalingClient.cs`. — [V/src/providers/ring/core/src](https://github.com/rsperry79/VideoForensics/tree/7508a00cac4556a305e853558c36fa59481f9dea/src/providers/ring/core/src)
- Alarm websocket over plain `ClientWebSocket`: `wss://{ticketResponse.Host}/ws?authcode={ticketResponse.Ticket}&ack=false`. — [V/.../Session.Alarm.cs L67](https://github.com/rsperry79/VideoForensics/blob/7508a00cac4556a305e853558c36fa59481f9dea/src/providers/ring/core/src/Session.Alarm.cs#L67). Its own comment says "dgreif/ring's source was ambiguous between the two. Treat this class as best-effort". — [V/.../Alarm/RingAssetSocket.cs L21](https://github.com/rsperry79/VideoForensics/blob/7508a00cac4556a305e853558c36fa59481f9dea/src/providers/ring/core/src/Alarm/RingAssetSocket.cs#L21)
- **No FCM receiver.** The code comment on the push subscribe endpoints says: "Ring rejects these with HTTP 422 'Client Device required' for a session that has never registered a push receiver… which a headless/server-side client like this one has no real token to provide". `RegisterPushReceiver(deviceToken)` exists but is "not confirmed against a live capture". — [V/.../Session.EventSubscriptions.cs L6-L17](https://github.com/rsperry79/VideoForensics/blob/7508a00cac4556a305e853558c36fa59481f9dea/src/providers/ring/core/src/Session.EventSubscriptions.cs#L6-L17); [V/.../Session.Account.cs L33-L38](https://github.com/rsperry79/VideoForensics/blob/7508a00cac4556a305e853558c36fa59481f9dea/src/providers/ring/core/src/Session.Account.cs#L33-L38)
- Auth uses the legacy flow with the generic UA `android:com.ringapp` on every request. A grep of the Ring provider for `oauth/v2`, `code_challenge`, `device_info/v3` and `evm/v3` found **no PKCE and no v3 endpoints**. The hardware_id is persisted to `hardware_id.txt`. — [V/.../HttpUtility.cs L258](https://github.com/rsperry79/VideoForensics/blob/7508a00cac4556a305e853558c36fa59481f9dea/src/providers/ring/core/src/HttpUtility.cs#L258); [V/.../Session.cs L29](https://github.com/rsperry79/VideoForensics/blob/7508a00cac4556a305e853558c36fa59481f9dea/src/providers/ring/core/src/Session.cs#L29)
- Size of `src/providers/ring` (non-test `.cs`): about 27.0k LOC in total. That splits into core 6,473, common 4,968 (entities), provider 8,739 (app-side sync services), utils 1,751, snapshots 2,130, video 2,028, auth 665 and forensics 234. There are about 28.6k LOC of tests. — local `wc -l` at `7508a00`

**Other C# code found (GitHub code search for `oauth.ring.com` / `ring_official_android` in C#)**
- `mmckechney/RingVideos`: MIT, 35 stars, last push 2026-07-15, "Console app downloader for Ring videos". Its `Api/Session.cs` appears to be a copy of KoenZomers. — [mmckechney/RingVideos](https://github.com/mmckechney/RingVideos)
- `hsakoh/RingTools`: MIT, 0 stars, last push 2024-03-08, Azure Functions host (`RingFunctionAppHost/Logics/RingSession.cs`). — [hsakoh/RingTools](https://github.com/hsakoh/RingTools)
- `goshorty00-ai/atlas-os` (`SmartHome/RingProvider.cs`): no license, 2026-07. — [goshorty00-ai/atlas-os](https://github.com/goshorty00-ai/atlas-os)
- Dead packages: `Stephanvs/Ring.com` (MIT, last push 2017-04-10; NuGet `Ring.com` 1.0.0) and NuGet `AndyUzick.Ring` 2017.10.22.11. — [Stephanvs/Ring.com](https://github.com/Stephanvs/Ring.com); NuGet search API (`q=doorbell`)
- A NuGet search for "ring alarm" returned nothing. "ring doorbell" returned only KoenZomers, AndyUzick.Ring and Blink.NET. — NuGet search API

**Feature matrix (read from source at the pinned commits; nothing run against a live account)**

`K/` = KoenZomers/RingApi; `VC/` = `V/src/providers/ring/core/src/`. Permalinks are to the files named, at the pinned commits.

| Feature | KoenZomers.Ring.Api 1.0.0 | VideoForensics Ring provider |
|---|---|---|
| OAuth login + 2FA | **Yes (legacy grant only).** `password` grant to `oauth/token`; 412 maps to 2FA-required, 400 to 2FA-incorrect ([K/Api/Session.cs L150-L200](https://github.com/KoenZomers/RingApi/blob/452e1b788b7785f62d53713ff2094b65f43a2da8/Api/Session.cs#L150-L200); [K/Api/HttpUtility.cs L155-L170](https://github.com/KoenZomers/RingApi/blob/452e1b788b7785f62d53713ff2094b65f43a2da8/Api/HttpUtility.cs#L155-L170)). Currently fails with 406 ([#37](https://github.com/KoenZomers/RingApi/issues/37)). No PKCE | **Yes (legacy grant only).** 412/400 handling ([VC/HttpUtility.cs L495-L510, L620-L630](https://github.com/rsperry79/VideoForensics/blob/7508a00cac4556a305e853558c36fa59481f9dea/src/providers/ring/core/src/HttpUtility.cs#L495-L510)); 2FA code-provider loop ([VC/Session.CredentialAuth.cs L70-L78](https://github.com/rsperry79/VideoForensics/blob/7508a00cac4556a305e853558c36fa59481f9dea/src/providers/ring/core/src/Session.CredentialAuth.cs#L70-L78)). An exact grep for `oauth/v2` and `code_challenge` finds nothing, so **no PKCE** |
| Refresh-token rotation | **Partial.** `RefreshSession(refreshToken)` does the refresh grant and keeps the new token in `OAuthToken`. There is no rotation callback; the caller must read and persist it ([K/Api/Session.cs L225-L260](https://github.com/KoenZomers/RingApi/blob/452e1b788b7785f62d53713ff2094b65f43a2da8/Api/Session.cs#L225-L260)) | **Partial / unverified.** The refresh grant is at [VC/Session.cs L321-L322](https://github.com/rsperry79/VideoForensics/blob/7508a00cac4556a305e853558c36fa59481f9dea/src/providers/ring/core/src/Session.cs#L321-L322). After auth, `session.OAuthToken.RefreshToken` is copied into a credentials object ([VC/Session.CredentialAuth.cs L81-L84](https://github.com/rsperry79/VideoForensics/blob/7508a00cac4556a305e853558c36fa59481f9dea/src/providers/ring/core/src/Session.CredentialAuth.cs#L81-L84)). No `onRefreshTokenUpdated`-style event found by grep |
| hardware_id | **Partial.** Required on `Authenticate`, but the refresh sends `"unspecified"` ([K/Api/Session.cs L240-L260](https://github.com/KoenZomers/RingApi/blob/452e1b788b7785f62d53713ff2094b65f43a2da8/Api/Session.cs#L240-L260)) | **Yes.** Persisted to `hardware_id.txt` and sent on auth and requests ([VC/Session.cs L29, L231, L284, L329](https://github.com/rsperry79/VideoForensics/blob/7508a00cac4556a305e853558c36fa59481f9dea/src/providers/ring/core/src/Session.cs#L29); [VC/HttpUtility.cs L262](https://github.com/rsperry79/VideoForensics/blob/7508a00cac4556a305e853558c36fa59481f9dea/src/providers/ring/core/src/HttpUtility.cs#L262)) |
| Locations | **No** (only `clients_api/` is used) | **Yes (v1).** `locations` on the devices API base ([VC/Session.cs L456](https://github.com/rsperry79/VideoForensics/blob/7508a00cac4556a305e853558c36fa59481f9dea/src/providers/ring/core/src/Session.cs#L456)). No `location_info/v3` |
| Devices | **Yes (legacy).** `ring_devices` ([K/Api/Session.cs L322-L326](https://github.com/KoenZomers/RingApi/blob/452e1b788b7785f62d53713ff2094b65f43a2da8/Api/Session.cs#L322-L326)). Doorbells, stickup cams and chimes only | **Yes (legacy).** `ring_devices` ([VC/Session.cs L433](https://github.com/rsperry79/VideoForensics/blob/7508a00cac4556a305e853558c36fa59481f9dea/src/providers/ring/core/src/Session.cs#L433)). No `device_info/v3` |
| Ring Alarm sensors (websocket device list, DataUpdate, battery fields) | **No** | **Partial / unverified.** `DeviceInfoDocGetList` and DataUpdate handling in `RingAssetSocket`, which self-describes as "best-effort" ([VC/Alarm/RingAssetSocket.cs L21, L184](https://github.com/rsperry79/VideoForensics/blob/7508a00cac4556a305e853558c36fa59481f9dea/src/providers/ring/core/src/Alarm/RingAssetSocket.cs#L184)) |
| Alarm mode (arm/disarm/bypass) | **No** | **Partial / unverified.** `security-panel.switch-mode` ([VC/Alarm/RingAssetSocket.cs L245](https://github.com/rsperry79/VideoForensics/blob/7508a00cac4556a305e853558c36fa59481f9dea/src/providers/ring/core/src/Alarm/RingAssetSocket.cs#L245)). Bypass support not checked |
| Location modes (non-alarm) | **No** | **Yes, untested** (`Session.LocationMode.cs`) |
| Device control (light, siren) | **No** | **Yes.** `floodlight_light_on/off`, `siren_on/off` ([VC/Session.DeviceControl.cs L29, L48](https://github.com/rsperry79/VideoForensics/blob/7508a00cac4556a305e853558c36fa59481f9dea/src/providers/ring/core/src/Session.DeviceControl.cs#L29)) |
| Snapshots | **Yes (legacy).** `snapshots/image`, `timestamps`, `update_all` ([K/Api/Session.cs L697-L790](https://github.com/KoenZomers/RingApi/blob/452e1b788b7785f62d53713ff2094b65f43a2da8/Api/Session.cs#L697-L790)) | **Yes.** `snapshots/image` ([VC/Session.cs L984](https://github.com/rsperry79/VideoForensics/blob/7508a00cac4556a305e853558c36fa59481f9dea/src/providers/ring/core/src/Session.cs#L984)) and `snapshots/next` ([VC/Session.SnapshotsExtra.cs L52](https://github.com/rsperry79/VideoForensics/blob/7508a00cac4556a305e853558c36fa59481f9dea/src/providers/ring/core/src/Session.SnapshotsExtra.cs#L52)) |
| Event history | **Yes (legacy).** `doorbots/{id}/history?older_than=` ([K/Api/Session.cs L344-L440](https://github.com/KoenZomers/RingApi/blob/452e1b788b7785f62d53713ff2094b65f43a2da8/Api/Session.cs#L344-L440)) | **Yes.** `doorbots/{id}/history` ([VC/Session.cs L535](https://github.com/rsperry79/VideoForensics/blob/7508a00cac4556a305e853558c36fa59481f9dea/src/providers/ring/core/src/Session.cs#L535)), `locations/{loc}/devices/{id}/events` ([VC/Session.Events.cs L52](https://github.com/rsperry79/VideoForensics/blob/7508a00cac4556a305e853558c36fa59481f9dea/src/providers/ring/core/src/Session.Events.cs#L52)) and `rs/history` ([VC/Session.AppHistory.cs L20](https://github.com/rsperry79/VideoForensics/blob/7508a00cac4556a305e853558c36fa59481f9dea/src/providers/ring/core/src/Session.AppHistory.cs#L20)). No `evm/v3` |
| Push notifications (FCM) | **No.** An open user question asks about this ([#30](https://github.com/KoenZomers/RingApi/issues/30)) | **No receiver.** `RegisterPushReceiver(token)` is unconfirmed and subscribe returns 422 (see above) |

### Inferences
- **Option (a) as "take a dependency" is not available.**
  - KoenZomers lacks most of the required surface: no Alarm, push, modes or control. It fails on 2026 auth. Its EPL-2.0 license means copying or porting its source into an MIT repo would bring EPL file-level obligations; using it as an unmodified binary NuGet dependency is generally compatible.
  - VideoForensics is the best C# **reference** for REST/websocket shapes on net10.0. It is not a dependable upstream: it is a single-author app, it is unpackaged, its comments flag much of the code as unverified, and its lineage traces to EPL code under a misattributed credit.
- In practice, "(a)" collapses into "(b) own C# client, possibly seeded from VideoForensics or KoenZomers code". The license caveat applies to that seeding.

### Gaps
- I did not run VideoForensics or KoenZomers against a live Ring account, so I don't know whether VideoForensics' websocket and alarm commands actually work.
- I could not establish whether VideoForensics' Ring code is derived from KoenZomers source (EPL-2.0) or written independently. The snk file and file layout suggest derivation, but that is not proof.
- KoenZomers' versions before 0.5.2 show no license expression on NuGet. Whether those were MIT was not checked.

---

## 2. What ring-client-api implements that a C# port would have to reproduce, and how big it is

### Takeaway
Excluding streaming, ring-client-api is about **4.6k TS LOC**. About 1.27k of that is the type catalog (`ring-types.ts`) and about 3.4k is logic: REST/auth 641, location/websocket 634, camera 719, API/push glue 526, plus devices, chime and intercom. The push stack it depends on, `@eneris/push-receiver`, is a separate package of about **1.7k hand-written TS plus 0.6k lines of .proto definitions**. It does GCM checkin, GCM register3, Firebase Installations, a web-push FCM registration with ECDH keys, the MCS socket, and draft-03 web-push (aesgcm) decryption. A C# port of the non-video scope is therefore roughly 6-9k C# LOC including types and push. My estimate is that push is the riskiest third.

### Cited Findings
- `ring-client-api` 14.3.0 is MIT, ESM (`"type": "module"`). Repo `main` declares `engines.node: ^22.19.0 || ^24 || ^26`. Runtime dependencies: `@eneris/push-receiver` 4.4.0, `@homebridge/camera-utils`, `colors`, `debug`, `json-bigint`, `rxjs`, `systeminformation`, `undici`, `uuid` and `werift`. — [T/package.json](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/package.json)
- LOC per file (non-test TS, local `wc -l` at `925a3aa`), 5,552 in total:

  | File | LOC |
  | --- | --- |
  | `ring-types.ts` | 1,271 |
  | `ring-camera.ts` | 719 |
  | `rest-client.ts` | 641 |
  | `location.ts` | 634 |
  | `api.ts` | 526 |
  | `util.ts` | 187 |
  | `ring-chime.ts` | 168 |
  | `device-data.ts` | 152 |
  | `ring-device.ts` | 125 |
  | `ring-intercom.ts` | 117 |
  | `refresh-token.ts` | 45 |
  | CLIs and index | about 35 |
  | `streaming/*` (WebRTC, out of scope) | 924 |

  — [T/ tree](https://github.com/dgreif/ring/tree/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api)
- What a port must reproduce (details and permalinks are in the earlier notes):
  - **Auth** — legacy password/refresh grant, 412/400 2FA handling, hardware_id derivation, the wrapped refresh token `base64(JSON{rt,hid,pnc})` that embeds the push credentials, the `onRefreshTokenUpdated` rotation callback, and the 12 h session re-creation. — [T/rest-client.ts L213-L355, L431-L503](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/rest-client.ts#L213-L355)
  - **REST surface** — device discovery, locations, history, snapshots, settings, chimes, intercom and modes. — earlier note `unofficial_api_auth_rest.md` §2
  - **Alarm/Beams websocket** — `clap/tickets` → `wss://{host}/ws?authcode=…&ack=false`, the `{channel, msg}` frames, `DataUpdate`/`DeviceInfoDocType`/`SessionInfoType`/`HubDisconnectionEventType`, `DeviceInfoDocGetList`, `DeviceInfoSet` commands with `seq`, and reconnect on hub disconnect. — [T/location.ts L231-L350](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/location.ts#L231-L350)
  - **Device data model** — `RingDeviceData` fields including the battery fields (`batteryLevel`, `batteryStatus`, `batteryBackup`, `acStatus`), plus `AlarmMode`, `AlarmState` and the `security-panel.switch-mode` command with `bypass`. — [T/ring-types.ts L156-L288](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-types.ts#L156-L288); earlier note `alarm_and_device_control.md` §1-2
  - **Push glue** — the Ring Firebase config, `PATCH clients_api/device` with the FCM token, `JSONbig` parsing of the v2 payload, and the ding/motion subscribe calls. — [T/api.ts L236-L341](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/api.ts#L236-L341)
- **The websocket is no longer socket.io.**
  - 14.0.0 (2025-05-11): "Use undici for all websocket connections… It also allows us to drop the socket.io client". — [T/CHANGELOG.md](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/CHANGELOG.md)
  - The type name `SocketIoMessage` survives only as a legacy name. — [T/ring-types.ts L158-L175](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-types.ts#L158-L175)
- **`@eneris/push-receiver` 4.4.0** — MIT, `engines.node >=20`, dependencies `http_ece`, `jsonwebtoken`, `long` and `protobufjs`. — [PR/package.json](https://github.com/Eneris/push-receiver/blob/590d6d95f92193f7a320ba556208b3f948f52ddc/package.json)
  - Hand-written source (about 1.7k LOC): `client.ts` 481, `parser.ts` 269, `types.ts` 172, `fcm.ts` 153, `gcm.ts` 138, `constants.ts` 138, `sender.ts` 121, `utils/decrypt.ts` 58, plus small utilities.
  - Proto definitions: `mcs.proto` 328, `checkin.proto` 155, `android_checkin.proto` 96.
  - Generated: `protos.js` 7,934 (not hand-maintained).
  - — local `wc -l` at `590d6d9`; [PR/src](https://github.com/Eneris/push-receiver/tree/590d6d95f92193f7a320ba556208b3f948f52ddc/src)
  - **Registration flow (new install):** `createKeys()` → `registerGCM()`, which calls `android.clients.google.com/checkin` and `/c2dm/register3` → `registerFCM(gcm, keys)`, which calls `firebaseinstallations.googleapis.com/v1/` and then `fcmregistrations.googleapis.com/v1/` with `web: {auth, p256dh, …}` keys. For saved credentials it does a checkin, then refreshes the Firebase Installation token, which "is only valid for 7 days". — [PR/src/client.ts L157-L178](https://github.com/Eneris/push-receiver/blob/590d6d95f92193f7a320ba556208b3f948f52ddc/src/client.ts#L157-L178); [PR/src/gcm.ts L10-L11](https://github.com/Eneris/push-receiver/blob/590d6d95f92193f7a320ba556208b3f948f52ddc/src/gcm.ts#L10-L11); [PR/src/fcm.ts L6-L8, L30-L80, L117-L130](https://github.com/Eneris/push-receiver/blob/590d6d95f92193f7a320ba556208b3f948f52ddc/src/fcm.ts#L6-L8)
  - **Payloads are encrypted.** `decrypt.ts` implements "https://tools.ietf.org/html/draft-ietf-webpush-encryption-03": it reads the `crypto-key` (`dh=`) and `encryption` (`salt=`) app-data headers and decrypts with `http_ece`. — [PR/src/utils/decrypt.ts L1-L58](https://github.com/Eneris/push-receiver/blob/590d6d95f92193f7a320ba556208b3f948f52ddc/src/utils/decrypt.ts)
  - Recent maintenance (Sept 2026) touched FIS token refresh, spec-compliant FIDs, retry propagation and "fix(parser): loop instead of recurse to avoid stack overflow". — [Eneris/push-receiver commits](https://github.com/Eneris/push-receiver/commits/master)
  - Upstream origin: a fork of `MatthieuLemoine/push-receiver` (MIT, 220 stars, 38 open issues, pushed 2026-02-07). — [MatthieuLemoine/push-receiver](https://github.com/MatthieuLemoine/push-receiver); [Eneris/push-receiver](https://github.com/Eneris/push-receiver)

### Inferences
- **Effort estimate for a C# port of the non-video scope** (my estimate, not sourced). It assumes a developer fluent in .NET who reads the MIT TypeScript as the spec. It excludes video and includes testing against a real Ring account and Alarm. It assumes C# is about 1.2-1.5× the TS size because of DTOs and System.Text.Json converters:
  - Auth, 2FA, rotation and hardware_id: about 0.6-1k C# LOC, roughly 1-1.5 weeks.
  - REST endpoints and DTOs: about 2-3k LOC, roughly 1.5-2 weeks. The type catalog dominates the line count.
  - Alarm/Beams websocket, state cache and commands: about 0.8-1.2k LOC, roughly 1-1.5 weeks.
  - FCM push receiver: about 2-3k LOC including generated protobuf, roughly 2-4 weeks. This is high variance, because debugging MCS, registration and decryption against Google is slow.
  - Total: about **6-9k LOC and 5-9 person-weeks** to reach parity for MCP needs.
- **What moves most often:** auth (UA/WAF headers, PKCE), discovery (v3), and the push decrypt/registration layer. Websocket framing has been stable since the 2025 change. So most ongoing porting work would land in roughly 1.5-2k LOC (auth plus push).
- **Shared state:** the wrapped refresh token, which carries the hardware_id plus push credentials, is a de facto state format. A C# port must define its own persisted credential bundle with the same semantics: the Ring refresh token, the hardware_id, and the FCM/GCM credentials plus ECDH keys plus persistent IDs.

### Gaps
- LOC counts are raw line counts, not logical LOC (no cloc/SLOC tool run).
- I did not measure how much of `ring-camera.ts` (719 lines) is streaming glue versus REST. Part of it would drop out of a non-video port.

---

## 3. .NET building blocks: socket.io, raw websocket, and FCM receiving (MCS / checkin / register). Is push the hardest part?

### Takeaway
- **The websocket is easy.** Ring dropped socket.io in 2025, so .NET's built-in `ClientWebSocket` is enough. VideoForensics shows this working on net10.0. SocketIOClient exists but isn't needed.
- **FCM receiving is the hardest part.** There is **no .NET port of `push-receiver`'s full web-push flow**. The parts exist only in pieces:
  - **RustPlusApi.Fcm and RustPlusApi.Fcm.Registration** (MIT, net10.0, active October 2026): a C# MCS socket, Android checkin, register3 and Firebase Installations. They have **no web-push `fcmregistrations` registration and no ECE decryption**, because the Rust+ app uses an Android-style registration.
  - **ekalchev/push-notificator-csharp** (MIT, stale since 2022): a C# draft-03 decryptor built on BouncyCastle. It uses a legacy FCM subscribe endpoint.
- Combining the two and adding the `fcmregistrations` step is feasible, but the result would be new, untested code. It also sits exactly where Ring and Google broke things in 2026.

### Cited Findings
- **Socket.io is not needed:** ring-client-api 14.0.0 replaced socket.io with plain websockets (see §2). — [T/CHANGELOG.md](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/CHANGELOG.md)
  - For reference, NuGet `SocketIOClient` 4.0.5 has about 3.03M downloads. It comes from `doghappy/socket.io-client-csharp` (MIT, 797 stars, pushed 2026-07-24). — NuGet search API (`packageid:SocketIOClient`); [doghappy/socket.io-client-csharp](https://github.com/doghappy/socket.io-client-csharp)
- **Plain `ClientWebSocket` works:** a C# implementation of the Ring alarm socket over `ClientWebSocket` exists in VideoForensics (net10.0). — [V/.../Sockets/ClientWebSocketTransport.cs](https://github.com/rsperry79/VideoForensics/blob/7508a00cac4556a305e853558c36fa59481f9dea/src/providers/ring/core/src/Sockets/ClientWebSocketTransport.cs); [V/.../Session.Alarm.cs L67](https://github.com/rsperry79/VideoForensics/blob/7508a00cac4556a305e853558c36fa59481f9dea/src/providers/ring/core/src/Session.Alarm.cs#L67)
- **RustPlusApi (HandyS11):** MIT, 23 stars, created 2024-03-16, pushed 2026-10-22. The README says it can "listen for FCM notifications, and acquire all the required credentials natively — _no Node.js required_". — [HandyS11/RustPlusApi](https://github.com/HandyS11/RustPlusApi); [R/README.md](https://github.com/HandyS11/RustPlusApi/blob/f61d403280c656addd103a09238e270e867cdc7e/README.md)
  - `RustPlusApi.Fcm` targets `netstandard2.0; net10.0` and depends on `protobuf-net`. It is 2,150 LOC: `RustPlusFcmSocket.cs` 873, `ProtoBuf/Mcs.cs` 479, `RustPlusFcm.cs` 165 and `Utils/McsUtils.cs` 76. NuGet `RustPlusApi.Fcm` stable is 1.4.0 (4,318 downloads). 2.0.0-beta.9 was published 2026-09-07 (MIT). — [R/src/RustPlusApi.Fcm](https://github.com/HandyS11/RustPlusApi/tree/f61d403280c656addd103a09238e270e867cdc7e/src/RustPlusApi.Fcm); NuGet registration API (`rustplusapi.fcm`)
  - `RustPlusApi.Fcm.Registration` is 1,252 LOC. It includes `Steps/AndroidFcmRegister.cs` (208) and `Protobuf/CheckinContracts.cs` (138). Its endpoints are `android.clients.google.com/checkin`, `/c2dm/register3` and `firebaseinstallations.googleapis.com/v1/projects/`. — [R/src/RustPlusApi.Fcm.Registration/RegistrationConstants.cs L48-L55](https://github.com/HandyS11/RustPlusApi/blob/f61d403280c656addd103a09238e270e867cdc7e/src/RustPlusApi.Fcm.Registration/RegistrationConstants.cs#L48-L55)
  - A grep of `src/RustPlusApi.Fcm*` found **no** `decrypt`, `aesgcm`, `ecdh`, `crypto-key` or `fcmregistrations` references. — local grep at `f61d403`
- **ekalchev/push-notificator-csharp ("FCM push notification implementation for C#"):** MIT, 4 stars, last push 2022-07-26, about 12.5k LOC including tests. — [ekalchev/push-notificator-csharp](https://github.com/ekalchev/push-notificator-csharp)
  - It contains `Gcm/GcmClient.cs` (checkin and register3), `FcmConnection.cs` (mtalk) and `Decryptor.cs` (HKDF/HMAC per RFC 5869 and RFC 2104, using **BouncyCastle** ECDH/AES). — [E/Firebase.Cloud.Messaging/Decryptor.cs](https://github.com/ekalchev/push-notificator-csharp/blob/b63de60d475a0f05dc868dff5a96fef127d8d097/Firebase.Cloud.Messaging/Decryptor.cs); [E/Firebase.Cloud.Messaging/Gcm/GcmClient.cs L18-L19](https://github.com/ekalchev/push-notificator-csharp/blob/b63de60d475a0f05dc868dff5a96fef127d8d097/Firebase.Cloud.Messaging/Gcm/GcmClient.cs#L18-L19)
  - Its FCM registration uses `https://fcm.googleapis.com/fcm/connect/subscribe`, not the `fcmregistrations.googleapis.com` flow that push-receiver 4.x uses. — [E/Firebase.Cloud.Messaging/Fcm/FcmClient.cs L25-L26](https://github.com/ekalchev/push-notificator-csharp/blob/b63de60d475a0f05dc868dff5a96fef127d8d097/Firebase.Cloud.Messaging/Fcm/FcmClient.cs#L25-L26); compare [PR/src/fcm.ts L6-L8](https://github.com/Eneris/push-receiver/blob/590d6d95f92193f7a320ba556208b3f948f52ddc/src/fcm.ts#L6-L8)
- **Other C# MCS/mtalk code (code search hits, not libraries):**
  - `lexaiko/WinGCore`: `MCS/McsConstants.cs`, `GoogleCheckinProvider.cs`. No license, 0 stars, created 2026-09-24.
  - `dreamstation625/FCM-Forward`: a .NET 8 transparent mtalk forwarder, **GPL-3.0**.
  - VK/Jodel token tools.
  - None is a reusable FCM receiver library. — [GitHub code search "mtalk.google.com language:C#"](https://github.com/search?q=mtalk.google.com+language%3AC%23&type=code); [lexaiko/WinGCore](https://github.com/lexaiko/WinGCore); [dreamstation625/FCM-Forward](https://github.com/dreamstation625/FCM-Forward)
- **No Ring push receiver in C#.** NuGet searches for "fcm receiver", "push receiver", "mcs gcm", "http_ece", "webpush decrypt" and "aesgcm ece" found no FCM *receiving* or ECE-decrypt package. Hits were server-side senders (`FirebaseNet`, `CorePush`, `Google.Apis.FirebaseCloudMessaging.v1`) or unrelated packages. — NuGet search API, 2026-10-24
- **Python has a maintained equivalent.** sdb9696/firebase-messaging (MIT, pushed 2026-06-10) is used by python-ring-doorbell. — [sdb9696/firebase-messaging](https://github.com/sdb9696/firebase-messaging)
- **Push breaks in 2026 were in exactly this layer:**
  - [dgreif/ring #1709](https://github.com/dgreif/ring/issues/1709), "Error: Public key is not valid for specified curve", opened 2026-02-07. A user diagnosis on 2026-10-21: "FCM changed the `crypto-key` header to `dh=KEY; p256ecdsa=SIG`. `@eneris/push-receiver` 4.3.0 strips `dh=` with `slice(3)`, which leaves the suffix on the key, so every push fails with `ERR_CRYPTO_ECDH_INVALID_PUBLIC_KEY`. 4.3.1 parses the header params".
  - The current decrypt code does parse the parameters. — [PR/src/utils/decrypt.ts L16-L40](https://github.com/Eneris/push-receiver/blob/590d6d95f92193f7a320ba556208b3f948f52ddc/src/utils/decrypt.ts#L16-L40)
  - [#1826](https://github.com/dgreif/ring/issues/1826) (2026-09-07) reports `PHONE_REGISTRATION_ERROR` at register3. Users later called it transient and self-healing (user claims, unverified).

### Inferences
- **Push is the hardest part of a pure-C# design.** A workable C# push stack would combine:
  - RustPlusApi.Fcm's MCS socket, checkin and register3 plus FIS code (MIT);
  - a new `fcmregistrations` web-push registration step;
  - a draft-03 aesgcm decryptor, either ported from push-receiver/`http_ece` (MIT) or adapted from ekalchev (MIT, BouncyCastle).
  This is my estimate of 2-4 weeks and the least-proven code in the project. Afterwards you own every Google-side change (header formats, FIS token refresh, register3 errors) that the Node and Python communities currently absorb.
- **Crypto primitives** (from general .NET knowledge, not checked in this session): `HKDF`, `AesGcm` and `ECDiffieHellman` are in `System.Security.Cryptography`. Draft-03 needs the **raw** ECDH shared secret. Check that .NET 10's `ECDiffieHellman` exposes raw secret agreement on Linux/OpenSSL before dropping BouncyCastle. ekalchev used BouncyCastle, which suggests this was a problem for older .NET.
- **Hybrid option (Node push helper plus C# Ring client):** push-receiver is independent of Ring auth. It produces an FCM token and decrypted messages; the Ring-side `PATCH clients_api/device` is just a REST call.
  - The split: the helper (on the order of 100 lines wrapping `@eneris/push-receiver`) owns and persists only the FCM/GCM credentials and ECDH keys. It reports the current token and streams messages. C# owns the Ring session and re-PATCHes `clients_api/device` on every token change and every 12 h session refresh.
  - The coupling cost is that token handoff, plus the #1860 rule: push credentials must never be regenerated for a device Ring already knows, so both sides' persisted state has to stay consistent.
  - This trades a small amount of cross-process state for keeping the hardest part in the ecosystem that maintains it. The same wording appears in §5.

### Gaps
- **Not tested:** whether Ring delivers pushes to an **Android-style, unencrypted** FCM registration (RustPlusApi-style, with no web-push keys). Ring's Firebase `appId` is an Android app ID, and Rust+ uses that kind of registration. If it works, RustPlusApi.Fcm could be used almost as-is. Nobody has published a test.
- I found no .NET port of `push-receiver` or `firebase-messaging` that includes the `fcmregistrations` plus ECE decrypt path. Absence of evidence is limited to GitHub and NuGet searches.
- I did not verify that ekalchev's decryptor is correct for current FCM header formats such as `dh=…; p256ecdsa=…`.

---

## 4. Current state and maintenance of ring-client-api and ring-mqtt v6; reusable parts and licenses

### Takeaway
**ring-client-api is maintained but releases slowly.**
- The latest npm release is **14.3.0 (2026-02-08)**. The published package still pins `@eneris/push-receiver` **4.3.0**, which has the 2026 decryption bug. The fixes (push-receiver 4.4.0, a non-JSON 406 handling fix, and newer Node engines) sit unreleased on `main`.
- PKCE (#1750) and the v3 APIs (#1749) are unmerged.

**ring-mqtt is moving away from upstream ring-client-api.**
- tsightler's npm fork `@tsightler/ring-client-api` **15.0.0-beta.2 (2026-08-27)** contains the OAuth v2/PKCE and v3 code.
- ring-mqtt **v6.0.0** (committed on `dev` 2026-10-19, **not tagged or released**) replaces the upstream library with an embedded MIT client of about 3.25k LOC in `lib/ring-client/`, which has PKCE and v3 support.
- Its Go component `ringstream` is a video-only WebRTC-to-RTSP gateway. It is not a Ring API sidecar.

All of these are MIT.

### Cited Findings
**ring-client-api releases and requirements**
- npm release history: 13.0.0 2024-08-04; 13.1.0 2024-08-13; 13.2.0 2024-11-21; 13.2.1 2024-12-07; 14.0.0 2025-05-11; 14.0.1 2025-05-14; 14.1.0 2025-09-27; 14.2.0 2025-11-11; **14.3.0 2026-02-08 (latest)**. Package `modified` 2026-02-08. — [npm registry ring-client-api](https://registry.npmjs.org/ring-client-api)
- Published 14.3.0 declares `@eneris/push-receiver: 4.3.0` and `engines.node: ^20 || ^22 || ^24`. Repo `main` has 4.4.0 and `^22.19.0 || ^24 || ^26`. — [npm ring-client-api 14.3.0 manifest](https://registry.npmjs.org/ring-client-api/14.3.0); [T/package.json](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/package.json)
- push-receiver releases: 4.3.0 2024-10-29; **4.3.1 2026-02-27**; 4.4.0 2026-09-23. — [npm registry @eneris/push-receiver](https://registry.npmjs.org/@eneris/push-receiver)
- #1709, user comment 2026-08-12: "The issue is fixed in @eneris/push-receiver@4.3.1, but the current published version of ring-client-api@14.3.0… is still referencing 4.3.0". Users still reported the error on 2026-10-21. — [dgreif/ring #1709](https://github.com/dgreif/ring/issues/1709)
- Repo stats on 2026-10-24: 1,532 stars, 46 open issues, MIT, last push 2026-10-22. 17 issues opened in 2026 are still open. They include:
  - #1717 "OAuth authentication broken - Ring has migrated to new /oauth/v2 endpoint" (21 comments)
  - #1715 "Refresh Token invalid"
  - #1709 (above)
  - #1826 (PHONE_REGISTRATION_ERROR)
  - #1860 "Camera motion events nor doorbell rings are not triggering" (25 comments)
  - #1866 "Motion events not triggering for cocoa_doorbell_v5 and cocoa_floodlight_v2" (2026-10-22)
  - — [dgreif/ring](https://github.com/dgreif/ring); [GitHub issue search](https://github.com/dgreif/ring/issues?q=is%3Aissue+is%3Aopen+created%3A%3E%3D2026-01-01)
- #1860, user root-cause analysis 2026-10-23: "homebridge-ring never saves the push credentials to `config.json`, so every restart registers new ones, which Ring ignores for an already registered device (as you described)". The parenthetical refers to an earlier tsightler explanation. A fix branch was offered and is not merged. — [dgreif/ring #1860](https://github.com/dgreif/ring/issues/1860)
- Open PRs from the earlier notes: [#1750 OAuth 2.0 + PKCE](https://github.com/dgreif/ring/pull/1750) (open since 2026-05-25), [#1749 v3 endpoints](https://github.com/dgreif/ring/pull/1749) (open), and [#1704 refresh-failure handling](https://github.com/dgreif/ring/pull/1704) (open). The #1818 non-JSON-406 fix is merged but unreleased.

**Forks on npm**
- `@tsightler/ring-client-api`: 14.3.1-beta.0 (2026-03-08), 14.3.1-beta.1 (2026-05-05), 15.0.0-beta.0/1/2 (2026-08-26/27). Latest is **15.0.0-beta.2**, with `engines.node ^20 || ^22 || ^24` and push-receiver **4.3.1**. I verified the 15.0.0-beta.2 tarball: `lib/rest-client.js` contains `oauth/v2`/`code_challenge` (PKCE) and `device_info/v3`/`evm/v3`. — [npm @tsightler/ring-client-api](https://registry.npmjs.org/@tsightler%2fring-client-api); tarball `ring-client-api-15.0.0-beta.2.tgz` inspected locally
- `@thoughtminers/ring-client-api` 14.3.2 (2026-03-06), described as a "Security-hardened fork of ring-client-api". Not examined further. — [npm search "ring-client-api"](https://registry.npmjs.org/-/v1/search?text=ring-client-api)

**ring-mqtt**
- Latest GitHub release is **v5.9.3 (2026-03-09)**. Earlier releases: v5.9.2 2025-12-12, v5.9.1 2025-12-04, v5.8.1 2025-05-11. **There is no v6 tag or release** as of 2026-10-24. — [ring-mqtt releases](https://github.com/tsightler/ring-mqtt/releases); GitHub tags API
- v6 `package.json`: `ring-mqtt` 6.0.0, **MIT**, `"type": "module"`. Dependencies include `@eneris/push-receiver` 4.4.0, `undici`, `ws`, `express`, `mqtt`, `rxjs`, `json-bigint`, `write-file-atomic` and `ffmpeg-for-homebridge`. **There is no `ring-client-api` dependency.** — [M6/package.json](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/package.json); [M6/LICENSE](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/LICENSE)
- Embedded client `lib/ring-client/`: 3,251 JS LOC. `rest-client.js` is 932, `ring-camera.js` 565, `api.js` 516, `location.js` 500, `ring-types.js` 208, plus chime, intercom, device and util. — local `wc -l` at `996be5b`; [M6/lib/ring-client](https://github.com/tsightler/ring-mqtt/tree/996be5b73537d845f9176eef6efcf5ed055be85e/lib/ring-client)
  - v3 bases: `deviceInfoApiBaseUrl = https://api.ring.com/device_info/v3/`, `locationInfoApiBaseUrl = …/location_info/v3/`, `evmApiBaseUrl = …/evm/v3/`. — [M6/lib/ring-client/rest-client.js L39-L42](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/lib/ring-client/rest-client.js#L39-L42)
  - PKCE: `initiatePkceFlow()` with `client_id: 'ring_official_android'`, `code_challenge_method: 'S256'`, `GET /oauth/v2/authorize`, then `POST /oauth/v2/signin` with a CSRF token and cookie jar, then 2FA verify. It still sends `User-Agent: 'android:com.ringapp'`. — [M6/lib/ring-client/rest-client.js L293-L505](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/lib/ring-client/rest-client.js#L367-L505)
- `ringstream` (Go 1.25):
  - 4,190 non-test LOC.
  - Dependencies: `pion/webrtc/v4`, `pion/rtp`, `pion/rtcp`, `gorilla/websocket`.
  - Its control channel says ring-mqtt holds the Ring session "so it stays the only thing that can mint a signaling ticket". `requestTicket()` sends `ticket_request` to ring-mqtt.
  - It is **video-only** and has no Ring auth or REST client of its own.
  - — [M6/ringstream/go.mod](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/ringstream/go.mod); [M6/ringstream/control.go L15-L56, L243-L244](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/ringstream/control.go#L15-L56)
- Packaging precedent: the v6 `Dockerfile` builds `ringstream` in a `golang:1.25-alpine` stage. The final image is **`node:krypton-alpine`** (Node 24 LTS), with **s6-overlay v3.2.3.2** supervising the processes. — [M6/Dockerfile](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/Dockerfile)
- ring-mqtt "supports only Linux platforms and will not run properly on Windows!" — [ring-mqtt wiki](https://github.com/tsightler/ring-mqtt/wiki) (from earlier note `existing_bridges_and_mcp_servers.md`)

### Inferences
- **For a Node sidecar, use a patched base, not npm `ring-client-api@14.3.0` as published.** Choices:
  1. upstream 14.3.0 plus npm `overrides` forcing `@eneris/push-receiver@4.4.0`, the #1709 workaround;
  2. `@tsightler/ring-client-api@15.0.0-beta.2`, which has PKCE and v3 but is a beta, single-maintainer fork;
  3. vendoring ring-mqtt v6 `lib/ring-client/` (MIT, about 3.25k LOC), which removes the upstream release lag but makes you its maintainer.
- **Bus factor:** the de facto source of 2026 fixes is one person, tsightler (ring-mqtt, the npm fork, and the open PKCE/v3 PRs upstream). dgreif's release cadence has slowed to about one minor release per quarter, with nothing since February. Any option inherits this bus factor, because even a C# port would port tsightler's fixes.
- **Not reusable:** ringstream is out of scope (video) and is not a reusable Ring sidecar. The reusable non-video asset is `lib/ring-client/`.

### Gaps
- I did not see a published v6 Docker image or release date. Treat the v6 client as pre-release.
- I found no statement from dgreif on when the next ring-client-api release will ship, or whether #1749/#1750 will be merged.
- The Node 26 incompatibility reported in #1715 (earlier note) is unverified.

---

## 5. Polyglot option: minimal Node sidecar shape, cost of two runtimes, and existing REST/WS wrappers

### Takeaway
A minimal sidecar is a small Node process that owns Ring auth state (the refresh token plus push credentials) and exposes a narrow internal API to the .NET 10 core:
- request/response for REST-style operations;
- a server-push stream (SSE or WebSocket) for normalized alarm and ding/motion events.

I found **no existing, reusable project that exposes ring-client-api as a generic REST/WebSocket service**. ring-mqtt, which exposes it over MQTT, is the closest. Two runtimes in one deployment have a working precedent in ring-mqtt's single image supervised by s6-overlay, and Azure Container Apps supports sidecar containers that share network and lifecycle. The costs are real but bounded: a second dependency tree, an internal API contract to maintain, image size, and supervision.

### Cited Findings
- GitHub repo searches for "ring-client-api rest api", "ring-client-api express", "ring-client-api http server", "ring alarm rest api" and "ring api server docker" returned **no relevant projects**. An npm search for `ring-client-api` returned only the library and forks (`@tsightler`, `@thoughtminers`, `@koush` 2022, `ring-client-api-lw` 2023). — GitHub search API and npm search API, 2026-10-24
- The closest existing wrappers (from the earlier note):
  - ring-mqtt (MQTT plus HA discovery, MIT);
  - jpcors/ring-mcp (TypeScript MCP on ring-client-api ^11.7.5, stale 2025-07, no license);
  - Node-RED ring-alarm nodes (stale 2023).
  - — `existing_bridges_and_mcp_servers.md` summary table; [jpcors/ring-mcp](https://github.com/jpcors/ring-mcp); [tsightler/ring-mqtt](https://github.com/tsightler/ring-mqtt)
- ring-mqtt's own HTTP surface (`lib/web-service.js`, `express`) is used for the auth UI, not as a general API. — [M6/lib](https://github.com/tsightler/ring-mqtt/tree/996be5b73537d845f9176eef6efcf5ed055be85e/lib); [M6/package.json](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/package.json)
- Single-image, two-runtime precedent: ring-mqtt v6 combines a Go builder stage, a `node:krypton-alpine` runtime and s6-overlay supervision. — [M6/Dockerfile](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/Dockerfile)
- Azure Container Apps (page updated 2026-03-25):
  - Supports "Optional sidecar and init containers". "Multiple containers in the same container app share hard disk and network resources and experience the same application lifecycle."
  - "Use this pattern only in specific instances where your containers are tightly coupled."
  - "If a container crashes, it automatically restarts." Liveness, readiness and startup probes can be set per container.
  - On the Consumption plan, "the total CPU and memory allocated to all the containers in a container app must add up to" fixed pairs, from 0.25 vCPU/0.5 Gi up to 4 vCPU/8 Gi.
  - Images must be `linux/amd64`.
  - — [Microsoft Learn: Containers in Azure Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/containers)
- Node runtime constraints:
  - Published ring-client-api 14.3.0 needs Node `^20 || ^22 || ^24`; `main` needs `^22.19.0 || ^24 || ^26`.
  - The library is ESM-only since 14.0.0.
  - — [npm 14.3.0 manifest](https://registry.npmjs.org/ring-client-api/14.3.0); [T/CHANGELOG.md](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/CHANGELOG.md)
- Push needs outbound TCP 5228 to `mtalk.google.com` (persistent connection). The Ring websocket and REST calls use 443. — [dgreif wiki: Notification-Troubleshooting](https://github.com/dgreif/ring/wiki/Notification-Troubleshooting)
- **Push state must persist across restarts in every option:**
  - The wiki says re-using an old refresh token breaks push permanently, because Ring "only accepts [FCM registration] during initial device registration".
  - #1860 (2026-10-23): failing to persist push credentials causes re-registration, "which Ring ignores for an already registered device".
  - — [dgreif wiki: Refresh-Tokens](https://github.com/dgreif/ring/wiki/Refresh-Tokens); [dgreif/ring #1860](https://github.com/dgreif/ring/issues/1860)

### Inferences
- **Minimal sidecar shape (my design sketch, not sourced):**
  - Node 24 LTS, ESM, about 300-800 TS LOC on top of the chosen Ring client.
  - Endpoints: `GET /locations`, `GET /devices`, `GET /alarm/{loc}`, `POST /alarm/{loc}/mode {mode, bypass[]}` (returns the confirmed read-back state, with a timeout), `POST /camera/{id}/light|siren`, `GET /camera/{id}/snapshot` (JPEG), `GET /history`, plus an SSE or WebSocket `/events` stream of normalized events: ding, motion, alarm mode, alarm state, sensor fault, battery and connectivity.
  - Bind to localhost or the shared container network only. Authenticate with a shared secret or a Unix socket.
  - Persist `{refreshToken (wrapped), pushCredentials}` atomically to a mounted volume on every `onRefreshTokenUpdated`.
  - Expose `/healthz`, including FCM connected state and websocket state per location.
  - The .NET core treats the sidecar as an anti-corruption layer and never touches Ring directly.
- **Transport choice:** HTTP/JSON plus SSE is simpler to debug than gRPC for a solo maintainer, and .NET 10's `HttpClient` handles both. gRPC adds codegen in two languages for little gain at this message rate.
- **Costs of two runtimes:**
  1. Image size and patching: Node base images, an npm audit cadence, and .NET patches.
  2. Two test and debug toolchains.
  3. A versioned internal contract.
  4. Supervision: s6-overlay in one image, or two containers in docker-compose, or ACA sidecars. These share localhost and restart independently.
  5. Ring auth state lives in the sidecar, so the .NET side must not also authenticate. One process per refresh token avoids rotation races.
  6. On ACA Consumption, both containers share one CPU/memory envelope. Node plus .NET idle footprints probably fit in 0.5 vCPU/1 Gi, but I have not measured this.
- **Hybrid variant (same as §3):** keep Node only as a push helper and do REST and websocket in C#.
  - The helper owns and persists only the FCM credentials and reports the token. C# owns the Ring session and re-PATCHes `clients_api/device` on every token change and session refresh.
  - Compared with an all-Node sidecar, it minimizes the Node surface. The cost is a token handoff across the process boundary and keeping two persisted state stores consistent (the #1860 rule).
  - It is a tradeoff, not clearly better or worse. It makes sense if the goal is a mostly-C# Ring client in which only push is delegated.

### Gaps
- I did not check Azure App Service sidecar support or ACA pricing. A sibling note in this folder, `azure_hosting_and_ring_egress.md`, covers Azure compute options for an always-on .NET 10 MCP server, C# MCP SDK guidance on Azure, durable storage, and the key risk of Ring/Cloudflare blocking cloud and datacenter egress IPs. That egress risk applies equally to (b) and (c).
- I have no measured memory or CPU numbers for a Node ring-client-api process plus a .NET 10 MCP host.
- I did not check .NET Aspire's Node/JavaScript app hosting for local dev orchestration.

---

## 6. Which option best fits a solo maintainer facing roughly annual Ring breaking changes?

### Takeaway
Inference: **the best fit is (c), a thin Node sidecar for all Ring access**, built on a patched or pinned Ring JS client, behind a Ring-agnostic interface in the .NET 10 core. A port to C# can be done later, one piece at a time (strangler pattern), if the sidecar becomes a burden. Push (FCM) would be the last piece moved, or never.
- **(b), an own C# client,** is viable only if a single runtime is a hard requirement. It costs about 5-9 person-weeks up front and makes the maintainer the first responder for every break. The push layer is the riskiest part.
- **(a), an existing C# library,** is not a real option in 2026.

Breaks have arrived more than once a year. Upstream JS was slow to *release* fixes but quick to *produce* them. The polyglot design lets you pick up those fixes by changing dependencies rather than porting code.

### Cited Findings
**Ring-side breaking changes, 2023-2026 (evidence for "about annual or faster")**
- 2023-07: the client_id had to switch from Windows to Android to "restore the service" (KoenZomers 0.5.1.0). — [K/README.md](https://github.com/KoenZomers/RingApi/blob/452e1b788b7785f62d53713ff2094b65f43a2da8/README.md)
- 2024-04: a 406 caused by missing headers (KoenZomers 0.5.4.0). — same source
- 2024-09: `client_id` became required on the initial token request, which broke all prior python-ring-doorbell versions (PR #446). — [python-ring-doorbell PR #446](https://github.com/python-ring-doorbell/python-ring-doorbell/pull/446)
- 2024-10: PUT requests without a JSON body started returning 422 (python 0.9.8 #456). — [python-ring-doorbell CHANGELOG](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/CHANGELOG.md)
- 2025-05: the alarm/Beams websocket broke, and socket.io was replaced (ring-client-api 14.0.0, ring-mqtt 5.8.1). — [T/CHANGELOG.md](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/CHANGELOG.md); [ring-mqtt v5.8.1](https://github.com/tsightler/ring-mqtt/releases/tag/v5.8.1)
- 2026-02: the FCM `crypto-key` header format changed and push decryption failed (#1709). The fix shipped in push-receiver 4.3.1 on 2026-02-27, but is **still not in a ring-client-api release** as of 2026-10. — [dgreif/ring #1709](https://github.com/dgreif/ring/issues/1709); [npm @eneris/push-receiver](https://registry.npmjs.org/@eneris/push-receiver)
- 2026-02/03: Cloudflare WAF 406 errors on the legacy OAuth endpoint, and the move to `/oauth/v2` PKCE (#1717). PKCE is in tsightler's fork and ring-mqtt v6; the upstream PR #1750 is unmerged. KoenZomers is still broken (#37). — [dgreif/ring #1717](https://github.com/dgreif/ring/issues/1717); [PR #1750](https://github.com/dgreif/ring/pull/1750); [KoenZomers #37](https://github.com/KoenZomers/RingApi/issues/37)
- 2026: the v3 discovery and events APIs became required for shared accounts and newer devices (PR #1749; ring-mqtt v6 changelog). — [PR #1749](https://github.com/dgreif/ring/pull/1749); [M6/docs/CHANGELOG.md](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/docs/CHANGELOG.md)

**Licenses**
- ring-client-api: MIT. — [T/package.json](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/package.json)
- push-receiver: MIT. — [PR/package.json](https://github.com/Eneris/push-receiver/blob/590d6d95f92193f7a320ba556208b3f948f52ddc/package.json)
- ring-mqtt v6: MIT. — [M6/LICENSE](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/LICENSE)
- RustPlusApi: MIT. — [HandyS11/RustPlusApi](https://github.com/HandyS11/RustPlusApi)
- ekalchev: MIT. — [ekalchev/push-notificator-csharp](https://github.com/ekalchev/push-notificator-csharp)
- VideoForensics: MIT, with unclear provenance (§1).
- KoenZomers.Ring.Api: **EPL-2.0** on NuGet. — [K/Api/Api.csproj L20](https://github.com/KoenZomers/RingApi/blob/452e1b788b7785f62d53713ff2094b65f43a2da8/Api/Api.csproj#L20)
- python-ring-doorbell: **LGPL-3.0**. — [python-ring-doorbell](https://github.com/python-ring-doorbell/python-ring-doorbell)
- FCM-Forward: **GPL-3.0**. — [dreamstation625/FCM-Forward](https://github.com/dreamstation625/FCM-Forward)

### Inferences
**Comparison (effort and risk are my estimates; facts are cited above):**

| | (a) Existing C#/.NET library | (b) Own C# Ring client (port) | (c) Polyglot: Node sidecar + .NET 10 core |
|---|---|---|---|
| Starting point | KoenZomers.Ring.Api 1.0.0 (2024-10, broken by 406, REST-only) or VideoForensics code (MIT, net10.0, unpackaged, no push) | Port from MIT TS sources: ring-client-api, ring-mqtt v6 `lib/ring-client`, push-receiver. Optionally seed from VideoForensics; MCS socket from RustPlusApi.Fcm; decrypt from ekalchev | Wrap ring-client-api 14.3.0 plus `overrides` (push-receiver 4.4.0), **or** `@tsightler/ring-client-api` 15.0.0-beta.2, **or** vendored ring-mqtt v6 `lib/ring-client` |
| Coverage vs. MCP needs (auth+2FA+rotation, locations, devices, alarm sensors and mode, snapshots, history, push) | See the §1 matrix. KoenZomers: no alarm, push, modes, locations or control, and auth is broken. VideoForensics: no push, no PKCE, no v3; alarm websocket unverified | Full coverage, but only after the work is done | Everything in scope on day one: ring-client-api covers all of it, and the tsightler fork adds PKCE and v3 |
| Up-front effort | Low to adopt, then it turns into (b) to fill gaps | **About 5-9 person-weeks**, about 6-9k C# LOC; FCM is 2-4 weeks of that | **About 1-2 person-weeks**: sidecar about 300-800 TS LOC, contract, Dockerfile/compose, health |
| Ongoing maintenance per Ring break | You own it (upstreams are dormant) | You own it: detect, then port the TS fix. Auth and push changes are 1-2k LOC of the most volatile code | Usually a dependency bump, override, or fork switch. Sometimes you patch vendored JS. You still have to watch upstream issues |
| Lag exposure | Total (no upstream) | Your own time, plus time to understand the TS fix | Upstream release lag (8+ months for #1709) unless you pin, override or vendor |
| Ops cost | One runtime | One runtime, one image | Two runtimes: Node 24 plus .NET 10; s6-overlay or two containers / ACA sidecars; two dependency trees to patch; an internal API contract |
| License (project is MIT) | KoenZomers **EPL-2.0**: OK as a binary dependency, but copying or porting source brings EPL obligations. VideoForensics MIT, provenance unclear | Clean if ported only from MIT sources. **Do not translate python-ring-doorbell (LGPL-3.0) or FCM-Forward (GPL-3.0)** | All MIT: ring-client-api, push-receiver, ring-mqtt, tsightler fork. Ships Node and npm deps under their own (mostly MIT) licenses |
| Key risks | Dead upstream; EPL; broken auth | FCM receiver correctness (web-push registration plus aesgcm decrypt, Google-side drift); WAF header tuning; v3 schemas undocumented | Single-maintainer forks (tsightler); upstream release lag; the sidecar becomes a second product; secret and state handling across the process boundary |

- **Why (c) fits a solo maintainer best:** in 2026, every break was first diagnosed and fixed in the JS or Python community: the WAF/UA fix in ring-mqtt 5.9.3, the crypto-key fix in push-receiver 4.3.1, PKCE and v3 in tsightler's fork. In (c), adopting a fix is mostly a version bump. In (b), each fix has to be understood and ported, and any break that no community member hits first, such as a C#-specific HTTP header difference, is yours alone. Push is the strongest argument. It is the hardest .NET gap (§3), and it is where Google-side drift happens.
- **Mitigations to make (c) robust:**
  1. Pin exact versions and use npm `overrides` for push-receiver.
  2. Prefer a dependency whose fixes ship (today that means tsightler's fork or vendored ring-mqtt v6 code over published dgreif 14.3.0). Re-evaluate when dgreif releases.
  3. Keep the sidecar API Ring-agnostic so the Ring client can be swapped.
  4. Own credential persistence in the sidecar: the wrapped refresh token plus push credentials, with atomic writes and one process per token (#1860 lesson).
  5. Add bounded retries and circuit breakers around auth to avoid IP blocks (earlier note).
- **When (b) would be preferable:**
  - a hard single-runtime requirement, for example a NuGet-distributable library as a project goal;
  - a deployment target where Node is unavailable;
  - a wish to contribute the first maintained .NET Ring client to the ecosystem.
  Then start with REST plus websocket, which is lower risk and has VideoForensics as a reference. Defer push or use the "Node push helper" hybrid (§3) until a C# FCM stack is proven.
- **Wildcard:** the official Ring Partner API (2026; see `official_ring_developer_platform.md` and `official_ring_api_recheck.md`) could eventually replace the unofficial access path for some features. If it does, a Ring-agnostic core interface pays off in every option.

### Gaps
- Effort and LOC estimates for (b) and (c) are my own. They are not benchmarked against a real implementation.
- I found no data on how quickly dgreif will release pending fixes, or on tsightler's long-term plans for the npm fork versus the v6 embedded client.
- I did not test whether Ring treats a C#/.NET HTTP client differently at the Cloudflare WAF (TLS fingerprint, header order) from Node's `undici`. This could make (b) more fragile than (c) under 2026-style WAF filtering, but that is speculative.
