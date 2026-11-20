# Ring Real-Time Events and Video/Media in the Unofficial (Community) Ecosystem

Research date: 2026-10-23. Primary sources are pinned source snapshots:
- dgreif/ring (ring-client-api 14.3.0) @ `925a3aa` (2026-10-22)
- python-ring-doorbell (0.9.14) @ `486193a` (last commit 2026-02-28, possibly stale)
- tsightler/ring-mqtt `main` (5.9.3) @ `0a34496`
- tsightler/ring-mqtt `dev` (6.0.0) @ `996be5b`

Line numbers refer to those commits. "Inference" marks my own reasoning, not something a source states.

---

## 1. Push notifications (FCM): how ding/motion/on-demand/intercom events reach community clients

### Takeaway
ring-client-api and python-ring-doorbell both pose as a Ring Android app. They register with Firebase Cloud Messaging (FCM) using Ring's own Firebase project credentials, then PATCH the resulting FCM token into Ring's `clients_api/device` endpoint. After that they hold a persistent MCS connection to `mtalk.google.com:5228` and receive ding/motion/intercom/alarm-mode pushes, usually within seconds. Polling `/dings/active` was removed in May 2022. The 2024 FCM legacy-API deprecation forced both libraries onto FCM HTTP v1 registration, which also changed the payload shape: ring-client-api 13.0.0 shipped this on 2024-08-04 and python-ring-doorbell 0.9.2 (firebase-messaging 0.4.0) on 2024-08-29.

