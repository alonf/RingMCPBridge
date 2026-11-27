# Existing Ring Bridges/Integrations and Ring MCP Servers (landscape as of 2026-10-23)

Method note: GitHub facts (stars, push dates, releases, file lists, issue counts) were pulled live through the GitHub API on 2026-10-23. Links point at the canonical GitHub page for each fact. The npm, PyPI and official MCP registry lookups were also live queries on 2026-10-23. Star counts are point-in-time.

---

## 1. Home Assistant core "ring" integration (and HACS alternatives)

### Takeaway
HA core `ring` is actively maintained. It is built on `python-ring-doorbell` (pinned `ring-doorbell==0.9.14`) and covers doorbells, cameras (a WebRTC live view plus a last-recording camera), chimes and intercoms through event, camera, light, siren, switch, button, number and sensor entities. It still has **no Ring Alarm support**: there is no `alarm_control_panel` platform, and an open 2026 issue shows the Base Station detected with no entities created. HA users get Alarm only through ring-mqtt. The declared quality scale is Bronze. Recent churn has been heavy: the `ding`→`ring` event rename, the snapshot fix and its revert, and removal of the deprecated binary sensors on `dev`.

### Cited Findings
**Platforms, entities and devices (docs)**
- The current docs list these platforms: binary sensor, button, camera, event, sensor, siren, switch, light and number. Supported devices are doorbells, stickup cams, chimes and intercoms. — [HA Ring docs](https://www.home-assistant.io/integrations/ring/)
- Camera: there are `live_view` and `last_recording` entities, and "`last_recording` is disabled by default." — [HA Ring docs](https://www.home-assistant.io/integrations/ring/)
- Event: "The event entity captures events like doorbell rings, motion alerts, and intercom unlocking." The binary sensor is "being replaced by the event entity." — [HA Ring docs](https://www.home-assistant.io/integrations/ring/)
- Sensor: battery, Wi-Fi signal, and a last-recording timestamp that is disabled by default. Number: doorbell and chime volume, plus intercom voice and mic volume. Siren, switch, light and button cover camera and chime sirens, motion detection, the in-home chime, camera lights and intercom door opening. — [HA Ring docs](https://www.home-assistant.io/integrations/ring/)
- Setup takes username, password and a 2FA "Account verification code". DHCP auto-discovery is supported. — [HA Ring docs](https://www.home-assistant.io/integrations/ring/); DHCP MAC prefixes are in the [manifest.json (dev)](https://github.com/home-assistant/core/blob/dev/homeassistant/components/ring/manifest.json)
- Documented limitations:
  - "Two-way audio in camera live view is not currently supported."
  - Downloading or playing `last_recording` requires a Ring Protect plan.
  - Some models send two alerts per doorbell ring.

  — [HA Ring docs](https://www.home-assistant.io/integrations/ring/)
- IoT class is Cloud Polling, with "Data updates every 60 seconds". Realtime events need outbound TCP 5228. Troubleshooting says to remove excess "Authorized Client Devices" whose names start with `ring-doorbell:HomeAssistant` or `Python`. Introduced in HA 0.42. — [HA Ring docs](https://www.home-assistant.io/integrations/ring/)
- **Ring Alarm is not mentioned in the docs.** — [HA Ring docs](https://www.home-assistant.io/integrations/ring/)

**Manifest, code and quality scale (dev branch, 2026-10-23)**
- Manifest values:
  - `requirements: ["ring-doorbell==0.9.14"]`
  - `quality_scale: "bronze"`
  - `iot_class: "cloud_polling"`
  - `integration_type: "hub"`
  - `dependencies: ["ffmpeg"]`
  - codeowner `@sdb9696`

  — [manifest.json](https://github.com/home-assistant/core/blob/dev/homeassistant/components/ring/manifest.json)
- Component files on dev: `button, camera, event, light, number, sensor, siren, switch`, plus coordinator, config_flow and diagnostics. **There is no `alarm_control_panel.py` and no `binary_sensor.py`.** — [components/ring (dev)](https://github.com/home-assistant/core/tree/dev/homeassistant/components/ring)
- quality_scale.yaml:
  - Bronze: all done.
  - Silver: all done except `action-exceptions: todo`.
  - Gold todos: `entity-translations`, `stale-devices`, `exception-translations`, `dynamic-devices`.
  - Platinum: `async-dependency`, `inject-websession` and `strict-typing` are done.

  — [quality_scale.yaml](https://github.com/home-assistant/core/blob/dev/homeassistant/components/ring/quality_scale.yaml)
- The latest HA stable release is 2026.10.2, published 2026-10-16. — [HA core releases](https://github.com/home-assistant/core/releases/tag/2026.10.2)

**Recent changes, 2024–2026 (merged PRs)**
- 2024-10-21: reconfigure flow added. — [PR #128357](https://github.com/home-assistant/core/pull/128357)
- 2024-11-26: "Add a new camera entity to enable live view over WebRTC. Retains the original camera that shows the last recording which will be disabled by default." — [PR #127579](https://github.com/home-assistant/core/pull/127579)
- 2024-11-14: do not trigger events for *updated* ring events. — [PR #130430](https://github.com/home-assistant/core/pull/130430)
- 2025-07-28: quality scale added to the manifest. — [PR #149406](https://github.com/home-assistant/core/pull/149406)
- 2026-01-07 (2026.1.0): fixed log flooding of "Your Ring account does not have an active subscription", which fired about 480 times a day for users without Ring Protect. — [PR #158012](https://github.com/home-assistant/core/pull/158012)
- 2026-03-03: library bumped to ring-doorbell 0.9.14. — [PR #158074](https://github.com/home-assistant/core/pull/158074)
- 2026-04-02 (2026.4.1): "Fix Ring snapshots" made live-view cameras fetch fresh snapshots. It was **reverted** on 2026-04-09 (2026.4.2) because it "degraded or completely broken the Ring Snapshot behavior". Issue #167406 is still open. — [PR #164337](https://github.com/home-assistant/core/pull/164337); [revert PR #167790](https://github.com/home-assistant/core/pull/167790); [issue #167406](https://github.com/home-assistant/core/issues/167406)
- 2026-04-10, **breaking**: the doorbell event type `ding` was replaced by the standardized `ring` event "so they can be seamlessly used in the new triggers and conditions". — [PR #167728](https://github.com/home-assistant/core/pull/167728)
- 2026-09-19: Ring listener (FCM) credentials are preserved during reauth and reconfigure. Previously the stored `listen_token` was dropped. — [PR #182033](https://github.com/home-assistant/core/pull/182033)
- 2026-09-19: fixed a switch setup crash on unknown chime types. — [PR #182375](https://github.com/home-assistant/core/pull/182375)
- 2026-09-28: added a disabled-by-default `last_recording` timestamp sensor. — [PR #181480](https://github.com/home-assistant/core/pull/181480)
- 2026-10-22: deprecated binary sensors removed, which removed "the complete binary sensor platform", and deprecated sensors removed. Both had been "scheduled for removal already in 2025.4". These are merged to dev with no milestone. — [PR #187596](https://github.com/home-assistant/core/pull/187596); [PR #187592](https://github.com/home-assistant/core/pull/187592)

**Ring Alarm status**
- Open issue, 2026-07-24: "Ring Alarm Base Station detected in diagnostics but no device/entities are created". — [issue #177181](https://github.com/home-assistant/core/issues/177181)
- ring-mqtt documents itself as the HA path for Alarm. It provides "Full Home Assistant MQTT discovery" and a sister HA add-on. — [ring-mqtt wiki](https://github.com/tsightler/ring-mqtt/wiki)

**HACS alternatives**
- The HACS default integration list has no alternative full Ring integration. The only Ring-specific entries are `john1506/ring-stash` and `simplytoast1/ha-ring-smoke-detectors`. — [hacs/default integration list](https://github.com/hacs/default/blob/master/integration)
- **ring-stash** (MIT, 2 stars, pushed 2026-06-21): auto-downloads Ring clips to local HA storage, with a sidebar viewer, retention and paged history recovery. — [john1506/ring-stash](https://github.com/john1506/ring-stash)
- **ha-ring-smoke-detectors** (MIT, 21 stars, pushed 2026-07-25): supports Kidde/Ring hubless Wi-Fi smoke/CO detectors that are "not supported by the standard Ring integration". The core integration misses them because "the upstream library only creates WebSocket connections when a Ring Alarm hub or Beams bridge is present". The repo opens its own WebSockets, using an approach credited to @tsightler. — [simplytoast1/ha-ring-smoke-detectors](https://github.com/simplytoast1/ha-ring-smoke-detectors)

### Inferences
- The binary_sensor and deprecated-sensor removals will most likely ship in HA 2026.11. Stable 2026.10.x still has them, which is why the docs still list "binary sensor". Any MCP that rides on HA entity IDs should target `event.*` entities and the `ring` event type.
- "Cloud polling" undersells the design. Device state is polled every 60 s, but dings and motion arrive by FCM push (port 5228). The library's FCM listener is therefore the critical and fragile path.
- The quality scale reads close to Silver in practice: only `action-exceptions` is outstanding. The integration is real and maintained, but it cannot be a complete Ring surface because Alarm is absent.

### Gaps
- No primary source says why the core integration has never added Alarm support. It may be a library limitation or a maintainer choice.
- The HA docs page does not state the live-view protocol. WebRTC is confirmed only by PR #127579.

---

## 2. ring-mqtt (tsightler)

### Takeaway
ring-mqtt is the most feature-complete open-source Ring bridge. It covers Alarm with full arm/disarm and bypass, Z-Wave peripherals, cameras (events, snapshots, on-demand RTSP live and recorded streams), chimes, intercom unlock, 1st-gen smart lighting and location modes, and it publishes everything to MQTT with Home Assistant discovery. It is actively maintained but releases are infrequent; the latest tag is v5.9.3 (2026-03-09). An **unreleased v6.0.0 on `dev` (2026-10-19)** drops the dgreif `ring-client-api` for an embedded client on Ring's v3 API, and replaces go2rtc/werift with a Go WebRTC-to-RTSP gateway, `ringstream`, that adds H.265.

### Cited Findings
- Repo stats (2026-10-23): 796 stars, MIT, JavaScript, 4 open issues, last push 2026-10-23. — [tsightler/ring-mqtt](https://github.com/tsightler/ring-mqtt)
- Disclaimer: the project "does not enable local control of Ring devices as there is no known facility to do so". It also says "many capabilities are not possible without a subscription" and it "is not intended as a way to bypass this requirement". — [ring-mqtt README](https://github.com/tsightler/ring-mqtt)
- Architecture per the wiki: "written primarily in JavaScript and features an embedded Ring API client communicating via the same API leveraged by the official Ring apps, including the Ring v3 API". Video goes through "a custom Ring WebRTC-to-RTSP gateway service written in Go (`ringstream`)" with H.265/H.264. **The wiki already describes v6, which has not been released.** — [ring-mqtt wiki Home](https://github.com/tsightler/ring-mqtt/wiki)
- Deployment: HA OS and Supervised users get a sister add-on (installed from the add-on store, not HACS), and Docker is "Fully supported and highly preferred". The project "supports only Linux platforms and will not run properly on Windows!" — [ring-mqtt wiki](https://github.com/tsightler/ring-mqtt/wiki); [ring-mqtt-ha-addon](https://github.com/tsightler/ring-mqtt-ha-addon)
- Feature list from the wiki:
  - **2FA**: embedded web auth UI on port 55123, plus a CLI tool.
  - **Alarm control panel**: arm/disarm with automatic retries, sensor bypass, and states disarmed, armed home, armed away, arming, pending and triggered. Supports a disarm code.
  - **Base station**: volume, panic switches (Ring Protect required) and siren.
  - **Other alarm devices**:
    - keypad
    - contact and motion sensors
    - flood/freeze sensor
    - smoke/CO listener
    - First Alert and Kidde smoke/CO
    - Zooz valves
    - Retro Kit
    - range extender
    - external siren
    - third-party Z-Wave locks (not Wi-Fi/Amazon Key locks), switches, dimmers, fans and thermostats
  - **Cameras**: motion and ding events, lights, siren, and snapshots on motion or at an interval. Live RTSP streams start on demand or via MQTT. "Recorded event streams via RTSP (playback of last 5 motion/ding recorded events)". Also a Video Mode select, battery and Wi-Fi status.
  - **Chimes**: volume, play sounds and snooze.
  - **Intercom**: ding, lock state and unlock, with "no video/audio streaming".
  - **Smart lighting**: 1st gen only ("2nd Gen Smart Lighting, based on Amazon Sidewalk, is not currently supported").
  - **Location modes**: shown as an alarm panel.

  — [ring-mqtt wiki](https://github.com/tsightler/ring-mqtt/wiki)
- Explicit non-goal: the project does not turn cameras into 24x7 CCTV. Using it with Frigate, Zoneminder or other NVRs causes "loss of motion/ding events while streaming (Ring cameras only send alerts when they are not actively streaming/recording)", and such issues "will be locked and deleted". — [ring-mqtt wiki](https://github.com/tsightler/ring-mqtt/wiki)
  - Note: a 2026-10-23 README commit, "Clarify limitations of Ring device usage", *removed* the continuous-streaming/NVR paragraphs from the README. That README text had also warned of "quickly drained batteries, and potential device overheating". The non-goal is now stated only in the wiki. — [README commit history](https://github.com/tsightler/ring-mqtt/commits/main/README.md)
- Release history, all as GitHub releases:
  - [v5.8.1](https://github.com/tsightler/ring-mqtt/releases/tag/v5.8.1), 2025-05-11: "Update ring-client-api to address a recent Ring API change which caused socket connections to fail and crash".
  - [v5.9.0/5.9.1](https://github.com/tsightler/ring-mqtt/releases/tag/v5.9.1), 2025-12-04: experimental Ring Video Intercom (no video) and Kidde Smoke/CO detection.
  - [v5.9.2](https://github.com/tsightler/ring-mqtt/releases/tag/v5.9.2), 2025-12-12: MQTT discovery workaround.
  - [v5.9.3](https://github.com/tsightler/ring-mqtt/releases/tag/v5.9.3), 2026-03-09: "patched push-receiver package to address push messages failing decryption with ERR_CRYPTO_ECDH_INVALID_PUBLIC_KEY... potentially leading to missed motion/ding events", plus a Sidewalk-only-device crash fix. It bundles `ring-client-api 14.3.1-beta.0 (custom)` and Go2RTC 1.9.14.
- The v5.9.3 dependency set on `main` uses a **fork**, `"@tsightler/ring-client-api": "^14.3.1-beta.0"`, alongside `werift`, `aedes` and `mqtt`. — [package.json (main)](https://github.com/tsightler/ring-mqtt/blob/main/package.json)
- **v6.0.0 (dev branch, "Release v6.0.0" commit 2026-10-19, not yet tagged)**:
  - "entirely re-written video streaming pipeline using a custom Ring WebRTC-to-RTSP gateway service written in go", with "native H.265 2K/4K streams".
  - New Video Mode setting: `Compatible` (H.264) vs `Optimal` (H.265).
  - "no longer depends on the upstream ring-client-api... modified to use newer Ring v3 API for location and device discovery which is required for some newer devices as well as the new shared permissions model".
  - Removed aedes ("internal MQTT broker is gone"), `@homebridge/camera-utils`, werift and the go2rtc binary.

  — [CHANGELOG.md (dev)](https://github.com/tsightler/ring-mqtt/blob/dev/docs/CHANGELOG.md); [dev commits](https://github.com/tsightler/ring-mqtt/commits/dev)

### Inferences
- ring-mqtt forking, and in v6 abandoning, `ring-client-api` suggests the upstream library is not keeping pace with Ring's v3 API and new device types. A new bridge that wraps `ring-client-api` may inherit that lag.
- The MQTT topic model, with discovery and per-device topics, is already a de facto "Ring event bus". An MCP server could subscribe to ring-mqtt's MQTT and get events, alarm control and RTSP without touching Ring auth itself. sandraschi/ring-mcp already does this for Alarm (see §6).
- Because the tool is Linux/Docker-only, a Windows-hosted MCP that composes over ring-mqtt needs a container or WSL.

### Gaps
- No v6.0.0 GitHub release, tag or Docker image date was found. Treat the v6 features as pending.
- Maintainer bus factor: the project is effectively single-maintainer (tsightler), but no primary statement about future maintenance was found.

---

## 3. homebridge-ring / ring-client-api (dgreif)

### Takeaway
`dgreif/ring` is the reference unofficial Ring API implementation. It is a TypeScript monorepo containing the `ring-client-api` npm library and the Homebridge-verified `homebridge-ring` plugin, which bridges Ring Alarm, cameras (snapshot plus live view with two-way audio) and smart lighting to HomeKit. It is maintained at a "maintenance" cadence: the last release was 14.3.0 on 2026-02-08, and recent commits are mostly dependency bumps plus a streaming keepalive fix in Oct 2026.

### Cited Findings
- Repo stats (2026-10-23): 1,532 stars, MIT, TypeScript, 46 open issues, last push 2026-10-22. — [dgreif/ring](https://github.com/dgreif/ring)
- Releases: `ring-client-api@14.3.0` and `homebridge-ring@14.3.0` on 2026-02-08, 14.2.0 on 2025-11-11, 14.1.0 on 2025-09-27. — [dgreif/ring releases](https://github.com/dgreif/ring/releases); [npm homebridge-ring](https://www.npmjs.com/package/homebridge-ring) (latest 14.3.0, modified 2026-02-08)
- Recent commits:
  - 2026-10-06: "reply to server ping keepalives with pong to prevent 30s stream disconnect" ([#1834](https://github.com/dgreif/ring/pull/1834)).
  - 2026-09-23: undici 8, "drop Node 20", TypeScript 7.0.2.
  - Otherwise dependabot bumps.

  — [dgreif/ring commits](https://github.com/dgreif/ring/commits/main)
- `ring-client-api` scope: an "unofficial TypeScript api for Ring Doorbells, Ring Cameras, the Ring Alarm System, Ring Smart Lighting, and third party devices that connect to the Ring Alarm System". Auth uses a `refreshToken` generated with `ring-auth-cli`. Location APIs are `disarm()`, `armHome()`, `armAway()`, `getAlarmMode()`, `soundSiren()`, `getHistory()` and `getCameraEvents()`. Options include `cameraStatusPollingSeconds` (no polling by default) and `avoidSnapshotBatteryDrain`. — [ring-client-api README](https://github.com/dgreif/ring/tree/main/packages/ring-client-api)
- `homebridge-ring` features:
  - Homebridge Verified and HOOBS Certified.
  - Supports doorbells, cameras, Ring Alarm, Smart Lighting and third-party alarm devices.
  - Camera feed shows a snapshot (with battery-cam limitations) and a "live feed... supports video and 2-way audio" via ffmpeg with `libfdk_aac`.
  - Options include `showPanicButtons`, `nightModeBypassFor`, `alarmOnEntryDelay`, `hideDoorbellSwitch` (a programmable switch for ding automations) and `cameraStatusPollingSeconds` (default 20).
  - Supports "ONVIF cameras connected via Ring Edge".

  — [homebridge-ring README](https://github.com/dgreif/ring/tree/main/packages/homebridge-ring)
- Most-discussed issues, all-time and therefore historical:
  - [#1083](https://github.com/dgreif/ring/issues/1083) Ring Intercom integration (122 comments, 2022).
  - [#1218](https://github.com/dgreif/ring/issues/1218) "Push notifications stop after ~24 hours" (107, 2023).
  - [#497](https://github.com/dgreif/ring/issues/497) and [#1506](https://github.com/dgreif/ring/issues/1506) "failing to reach ring server" (2020; 2024).
  - [#860](https://github.com/dgreif/ring/issues/860) HomeKit Secure Video.
  - [#237](https://github.com/dgreif/ring/issues/237) 2-way audio via HomeKit.
  - [#1124](https://github.com/dgreif/ring/issues/1124) no snapshot update.
  - [#1633](https://github.com/dgreif/ring/issues/1633) unable to add cameras after update (2025-07).

  — [GitHub issue search](https://github.com/dgreif/ring/issues?q=sort%3Acomments-desc)

### Inferences
- `ring-client-api` is the richest library for an MCP that needs Alarm control, but two signals point to upstream lag: ring-mqtt needed a custom 14.3.1-beta fork for the push-decryption fix, and then moved to its own client.
- The MIT license, compared with python-ring-doorbell's LGPL-3.0, makes ring-client-api the less encumbered library to wrap.

### Gaps
- No public statement from dgreif on long-term maintenance or a v3 API migration was found.

---

## 4. Scrypted Ring plugin (koush/scrypted)

### Takeaway
Scrypted's Ring plugin bridges Ring cameras, with HomeKit Secure Video, and many Alarm and lighting devices into HomeKit. It uses a vendored fork of ring-client-api. The Scrypted core is very active (v0.147.0, 2026-09-13), but **the Ring plugin itself has not changed since 2025-06-14**. Its docs warn hard against prebuffer and persistent streaming because they kill motion events.

### Cited Findings
- Core repo: 6,021 stars, TypeScript, license reported as NOASSERTION, releases v0.147.0 (2026-09-13) and v0.145.0 (2026-09-02). — [koush/scrypted](https://github.com/koush/scrypted); [v0.147.0](https://github.com/koush/scrypted/releases/tag/v0.147.0)
- Plugin purpose and supported devices:
  - The plugin "bridges compatible Ring Cameras in Scrypted to HomeKit".
  - Camera list: Video Doorbell Wired/Pro/Pro 2/4/3/2nd Gen, Floodlight Cam Wired Plus/Pro, Spotlight Cam, Indoor Cam and Stick-Up Cam.
  - Other devices:
    - Security Panel and Location Modes
    - Contact, Retrofit, Tilt, Glassbreak, Motion, Flood/Freeze, Water and Mailbox sensors
    - Smart Locks
    - Ring Smart Lights
    - Lights, Switches and Outlets

  — [plugins/ring README](https://github.com/koush/scrypted/tree/main/plugins/ring)
- Video caveats from the same README:
  - "Do not enable prebuffer on Ring cameras... The persistent live stream will cause motion event delivery to stop functioning... drain the battery".
  - Turn off "PAM DIFF", "OPEN CV" and prebuffer.
  - HKSV recording does not require a paid Ring plan.
  - "Recording in HKSV starts few seconds after recording in Ring app" because of the cloud event relay.

  — [plugins/ring README](https://github.com/koush/scrypted/tree/main/plugins/ring)
- The plugin depends on `"@koush/ring-client-api": "file:../../external/ring-client-api"`, a vendored fork, at version 0.0.145. — [plugins/ring/package.json](https://github.com/koush/scrypted/blob/main/plugins/ring/package.json)
- Recent plugin activity: last commit 2025-06-14, "ring: fix startup crash due to server changes". Before that came push-receiver and heartbeat updates in Sept 2024. npm `@scrypted/ring` latest is 0.0.145, modified 2025-06-14. — [plugins/ring commits](https://github.com/koush/scrypted/commits/main/plugins/ring); [npm @scrypted/ring](https://www.npmjs.com/package/@scrypted/ring)

### Inferences
- Scrypted's video path converts Ring's cloud WebRTC into HomeKit streams and HKSV recordings. The README's own wording ("persistent live stream") confirms Ring video is session-based. HKSV works because Scrypted starts a session only on a Ring motion event.
- The Ring plugin should be flagged as **stale** (16 months without changes). The ring-mqtt v5.9.3 push-decryption fix is not reflected there.

### Gaps
- Not verified: whether the plugin exposes Ring video over WebRTC to non-HomeKit consumers (for example Scrypted NVR or the Scrypted HA integration). The README covers only HomeKit.

---

## 5. Other integrations, platforms and libraries (Hubitat, openHAB, Node-RED, Domoticz, SmartThings, IFTTT, Alexa, Google Home, go2rtc, Frigate, other-language libs) and the new official Ring Partner API

### Takeaway
Beyond HA, Homebridge, ring-mqtt and Scrypted, coverage is thin or stale, with two notable exceptions:
- **go2rtc** gained a native Ring source in v1.9.13 (Dec 2025), with two-way audio and snapshots.
- **Hubitat** shipped an official built-in Ring integration in 2.5.0 (May 2026).

openHAB's Java binding is "experimental" with no live video, but it moved to FCM push in July 2026. Node-RED nodes, the .NET library and the Hubitat community driver are stale. IFTTT offers only 2 Ring triggers and 0 actions. Separately, **Ring launched an official developer platform in 2026, the Ring Partner API (`api.amazonvision.com`)**, with OAuth, webhooks, snapshots, event history and WHEP live video. It is the first sanctioned path. Its write/control scope is unclear:
- Lock control is explicitly absent.
- Alarm arm/disarm is not documented.
- Sensor data appears to be in Early Access.
- Chime actuation is hinted at but unverified.
- Lights and siren are undocumented.

### Cited Findings
**Hubitat**
- The built-in Ring integration arrived in Hubitat Elevation 2.5.0 (press release dated 2026-05-19). It covers "Ring doorbells, cameras, lights, sirens, and chimes", says more devices will come later, and "relies on Ring's cloud services". The release does not mention Alarm. — [IPS News (vendor press release)](https://ipsnews.net/business/2026/05/19/hubitat-elevation-2-5-0-update-adds-ring-integration-to-power-smarter-home-automation/)
- The Hubitat docs page exists but did not render for extraction. Search snippets say it is cloud-based and "in beta". — [Hubitat docs: Ring Integration](https://docs2.hubitat.com/en/apps/ring-integration)
- The community "Unofficial Ring Integration" was originally by codahq. Its original thread was withdrawn and a fork was re-released. The current repo is `HubitatCommunity/hubitat_ring_integration` (Apache-2.0, 37 stars), last commit 2024-12-26 ("Bump beta version"). Alarm and Beams need a separate WebSocket "API" device. — [HubitatCommunity/hubitat_ring_integration](https://github.com/HubitatCommunity/hubitat_ring_integration); [Hubitat community re-release thread](https://community.hubitat.com/t/re-release-hubitat-ring-integration-unofficial/43619)

**openHAB**
- The Ring binding is "an experimental binding to the Ring.com API". It discovers Video Doorbells, Stick Up Cams, Chimes and "Other" (intercom). It "does _not_ support live video streaming, but you can view recorded videos". Config takes username, password and `twofactorCode`. Event channels are url, createdAt, kind (motion/ding), doorbotId and extendedDescription (person/vehicle recognition). The README does not mention Alarm. — [openHAB Ring binding README](https://github.com/openhab/openhab-addons/tree/main/bundles/org.openhab.binding.ring)
- Recent activity: on 2026-07-26 the binding moved to "Use Firebase Cloud Messaging instead of polling to receive new events" ([#21019](https://github.com/openhab/openhab-addons/pull/21019)). On 2026-06-15 it got "Fix multiple stability issues" ([#20943](https://github.com/openhab/openhab-addons/pull/20943)). The repo license is EPL-2.0. — [binding commits](https://github.com/openhab/openhab-addons/commits/main/bundles/org.openhab.binding.ring)

**Node-RED**
- `@realsixi/node-red-contrib-ring-alarm` 0.0.19 uses ring-client-api, with nodes for Device Listener, Alarm Mode Listener, Camera Motion, Alarm Status, Alarm Mode and Camera. The author calls it "a first draft". npm last modified 2023-04-12, so it is **stale**. — [Node-RED flows page](https://flows.nodered.org/node/@realsixi/node-red-contrib-ring-alarm); [npm](https://www.npmjs.com/package/@realsixi/node-red-contrib-ring-alarm)
- `node-red-contrib-ringdoorbell` 2.0.0 was last modified on npm on 2022-05-11, so it is **stale**. A 2021 forum thread reported no working node under Ring's newer auth. — [flows.nodered.org](https://flows.nodered.org/node/node-red-contrib-ringdoorbell); [Node-RED forum](https://discourse.nodered.org/t/ring-doorbell-is-there-a-working-contrib-node/47572)
- ring-mqtt topics are "easy to use with MQTT tools like Node-RED". — [ring-mqtt wiki](https://github.com/tsightler/ring-mqtt/wiki)

**SmartThings** (low confidence, forum evidence only, roughly 2019–2023)
- Users report that some Ring cameras appear as motion sensors usable in automations, live video often shows "camera is unavailable", only a few camera models are compatible, and Ring Alarm sensors do not appear in SmartThings. — [SmartThings community thread 158697](https://community.smartthings.com/t/ring-floodlight-camera-works-with-smartthings-not-100/158697); [thread 176182](https://community.smartthings.com/t/ring-camera-debacle-some-newer-models-don-t-work-with-smartthings/176182); [thread 206465](https://community.smartthings.com/t/ring-alarm-integration-with-st/206465)

**IFTTT (official Ring service)**
- Triggers are "New Ring Detected" and "New Motion Detected", both realtime and "normally run within a few seconds". Queries are History of Ring Detections and History of Motion Detections (Pro+). **Actions: 0.** Ring Shared accounts can't create Applets. — [IFTTT Ring service](https://ifttt.com/ring)
  - The realtime claim is contradicted by an IFTTT connect page surfaced in search, which describes "New Ring Detected" as a polling trigger: every 5 minutes for Pro/Pro+ users and every hour for Free users. — [IFTTT connect page (Hubitat + Ring)](https://ifttt.com/connect/hubitat/ring) (via search snippet; the exact page carrying the text was not confirmed). The ifttt.com/ring service page is the more authoritative source.
- An IFTTT MCP endpoint exists; a third-party proxy describes it as OAuth 2.1 + PKCE over Streamable HTTP. — [maishsk/ifttt-mcp-proxy](https://github.com/maishsk/ifttt-mcp-proxy)

**Amazon Alexa**
- Alexa routines can be triggered by Ring device events (motion, doorbell press) once the Ring skill is linked. Actions include Alexa announcements. — [Ring support: Creating a Routine with Alexa](https://ring.com/support/articles/g6hqn/Creating-a-Routine-with-Alexa-and-your-Ring-Device)
- Routines can be triggered by doorbell press or motion, including "motion isn't detected" for a period. — [Pocket-lint](https://www.pocket-lint.com/smart-home/news/ring/146966-how-to-create-alexa-routines-for-ring-video-doorbell); a person-detected trigger with a time window is described by [Insteon blog](https://www.insteon.com/blogs/news/bright-idea-use-your-video-doorbell-to-turn-on-the-lights)
- The Ring Alexa skill lists Ring Alarm arm/disarm (defaulting to Home mode) and routines with contact and motion sensors. — [Amazon Ring skill listing](https://skills-store.amazon.com/deeplink/dp/B01JTL2PYE) (via search summary, not fetched directly)
- Alexa+ uses MCP for third-party experiences. Hackathon projects describe MCP as "the open standard Alexa+ uses for third-party experiences" and say that Alexa+ "add-on tooling is partner-only". — [Dakshhhhh-ops/nova](https://github.com/Dakshhhhh-ops/nova); [hash066/stoop](https://github.com/hash066/stoop)

**go2rtc (native Ring source)**
- "Ring... `new in v1.9.13` by @seydx. This source type supports Ring cameras with two-way audio support." Config is `ring:?device_id=XXX&refresh_token=XXX`, and adding `&snapshot` gives a snapshot stream. Accounts can be added through the WebUI. — [go2rtc internal/ring README](https://github.com/AlexxIT/go2rtc/blob/master/internal/ring/README.md)
- v1.9.13 was published 2025-12-14 and the latest is v1.9.14 (2026-01-19). The Go implementation lives in `pkg/ring` (`api.go, client.go, snapshot.go, ws.go`), with its first commit on 2025-01-24. License MIT, 14,466 stars. — [go2rtc v1.9.13](https://github.com/AlexxIT/go2rtc/releases/tag/v1.9.13); [pkg/ring commits](https://github.com/AlexxIT/go2rtc/commits/master/pkg/ring)

**Frigate**
- No native Ring support was found in the Frigate repo. A code search for "ring-mqtt" returned no hits. — [blakeblackshear/frigate](https://github.com/blakeblackshear/frigate)
- ring-mqtt explicitly calls Frigate/NVR use "not a supported use case" because events are lost during streaming. — [ring-mqtt wiki](https://github.com/tsightler/ring-mqtt/wiki)

**Other-language libraries**
- **python-ring-doorbell** (Python, LGPL-3.0, 704 stars, 48 open issues):
  - Last release 0.9.14 on 2026-02-28. The previous one was 0.9.13 on 2024-11-26, and the last code commit was 2026-02-28.
  - Has an async API, 2FA via `Requires2FAError` plus an OTP callback, a `RingEventListener` for push, and a CLI (`ring-doorbell listen`, in-home chime control, raw query).
  - The longest-standing open issue is [#23 "Feature request: Live view proxy"](https://github.com/python-ring-doorbell/python-ring-doorbell/issues/23), open since 2017 with 81 comments.

  — [repo](https://github.com/python-ring-doorbell/python-ring-doorbell); [0.9.14 release](https://github.com/python-ring-doorbell/python-ring-doorbell/releases/tag/0.9.14); WebRTC answer fix [#491](https://github.com/python-ring-doorbell/python-ring-doorbell/pull/491) (2025-12-15)
- **KoenZomers.Ring.Api** (C#):
  - ".NET 8 will allow you to easily communicate with the Ring API and retrieve details about your Ring doorbells and Ring chimes". Companion tools download recordings and snapshots.
  - Last version 1.0.0.0 was released Oct 23, 2024, and the last push was 2024-11-02, so it is **stale**.
  - 43 stars. The GitHub API reports no license, but the README shows an MIT badge, so the license is unclear.

  — [KoenZomers/RingApi](https://github.com/KoenZomers/RingApi); [NuGet 1.0.0.0](https://www.nuget.org/packages/KoenZomers.Ring.Api/1.0.0.0)
- **Dart/Flutter port**: `sjhorn/ring_client_api` (pushed 2026-01-18), plus `sjhorn/ring_camera` for WebRTC. — [sjhorn/ring_client_api](https://github.com/sjhorn/ring_client_api); [sjhorn/ring_camera](https://github.com/sjhorn/ring_camera)
- Old or dead: `Stephanvs/Ring.com` (C#, 2017). — [Stephanvs/Ring.com](https://github.com/Stephanvs/Ring.com)
- **Go**: go2rtc's `pkg/ring` is the de facto Go implementation ([go2rtc pkg/ring](https://github.com/AlexxIT/go2rtc/tree/master/pkg/ring)). **Java**: the openHAB binding ([openHAB Ring binding](https://github.com/openhab/openhab-addons/tree/main/bundles/org.openhab.binding.ring)). No standalone Rust library was found in GitHub repo searches. — [GitHub search "ring doorbell rust"](https://github.com/search?q=ring+doorbell+rust&type=repositories)

**Official Ring Partner API (context for MCP decisions; new in 2026)**
- What the developer site says:
  - The Ring Developer Program targets "the new Ring Appstore" and lets "third-party developers to build, test, launch, monetize" apps.
  - The documented WHEP endpoint is `https://api.amazonvision.com/v1/devices/{deviceId}/media/streaming/whep/sessions`.
  - Data covers motion events with human/animal/vehicle classification, doorbell presses, device status and event history. Live video is WebRTC (WHEP) and RTSP.
  - Webhooks are HMAC-signed.
  - Auth is OAuth-style authorization code exchanged for a bearer token.
  - App certification includes a Privacy and Security questionnaire.
  - "Compatible Ring subscription required."
  - Banner: "Ring APIs & AI-Assisted Development Now Available".

  — [developer.ring.com](https://developer.ring.com)
- Amazon's starter repo `AmazonAppDev/ring-api-helloworld` was created 2026-02-13 (18 stars). It covers List Devices, Device Status, Capabilities, Location, Configurations, Event History and User Profile, plus a Next.js live-video app. Developer Playground tokens last about 30 minutes. — [AmazonAppDev/ring-api-helloworld](https://github.com/AmazonAppDev/ring-api-helloworld)
- "The Ring Partner API has no lock control". Hackathon apps use Image Snapshots, Live Video (WHEP), Event History and partner webhooks. The context was the "Amazon Developer Hackathon 2026 — Ring track". — [jiarong0423/ring-home-mcp-hub](https://github.com/jiarong0423/ring-home-mcp-hub)
- There are signs of an "Early Access sensor scope (flood, f…)" for some sensors. — [JonathanSolvesProblems/ringwire](https://github.com/JonathanSolvesProblems/ringwire) (repo description)
- One Partner API app is described as a "caretaking app that knocks with the chime". That hints at some chime actuation through the Partner API. It is unverified. — [kevin9327/still-here](https://github.com/kevin9327/still-here) (repo description)
- developer.ring.com lists "access controls" among the available data, without defining the term. — [developer.ring.com](https://developer.ring.com)

### Inferences
- The Partner API changes the build calculus. It is sanctioned and OAuth-based, with webhooks for events and WHEP for video, so token fragility and ToS risk drop. On the evidence above:
  - Lock control is explicitly absent.
  - Alarm arm/disarm is undocumented.
  - Sensor reads appear to be Early Access.
  - Chime actuation is possible but unverified.
  - Lights and siren are undocumented.

  Alarm arm/disarm and locks therefore most likely still require the unofficial API family.
- go2rtc's Ring source is a ready, MIT-licensed, Go-based "Ring video → RTSP/WebRTC" component that an MCP can use for snapshots and clips without writing WebRTC code.

### Gaps
- **Domoticz**: no Ring integration was researched or found; check its plugin list.
- **Google Home**: no source found on current Ring and Google Home interoperability.
- **Partner API**: the official launch date and GA vs. early-access status were not found. Rate limits, pricing and whether individuals (not only certified partners) can get production OAuth credentials are also unknown.
- **Partner API write/control scope is unverified.** The API reference was not read endpoint-by-endpoint, so it is unknown whether alarm mode, chime, siren, lights or camera settings can be written. Only "no lock control" is stated in a source.
- Hubitat built-in: device-level details (alarm, video) are unverified because the docs page did not render.
- Alexa: the current set of Ring triggers in Alexa routines (2026) is not confirmed from first-party Amazon docs.

---

## 6. Existing MCP servers for Ring (direct) and indirect paths (Ring → hub → MCP)

### Takeaway
No mature, widely adopted Ring MCP server exists.
- **Official MCP registry**: zero Amazon-Ring servers.
- **Unofficial-API servers (consumer Ring account)**: three small ones:
  - `jpcors/ring-mcp`: ring-client-api 11.x, stale since 2025-07.
  - `sandraschi/ring-mcp`: python-ring-doorbell plus ring-mqtt, WIP and unpublished.
  - `@striderlabs/mcp-ring`: browser automation.
- **Official Ring Partner API servers**: two generic ones, `ring-partner-mcp` (read-only) and `ring-vision-mcp` (WHEP signaling), both created Sept–Oct 2026 with 0 stars.
- **Hackathon apps**: several, which are use-case apps rather than bridges.

The strongest indirect path is **Ring → Home Assistant → MCP**: HA's core `mcp_server`, or the very popular community `ha-mcp` (5.2k stars, which has a camera-image tool). It inherits HA core's lack of Ring Alarm unless ring-mqtt is added.

### Cited Findings
**Registry and catalog sweep (2026-10-23)**
- **Official MCP registry** (`registry.modelcontextprotocol.io`, `search=ring`): all 6 pages, 562 entries, were scanned. There were **no Amazon Ring servers**. Ring-named hits were Oura Ring servers, `q-ring` (keychain) and `online.webring`. HA-related entries were `io.github.homeassistant-ai/ha-mcp` (many versions up to 8.x), `io.github.daedalus/mcp-homeassistant` and `io.github.Koneisto/HomeAssistant-Light-MCP`. — [MCP Registry API](https://registry.modelcontextprotocol.io/v0/servers?search=ring)
- **Glama**: 8 Ring-related servers: ring-partner-mcp, ring-vision-mcp, Ring Home MCP Hub, KinGuard, Stoop, Nova, AccessBell and jpcors Ring MCP Server. — [Glama search "ring doorbell"](https://glama.ai/mcp/servers?query=ring%20doorbell)
- **LobeHub** lists jpcors/ring-mcp. — [LobeHub jpcors-ring-mcp](https://lobehub.com/de/mcp/jpcors-ring-mcp)
- **Smithery** and **PulseMCP**: no Amazon-Ring server on the first results page; later pages were not checked. — [Smithery search](https://smithery.ai/search?q=ring%20doorbell); [PulseMCP search](https://www.pulsemcp.com/servers?q=ring)
- **punkpeye/awesome-mcp-servers**: no Ring (doorbell) entries, only Oura Ring entries. — [awesome-mcp-servers README](https://github.com/punkpeye/awesome-mcp-servers)
- **PyPI**: `ring-mcp`, `ring-mcp-server`, `mcp-ring` and `ring-doorbell-mcp` all return not found. **npm**: `ring-vision-mcp` and `ring-partner-mcp` are not published; `@striderlabs/mcp-ring` 1.0.0 is published (2026-03-16). — [PyPI](https://pypi.org/project/ring-mcp/); [npm @striderlabs/mcp-ring](https://www.npmjs.com/package/@striderlabs/mcp-ring)
- **Excluded name collisions**, which are not Amazon Ring:
  - mitchhankins01/oura-ring-mcp and other Oura servers
  - stanleytejakusuma/ring-mcp (actually Oura)
  - drgost1/ring-mcp (Claude Code notification popups)
  - RingCentral and Ringover servers
  - azzeddine2017/Ring_MCP_SDK (MCP SDK for the Ring programming language)
  - Elden Ring servers

  — [GitHub repo search "ring mcp"](https://github.com/search?q=ring+mcp&type=repositories)

**Direct, unofficial consumer-account API**
- **jpcors/ring-mcp** (TypeScript):
  - Tools: `list_devices`, `get_device_info`, `arm_disarm_alarm(locationId, mode: home|away|disarmed)`, `get_camera_snapshot`, `turn_light_on_off` and `monitor_events(duration=30s)`.
  - Auth: refresh token from CLI, env or `ring-config.json`, or interactive `ring-auth-cli`. It auto-saves rotated tokens.
  - Deps: `ring-client-api ^11.7.5` and `@modelcontextprotocol/sdk ^0.5.0`.
  - 4 stars, 2 forks, **no license**. Created 2025-07-16, last push 2025-07-21.

  — [jpcors/ring-mcp](https://github.com/jpcors/ring-mcp); [package.json](https://github.com/jpcors/ring-mcp/blob/main/package.json)
- **sandraschi/ring-mcp** (Python):
  - Built on FastMCP 3.4, MIT, version 1.0.4, 2 stars. Created 2025-09-20, last push 2026-10-13.
  - Deps: `ring-doorbell>=0.8.0`, plus `paho-mqtt` for an "Optional ring-mqtt (Ring Alarm) MQTT bridge" (`ring_mqtt_bridge.py`), plus FastAPI.
  - Claimed tools:
    - Cameras and doorbell: `get_camera_status`, `stream_all_cameras`, `get_doorbell_live_stream`, `answer_doorbell_call` (two-way audio), `get_visitor_history`, `configure_motion_detection`
    - Security: `arm_security_system`, `disarm_security_system`
    - Fire safety: `get_fire_alarm_status`, `test_fire_safety_system`
    - Automation: `trigger_emergency_protocol`, `schedule_security_modes`
  - Self-labels "Status: Production Ready". Recent commits are auto-generated "wip(auto)". The README says `uvx ring-mcp`, but the package is not on PyPI.

  — [sandraschi/ring-mcp](https://github.com/sandraschi/ring-mcp); [pyproject.toml](https://github.com/sandraschi/ring-mcp/blob/master/pyproject.toml); [Quick reference](https://github.com/sandraschi/ring-mcp/blob/master/docs/RING_MCP_QUICK_REFERENCE.md)
- **sandraschi/devices-mcp** (Python, beta, 4 stars, pushed 2026-10-13): a multi-vendor IoT MCP with a "Ring (doorbell + alarm + WebRTC live view + two-way intercom)" claim, built on `ring-doorbell>=0.7.0,<1.0.0`. It says it is "Not production-hardened". — [sandraschi/devices-mcp](https://github.com/sandraschi/devices-mcp)
- **markswendsen-code/mcp-ring** (`@striderlabs/mcp-ring` 1.0.0):
  - Uses **browser automation** with the dependency `patchright`, not a Ring library.
  - Tools:
    - Session: `ring_status`, `ring_login` ("User must complete login manually (including 2FA)"), `ring_confirm_login`, `ring_logout`
    - Devices and media: `ring_get_devices`, `ring_get_doorbell_history`, `ring_get_camera_snapshot`, `ring_get_recordings` (requires Ring Protect), `ring_toggle_light`
    - Alarm: `ring_arm_alarm` and `ring_disarm_alarm`, both requiring `confirm=true`; `ring_get_alarm_status`
  - Declares `mcpName: io.striderlabs/ring` but is absent from the official registry. 0 stars, no license, single drop on 2026-03-15.

  — [markswendsen-code/mcp-ring](https://github.com/markswendsen-code/mcp-ring); [src/index.ts](https://github.com/markswendsen-code/mcp-ring/blob/main/src/index.ts)

**Direct, official Ring Partner API**
- **inslot2525-ctrl/ring-partner-mcp** (TypeScript, MIT, created 2026-10-19): "MCP server for the Ring Partner API: devices, events and snapshots for AI agents". "All tools are read-only (`readOnlyHint: true`)". It authenticates with a `RING_ACCESS_TOKEN` from the Ring Developer Playground, valid for 30 minutes. — [ring-partner-mcp](https://github.com/inslot2525-ctrl/ring-partner-mcp)
- **SwaggyXO/ring-vision-mcp** (TypeScript, MIT, created 2026-09-06, last push 2026-09-07):
  - Built on "the official 2026 Amazon Vision Partner API (`api.amazonvision.com`)".
  - Capabilities: device discovery, connectivity status, event history, diagnostics, and "WebRTC (WHEP) live-view session signaling".
  - Auth: Playground token or production OAuth 2.0 client credentials with refresh.
  - Resolves friendly device names, hides diagnostics behind `--extended`, and has a `--mock` mode.
  - The README shows `npx -y ring-vision-mcp`, but the package is not on npm.

  — [ring-vision-mcp](https://github.com/SwaggyXO/ring-vision-mcp)
- **Hackathon use-case MCP servers** on the Partner API (Amazon Developer Hackathon 2026, Ring and Alexa+ tracks), all Oct 2026 with 0 stars:
  - `jiarong0423/ring-home-mcp-hub`: approval-gated "AI agents can only ask", Streamable HTTP, protocol 2025-11-25, plus a WHEP live view in the approval banner.
  - `duynguyendang/aws-access-bell`: 11 tools, Ring webhook v1.1 with HMAC.
  - `Dakshhhhh-ops/nova`: 25+ tools, MCP Apps, OAuth 2.1.
  - `piyush0213/kinguard-alexa-mcp`
  - `hash066/stoop`

  — [ring-home-mcp-hub](https://github.com/jiarong0423/ring-home-mcp-hub); [aws-access-bell](https://github.com/duynguyendang/aws-access-bell); [nova](https://github.com/Dakshhhhh-ops/nova); [kinguard-alexa-mcp](https://github.com/piyush0213/kinguard-alexa-mcp); [stoop](https://github.com/hash066/stoop)
- **Partner API client libraries** (Sept–Oct 2026, 0 stars each):
  - `G-ojies/ring-partner-kit` and `pswapnajit/ring-partner-kit` (TypeScript)
  - `jacklachan/ring-partner-py`, `DrunkWiz/ring-client` and `JonathanSolvesProblems/ringwire` (Python)
  - `bayraktartahsin/ring-webhook-kit` and `mikey92/ring-webhook-kit` (webhook verification)

  — [GitHub search "ring partner api"](https://github.com/search?q=ring+partner+api&type=repositories)

**Indirect: Ring → Home Assistant → MCP**
- **HA core `mcp_server`**:
  - Introduced in HA 2025.2.
  - Exposes the tools of the configured LLM API (Assist), plus prompts. When `GetLiveContext` is available it also exposes a resource, `homeassistant://assist/context-snapshot`.
  - HTTP endpoint is `/api/mcp`. Auth is OAuth 2.0 with PKCE and Client ID Metadata Documents. Admin accounts are required by default.
  - Clients can only see and control "entities that are exposed" to Assist.
  - **"Not supported: Sampling and Notifications."**

  — [HA MCP Server docs](https://www.home-assistant.io/integrations/mcp_server/)
- `mcp_server` manifest: `quality_scale: silver`, `iot_class: local_push`, `requirements: mcp==2.3.0`, codeowner @allenporter. — [mcp_server manifest](https://github.com/home-assistant/core/blob/dev/homeassistant/components/mcp_server/manifest.json)
- **homeassistant-ai/ha-mcp** (Python, MIT, 5,182 stars, pushed 2026-10-23):
  - 87 tools in 29 categories, including `ha_get_camera_image`, `ha_get_history`, `ha_get_logs`, automation CRUD and `ha_call_event`.
  - Installs as a HACS custom component (recommended), an HA add-on, Docker or `uvx ha-mcp@latest`.
  - Streamable HTTP is the main transport; "The stdio transport has connection problems".
  - The latest stable release is **v8.7.0 (2026-10-14)**, with 9.0.0.dev pre-releases dated 2026-10-23. The README mentions a 9.0.0 date of "October 28, 2026", which is in the future and should be disregarded.

  — [ha-mcp](https://github.com/homeassistant-ai/ha-mcp); [v8.7.0](https://github.com/homeassistant-ai/ha-mcp/releases/tag/v8.7.0); [tools_camera.py](https://github.com/homeassistant-ai/ha-mcp/blob/master/src/ha_mcp/tools/tools_camera.py)
- Other HA MCP servers:
  - voska/hass-mcp: 349 stars, MIT, v0.6.0 on 2026-08-06.
  - tevonsb/homeassistant-mcp: 576 stars, TypeScript, last push 2026-01-25.
  - Coolver/home-assistant-vibecode-agent: 644 stars.
  - allenporter/mcp-server-home-assistant: **archived**; the same author owns the core `mcp_server`.

  — [voska/hass-mcp](https://github.com/voska/hass-mcp); [tevonsb/homeassistant-mcp](https://github.com/tevonsb/homeassistant-mcp); [Coolver/home-assistant-vibecode-agent](https://github.com/Coolver/home-assistant-vibecode-agent); [allenporter/mcp-server-home-assistant](https://github.com/allenporter/mcp-server-home-assistant)
- Other hub MCP servers that could reach Ring indirectly are all small, mostly under 25 stars:
  - openHAB: `tdeckers/openhab-mcp` (25 stars)
  - Hubitat Maker API: `abeardmore/hubitat-mcp`, `rfhayn/hubitat-mcp-server`
  - SmartThings: `langowarny/smartthings-mcp` (Go)
  - Homey: `pigmej/python-homey-mcp`

  — [tdeckers/openhab-mcp](https://github.com/tdeckers/openhab-mcp); [abeardmore/hubitat-mcp](https://github.com/abeardmore/hubitat-mcp); [langowarny/smartthings-mcp](https://github.com/langowarny/smartthings-mcp); [pigmej/python-homey-mcp](https://github.com/pigmej/python-homey-mcp)

### Inferences
- jpcors/ring-mcp pins ring-client-api 11.x, which predates the 14.0 fix for Ring's 2025 socket change (see ring-mqtt v5.8.1) and the 14.3.x push-decryption fix. Its Alarm WebSocket and event monitoring are therefore **likely broken** on current Ring backends. This is an inference and was not tested. Its `monitor_events(duration)` design, a blocking listen window, also shows the core MCP problem: MCP has no good server-to-client event push for "doorbell rang" without Notifications or Resources subscriptions.
- sandraschi/ring-mcp claims tools such as two-way audio and fire-alarm test that python-ring-doorbell does not support. Alarm only works through the optional MQTT hop to ring-mqtt. Treat it as aspirational until proven.
- The striderlabs browser-automation approach is the most fragile, because it breaks on any UI change and depends on a headless-browser fingerprint. It is also the most ToS-sensitive.
- Composing via HA:
  - **Pros**: HA handles auth, 2FA, the FCM listener and WebRTC. ha-mcp already exposes camera images, history and logs. Ring Alarm can come in via ring-mqtt entities.
  - **Cons**: HA's core MCP has no Notifications, so it cannot push doorbell events to the LLM. Tools are generic Assist intents rather than Ring semantics. The user must run HA, plus ring-mqtt for Alarm.
- The gap in the market is a well-maintained, Ring-semantic MCP that offers (a) events as MCP resources or notifications, (b) snapshot and clip retrieval, (c) gated Alarm control, and (d) a choice of backend: the official Partner API for read, events and video (plus whatever control it turns out to allow), or the unofficial API for alarm arm/disarm and locks.

### Gaps
- mcp.so and mcpservers.org were not queried directly, and Smithery and PulseMCP were checked only on page 1.
- Official-registry caveat: `search=ring` matches substrings in server names (it returned "hiring", "coloring" and so on). A Ring server whose name lacks "ring", such as an `amazonvision`-style name, would have been missed. Descriptions were filtered locally only within the returned set.
- No Ring MCP server was runtime-tested. All capability statements come from READMEs and code.
- Not verified: whether HA's Assist LLM API exposes camera snapshots to MCP clients at all. The docs do not mention images.

---

## 7. What users most request or complain about (signal for product scope)

### Takeaway
Across HA, ring-mqtt, dgreif/ring, python-ring-doorbell and Scrypted the same pain points recur:
- unreliable push events (FCM and token breakage)
- **live streaming suppressing motion/ding events**
- snapshot freshness
- new device models showing up as "unknown"
- auth and token churn
- no Alarm support in HA core
- long-standing asks for live-view proxying and two-way audio

### Cited Findings
**Current signal: HA core open issues, 2025–2026**
- Events not arriving:
  - [#134431](https://github.com/home-assistant/core/issues/134431) "Ring addon doesn't detect Ding or motion" (53 comments).
  - [#149318](https://github.com/home-assistant/core/issues/149318) motion/ding "unknown" (33).
  - [#157764](https://github.com/home-assistant/core/issues/157764) "Ding" event not updating (30).
  - [#179639](https://github.com/home-assistant/core/issues/179639) no event items (17).
  - [#173231](https://github.com/home-assistant/core/issues/173231) doorbell events not received after 2026.6.0, WebRTC RuntimeError.
- FCM push client errors:
  - [#179149](https://github.com/home-assistant/core/issues/179149)
  - [#173915](https://github.com/home-assistant/core/issues/173915) "Incorrect padding, shutting down FcmPushClient"
  - [#187317](https://github.com/home-assistant/core/issues/187317) (2026-10-19)
- Live streaming suppresses events: [#177014](https://github.com/home-assistant/core/issues/177014) "Ring WebRTC live-view sessions remain active after frontend closes, suppressing subsequent doorbell events".
- Snapshots: [#155796](https://github.com/home-assistant/core/issues/155796) (24) and [#167406](https://github.com/home-assistant/core/issues/167406) (18).
- Unsupported or new device kinds:
  - [#175418](https://github.com/home-assistant/core/issues/175418) Stick Up Cam Pro as unknown
  - [#177118](https://github.com/home-assistant/core/issues/177118) Indoor Cam Plus unknown
  - [#177142](https://github.com/home-assistant/core/issues/177142) Battery Doorbell Plus unsupported
  - [#186103](https://github.com/home-assistant/core/issues/186103) "cocoa_camera_v2" unknown kind
- Alarm: [#177181](https://github.com/home-assistant/core/issues/177181) Base Station detected but no entities.
- Continuous recording: [#176299](https://github.com/home-assistant/core/issues/176299) 24/7 recording cameras don't produce proper last_recording.
- Intercom health: [#173299](https://github.com/home-assistant/core/issues/173299) Intercom stays "available" while the listener is unhealthy.

  — [HA core issues, label "integration: ring"](https://github.com/home-assistant/core/issues?q=is%3Aopen+label%3A%22integration%3A+ring%22)

**Streaming vs. events (design constraint)**
- ring-mqtt: there is a "loss of motion/ding events while streaming", and continuous streaming is unsupported. — [ring-mqtt wiki](https://github.com/tsightler/ring-mqtt/wiki)
- Scrypted: "The persistent live stream will cause motion event delivery to stop functioning". — [Scrypted Ring plugin](https://github.com/koush/scrypted/tree/main/plugins/ring)

**Historical top-commented issues** (all-time, mostly closed; shows recurring themes)
- ring-mqtt:
  - [#138](https://github.com/tsightler/ring-mqtt/issues/138) "Update Snapshots" (58)
  - [#238](https://github.com/tsightler/ring-mqtt/issues/238) "Live Video Streaming" (57)
  - [#733](https://github.com/tsightler/ring-mqtt/issues/733) not finding alarm/lighting (51)
  - [#68](https://github.com/tsightler/ring-mqtt/issues/68) "2FA refresh token expiring too quickly" (43)
  - [#643](https://github.com/tsightler/ring-mqtt/issues/643) no motion/ding events (37)
  - [#143](https://github.com/tsightler/ring-mqtt/issues/143) "Person detection" (29)
  - [#64](https://github.com/tsightler/ring-mqtt/issues/64) Modes support (26)
- dgreif/ring:
  - [#1083](https://github.com/dgreif/ring/issues/1083) Intercom (122)
  - [#1218](https://github.com/dgreif/ring/issues/1218) push stops after ~24h (107)
  - [#237](https://github.com/dgreif/ring/issues/237) two-way audio (53)
  - [#860](https://github.com/dgreif/ring/issues/860) HKSV (46)
- python-ring-doorbell:
  - [#23](https://github.com/python-ring-doorbell/python-ring-doorbell/issues/23) live view proxy (81, **still open since 2017**)
  - [#142](https://github.com/python-ring-doorbell/python-ring-doorbell/issues/142) "Ring API stopped working" (75)
  - [#161](https://github.com/python-ring-doorbell/python-ring-doorbell/issues/161) "How do I auth with 2FA?"

**Subscription gating**
- Many users have no Ring Protect. HA had to stop warning about it roughly 480 times a day. — [PR #158012](https://github.com/home-assistant/core/pull/158012)
- ring-mqtt says many features need a subscription. — [ring-mqtt README](https://github.com/tsightler/ring-mqtt)

**Hubless Kidde/Ring smoke/CO detectors**
- Demand was strong enough for a dedicated HACS integration and for ring-mqtt 5.9.x/6.0 support. — [ha-ring-smoke-detectors](https://github.com/simplytoast1/ha-ring-smoke-detectors); [ring-mqtt CHANGELOG (dev)](https://github.com/tsightler/ring-mqtt/blob/dev/docs/CHANGELOG.md)

### Inferences
- MVP scope signal: reliable event delivery (ding, motion, person) with snapshot-on-event is the most valued and most fragile capability. It should be a first-class, health-monitored feature, with listener health exposed as a tool or resource.
- Live view should be **on-demand and short-lived**, with an explicit teardown. Otherwise the MCP will suppress the very events it exists to report.
- Alarm arm/disarm is a frequent need that HA core does not meet. It is a differentiator, but it needs a confirmation/approval gate (as striderlabs and ring-home-mcp-hub already do).
- New device kinds and Ring's v3 API migration are an ongoing maintenance tax regardless of build or wrap. The question is which upstream (ring-mqtt's embedded client, ring-client-api, python-ring-doorbell or the Partner API) absorbs it fastest.

### Gaps
- Reddit r/homeassistant and r/Ring were not systematically mined, so the evidence is GitHub-centric.

---

## 8. Comparison table

### Takeaway
For a Ring MCP bridge, the candidate foundations are:
- **Most complete control (incl. Alarm)**: ring-mqtt (MQTT/RTSP), or ring-client-api directly (MIT).
- **Sanctioned, mainly read/events/video**: the Ring Partner API. It has no lock control, alarm arm/disarm is undocumented, and other control is unverified.
- **Easiest composition**: HA (+ ring-mqtt) with ha-mcp or the core `mcp_server`.
- **Video-only building block**: go2rtc's Ring source.

Existing Ring-specific MCP servers are immature (≤4 stars, stale or WIP).

### Cited Findings
Legend:
- "Events" means ding/motion push or event history.
- "Control" means non-alarm actuation (lights, siren, chime, intercom unlock, settings).
- Status is as of 2026-10-23.

| Project | Language | Ring library / backend | Events | Live video | Snapshots | Alarm | Control | Maintenance status | License | Sources |
|---|---|---|---|---|---|---|---|---|---|---|
| HA core `ring` | Python | python-ring-doorbell 0.9.14 (unofficial API) | Yes: event entities via FCM push; `ding`→`ring` rename 2026-04 | Yes, WebRTC `live_view` (no 2-way audio) | Yes, camera image (2026.4 regression, open issue) | **No** | Lights, sirens, switches (motion detect, in-home chime), volumes, intercom unlock | Active (PRs through 2026-10-22); Bronze declared | Apache-2.0 | [docs](https://www.home-assistant.io/integrations/ring/), [manifest](https://github.com/home-assistant/core/blob/dev/homeassistant/components/ring/manifest.json) |
| ring-mqtt | JavaScript (Node); Go `ringstream` in v6-dev | Forked `@tsightler/ring-client-api` 14.3.1-beta (v5.9.3); embedded v3-API client in v6.0.0 (dev, unreleased) | Yes, via MQTT plus HA discovery | Yes, RTSP gateway (go2rtc in 5.x; ringstream with H.265 in 6.0-dev); recorded-event playback | Yes, on motion or interval | **Yes, full** (states, bypass, panic, siren, keypad) | Extensive: Z-Wave locks, switches, thermostats, chimes, lights, intercom unlock, location modes | Active; last release v5.9.3 2026-03-09; v6.0.0 committed on dev 2026-10-19 | MIT | [repo](https://github.com/tsightler/ring-mqtt), [wiki](https://github.com/tsightler/ring-mqtt/wiki), [CHANGELOG dev](https://github.com/tsightler/ring-mqtt/blob/dev/docs/CHANGELOG.md) |
| homebridge-ring | TypeScript | ring-client-api 14.3.0 | Yes, to HomeKit (doorbell programmable switch, motion sensors) | Yes, HomeKit live with 2-way audio via ffmpeg | Yes (battery-cam limits) | **Yes** (plus panic buttons, night-mode bypass) | Lights, sirens, chimes, location modes | Maintained; last release 2026-02-08; keepalive fix and deps 2026-10 | MIT | [README](https://github.com/dgreif/ring/tree/main/packages/homebridge-ring), [releases](https://github.com/dgreif/ring/releases) |
| ring-client-api (lib) | TypeScript | Own (unofficial API) | Yes, push and WebSocket | Yes, WebRTC (with ffmpeg) | Yes | **Yes** | Yes | As above | MIT | [README](https://github.com/dgreif/ring/tree/main/packages/ring-client-api) |
| python-ring-doorbell (lib) | Python | Own (unofficial API) | Yes, `RingEventListener` (FCM) | WebRTC signaling (used by HA); "live view proxy" request open since 2017 | Yes | Not documented (HA has none) | Chime, lights, siren, settings | Slow: 0.9.14 2026-02-28 after a 15-month gap; no commits since | **LGPL-3.0** | [repo](https://github.com/python-ring-doorbell/python-ring-doorbell), [issue #23](https://github.com/python-ring-doorbell/python-ring-doorbell/issues/23) |
| Scrypted Ring plugin | TypeScript | Vendored `@koush/ring-client-api` | Yes, to HomeKit and HKSV | Yes, HomeKit and HKSV | Yes | Yes (security panel, location modes) | Locks, lights, switches | **Plugin stale** (last change 2025-06-14); core active (v0.147.0 2026-09-13) | NOASSERTION (repo) | [plugin](https://github.com/koush/scrypted/tree/main/plugins/ring), [npm](https://www.npmjs.com/package/@scrypted/ring) |
| go2rtc Ring source | Go | Own `pkg/ring` (refresh token) | No | Yes, with 2-way audio, re-streamed as RTSP/WebRTC | Yes (`&snapshot`) | No | No | Added v1.9.13 2025-12-14; latest v1.9.14 2026-01-19 | MIT | [internal/ring](https://github.com/AlexxIT/go2rtc/blob/master/internal/ring/README.md) |
| openHAB Ring binding | Java | Own | Yes (FCM since 2026-07) | **No** | Recorded video URLs (subscription) | Not mentioned | Limited (enable/polling) | Active but "experimental" | EPL-2.0 | [README](https://github.com/openhab/openhab-addons/tree/main/bundles/org.openhab.binding.ring) |
| Hubitat built-in Ring | Closed platform | Ring cloud (backend unknown) | Yes (motion, button press) | Unknown | Unknown | Not mentioned | Lights, sirens, chimes | New in 2.5.0 (May 2026); docs say beta | Unknown (closed platform) | [press release](https://ipsnews.net/business/2026/05/19/hubitat-elevation-2-5-0-update-adds-ring-integration-to-power-smarter-home-automation/) |
| Hubitat community Ring | Groovy | Own (unofficial API) | Yes | No (not documented) | Not verified | Yes (needs WebSocket API device) | Yes | Stale (last commit 2024-12-26) | Apache-2.0 | [repo](https://github.com/HubitatCommunity/hubitat_ring_integration) |
| Node-RED ring-alarm nodes | JavaScript | ring-client-api | Yes | No | Camera node | Yes | Alarm mode | **Stale** (npm 2023-04) | MIT | [flows](https://flows.nodered.org/node/@realsixi/node-red-contrib-ring-alarm) |
| IFTTT Ring service | Cloud (official) | Official Ring service | 2 triggers (ring, motion) | No | No | No | **0 actions** | Official | n/a | [IFTTT](https://ifttt.com/ring) |
| KoenZomers.Ring.Api | C# (.NET 8) | Own (unofficial API) | Not documented | No | Via companion downloader | No | Doorbell/chime details | **Stale** (1.0.0.0 Oct 2024) | Unclear (MIT badge; no license in GitHub API) | [repo](https://github.com/KoenZomers/RingApi) |
| **MCP:** jpcors/ring-mcp | TypeScript | ring-client-api **^11.7.5**, MCP SDK ^0.5.0 | `monitor_events(duration)` listen window | No | Yes | Yes (arm/disarm) | Lights | **Stale** (2025-07-21), 4 stars | None | [repo](https://github.com/jpcors/ring-mcp) |
| **MCP:** sandraschi/ring-mcp | Python (FastMCP 3.4) | ring-doorbell plus optional ring-mqtt via MQTT | Claimed | Claimed | Claimed | Via ring-mqtt only | Claimed (some beyond library support) | WIP auto-commits; not on PyPI; 2 stars | MIT | [repo](https://github.com/sandraschi/ring-mcp) |
| **MCP:** @striderlabs/mcp-ring | TypeScript | **Browser automation (patchright)** on ring.com | History | No | Yes | Yes (confirm-gated) | Light toggle | Single drop 2026-03; 0 stars | None | [repo](https://github.com/markswendsen-code/mcp-ring) |
| **MCP:** ring-partner-mcp | TypeScript | **Official Ring Partner API** | Event history | No | Yes | No | None (read-only) | New (2026-10-19); 0 stars; not on npm | MIT | [repo](https://github.com/inslot2525-ctrl/ring-partner-mcp) |
| **MCP:** ring-vision-mcp | TypeScript | **Official Partner API** (`api.amazonvision.com`) | Event history | WHEP session signaling | Not stated | No | None stated | 2026-09; 0 stars; not on npm | MIT | [repo](https://github.com/SwaggyXO/ring-vision-mcp) |
| **MCP (indirect):** HA core `mcp_server` | Python | Whatever HA exposes (Ring via core; Alarm only with ring-mqtt) | **No push** (Notifications unsupported); state via GetLiveContext | No | Not documented | Only via ring-mqtt entities | Assist intents on exposed entities | Core, Silver, since 2025.2 | Apache-2.0 | [docs](https://www.home-assistant.io/integrations/mcp_server/) |
| **MCP (indirect):** ha-mcp | Python | Via HA REST/WebSocket | History and logs (pull) | No | **Yes** (`ha_get_camera_image`) | Only via ring-mqtt entities | Any HA service | Very active; v8.7.0 2026-10-14; 5,182 stars | MIT | [repo](https://github.com/homeassistant-ai/ha-mcp) |

### Inferences
- Decision framing for the team:
  - **(a) Build from scratch on the Partner API.** This is sanctioned and has OAuth, webhooks and WHEP. It has no locks (stated) and no documented alarm arm/disarm, and other control scope is unverified. It also needs certification for production.
  - **(b) Wrap ring-client-api (MIT) or compose over ring-mqtt's MQTT/RTSP.** This gives full Alarm and control, but carries unofficial-API risk and upstream lag.
  - **(c) Compose via HA plus ha-mcp.** This is the fastest to demo, but has no native event push, generic semantics and a heavy prerequisite stack.
- A hybrid design is plausible: Partner API for events, snapshots and video, and an unofficial-API module for Alarm, gated behind explicit confirmation. Inference: nobody in the catalog does this today.

### Gaps
- License for Hubitat's built-in integration and its backend library are unknown.
- Snapshot support in ring-vision-mcp and the full tool list of ring-partner-mcp were not enumerated; only the README summaries were read.