### Cited Findings
**Firebase identity used**
- Both libraries use identical Firebase config, taken from the Ring Android app:
  - apiKey `AIzaSyCv-hdFBmmdBBJadNy-TFwB-xN_H5m3Bk8`
  - projectId `ring-17770`
  - messagingSenderId `876313859327`. The code comment says this is "for Ring android app. 703521446232 for ring-site".
  - appId `1:876313859327:android:e10ec6ddb3c81f39`
  - Sources: [ring-client-api api.ts L241-249](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/api.ts#L241-L249); [python const.py L77-80](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/ring_doorbell/const.py#L77-L80)

**Libraries used**
- ring-client-api uses `@eneris/push-receiver` 4.4.0, with `werift` 0.24.4 for WebRTC. — [package.json L42-51](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/package.json#L42-L51)
- python-ring-doorbell uses `firebase_messaging.FcmPushClient` (sdb9696's package, `firebase-messaging>=0.4.0`). — [eventlistener.py L164-202](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/ring_doorbell/listen/eventlistener.py#L164-L202)

**Token registration with Ring**
- Request: `PATCH https://api.ring.com/clients_api/device` with body `{device:{metadata:{...baseSessionMetadata, pn_dict_version:'2.0.0', pn_service:'fcm'}, os:'android', push_notification_token:<fcm token>}}`.
- ring-client-api re-sends it every time the token changes or the Ring session is refreshed, via `combineLatest` with `onSession`. — [api.ts L271-297](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/api.ts#L271-L297)
- python uses the same body via `SUBSCRIPTION_ENDPOINT = "/clients_api/device"`. — [eventlistener.py L91-127](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/ring_doorbell/listen/eventlistener.py#L91-L127); [const.py L88-89](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/ring_doorbell/const.py#L88-L89)
- Separate per-device opt-in endpoints also exist:
  - `POST clients_api/doorbots/{id}/subscribe` and `/unsubscribe` for dings
  - `POST .../motions_subscribe` and `/motions_unsubscribe` for motion
  - Source: [ring-camera.ts L688-714](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-camera.ts#L688-L714)
- ring-client-api 11.7.7 began re-subscribing to ding/motion on every session refresh, about every 12 h. — [CHANGELOG](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/CHANGELOG.md)
- ring-mqtt 6.0.0 backs off when these subscriptions fail. It skips them entirely on shared cameras that lack "alert management permission". — [ring-mqtt dev CHANGELOG v6.0.0](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/docs/CHANGELOG.md)

**Credential persistence**
- ring-client-api:
  - push-receiver emits `onCredentialsChanged`; the new credentials go into `restClient._internalOnly_pushNotificationCredentials` and are reused on restart. — [api.ts L264-270, L387-395](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/api.ts#L264-L270)
  - Since 11.8.0 (2023-06-09), the push credentials and a hardware id are embedded inside the refresh-token string. Per the changelog, this lets "push notifications … work across restarts and continue working past 24 hours in regions with data residency restrictions" and stops a second device from appearing in Ring Control Center. — [CHANGELOG 11.8.0](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/CHANGELOG.md); [npm release dates](https://registry.npmjs.org/ring-client-api)
- python:
  - The caller supplies a `credentials` dict plus a `credentials_updated_callback`. — [eventlistener.py L51-89](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/ring_doorbell/listen/eventlistener.py#L51-L89)
  - Listener defaults: `server_heartbeat_interval=60`, `client_heartbeat_interval=120`, `monitor_interval=15`. — [listenerconfig.py](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/ring_doorbell/listen/listenerconfig.py)
  - It recreates the Ring session and re-PATCHes the token every 12 h (`SESSION_REFRESH_INTERVAL = 60*60*12`). — [eventlistener.py L49, L204-219](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/ring_doorbell/listen/eventlistener.py#L204-L219)

**Transport requirements**
- The connection is a persistent socket to `mtalk.google.com` on TCP/5228, and it is fragile under ad-blocking DNS, IDS/IPS, and DNS-over-HTTPS. — [dgreif wiki: Notification Troubleshooting](https://github.com/dgreif/ring/wiki/Notification-Troubleshooting); [api.ts L299-309](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/api.ts#L299-L309)
- Home Assistant's Ring docs say outbound TCP 5228 must be open for "real-time event" delivery. — [HA Ring integration](https://www.home-assistant.io/integrations/ring/)

**Payload structure ("v2", `pn_dict_version 2.0.0`)**
- Every FCM `data` field arrives as a JSON string and must be parsed field by field. ring-client-api parses with `JSONbig({storeAsString:true})` to keep 64-bit ids intact. — [api.ts L330-341](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/api.ts#L330-L341)
- `PushNotificationDingV2` fields — [ring-types.ts L1051-1103](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-types.ts#L1051-L1103):
  - `version`
  - `android_config{category, body}`
  - `analytics{server_correlation_id, server_id:'com.ring.pns', subcategory, triggered_at, sent_at, referring_item_type, referring_item_id}`
  - `data.device{e2ee_enabled, id, kind, name}`
  - `data.event.ding{id, created_at, subtype, detection_type?}`
  - `data.event.eventito{type, timestamp}`
  - `data.event.riid`
  - `data.event.is_sidewalk`
  - `data.event.live_session{streaming_data_hash, active_streaming_profile:'rms', default_audio_route, max_duration}`
  - `data.location.id`
  - optional `img.snapshot_uuid`

**Category strings (`android_config.category` / action)** — [ring-types.ts L1037-1049](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-types.ts#L1037-L1049); [python const.py L210-221](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/ring_doorbell/const.py#L210-L221)
- Live events:
  - `com.ring.pn.live-event.ding`
  - `com.ring.pn.live-event.motion`
  - `com.ring.pn.live-event.intercom`
- Intercom unlock: `com.ring.push.INTERCOM_UNLOCK_FROM_APP`
- Alarm and siren:
  - `com.ring.push.HANDLE_NEW_SECURITY_PANEL_MODE_NONE_NOTICE`
  - `…_MODE_SOME_NOTICE`
  - `com.ring.push.HANDLE_NEW_USER_SOUND_SIREN`
  - `com.ring.push.HANDLE_NEW_NON_ALARM_SIREN_SILENCED`
- Alarm and intercom-unlock pushes use the older shape `data.gcmData{aps.alert, action, alarm_meta{device_zid, location_id}}`. — [ring-types.ts L1105-1142](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-types.ts#L1105-L1142); [api.ts L346-380](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/api.ts#L346-L380)

**Detection types**
- `ding.subtype` is typed `'other_motion' | 'motion' | 'ding' | 'human' | string`.
- `NotificationDetectionType` lists `human`, `loitering`, `motion`, `other_motion`, `null`, `stream_broken`, with the source comment "this list may not be complete". — [ring-types.ts L1024-1035](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-types.ts#L1024-L1035)
- ring-mqtt sets `is_person = (ding.detection_type === 'human')`. — [ring-mqtt camera.js L510-515](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/camera.js#L510-L515)
- Device settings show a richer CV taxonomy: `cv_settings.detection_types{human, loitering, motion, moving_vehicle, nearby_pom, other_motion, package_delivery, package_pickup}` and `threshold{loitering, package_delivery}`. — [ring-types.ts L813-826](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-types.ts#L813-L826)
- History/event `kind` values (`DingKind`): `motion`, `ding`, `on_demand` (Live View), `alarm` and `on_demand_link` (linked events), `door_activity` (knock), `key_access`, `DELETED_FOOTAGE`, `OFFLINE_FOOTAGE`, `OFFLINE_MOTION`. — [ring-types.ts L920-930](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-types.ts#L920-L930)

**Dedup and event lifetime (differs per library)**
- ring-client-api:
  - drops every push received in the first 2 s after connecting ("likely duplicates", and persistent ids are not stored). — [api.ts L318-327](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/api.ts#L318-L327)
  - replaces any active notification that has the same `ding.id`, and expires it after 65 s ("dings last ~1 minute"). — [ring-camera.ts L453-476](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-camera.ts#L453-L476)
- python:
  - marks a repeated event key seen within 180 s (`DEFAULT_LISTEN_EVENT_EXPIRES_IN`) as `is_update=True`, because "Battery doorbells send two events. First without an image and the second with an image."
  - also ignores the FCM `persistent_id`.
  - Sources: [eventlistener.py L268-305](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/ring_doorbell/listen/eventlistener.py#L268-L305); [const.py L75](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/ring_doorbell/const.py#L75)
- ring-mqtt keeps motion/ding "active" for a configurable duration (default 180 s). Each new push extends the expiry. — [ring-mqtt camera.js L25-39, L484-540](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/camera.js#L484-L540)
- HA documents that "some models send two alerts for one doorbell ring". — [HA Ring integration](https://www.home-assistant.io/integrations/ring/)

**Ding id precision**
- Ding ids must be handled as strings. In 11.7.7, ring-client-api changed `ding.id` from number to string because "the last few digits were truncated due to number rounding" and the number "was unusable for fetching additional information about the ding" (PR #1222). — [CHANGELOG 11.7.7](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/CHANGELOG.md)

**Move away from polling**
- ring-client-api 10.0.0 (2022-05-08):
  - "The `cameraDingsPollingSeconds` option has been removed. Ding events will now be received via push notifications (no setup required)"
  - "receive dings from push notifications"
  - Sources: [CHANGELOG 10.0.0](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/CHANGELOG.md); [npm dates](https://registry.npmjs.org/ring-client-api)
- ring-mqtt <5.x polled. Polling "would detect all motion/ding events even if notifications for those events were disabled in the Ring app". 5.x and later rely on push. — [ring-mqtt FAQ](https://github.com/tsightler/ring-mqtt/wiki/Frequently-Asked-Questions-(FAQ))
- python still defines `DINGS_ENDPOINT = "/clients_api/dings/active"`. It added the realtime FCM listener in 0.7.5 (2023-10-25) and enabled it by default in 0.9.6 (2024-09-26). — [const.py L86](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/ring_doorbell/const.py#L86); [python CHANGELOG](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/CHANGELOG.md); [PyPI history](https://pypi.org/project/ring-doorbell/#history)

**FCM v1 migration (2024)**
- Deprecation dates come only from secondary sources:
  - Twilio says Google "deprecated the legacy FCM API in June 2024" and that legacy server-key credentials then stopped working. — [Twilio error 52116](https://www.twilio.com/docs/api/errors/52116)
  - Azure says Google stopped supporting FCM legacy HTTP on June 20, 2024. — [Microsoft Learn: FCM migration](https://learn.microsoft.com/en-us/azure/notification-hubs/firebase-migration-rest)
  - Google's own migration page, `firebase.google.com/docs/cloud-messaging/migrate-v1` (linked from the firebase-messaging changelog), returned 404 when fetched on 2026-10-23. The announcement date versus the actual turn-down date is therefore not verified from a primary source.
- How the receiver-side registration changed, from firebase-messaging's `fcmregister.py`, tag `0.3.0` vs `main`, with URLs from [const.py](https://github.com/sdb9696/firebase-messaging/blob/main/firebase_messaging/const.py):
  - Unchanged in both versions: GCM device check-in `https://android.clients.google.com/checkin`, then GCM register `https://android.clients.google.com/c2dm/register3`. This yields the GCM token, and the MCS socket to `mtalk.google.com:5228` is used for delivery.
  - Old (≤0.3.0, legacy): `POST https://fcm.googleapis.com/fcm/connect/subscribe/` with the sender id and an `endpoint` of `https://fcm.googleapis.com/fcm/send/{token}`.
  - New (≥0.4.0, FCM v1):
    1. Firebase Installations: `POST https://firebaseinstallations.googleapis.com/v1/projects/{project_id}/installations` with `x-goog-api-key`. This returns an installation auth token and supports refresh.
    2. FCM Registrations: `POST https://fcmregistrations.googleapis.com/v1/projects/{project_id}/registrations` with `x-goog-api-key` + `x-goog-firebase-installations-auth`. The body is `{web:{applicationPubKey, auth, endpoint: FCM_SEND_URL+gcmToken, p256dh}}`, using locally generated ECDH keys to decrypt pushes.
    - This is why the new flow needs `projectId` and `appId`, not just the sender id.
  - Sources: [fcmregister.py @0.3.0](https://github.com/sdb9696/firebase-messaging/blob/0.3.0/firebase_messaging/fcmregister.py); [fcmregister.py @main](https://github.com/sdb9696/firebase-messaging/blob/main/firebase_messaging/fcmregister.py)
- ring-client-api PR #1435, "Switch to FCMv1 for push messages":
  - committed 2024-08-04 by tsightler and dgreif, released as 13.0.0 the same day.
  - described as "due to imminent deprecation of old method".
  - included "Force new FCM registration on legacy credentials", "Parse each message data property", "Handle lack of img field on notifications", and "Log unknown push notifications".
  - The changelog warns it "will change the shape of push notifications for projects which manually consume push notifications".
  - 13.0.1 bumped push-receiver for "more reliable push notification handling".
  - Sources: [GitHub commit cc2f0b7 / PR #1435](https://github.com/dgreif/ring/pull/1435); [CHANGELOG 13.0.0](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/CHANGELOG.md)
- firebase-messaging 0.4.0 (2024-08-29): "Support for new FCM HTTP v1 API. Previous versions of this library will no longer work due firebase deprecating the legacy APIs". — [firebase-messaging CHANGELOG](https://github.com/sdb9696/firebase-messaging/blob/main/CHANGELOG.md)
- python-ring-doorbell 0.9.2 (2024-08-29): "Fixes the broken event listener by migrating to the new `firebase-messaging` library to support FCM HTTP v1 api". The listener became async-only. — [python CHANGELOG 0.9.2](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/CHANGELOG.md)

**Later push fix (2026)**
- ring-mqtt 5.9.3 (released 2026-03-09) shipped a custom ring-client-api build (14.3.1-beta.0) with a patched push-receiver. It addresses "push messages failing decryption with ERR_CRYPTO_ECDH_INVALID_PUBLIC_KEY … potentially leading to missed motion/ding events". — [ring-mqtt CHANGELOG v5.9.3](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/docs/CHANGELOG.md); [GitHub releases API](https://api.github.com/repos/tsightler/ring-mqtt/releases)

**Python bug in the legacy path**
- In python's legacy (`gcmData`) path, `elif action.lower == PUSH_ACTION_DING.lower():` compares a bound method object to a string, so it is always false. Legacy ding pushes therefore fall through to `kind = action`. The v2 path (`_get_ring_event`) is unaffected. — [eventlistener.py L228](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/ring_doorbell/listen/eventlistener.py#L228)

### Inferences
- An MCP bridge should reuse an existing receiver rather than writing its own MCS/FCM client: `@eneris/push-receiver` (Node) or `firebase-messaging` (Python). It must also:
  - persist FCM credentials and Ring hardware id/refresh token together, so restarts do not register new "devices";
  - re-PATCH `clients_api/device` after every session refresh;
  - parse each `data` field as JSON with big-int-safe parsing.
- Dedup should key on `(device.id, ding.id as string, category)` and treat a later push carrying `img.snapshot_uuid` as an update, not a new event. Neither library persists `persistent_id`, so a durable dedup store is an easy improvement.
- `analytics.triggered_at` vs `sent_at`, together with `eventito.timestamp`, gives a basis for measuring Ring-side latency per event.
- `data.device.e2ee_enabled` lets the bridge tell an agent up front that media will not be retrievable.
- The 2024 incident shows a single Google-side protocol change can silently break event ingestion. Watchdog and health reporting on the push channel are warranted.

### Gaps
- No published latency numbers (ms/seconds) for FCM delivery were found. Sources say only "much faster and very reliable" ([ring-mqtt FAQ](https://github.com/tsightler/ring-mqtt/wiki/Frequently-Asked-Questions-(FAQ))).
- No code observed confirms that notification `detection_type`/`subtype` values for vehicle or package exist. They appear only in device `cv_settings`. Whether pushes carry `moving_vehicle`/`package_delivery` is unverified.
- No community `on_demand` push category was found. `on_demand` appears only as a history `kind`.
- The exact Ring-side change behind the 2024 payload-shape change, i.e. why v2 `android_config`/`data` JSON strings replaced `gcmData`, is not documented beyond the PR text.

---

## 2. Ring Alarm / location real-time websocket (alarm, smart lighting, hubs)

### Takeaway
Alarm and Smart Lighting (Beams) state arrives over a per-location websocket. The client fetches a ticket from `…/api/v1/clap/tickets?locationID=…&requestedTransport=ws` and connects to `wss://{host}/ws?authcode={ticket}&ack=false`. JSON frames `{channel, msg}` follow: `channel:'DataUpdate'` carries device-state documents (`DeviceInfoDocType`) and session info. ring-client-api 14.0.0 (2025-05-11) dropped socket.io for a plain WebSocket via undici after Ring-side changes broke connections.

### Cited Findings
**Ticket request**
- `GET https://prd-api-us.prd.rings.solutions/api/v1/clap/tickets?locationID={id}&enableExtendedEmergencyCellUsage=true&requestedTransport=ws`.
- Response: `{assets: TicketAsset[], host, subscriptionTopics: string[], ticket}`.
- Assets are filtered to websocket-capable kinds such as `base_station_v1` and `beams_bridge_v1`. With no assets the client errors with "No assets (alarm hubs or beam bridges) found".
- Sources: [location.ts L231-250](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/location.ts#L231-L250); [ring-types.ts L177-181](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-types.ts#L177-L181)

**API base hosts**
- `appApiBaseUrl = 'https://prd-api-us.prd.rings.solutions/api/v1/'`
- `clientApiBaseUrl = 'https://api.ring.com/clients_api/'`
- `deviceApiBaseUrl = 'https://api.ring.com/devices/v1/'`
- `commandsApiBaseUrl = 'https://api.ring.com/commands/v1/'`
- Source: [rest-client.ts L53-56](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/rest-client.ts#L53-L56)
- ring-client-api 12.1.1 "Update app API endpoint to fix socket connection issues" (PR #1433). — [CHANGELOG](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/CHANGELOG.md)
- ring-mqtt 6.0.0's embedded client adds v3 bases: `device_info/v3`, `location_info/v3`, `evm/v3`. Its changelog says it uses "newer Ring v3 API for location and device discovery which is required for some newer devices as well as the new shared permissions model". — [ring-mqtt dev rest-client.js L36-43](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/lib/ring-client/rest-client.js#L36-L43); [dev CHANGELOG](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/docs/CHANGELOG.md)

**Socket protocol**
- URL: `wss://${host}/ws?authcode=${ticket}&ack=false`.
- Incoming frames are `{msg, channel}`:
  - `channel === 'DataUpdate'` is routed to `onDataUpdate`.
  - `datatype === 'HubDisconnectionEventType'` triggers a reconnect.
  - Errors and closes also reconnect.
- Source: [location.ts L252-318](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/location.ts#L252-L318)
- Outgoing frames: `{channel:'message', msg:{msg, datatype?, dst:<assetUuid>, body?, seq}}` with an incrementing `seq`. — [location.ts L335-350](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/location.ts#L335-L350)
- Message types: `RoomGetList`, `SessionInfo`, `DeviceInfoDocGetList`, `DeviceInfoSet`.
- Data types: `RoomListV2Type`, `SessionInfoType`, `DeviceInfoDocType`, `DeviceInfoSetType`, `HubDisconnectionEventType`.
- `SocketIoMessage = {msg, datatype, src, body: any[]}`. — [ring-types.ts L158-175](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-types.ts#L158-L175)
- Device-state streaming: `onDeviceDataUpdate` filters `datatype === 'DeviceInfoDocType'` and flattens `body`. The initial device list comes from `DeviceInfoDocGetList` per asset (`dst = asset uuid`). — [location.ts L57-113](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/location.ts#L57-L113)
- `SessionInfo` bodies (`AssetSession`) carry `assetUuid`, `connectionStatus: 'unknown'|'cell-backup'|'online'`, `doorbotId`, `kind`, `sessionId`. — [ring-types.ts L183-190](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-types.ts#L183-L190); [location.ts L115-118](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/location.ts#L115-L118)

**Breakages and fixes**
- ring-client-api 14.0.0 (2025-05-11): "Use undici for all websocket connections. This fixes https://github.com/dgreif/ring/issues/1605 where websockets were failing to connect for alarms and light hubs. It also allows us to drop the socket.io client". — [CHANGELOG 14.0.0](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/CHANGELOG.md)
- ring-mqtt 5.8.1 (2025-05-11) fixed "a recent Ring API change which caused socket connections to fail and crash the ring-mqtt process". — [ring-mqtt CHANGELOG](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/docs/CHANGELOG.md)

**History and monitoring**
- Alarm/Beams history: `GET {appApi}rs/history?accountId={locationId}&category=alarm|beams&maxLevel=50&limit&offset`. It returns `DataUpdate`-shaped events. — [location.ts L470-480](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/location.ts#L470-L480); [ring-types.ts HistoryOptions/RingDeviceHistoryEvent](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-types.ts#L1000-L1020)
- Monitoring status: `rs/monitoring/accounts/{locationId}`. — [location.ts L490-494](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/location.ts#L490-L494)
- Alarm mode changes and siren events also arrive as FCM pushes (`HANDLE_NEW_SECURITY_PANEL_MODE_*`, `alarm_meta.device_zid`), in parallel with the socket. — [ring-types.ts L1037-1046](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-types.ts#L1037-L1046)

### Inferences
- A bridge needs two independent real-time channels: FCM for cameras, doorbells, and intercoms, and the location websocket for alarm and lighting. They should feed one normalized event bus.
- Websocket messages are full device-document updates, not diffs, so the bridge should keep a state cache and compute change events itself.
- Tickets are short-lived and per-connection. Reconnect logic must re-request a ticket rather than reuse the URL. ring-client-api does this via `getConnection()`.
- The socket.io-to-raw-WebSocket change (2025) and the v3 discovery APIs (2026) show these endpoints drift roughly yearly. Isolate them behind an adapter.

### Gaps
- No ticket TTL, socket heartbeat interval, or server-side idle timeout is documented in the code.
- The full `DeviceInfoDocType` body schema (alarm sensor fields) was not examined here. It is in `ring-device.ts` / `device-data.ts` and is out of this note's scope.
- Whether the v3 location APIs change the websocket ticket flow is unknown. ring-mqtt v6 still uses the same `wss://${host}/ws?authcode=` URL ([dev location.js L215](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/lib/ring-client/location.js#L215)).

---

## 3. Live video: SIP legacy vs. WebRTC now; signaling, transcoding, RTSP, two-way audio, limits

### Takeaway
SIP-based live calls were removed from ring-client-api in 10.0.0 (2022-05-08). All community live view now uses Ring's WebRTC service. The main path is a trickle-ICE websocket at `wss://api.prod.signalling.ring.devices.a2z.com/ws?api_version=4.0…`, authorized by a ticket from `clap/ticket/request/signalsocket`. A simpler REST path, `api.ring.com/integrations/v1/liveview/start`, takes an SDP offer and returns an SDP answer with no trickle ICE. Streams are cloud-relayed, last about 10 minutes, suppress motion events while active, and create a recording when a Protect plan is active. ring-mqtt converts them to RTSP: via werift + go2rtc in 5.x, and via a Go gateway `ringstream` with H.265 support in 6.0.0, released on the `dev` branch on 2026-10-20.

### Cited Findings
**History of the transport**
- ring-client-api changes:
  - 9.19 (2021-07-31) added a SIP "keepalive to keep stream open longer than 30 seconds".
  - 9.25.0-beta.1 (2022-02-14): "use new WebRTC endpoint for live calls".
  - 10.0.0 (2022-05-08): "remove sip calling in favor of live calls … All streaming will now be done using the new Ring api via WebRTC + WebSockets".
  - 12.0.0 (2023-08-20): "condensed to use a single API, rather than a separate setup between Ring Cloud and Ring Edge streaming. This should allow all cameras to stream, including those using HEVC which were unable to be put into Legacy Mode."
  - Sources: [CHANGELOG](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/CHANGELOG.md); [npm dates](https://registry.npmjs.org/ring-client-api)
- python still has a legacy `async_get_live_streaming_json()`. It POSTs `https://app.ring.com/clients_api/doorbots/{id}/live_view` and then reads `/clients_api/dings/active[0]` (the old SIP-style flow). — [doorbot.py L289-302](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/ring_doorbell/doorbot.py#L289-L302)

**WebRTC signaling path (ring-client-api `WebrtcConnection`)**
1. Get a ticket: `POST https://prd-api-us.prd.rings.solutions/api/v1/clap/ticket/request/signalsocket` returns `{ticket}`. — [ring-camera.ts L419-429](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-camera.ts#L419-L429)
   - ring-mqtt 6.0.0 uses `https://app.ring.com/api/v1/clap/ticket/request/signalsocket`. — [dev camera.js L1264](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/devices/camera.js#L1264)
   - python uses `RTC_STREAMING_TICKET_ENDPOINT = "/api/v1/clap/ticket/request/signalsocket"`. — [const.py L118-119](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/ring_doorbell/const.py#L118-L119)
2. Connect: `wss://api.prod.signalling.ring.devices.a2z.com:443/ws?api_version=4.0&auth_type=ring_solutions&client_id=ring_site-{uuid}&token={ticket}`. — [webrtc-connection.ts L49](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/streaming/webrtc-connection.ts#L49)
   - The same host appears in ring-mqtt's Go `ringstream`. — [dev ringstream/signaling.go L15, L61](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/ringstream/signaling.go#L15)
3. Send `{method:'live_view', dialog_id, body:{doorbot_id, stream_options:{audio_enabled:true, video_enabled:true}, sdp}}`. — [webrtc-connection.ts L156-166](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/streaming/webrtc-connection.ts#L156-L166)
4. Receive messages — [streaming-messages.ts](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/streaming/streaming-messages.ts):
   - `session_created` / `session_started` (with `session_id`)
   - `sdp` (answer)
   - `ice {ice, mlineindex}`
   - `ping` / `pong`
   - `notification {is_ok, text}`
   - `camera_started`
   - `stream_info {transcoding, transcoding_reason:'codec_mismatch'}`
   - `close {reason:{code,text}}`
5. After the answer, send `activate_session`, which is "required to keep the stream alive longer than 70 seconds", plus `stream_options`. Send a session `ping` every 5 s. Local ICE candidates go out as `{method:'ice', body:{ice, mlineindex}}`. — [webrtc-connection.ts L135-150, L291-297](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/streaming/webrtc-connection.ts#L291-L297)
   - ringstream does the same: a 5 s ticker, and `activate_session` / `stream_options` "which Ring requires on ping/activate/stream_options". — [dev signaling.go L97-150](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/ringstream/signaling.go#L97-L150)
6. Close codes — [streaming-messages.ts L63-73](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/streaming/streaming-messages.ts#L63-L73):
   - 0: normal
   - 5: auth failed, e.g. "Unauthorized: invalid or expired token" or "Sessions with the provided ID not found"
   - 6: "Timeout waiting for ping"

**Peer connection (werift)**
- STUN servers: `stun.kinesisvideo.{us-east-1,us-east-2,us-west-2}.amazonaws.com:443` plus Google STUN.
- Codecs: `audio/opus` and `video/H264`.
- `bundlePolicy:'disable'`; RTCP PLI for keyframes.
- Sources: [peer-connection.ts L15-131](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/streaming/peer-connection.ts#L15-L131)

**Simplified REST WebRTC (`SimpleWebRtcSession`, for browsers)**
- Endpoints:
  - `POST https://api.ring.com/integrations/v1/liveview/start {session_id, device_id, sdp, protocol:'webrtc'}` returns `{sdp}`
  - `POST …/liveview/end {session_id}`
  - `PATCH …/liveview/options {session_id, actions:['turn_off_stealth_mode']}`, which turns on the camera speaker
- Notes from the source: "no backplane for trickle ICE … designed for use in a browser"; "cameras with Ring Edge enabled will stream with the speaker enabled as soon as the stream starts, which can drain the battery more quickly."
- Sources: [simple-webrtc-session.ts](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/streaming/simple-webrtc-session.ts); [ring-camera.ts L677-686](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-camera.ts#L677-L686)

**Transcoding and two-way audio**
- `StreamingSession.startTranscoding()` feeds RTP into ffmpeg via a generated SDP.
  - "Ring will answer with either opus or pcmu". The default output is `-acodec aac` and `-vcodec copy`.
  - `recordToFile(path, 30)` and `streamVideo(ffmpegOptions)` are convenience wrappers.
  - `transcodeReturnAudio()` encodes local input to opus 48 kHz (or pcmu) RTP and sends it to the camera for two-way audio.
  - `activateCameraSpeaker()` and `requestKeyFrame()` are also provided.
  - Sources: [streaming-session.ts L100-254](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/streaming/streaming-session.ts#L100-L254); [ring-camera.ts L664-675](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-camera.ts#L664-L675)
- HA's Ring integration: "Two-way audio in camera live view is not currently supported". It exposes `live_view` and `last_recording` camera entities. — [HA Ring integration](https://www.home-assistant.io/integrations/ring/)

**Mode gating (2026)**
- ring-client-api 14.3.0 (2026-02-08): "Block streaming from cameras based on location mode settings".
- `startLiveCall` throws if `settings.live_view_disabled === true`.
- Sources: [CHANGELOG 14.3.0](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/CHANGELOG.md); [ring-camera.ts L432-442](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-camera.ts#L432-L442)

**python WebRTC**
- `RingWebRtcStream` uses the same ticket and wss flow.
  - `PING_TIME_SECONDS = 5`
  - `keep_alive_timeout` defaults to 30 s (sync offer) or 5 min (async trickle-ICE `generate_async_webrtc_stream`)
  - `activate_session` is sent after the answer
  - Sources: [webrtcstream.py L59-197](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/ring_doorbell/webrtcstream.py#L59-L197); [doorbot.py L456-528](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/ring_doorbell/doorbot.py#L456-L528)
- Release timeline:
  - WebRTC session generation added in 0.9.4 (2024-09-05)
  - multiple sessions per device in 0.9.5 (2024-09-19)
  - stream keep-alive in 0.9.7 (2024-10-04)
  - trickle ICE in 0.9.9 (2024-11-06)
  - "WebRTC Answer Fix for Firefox" in 0.9.14 (2026-02-27)
  - Source: [python CHANGELOG](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/CHANGELOG.md)

**ring-mqtt RTSP gateway**
- 5.9.3 (`main`, latest tag) uses werift + go2rtc. — [ring-mqtt main lib/](https://github.com/tsightler/ring-mqtt/tree/0a34496f4d583e663e1fa7136f6d4602c208e57f/lib); [CHANGELOG v5.9.3](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/docs/CHANGELOG.md)
- 6.0.0 ("Release v6.0.0" commit on `dev`, 2026-10-20; no v6 git tag and `main` still 5.9.3 as of 2026-10-23):
  - adds a Go WebRTC-to-RTSP gateway `ringstream` on TCP 8554 (`rtsp://host:8554/<camera_id>_live` and `<camera_id>_event`)
  - "no longer depends on the upstream ring-client-api"
  - supports native H.265 via a "Video Mode" setting (`Compatible`=H.264, `Optimal`=HEVC)
  - forwards video RTP without transcoding and transcodes "Audio packets (G.711 μ-law from Ring)" to AAC
  - lets multiple RTSP clients share one session, torn down about 5–10 s after the last client leaves
  - Sources: [ring-mqtt wiki: Video Streaming](https://github.com/tsightler/ring-mqtt/wiki/Video-Streaming); [dev CHANGELOG v6.0.0](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/docs/CHANGELOG.md); [GitHub dev commits](https://github.com/tsightler/ring-mqtt/commits/dev)
- Codec conflict: the wiki says Ring audio is G.711 μ-law; ring-client-api says Ring answers with "opus or pcmu" (pcmu is G.711 μ-law).

**Limits and behavior**
- "Ring enforces a time limit on active live streams and terminates them, typically after approximately 10 minutes, although sometimes significantly less and sometimes a little more." — [ring-mqtt FAQ](https://github.com/tsightler/ring-mqtt/wiki/Frequently-Asked-Questions-(FAQ))
- "all Ring cameras stream only via Ring cloud servers"; continuous streaming risks "high energy drain (especially for battery powered cameras) and overheating"; "Ring cameras will not send motion notifications while live streaming is active". — [ring-mqtt wiki: Video Streaming](https://github.com/tsightler/ring-mqtt/wiki/Video-Streaming)
- With a Protect plan, "all 'live streams' are actually recording sessions as well" (`on_demand` events). — [ring-mqtt FAQ](https://github.com/tsightler/ring-mqtt/wiki/Frequently-Asked-Questions-(FAQ))
- The push payload carries `live_session.max_duration` (value not observed). — [ring-types.ts L1088-1094](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-types.ts#L1088-L1094)
- HA's HLS adds 3–5 s of latency and keeps streams alive about 5 min; go2rtc/WebRTC is recommended. — [ring-mqtt FAQ](https://github.com/tsightler/ring-mqtt/wiki/Frequently-Asked-Questions-(FAQ))

### Inferences
- For an MCP bridge, the cheapest "show me the camera now" path is: start a WebRTC session (signalsocket path for a headless server), grab one keyframe or a few seconds via ffmpeg, then close immediately. That gives a fresh frame or a short clip without holding the camera.
- Live-view tools should be rate-limited and time-boxed, well under 10 min, and should warn that they blind motion detection and create `on_demand` recordings.
- A bridge in Node can depend on ring-client-api's `StreamingSession`. A Python or other-language bridge can port the ~10-message signaling protocol, which ringstream shows is portable to Go.
- `SimpleWebRtcSession` lets a browser client (e.g. an MCP UI) negotiate directly with Ring and keeps media off the bridge.
- `live_session.max_duration` in the push payload is plausibly Ring's per-session cap, consistent with the ~10 min observation. This is unverified.
- The opus-vs-μ-law audio discrepancy probably reflects what the client offers: ring-client-api offers opus, while ringstream receives μ-law. A bridge should handle both.

### Gaps
- No documented concurrent-stream limit per camera or per account was found. homebridge's "simultaneous stream limit" (9.13.0) is a plugin-side setting, not a Ring limit.
- The value of `live_session.max_duration` was not observed.
- Whether the signalling host or `api_version=4.0` change by region (EU/AU data residency) is unknown.
- Whether E2EE cameras can be live-streamed by these clients is not stated in code or docs. See section 5.

---

## 4. Snapshots: mechanisms, rules, battery-camera limits

### Takeaway
There are three snapshot mechanisms:
- The legacy timestamp-poll: POST `clients_api/snapshots/timestamps`, then GET `clients_api/snapshots/image/{id}`.
- The newer `app-snaps.ring.com/snapshots/next/{id}` long-poll with `extras=force`, used by ring-client-api since 2022.
- Fetching the event's notification image by `img.snapshot_uuid` (`clients_api/snapshots/uuid`).

Wired ("high-power") cameras snapshot on demand in milliseconds. Battery ("low-power") cameras are slow, drain battery when forced, and cannot snapshot while recording or streaming. Their motion snapshots therefore depend on the notification image, which requires Ring Protect plus Rich Notifications. Snapshots are blocked entirely when motion detection or recording is disabled (e.g. by Modes).

### Cited Findings
**Endpoints**
- python legacy flow:
  1. `POST /clients_api/snapshots/timestamps {"doorbot_ids":[id]}`
  2. poll the same endpoint, by default 3 tries × 1 s, until `timestamps[0].timestamp/1000 > request_time`
  3. `GET /clients_api/snapshots/image/{id}`
  - Sources: [doorbot.py L402-424](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/ring_doorbell/doorbot.py#L402-L424); [const.py L102-103](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/ring_doorbell/const.py#L102-L103)
- ring-client-api newer flow: `GET https://app-snaps.ring.com/snapshots/next/{id}?after-ms=&max-wait-ms=&extras=force&uuid=` (Accept `image/jpeg`). The response timestamps are used to track snapshot age. — [ring-camera.ts L620-652](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-camera.ts#L620-L652)
  - 9.25.0-beta.0 (2022-01-29) changelog: "slightly faster snapshots via new endpoint". The changelog does not name the endpoint. — [CHANGELOG](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/CHANGELOG.md)
- Event image: `GET clients_api/snapshots/uuid?uuid={snapshot_uuid}`. The uuid is cleaned by stripping everything after `:`. — [ring-camera.ts L119-125, L654-662](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-camera.ts#L654-L662)
  - Alternatively, `getNextSnapshot({uuid})` passes the uuid to app-snaps, which is what ring-mqtt does. — [ring-mqtt camera.js L741-791](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/camera.js#L741-L791)

**Rules in code (ring-client-api)**
- Timeout: `maxSnapshotRefreshSeconds = 15`. — [ring-camera.ts L46](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-camera.ts#L46)
- Snapshot lifetime is 10 s for normal cameras ("snapshot updates will be forced") and 600 s for battery cameras with `avoidSnapshotBatteryDrain`, because "battery cams only refresh timestamp every 10 minutes". — [ring-camera.ts L529-533](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-camera.ts#L529-L533)
- Snapshots are blocked when `settings.motion_detection_enabled === false`: "This can be caused by Modes settings or by turning off the Record Motion setting". Offline cameras also error. — [ring-camera.ts L525-558](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-camera.ts#L525-L558)
- `canTakeSnapshotWhileRecording` is false for any camera `operatingOnBattery` (battery present and `power_mode !== 'wired'`) and for wired model `doorbell_graham_cracker`. The 15 s timeout message adds "This is normal behavior since this camera is unable to capture snapshots while streaming". — [ring-camera.ts L127-129, L295-306, L598-606](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-camera.ts#L295-L306); [CHANGELOG 14.0.0](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/CHANGELOG.md)

**Community documentation (ring-mqtt FAQ)**
- "High-power" devices "can take a snapshot at any time and will generally respond … in a few milliseconds".
- "Low-power" devices "can take significantly longer to wake … and … cannot take a snapshot at all when they are recording/live streaming".
- Interval snapshots on battery cameras use "significantly more battery".
- Motion snapshots for low-power cameras use "the image UUID included in the push notification … this feature requires at least the basic Ring Protect Plan … If the account has no subscription, or Rich Notifications have not been enabled … ring-mqtt will not be able to retrieve a snapshot image on motion."
- Source: [ring-mqtt FAQ](https://github.com/tsightler/ring-mqtt/wiki/Frequently-Asked-Questions-(FAQ))

**Ring "Snapshot Capture" (`lite_24x7`)**
- ring-mqtt's automatic snapshot interval:
  - battery cameras: `settings.lite_24x7.frequency_secs` if `lite_24x7.enabled`, otherwise 600 s
  - wired cameras: 30 s
  - Source: [ring-mqtt camera.js L411-432](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/camera.js#L411-L432)
- Ring also exposes "periodical footage": `GET https://api.ring.com/recordings/public/footages/{id}?start_at_ms=&end_at_ms=&kinds=online_periodical&kinds=offline_periodical`. The source comment says "These will be mp4 clips that are created using periodic snapshots". The response is `{start_ms, end_ms, playback_ms, kind, url, deleted, snapshots[]}`. — [ring-camera.ts L502-511](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-camera.ts#L502-L511); [ring-types.ts L990-1006](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-types.ts#L990-L1006)

**Snapshot on event (ring-mqtt)**
- On a motion or ding push, ring-mqtt:
  - prefers `img.snapshot_uuid`;
  - otherwise forces a fresh snapshot only on non-battery cameras;
  - otherwise gives up ("battery cameras are unable to snapshot while recording");
  - retries up to 3× at 1 s intervals.
- Source: [ring-mqtt camera.js L741-791](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/camera.js#L741-L791)
- ring-client-api 10.0.0 also used notification images for "faster snapshots from camera notifications" (homebridge). — [CHANGELOG](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/CHANGELOG.md)

### Inferences
- A `get_snapshot` MCP tool should branch on power mode:
  - wired camera: force `snapshots/next` with `extras=force`;
  - battery camera: return the cached or notification image with its age, and only force when the agent explicitly accepts battery cost.
- For "what happened at event X", the notification `snapshot_uuid` is the best image and should be captured and cached at push time.
- Taking a frame from a live stream is the fallback when no snapshot is available. It costs a full WebRTC session, interrupts motion detection, and creates a recording.
- The "new endpoint" in 9.25.0-beta.0 is probably `app-snaps.ring.com/snapshots/next`, since that is what the current code uses. The changelog does not confirm this.
- Snapshot results should always carry a capture timestamp, since Ring can return a stale image. Both libraries track `timeMillis` / timestamps for this reason.

### Gaps
- No documented server-side rate limit for snapshot requests was found.
- Whether `snapshot_uuid` images remain retrievable after a retention window is not documented.
- Whether the legacy `snapshots/timestamps` + `snapshots/image` flow still works in 2026 was not verified. python still ships it; ring-client-api moved off it in 2022.

---

## 5. Recorded clips and history: APIs, download URLs, subscription, E2EE, AI search and descriptions

### Takeaway
Recorded clips require a Ring Protect (now "Ring Home") plan with video storage. Community code uses three coexisting history APIs:
- `clients_api/locations/{loc}/devices/{id}/events`, plus `video_search/history` (ring-client-api)
- `api.ring.com/evm/v2/history/devices/{id}` (ring-mqtt)
- `clients_api/doorbots/{id}/history` (python)

Download URLs come from `clients_api/dings/{id}/share/play` or `/recording`, from the evm `visualizations.cloud_media_visualization.media[]` entries, or from the async transcoding service `share_service/v2/transcodings/downloads`. URLs are pre-signed and expire (ring-mqtt treats them as valid about 15 min). With E2EE enabled, Ring says third-party integrations, ring.com viewing, Video Search, and Video Descriptions are unavailable. No community library exposes Ring's AI features, Smart Video Search or Video Descriptions.

### Cited Findings
**History endpoints**
- ring-client-api:
  - `getEvents` calls `GET clients_api/locations/{location_id}/devices/{id}/events?limit&kind&state=missed|accepted|person_detected&favorites&pagination_key`. It returns `{events: CameraEvent[], meta:{pagination_key}}`, where `CameraEvent` has `ding_id`, `ding_id_str`, `kind`, `state:'timed_out'|'completed'`, `recording_status:'ready'|'audio_ready'`, `cv_properties{detection_type, person_detected, stream_broken}`, and `favorite`. — [ring-camera.ts L478-486](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-camera.ts#L478-L486); [ring-types.ts L932-964](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-types.ts#L932-L964)
  - A location-wide variant exists: `clients_api/locations/{id}/events`. — [location.ts L482-489](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/location.ts#L482-L489)
  - `videoSearch` calls `GET clients_api/video_search/history?doorbot_id=&date_from=&date_to=&order=&api_version=11&includes[]=pva`. Results include `hq_url`, `lq_url`, `untranscoded_url`, `thumbnail_url`, `duration`, `had_subscription`, `preroll_duration`, and `cv_properties`. — [ring-camera.ts L488-500](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-camera.ts#L488-L500); [ring-types.ts L966-988](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-types.ts#L966-L988)
- ring-mqtt:
  - Per device: `GET https://api.ring.com/evm/v2/history/devices/{id}?event_types=motion|ding|on_demand&limit&pagination_key`. Items carry `event_id`, `start_time`, `cv.person_detected`, `recording_status`, and `visualizations.cloud_media_visualization.media[{file_type:'VIDEO', url}]`. — [base-polled-device.js L64-75](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/base-polled-device.js#L64-L75); [camera.js L335-363](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/camera.js#L335-L363)
  - Multi-device: `evm/v2/history/devices?source_ids=…&capabilities=offline_event&limit=100`. — [ring-mqtt lib/ring.js L227](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/lib/ring.js#L227)
  - v6 adds an `evm/v3` base. — [dev rest-client.js L42](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/lib/ring-client/rest-client.js#L42)
- python:
  - `URL_DOORBELL_HISTORY = /clients_api/doorbots/{id}/history` with `limit`, `older_than`, and `kind` (ding/motion/on_demand) filters
  - intercom history at `/evm/v2/history/locations/{loc}?ringtercom`
  - Sources: [const.py L91-111](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/ring_doorbell/const.py#L91-L111); [generic.py L163-195](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/ring_doorbell/generic.py#L163-L195)

**Download URLs**
- ring-client-api `getRecordingUrl(dingIdStr, {transcoded})` calls `GET clients_api/dings/{id}/share/play?disable_redirect=true` (default) or `…/recording?disable_redirect=true` (transcoded) and returns `{url}`. — [ring-camera.ts L513-519](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-camera.ts#L513-L519)
- python:
  - `async_recording_url` uses `share/play`.
  - `async_recording_download` downloads MP4 bytes from `/clients_api/dings/{id}/recording`.
  - Both refuse without a subscription, where `has_subscription` = `features.show_recordings`.
  - Sources: [doorbot.py L304-373](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/ring_doorbell/doorbot.py#L304-L373)
- ring-mqtt transcoding flow:
  1. `POST https://api.ring.com/share_service/v2/transcodings/downloads {ding_id, file_type:'VIDEO', send_push_notification:false}`
  2. poll `GET …/downloads/{event_id}?file_type=VIDEO` once per second for up to 60 s, until `status:'done'`
  3. read `result_url`
  - Source: [camera.js L1030-1090](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/camera.js#L1030-L1090)
- URL expiry:
  - The expiry is parsed from S3 `X-Amz-Expires` / `X-Amz-Date` and refreshed at 2/3 of its lifetime. — [camera.js L945-993](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/camera.js#L945-L993)
  - The wiki says "recordingUrls are only valid for 15 minutes". — [ring-mqtt wiki: Video Streaming](https://github.com/tsightler/ring-mqtt/wiki/Video-Streaming)

**Subscription**
- "use of this feature requires a Ring Protect plan that supports video storage". — [ring-mqtt wiki](https://github.com/tsightler/ring-mqtt/wiki/Video-Streaming)
- HA: the `last_recording` camera (with a `video_url` attribute) requires a Ring subscription or Protect plan. — [HA Ring integration](https://www.home-assistant.io/integrations/ring/)
- ring-mqtt auto-detects "no Ring Protect subscription" when no motion event yields a VIDEO url. — [camera.js L358-362](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/camera.js#L358-L362)

**E2EE**
- Ring lists these as "Not available with end-to-end encryption": Active Warnings, Alexa and Fire TV integration, Alexa+ Greetings, Bird's Eye View, Familiar Faces, Motion Tracking, ring.com viewing, Shared Users, Single Event Alert, Smart Alerts, **Third-party integrations**, Unusual Event Alert, **Video Descriptions**, Video links, **Video Search**, Virtual Security Guard.
- Rich Notifications remain available.
- "Only your enrolled mobile devices can view videos". E2EE uses a 12-word passphrase.
- Unsupported cameras: Video Doorbell 1st/2nd Gen, Video Doorbell Wired, Stick Up Cam 1st/2nd Gen, Spotlight Cam Battery 1st Gen, Peephole Cam, Car Cam.
- Source: [Ring support: Using Video End-to-End Encryption](https://ring.com/support/articles/myr75/using-video-end-to-end-encryption)
- Feature lists differ by region. The US page includes items such as Active Warnings and Virtual Security Guard that the UK page lacks. — [Ring UK E2EE article](https://ring.com/gb/en/support/articles/7e3lk/Understanding-Video-End-to-End-Encryption-E2EE)
- The push payload exposes `data.device.e2ee_enabled`. — [ring-types.ts L1066-1072](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-types.ts#L1066-L1072)

**Ring AI features**
- Smart Video Search: natural-language search over recorded events, announced October 2024 alongside the Ring Home plans (launched 2024-11-05). — [PCWorld](https://www.pcworld.com/article/2482645/ring-launches-ai-based-smart-video-search.html); [CE Pro](https://www.cepro.com/briefs/ring-introduces-smart-video-search/142642)
- Video Descriptions: generative-AI text summaries in motion notifications, e.g. "A person is walking up the steps with a black dog". It is a beta for Ring Home Premium subscribers in the US and Canada, reported June 2025. — [About Amazon](https://www.aboutamazon.com/news/devices/ring-video-descriptions-gen-ai); [CE Pro](https://www.cepro.com/news/ring-introduces-ai-powered-video-descriptions-in-latest-update/619632); [Tom's Guide](https://www.tomsguide.com/home/smart-home/rings-new-ai-feature-summarizes-security-camera-footage-for-you-those-alerts-just-got-less-annoying)
- Neither feature is implemented in ring-client-api 14.3.0, python-ring-doorbell 0.9.14, or ring-mqtt 5.9.3 / 6.0.0. A case-insensitive grep for `vehicle|package|smart_search|video_description|ai_description|pva|e2ee` in those trees hit only:
  - `includes[]=pva` in `videoSearch`
  - `moving_vehicle` in `cv_settings`
  - the `e2ee_enabled` type
  - (local grep of pinned sources listed above; see [ring-camera.ts L496](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-camera.ts#L496))

### Inferences
- The MCP bridge should treat clip access as a capability gated on three conditions:
  1. the plan includes video storage (`features.show_recordings`, or a VIDEO url present in evm history);
  2. E2EE is off for the device (`e2ee_enabled`);
  3. `recording_status === 'ready'`.
- Pre-signed URLs should be fetched lazily and never cached past about 10 min.
- Because Video Descriptions reach users as notification text, the description may appear in the FCM push `android_config.body`. This is unverified and must be tested with a Premium account before relying on it.
- Smart Video Search has no known API, so the bridge would have to build its own "search" over history metadata (kind, `cv_properties`, timestamps), or run its own vision model on downloaded clips and snapshots.
- `evm/v2` and now `evm/v3` look like Ring's newer history service, given that ring-mqtt moved there and python uses it for intercoms. Calling evm the "current" API is my inference.

### Gaps
- Ring's retention periods per plan (e.g. 180 days on Premium per [PCWorld](https://www.pcworld.com/article/2963250/finally-ring-cams-will-stop-bombarding-you-with-ai-alerts.html)) and how retention shows up in the API were not verified in code.
- The meaning of `includes[]=pva` is undocumented.
- Whether E2EE blocks only clip download or also WebRTC live view and snapshots for third-party clients is not stated by any community source. Ring's list says "Third-party integrations" generically.
- No source shows whether AI description text exists in any history/evm field.

---

## 6. Event-to-video correlation: from a push `ding.id` to its clip

### Takeaway
The push's `data.event.ding.id` is the key. Treat it as a string. It equals the history `ding_id` / `ding_id_str` / evm `event_id` and is what `clients_api/dings/{id}/share/play|recording` and `share_service/v2/transcodings/downloads` accept. The recording is not available at push time. Community tools wait for the event to appear in history with `recording_status:'ready'` (ring-mqtt polls history about every minute), or wait a fixed delay (HA's example waits 5 min). Transcoded downloads can take up to about 60 s more.

### Cited Findings
- Truncated numeric ding ids "[were] unusable for fetching additional information about the ding". The string id fixes this. — [CHANGELOG 11.7.7 / PR #1222](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/CHANGELOG.md)
- `getRecordingUrl(dingIdStr)` takes the string ding id directly. — [ring-camera.ts L513-519](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-camera.ts#L513-L519)
- The transcoding API keys on `ding_id = event.event_id` from evm history. — [ring-mqtt camera.js L1047-1055](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/camera.js#L1047-L1055)
- ring-mqtt documents the correlation pattern: trigger on the motion push, then `wait_for_trigger` on the event-select `eventId` attribute changing (timeout `00:05`), which "indicates that the recording of the new event is ready", then download `recordingUrl`. — [ring-mqtt wiki: Video Streaming](https://github.com/tsightler/ring-mqtt/wiki/Video-Streaming)
- ring-mqtt "Checks for new events or expired recording URL every 3 polling cycles (~1 minute)". — [camera.js L439](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/camera.js#L439)
- It shows `<Transcoding in Progress>` / `<Recording Not Found>` placeholders while unavailable. — [camera.js L832, L1057-1059](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/camera.js#L1057-L1059)
- HA's documented example automation waits five minutes after an event before downloading `last_recording` `video_url`. — [HA Ring integration](https://www.home-assistant.io/integrations/ring/)
- Ring Protect recordings include pre-roll ("pulls the seconds just before the event"). A client-triggered stream recording "will always miss the first few seconds". — [ring-mqtt wiki](https://github.com/tsightler/ring-mqtt/wiki/Video-Streaming)
- `VideoSearchResult.preroll_duration` exists. — [ring-types.ts L966-988](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-types.ts#L966-L988)
- Person filtering: ring-mqtt scans up to 4 pages × 50 motion events for `cv.person_detected` to find "person" events. 6.0.0 fixed a bug where only the first page was checked. — [camera.js L997-1015](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/camera.js#L997-L1015); [dev CHANGELOG](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/docs/CHANGELOG.md)

### Inferences
- An MCP `get_event_clip(ding_id)` tool should behave as follows:
  1. look up the event in history by id;
  2. if absent or not `ready`, return a "pending" status with retry-after (about 30–60 s), rather than blocking;
  3. once ready, fetch a fresh signed URL;
  4. optionally use the transcoding service for a standard MP4.
- Event records should be persisted at push time with id, device, kind, detection type, `snapshot_uuid`, and timestamps. Agents can then correlate later even after the 65–180 s in-memory "active ding" windows expire.

### Gaps
- No measured distribution of push-to-`recording_status:'ready'` delay was found. The 1-minute poll and 5-minute wait are heuristics, not measurements.
- Whether `share/play` returns a usable URL before `recording_status` becomes `ready` is undocumented.

---

## 7. Practical limits and failure modes (2023–2026)

### Takeaway
The dominant failure classes are:
- push registration drift: too many "Authorized Client Devices", a new device registered on every restart, stale credentials;
- network blocking of `mtalk.google.com:5228`;
- Ring-side filtering: app notification toggles, Smart Notifications, Modes, shared-user permissions;
- session expiry outside the US (data residency);
- periodic Ring/Google protocol changes: FCM v1 in 2024, websocket in 2025, push decryption in 2026.

Cameras also stop emitting motion events while streaming.

### Cited Findings
**Authorized client devices**
- Ring "limits how many devices can receive push notifications" (no number given), and libraries could add a device registration on each start.
- Fix:
  1. stop the integration;
  2. in Ring app → Control Center → Authorized Client Devices, remove entries named `homebridge-ring`, `ring-client-api`, `ring-mqtt-addon`, or "Device name not found";
  3. create a new refresh token;
  4. restart.
- "Remove All Devices" logs out other devices and re-enables ding/motion settings that had been disabled.
- Source: [dgreif wiki: Notification Troubleshooting](https://github.com/dgreif/ring/wiki/Notification-Troubleshooting)
- HA: before 2023.12.0 the integration "added a new entry on every restart". Remove `ring-doorbell:HomeAssistant` / `Python` entries, use Reconfigure to get a new unique ID, and toggle the device's Motion Warning off and on, which "has restored alerts for many users". — [HA Ring integration](https://www.home-assistant.io/integrations/ring/)
- ring-client-api 11.8.0 (2023-06-09) embedded the hardware id in the refresh token to stop duplicate Control Center devices. — [CHANGELOG](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/CHANGELOG.md)

**Network**
- The FCM socket needs TCP 5228 and correct regional DNS for `mtalk.google.com`. DNS-over-HTTPS can return wrong-region servers that refuse connections. — [dgreif wiki](https://github.com/dgreif/ring/wiki/Notification-Troubleshooting); [api.ts L299-309](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/api.ts#L299-L309)

**App-side filtering**
- "if you use Ring app features such as Smart Notifications to restrict which notifications are received, this will also limit the events which get sent to ring-mqtt … If you want ring-mqtt to receive all notifications they must be fully enabled in the Ring app." — [ring-mqtt FAQ](https://github.com/tsightler/ring-mqtt/wiki/Frequently-Asked-Questions-(FAQ))

**Data residency**
- 11.7.6: Ring is believed to delete session data after about 24 h outside the US "for Data Residency reasons", so sessions are recreated every 12 h (issue #1218).
- 11.7.7: re-subscribe to ding/motion on each refresh.
- 11.8.0: "Remove forced session creation on startup … fix issues where notifications stop working immediately after a restart".
- Source: [CHANGELOG](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/CHANGELOG.md)
- python mirrors this with a 12 h refresh. — [eventlistener.py L49](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/ring_doorbell/listen/eventlistener.py#L49)

**Protocol breakages by date**
- 2024-08: FCM legacy deprecation broke the push listeners in both libraries until the v1 migration (13.0.0 on 2024-08-04; 0.9.2 on 2024-08-29). — [PR #1435](https://github.com/dgreif/ring/pull/1435); [python CHANGELOG](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/CHANGELOG.md)
- 2025-05: location websocket failures; socket.io replaced (14.0.0, ring-mqtt 5.8.1). — [CHANGELOG 14.0.0](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/CHANGELOG.md); [ring-mqtt CHANGELOG](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/docs/CHANGELOG.md)
- 2026-03: `ERR_CRYPTO_ECDH_INVALID_PUBLIC_KEY` push decryption failures causing missed events, fixed with a patched push-receiver (ring-mqtt 5.9.3). — [ring-mqtt CHANGELOG v5.9.3](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/docs/CHANGELOG.md)
- 2026-10: ring-mqtt 6.0.0 moves to the v3 discovery APIs, "required for some newer devices as well as the new shared permissions model". — [dev CHANGELOG](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/docs/CHANGELOG.md)

**Streaming side effects**
- No motion events while a stream is active.
- About 10 min stream cap.
- Background stream preloading (HA "Preload Stream", or Picture Glance "live") causes missed motion and heavy bandwidth.
- Source: [ring-mqtt FAQ](https://github.com/tsightler/ring-mqtt/wiki/Frequently-Asked-Questions-(FAQ))

**Modes and settings gates**
- Snapshots are blocked when Modes disable motion recording.
- Streaming is blocked when Modes set `live_view_disabled` (enforced since 14.3.0, 2026-02-08).
- Source: [ring-camera.ts L432-442, L546-558](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-camera.ts#L432-L442)

**Duplicate events**
- Battery doorbells send two pushes per event (without and then with an image). — [eventlistener.py L268-284](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/ring_doorbell/listen/eventlistener.py#L268-L284)
- HA notes duplicate ring alerts on some models. — [HA Ring integration](https://www.home-assistant.io/integrations/ring/)
- ring-client-api discards pushes in the first 2 s after connect. — [api.ts L318-327](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/api.ts#L318-L327)

**Ring's own framing**
- ring-mqtt says the project "uses the same API used by the Ring apps, if you can't perform a function in the app then it's unlikely to be possible via the API". — [ring-mqtt FAQ](https://github.com/tsightler/ring-mqtt/wiki/Frequently-Asked-Questions-(FAQ))

### Inferences
- The bridge should expose a health resource covering:
  - FCM connected/last-heartbeat;
  - time since the last push per device;
  - websocket connected per location;
  - token age.
- Optionally, a slow fallback poll of evm history (e.g. every 1–5 min) can detect events missed by push. That recovers the "polling sees everything" property the pre-2022 approach had.
- Use one stable hardware id and persisted FCM credentials per bridge install. Name the client device clearly so users can find it in Control Center.
- Expect at least one breaking Ring/Google-side change per year, and keep transport adapters swappable.
- Library staleness: python-ring-doorbell's last release was 0.9.14 on 2026-02-27/28, after a 15-month gap since 0.9.13 (2024-11-26). ring-client-api released 14.3.0 on 2026-02-08 with commits through 2026-10-22. ring-mqtt 6.0.0 has now forked away from ring-client-api into its own embedded client. For a Node bridge, ring-client-api is the most actively maintained base. Watch ring-mqtt v6's embedded client for newer v3 endpoints. Sources: [PyPI history](https://pypi.org/project/ring-doorbell/#history); [npm](https://registry.npmjs.org/ring-client-api); [ring-mqtt dev commits](https://github.com/tsightler/ring-mqtt/commits/dev)

### Gaps
- No Ring-published cap on authorized client devices or push-receiving devices was found.
- Whether Ring delivers pushes to all registered devices or to just one, and under what conditions, is not definitively documented. The dgreif wiki says only that the number of devices is limited.
- No quantitative missed-notification rates or FCM reconnect frequencies were found.
- Ring's Terms of Service position on unofficial API use was not examined; it is out of scope.
