# Live Video and Live Frame Capture for a Ring MCP Bridge (Unofficial API, .NET-first)

Research date: 2026-10-24.

This note covers only what is new relative to `research_notes/Ring MCP bridge research/realtime_events_and_video.md` (written 2026-10-23). That earlier note already covers:
- the SIP-to-WebRTC history;
- the signalsocket ticket and the `wss://api.prod.signalling.ring.devices.a2z.com` flow, `activate_session`, and the 5 s ping;
- `SimpleWebRtcSession`;
- the snapshot endpoints;
- the ~10 min cap;
- motion suppression while streaming;
- `on_demand` recordings.

Facts reused from it are re-cited to their original sources below.

**Pinned source snapshots** (shallow clones taken 2026-10-24). Line numbers refer to these commits.

| Project | Commit | Date | Notes |
|---|---|---|---|
| dgreif/ring (ring-client-api 14.3.0) | `925a3aa` | 2026-10-22 | |
| tsightler/ring-mqtt `dev` (v6.0.0) | `996be5b` | 2026-10-19 | contains the Go gateway `ringstream` |
| AlexxIT/go2rtc `master` | `c245815` | 2026-07-13 | latest release v1.9.14, 2026-01-19 |
| koush/scrypted (plugins/ring) | `78320e9` | 2026-10-17 | |
| modelcontextprotocol/modelcontextprotocol (spec) | `dae694f` | 2026-10-23 | |
| modelcontextprotocol/ext-apps (MCP Apps) | `266a9e3` | 2026-10-23 | |
| sipsorcery-org/sipsorcery `master` | `caa180d` | 2026-10-23 | |

"Inference" marks my own reasoning rather than something a source states.

The official Ring developer API's live view is covered by another researcher. It is mentioned here only where it touches these options.

---

## 1. How unofficial Ring live view works today (2026): signaling, codecs, limits, keepalive, E2EE, plan

### Takeaway
All community clients use one protocol: Ring's cloud-relayed WebRTC "live_view" service. The flow is:
1. Fetch a short-lived ticket by REST (`clap/ticket/request/signalsocket`).
2. Open a JSON websocket to Ring's signaling host and send `live_view` with an SDP offer.
3. Trickle ICE, receive the SDP answer, then send `activate_session` and pings every 5 s.

Media is H.264 by default, with H.265 negotiable on newer models since ring-mqtt 6.0.0. Audio is Opus (or μ-law). SIP is gone, removed in 2022.

As of October 2026 the protocol has been reimplemented independently three times: TypeScript (werift, ring-client-api), Go (pion, go2rtc since v1.9.13 on 2025-12-14), and Go again (ringstream in ring-mqtt 6.0.0, 2026-10-20). That makes it well understood and portable.

Limits:
- Sessions end after about 10 min.
- Motion events stop while a session is live.
- With a plan (the user has Multi), every live view is also recorded as an `on_demand` event.
- No per-camera concurrency limit is documented.

### Cited Findings
**Signaling and session protocol**
- The flow has four steps, per the earlier note's sources ([webrtc-connection.ts](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/streaming/webrtc-connection.ts); [ring-camera.ts L419-429](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-camera.ts#L419-L429)):
  1. `POST .../api/v1/clap/ticket/request/signalsocket` returns `{ticket}`.
  2. Connect to `wss://api.prod.signalling.ring.devices.a2z.com/ws?api_version=4.0&auth_type=ring_solutions&client_id=ring_site-{uuid}&token={ticket}`.
  3. Send `{method:'live_view', body:{doorbot_id, stream_options, sdp}}`.
  4. After the answer, send `activate_session`, which is "required to keep the stream alive longer than 70 seconds", then ping every 5 s.
- go2rtc's independent Go implementation matches this protocol:
  - same signaling URL — [go2rtc pkg/ring/ws.go L115](https://github.com/AlexxIT/go2rtc/blob/c245815e75e2a5fd60b4290f12bfc04e55a984d3/pkg/ring/ws.go#L115)
  - a 5 s ticker sending `ping` — [ws.go L158-166](https://github.com/AlexxIT/go2rtc/blob/c245815e75e2a5fd60b4290f12bfc04e55a984d3/pkg/ring/ws.go#L158-L166)
  - `activate_session` — [ws.go L197](https://github.com/AlexxIT/go2rtc/blob/c245815e75e2a5fd60b4290f12bfc04e55a984d3/pkg/ring/ws.go#L197)
  - ticket from `clap/ticket/request/signalsocket` — [api.go L389-400](https://github.com/AlexxIT/go2rtc/blob/c245815e75e2a5fd60b4290f12bfc04e55a984d3/pkg/ring/api.go#L389-L400)
  - Kinesis Video STUN servers (`stun.kinesisvideo.us-east-1/2, us-west-2 .amazonaws.com:443`) plus Google STUN — [client.go L75-87](https://github.com/AlexxIT/go2rtc/blob/c245815e75e2a5fd60b4290f12bfc04e55a984d3/pkg/ring/client.go#L75-L87)
- Ring-side close codes, from server error strings quoted in source comments — [streaming-messages.ts L55-73](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/streaming/streaming-messages.ts#L55-L73):
  - `0` normal close
  - `5` auth failed, e.g. `rsl-apps/webrtc-liveview-server/Session.cpp ... Unauthorized: invalid or expired token`, or "Sessions with the provided ID not found"
  - `6` "Timeout waiting for ping"
  - A `stream_info` message carries `transcoding: boolean` and `transcoding_reason: 'codec_mismatch'`.
- ringstream (Go, ring-mqtt 6.0.0) waits up to 30 s for Ring's SDP answer before giving up ("timed out waiting for answer from Ring"). — [ringstream/main.go L268-276](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/ringstream/main.go#L268-L276)

**Codecs**
- ring-client-api offers `audio/opus` and `video/H264`, and uses RTCP PLI for keyframes. — [peer-connection.ts L15-131](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/streaming/peer-connection.ts)
- go2rtc's Ring producer exposes `opus` audio and `H264` video. — [client.go L175-190](https://github.com/AlexxIT/go2rtc/blob/c245815e75e2a5fd60b4290f12bfc04e55a984d3/pkg/ring/client.go#L175-L190)
- ringstream:
  - offers H.264 `packetization-mode=1;profile-level-id=640034` (High profile, level 5.2) — [main.go L70](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/ringstream/main.go#L70)
  - advertises NACK/PLI, and RTX (`apt=96`) — [main.go L61-99](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/ringstream/main.go#L61-L99)
  - takes a `-video-codec h264|h265` flag — [session.go L131](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/ringstream/session.go#L131)
- ring-mqtt 6.0.0 "Video Mode":
  - `Compatible` = H.264 for all cameras (the default)
  - `Optimal` = "attempt to negotiate H.265 on cameras that support it"
  - H.265 playback "depends entirely on the combination of browser and OS capability", and hardware H.265 decoders are "much more sensitive to packet loss"
  - Source: [ring-mqtt dev CHANGELOG v6.0.0 L1-21](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/docs/CHANGELOG.md)
- Background from the same changelog's earlier entries:
  - "Ring is actively enabling the H.265/HEVC codec on some newer camera models and the Ring Android-app based API … actively rejects any other protocol for these cameras".
  - A later fix switched to "a different streaming API that is able to negotiate down to H.264/AVC for these cameras on-the-fly".
  - Source: [CHANGELOG L304-317](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/docs/CHANGELOG.md)
- ringstream transcodes "Audio packets (G.711 μ-law from Ring)" to AAC. ring-client-api says Ring answers "opus or pcmu". So a bridge must handle both. — [ring-mqtt wiki: Video Streaming](https://github.com/tsightler/ring-mqtt/wiki/Video-Streaming); [streaming-session.ts](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/streaming/streaming-session.ts)

**Stream start-up behavior (relevant to frame grabs)**
- "Ring hands over a backlog when a session opens — several seconds of it on a doorbell. … ringstream drains the backlog and re-anchors on the **newest** complete keyframe, so playback starts near the live edge instead of seconds in the past." — [ringstream README §2](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/ringstream/README.md)
- Ring "only sends [SPS/PPS/VPS] in-band alongside each keyframe". "A Picture Loss Indication is sent to Ring at startup (and retried) so the first keyframe arrives promptly rather than on Ring's ~2-second cadence." — [ringstream README §1, §4](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/ringstream/README.md)
- Loss handling matters over the cloud relay: NACK/RTX recovery, an adaptive reorder buffer of 50–400 ms, and resync-to-keyframe on unrecoverable loss. — [ringstream README §6-8](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/ringstream/README.md)

**Session duration, concurrency, side effects**
- ~10 min cap:
  - "Ring enforces a time limit on active live streams and terminates them, typically after approximately 10 minutes, although sometimes significantly less and sometimes a little more." — [ring-mqtt FAQ](https://github.com/tsightler/ring-mqtt/wiki/Frequently-Asked-Questions-(FAQ))
  - A Best Buy Q&A answer attributed to Ring staff says Live View "will automatically turn off after 10 minutes". This comes from a search-result summary, not a fetched page. — [Best Buy Q&A](https://www.bestbuy.com/site/questions/ring-indoor-1080p-security-camera-1st-gen-black/6375685/question/72eda12d-e936-3b5d-a84f-dfd1c06b8581)
- Ring's own "Using Live View" support article URL returned 404 on 2026-10-24, so this is not confirmed from a primary Ring page. — (fetch of `ring.com/support/articles/2wnnp/Using-Live-View`)
- "Ring cameras will not send motion notifications while live streaming is active"; "all Ring cameras stream only via Ring cloud servers". — [ring-mqtt wiki: Video Streaming](https://github.com/tsightler/ring-mqtt/wiki/Video-Streaming)
- With a Protect plan, "all 'live streams' are actually recording sessions as well". — [ring-mqtt FAQ](https://github.com/tsightler/ring-mqtt/wiki/Frequently-Asked-Questions-(FAQ))
- Scrypted's Ring README: "I can constantly see Live View recordings in Ring App — Turn off 'PAM DIFF', 'OPEN CV' and 'PREBUFFER'. All of these will cause continuous connection to Live View. This will stop motion event delivery and clutter Ring app with Live View Recordings." — [scrypted plugins/ring/README.md](https://github.com/koush/scrypted/blob/78320e94ad977a77fa2bb201346b98630b8b1d47/plugins/ring/README.md)
- Concurrency:
  - ring-mqtt shares one Ring session across multiple RTSP readers and stops the camera when nothing is watching ("released %s with nothing watching, stopping the camera"). — [ringstream/server.go ~L446-462](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/ringstream/server.go)
  - python-ring-doorbell 0.9.5 added "multiple sessions per device". — [python CHANGELOG](https://github.com/python-ring-doorbell/python-ring-doorbell/blob/486193a80e7c924a0ab14b04d47305e1b36e419e/CHANGELOG.md)
  - No Ring-imposed concurrency number was found (see Gaps).
- Keepalive vs. extension:
  - The only documented keepalives are `activate_session`, which is needed to pass about 70 s, and the 5 s session `ping`, where missing pings produce close code 6 "Timeout waiting for ping".
  - No source shows any message or API that extends a session beyond Ring's ~10 min cutoff.
  - The community pattern is to let the session end and open a new one; ring-mqtt documents the cutoff as a Ring-enforced limit. — [webrtc-connection.ts L135-150, L291-297](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/streaming/webrtc-connection.ts#L291-L297); [streaming-messages.ts L63-73](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/streaming/streaming-messages.ts#L63-L73); [ring-mqtt FAQ](https://github.com/tsightler/ring-mqtt/wiki/Frequently-Asked-Questions-(FAQ))
  - Whether ringstream or go2rtc automatically re-open a session after Ring cuts it was not verified (see §4 Gaps).
- Mode gating: since ring-client-api 14.3.0 (2026-02-08), `startLiveCall` throws if `settings.live_view_disabled === true` (Modes). — [ring-camera.ts L432-442](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-camera.ts#L432-L442)

**Plan and E2EE**
- Plan:
  - Live View itself does not require Ring Protect, per a Ring community page and a Ring staff community reply. Both come from search-result summaries, not fetched pages. — [Ring Community: Live View](https://community.ring.com/t/live-view-for-ring-video-doorbells-and-security-cameras/132513); [Ring Community: No Live View without Ring Protect](https://community.ring.com/t/no-live-view-without-ring-protect/31070)
  - Recording of live views needs a plan, and the user has Ring Multi. — [ring-mqtt FAQ](https://github.com/tsightler/ring-mqtt/wiki/Frequently-Asked-Questions-(FAQ))
- E2EE:
  - With E2EE on, Ring lists "Third-party integrations" as unavailable, and "only your enrolled mobile devices can view videos". — [Ring support: Using Video E2EE](https://ring.com/support/articles/myr75/using-video-end-to-end-encryption)
  - The push payload carries `data.device.e2ee_enabled`. — [ring-types.ts L1066-1072](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-types.ts#L1066-L1072)
  - The user has E2EE off, so this is not blocking.
- Official API: Ring's official developer platform also exposes a WebRTC live view. It is covered by the other researcher and not analysed here.

### Inferences
- The protocol has stayed stable through 2025–2026 across three independent implementations. Ticket, websocket, offer/answer, trickle ICE, `activate_session`, and the 5 s ping are identical in TypeScript and both Go codebases. Porting the signaling half to C# (ClientWebSocket + HttpClient) is low risk. The hard part is the WebRTC media stack, not the signaling (see §4).
- Every agent-initiated live view has three side effects on this user's Multi plan:
  - it creates an `on_demand` recording visible in the Ring app timeline;
  - it blinds motion events on that camera for the session;
  - it consumes battery on the two doorbells.
- The bridge should therefore treat "live view" as an explicit, rate-limited, time-boxed action, not a passive read.
- Because Ring sends a multi-second backlog at session start, the first decodable frame of a session may show the past, by "several seconds on a doorbell". A "current frame" grabber must drain to the newest keyframe, or wait 1–3 s after start and request a PLI, rather than taking the first keyframe.
- For H.265-capable models, offering only H.264 keeps the "Compatible" path. Ring then transcodes server-side (`stream_info.transcoding_reason: codec_mismatch`). That is simplest for a frame-grab pipeline.

### Gaps
- No primary Ring document states the live-view cap. "~10 minutes" is community observation plus a Ring-staff Q&A snippet. `live_session.max_duration` in pushes was not observed.
- No documented per-camera or per-account concurrent-session limit, and no documented behavior when the Ring app and the bridge view the same camera at once.
- Which of the user's models negotiate H.265 (e.g., Battery Doorbell 2K Plus) is unverified. No source lists HEVC-capable models.
- Whether the signaling host or `api_version=4.0` differs for accounts outside the US (Israel) is unknown. All three implementations hard-code the US host.

---

## 2. Snapshot freshness and how to get a genuinely fresh image; time-to-first-frame

### Takeaway
Wired cameras (Floodlight Cam Wired, Floodlight Cam Plus Wired) can produce an on-demand snapshot via `app-snaps.ring.com/snapshots/next/{id}?extras=force`. The image is roughly current: no more than about 10 s old.

The Outdoor/Stick Up Cam comes in battery, plug-in and solar variants, so its class depends on the variant the user has and must be read from `power_mode`/battery fields. This is unverified for the user's unit.

Battery cameras (Video Doorbell 4 and Battery Doorbell 2K Plus when on battery) differ:
- Their snapshot timestamp refreshes only about every 10 min.
- They cannot snapshot while recording or streaming.
- Forcing a snapshot costs battery.

During motion they also cannot snapshot. The best image is then the push notification's `snapshot_uuid` image, which needs a plan plus Rich Notifications.

No community project grabs a frame from a live stream by default to get a "current" battery-cam image. The generic tool that does this is go2rtc's `/api/frame.jpeg`: start the stream, wait for a keyframe, transcode it to JPEG with ffmpeg, then stop. It works with Ring sources. No published time-to-first-frame measurements exist.

### Cited Findings
**Freshness rules in code and wiki**
- ring-client-api:
  - Snapshot lifetime is 10 s for normal cameras.
  - With `avoidSnapshotBatteryDrain` it is 600 s for battery cameras, because "battery cams only refresh timestamp every 10 minutes".
  - Source: [ring-camera.ts L529-533](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-camera.ts#L529-L533)
- `canTakeSnapshotWhileRecording` is false for any camera operating on battery. — [ring-camera.ts L295-306](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-camera.ts#L295-L306)
- dgreif wiki "Snapshot Limitations", last edited 2020-07-04, so possibly dated — [wiki](https://github.com/dgreif/ring/wiki/Snapshot-Limitations):
  - Battery cameras "(even when plugged in to a power source) are unable to take a snapshot while video is being recorded"
  - "Wired cameras … allow snapshots while video is being captured … they will be no more than 10 seconds old at the time of the notification"
  - A motion event "triggers a video recording and blocks … fetch[ing] a new snapshot for 30-40 seconds"
  - "notifications snapshots are most likely stale"
  - Modes can "disable motion detection, which prevents new snapshots from being captured"
- ring-mqtt 6.0.0 snapshot policy — [ring-mqtt dev camera.js L400-420, L823-870](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/devices/camera.js#L400-L420):
  - "Auto" mode enables interval snapshots only for non-battery cameras (`interval = !operatingOnBattery`).
  - Battery cameras default to `lite_24x7.frequency_secs` (Ring "Snapshot Capture") or 600 s.
  - Wired cameras default to 30 s.
  - On motion or ding it prefers the push `snapshot_uuid`. Otherwise it forces a snapshot only on wired cameras, and otherwise logs "battery cameras are unable to snapshot while recording".
- Scrypted `takePicture()` — [scrypted camera.ts L651-690](https://github.com/koush/scrypted/blob/78320e94ad977a77fa2bb201346b98630b8b1d47/plugins/ring/src/camera.ts#L651-L690):
  1. Uses a prebuffered stream if one exists.
  2. Otherwise, if not `snapshotsAreBlocked`, GETs `https://app-snaps.ring.com/snapshots/next/{id}`.
  3. On failure it "fall[s] back to cache" via `clients_api/snapshots/image/{id}`.
- homebridge-ring:
  - caches snapshots for `snapshotLifeTime + 2 min` and returns the cached image immediately — [camera-source.ts L400-470](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/homebridge-ring/camera-source.ts#L400-L470)
  - its `avoidSnapshotBatteryDrain` option fetches battery-camera snapshots "at a minimum 10 minute interval" — [config.schema.json L80-83](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/homebridge-ring/config.schema.json#L80-L83)
- go2rtc's Ring snapshot mode (`ring:?…&snapshot`) GETs `https://app-snaps.ring.com/snapshots/next/{cameraID}` with no `extras=force` or `after-ms` parameters. — [go2rtc pkg/ring/snapshot.go L44-46](https://github.com/AlexxIT/go2rtc/blob/c245815e75e2a5fd60b4290f12bfc04e55a984d3/pkg/ring/snapshot.go#L44-L46)
  - For comparison, ring-client-api adds `extras=force` and `after-ms` to request a fresh image. — [ring-camera.ts L620-652](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-camera.ts#L620-L652)

**Frame-from-stream mechanisms**
- go2rtc `GET /api/frame.jpeg?src=<stream>` — [go2rtc internal/mjpeg/mjpeg.go L27, L39-100](https://github.com/AlexxIT/go2rtc/blob/c245815e75e2a5fd60b4290f12bfc04e55a984d3/internal/mjpeg/mjpeg.go#L39-L100):
  - adds a keyframe consumer to the stream, which starts the producer;
  - takes the first keyframe ("init and first frame");
  - removes the consumer;
  - for H.264/H.265 runs `ffmpeg.JPEGWithQuery` to make a JPEG.
- Options include `width/height`, `rotate`, `hw`, and `cache=<duration>`, which returns a cached frame if newer than that duration. — [internal/mjpeg/README.md](https://github.com/AlexxIT/go2rtc/blob/c245815e75e2a5fd60b4290f12bfc04e55a984d3/internal/mjpeg/README.md)
- When the last consumer is removed, go2rtc calls `stopProducers()` immediately, with no linger timer, for producers with no remaining senders. A one-shot frame grab therefore tears the Ring session down right away. — [internal/streams/stream.go L64-118](https://github.com/AlexxIT/go2rtc/blob/c245815e75e2a5fd60b4290f12bfc04e55a984d3/internal/streams/stream.go#L64-L118)
- go2rtc can also produce MP4 clips: `/api/stream.mp4?src=…&duration=15&filename=record.mp4`. HLS is available via `/api/stream.m3u8`. — [internal/mp4/README.md L12-16](https://github.com/AlexxIT/go2rtc/blob/c245815e75e2a5fd60b4290f12bfc04e55a984d3/internal/mp4/README.md); [internal/hls/hls.go L21-28](https://github.com/AlexxIT/go2rtc/blob/c245815e75e2a5fd60b4290f12bfc04e55a984d3/internal/hls/hls.go#L21-L28)
- ring-client-api's own primitives:
  - `camera.recordToFile(path, seconds)`; the example records 10 s to MP4 — [examples/record-example.ts](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/examples/record-example.ts)
  - `camera.streamVideo({output:[ffmpeg args]})`; the browser example writes HLS (`-f hls -hls_time 2`) and stops after 5 min — [examples/browser-example.ts](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/examples/browser-example.ts)
  - A single-frame grab would use the same `streamVideo` with ffmpeg `-frames:v 1` output. That is inference: no example ships it.

**Time-to-first-frame evidence (qualitative only)**
- Start-up steps, each adding latency:
  1. ticket REST call;
  2. websocket and offer/answer, where ringstream allows up to 30 s for the answer — [main.go L268-276](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/ringstream/main.go#L268-L276);
  3. ICE/DTLS;
  4. a keyframe, where PLI at startup avoids waiting for "Ring's ~2-second cadence" — [ringstream README §4](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/ringstream/README.md).
- ringstream's default `-track-wait` is 5 s ("how long to wait for tracks before publishing"). — [session.go L130](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/ringstream/session.go#L130)
- Low-power devices "can take significantly longer to wake … and … cannot take a snapshot at all when they are recording/live streaming"; high-power devices respond "in a few milliseconds". — [ring-mqtt FAQ](https://github.com/tsightler/ring-mqtt/wiki/Frequently-Asked-Questions-(FAQ))

### Inferences
- `get_current_image(camera)` should branch on power mode:
  - **Wired** (Floodlights, and the Stick Up Cam if it is the plug-in variant): use `snapshots/next/{id}?extras=force&after-ms=<now>`. It needs no stream, so there is no `on_demand` recording and no motion blinding. Return the image with its Ring timestamp.
  - **Battery** (both doorbells):
    - default to the newest cached or notification image, with an explicit `age_seconds`;
    - offer `fresh=true`, which starts a live session, grabs a frame, and stops;
    - warn that this costs battery, creates an `on_demand` recording, and blinds motion for the session.
  - **A camera with a live session already open** (e.g., the agent is "watching"): take the frame from that session instead of opening a new one.
- go2rtc's `frame.jpeg` takes the first keyframe after start. Combined with Ring's multi-second start-up backlog, the returned frame may be several seconds stale on doorbells. This is plausible but untested. A custom grabber should discard the backlog, or capture about 2 s and use the last keyframe.
- Expected time-to-first-frame is a few seconds on wired cameras and longer on battery doorbells, because of the wake-up. This is inferred from the start-up steps above, not measured. The bridge should report measured latency per camera in tool results and logs so the design can be tuned.

### Gaps
- No published or measured time-to-first-frame figures for Ring WebRTC sessions (wired or battery) were found. This needs a spike measurement on the user's cameras.
- The exact battery-camera snapshot refresh cadence on 2025–2026 firmware is unverified. The "every 10 minutes" comes from a ring-client-api code comment, and `lite_24x7.frequency_secs` is user-configurable. No Ring documentation was found.
- Whether `snapshots/next?extras=force` actually wakes a battery camera to take a new image, and its battery cost, is not documented. Community code simply avoids it.

---

## 3. Battery-camera cost of live view and frame grabs; how ring-mqtt, Scrypted and Homebridge protect batteries

### Takeaway
No source gives quantitative battery cost per live view. All three mature integrations treat live view on battery cameras as expensive and protect batteries the same way:
- never keep a persistent stream or prebuffer;
- never use interval snapshots on battery cameras by default;
- fall back to cached or notification images;
- tear sessions down promptly when no one is watching.

Scrypted auto-stops sessions after 2 min unless refreshed.

### Cited Findings
- Scrypted Ring README: "Do not enable prebuffer on Ring cameras and doorbells. The persistent live stream will cause motion event delivery to stop functioning. The persistent live stream will drain the battery faster than it can charge. The persistent live stream will also count against ISP bandwidth limits." — [scrypted plugins/ring/README.md](https://github.com/koush/scrypted/blob/78320e94ad977a77fa2bb201346b98630b8b1d47/plugins/ring/README.md)
- Scrypted's `STREAM_TIMEOUT = 120000` (2 min). `resetStreamTimeout()` stops the session unless the consumer refreshes it (`refreshAt: Date.now() + STREAM_TIMEOUT`). — [scrypted camera.ts L16, L232-261, L433](https://github.com/koush/scrypted/blob/78320e94ad977a77fa2bb201346b98630b8b1d47/plugins/ring/src/camera.ts#L232-L261)
- ring-mqtt:
  - continuous streaming risks "high energy drain (especially for battery powered cameras) and overheating" — [ring-mqtt wiki: Video Streaming](https://github.com/tsightler/ring-mqtt/wiki/Video-Streaming)
  - interval snapshots on battery cameras use "significantly more battery" — [ring-mqtt FAQ](https://github.com/tsightler/ring-mqtt/wiki/Frequently-Asked-Questions-(FAQ))
  - Auto mode disables interval snapshots for battery cameras — [camera.js L404-406](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/devices/camera.js#L404-L406)
  - ringstream stops the camera when "nothing [is] watching" — [server.go](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/ringstream/server.go)
  - per the earlier note, the shared session is torn down about 5–10 s after the last client leaves — [ring-mqtt wiki](https://github.com/tsightler/ring-mqtt/wiki/Video-Streaming)
- Homebridge: `avoidSnapshotBatteryDrain` "Causes snapshots for battery cameras to be fetched at a minimum 10 minute interval to avoid draining the battery. This is useful if you have the Home app open constantly." — [homebridge-ring README L97](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/homebridge-ring/README.md)
- ring-client-api `SimpleWebRtcSession` note: "cameras with Ring Edge enabled will stream with the speaker enabled as soon as the stream starts, which can drain the battery more quickly." — [simple-webrtc-session.ts](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/streaming/simple-webrtc-session.ts)
- Ring and third-party framing: Live View wakes the camera, connects Wi-Fi, and streams. Third-party guides cite Live View sessions and weak Wi-Fi as common causes of fast drain. No official Ring battery-per-minute figure was found. — search-result summary of [Asurion](https://asurion.com/connect/tech-tips/ring-battery-draining-fast/) (secondary)
- The Battery Doorbell 2K Plus and Video Doorbell 4 qualify as "operatingOnBattery" (battery present and `power_mode !== 'wired'`) unless hard-wired with power mode set to wired. — [ring-camera.ts L127-129](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/ring-camera.ts#L127-L129)

### Inferences
- Bridge battery guardrails for the two doorbells, consistent with the community consensus:
  1. Per-camera cooldown on fresh live frames, e.g., at most 1 per N minutes, configurable.
  2. Hard cap on live-session length (e.g., 60–120 s for agents, mirroring Scrypted's 2 min refresh model), with an explicit renew call.
  3. No background or prebuffer streams ever.
  4. Reuse an existing session for multiple frame requests (fan-out).
  5. Expose `battery_level` and `power_mode` in tool results so the agent can reason about cost.
  6. Prefer the push `snapshot_uuid` image for "what triggered the event".
- If a doorbell is hard-wired (`power_mode: wired`), ring-client-api treats it as wired for snapshot rules. The bridge should read `power_mode` rather than infer from the model name.

### Gaps
- No quantitative battery cost per live-view minute or per forced snapshot was found from Ring or the community.
- Whether a quick live-view "peek" (under 10 s) costs much less than a long view, given that the wake/connect cost dominates, is unmeasured.

---

## 4. Implementation options in .NET vs. sidecars (SIPSorcery, FFmpeg, go2rtc, Scrypted, ringstream, ring-client-api)

### Takeaway
**Licensing blocker for this user.** SIPSorcery is the only mature managed .NET WebRTC stack with H.264/H.265 depacketisers, DTLS-SRTP and ICE. Its license carries an "Additional Use Restriction", present since at least 2025-05-18: use, modification or distribution "inside Israel and the Occupied Territories is not permitted". The user's Ring account is in Israel. That the user, home and deployment are also in Israel is my inference. If so, SIPSorcery should be treated as unusable. This is a factual reading of the license text, not legal advice. The `SIPSorceryMedia.FFmpeg` package is separately LGPL-2.1, but it depends on SIPSorcery anyway.

The only other managed option found is tryAGI.WebRTC (MIT, .NET 10). It is "Experimental 0.x" and "not … a security-audited general WebRTC stack".

Recommended shape: a .NET 10 MCP bridge that owns Ring auth and signaling tickets, plus a small media sidecar written in Go (pion). There are two reusable MIT-licensed choices:
- **ringstream** (ring-mqtt 6.0.0) is already designed to be handed a signaling ticket by the process that owns the Ring session. It publishes RTSP.
- **go2rtc** (Ring source since v1.9.13, 2025-12-14) gives `frame.jpeg`, MP4, HLS, WebRTC and RTSP out of the box. But it needs the Ring refresh token itself and does not persist rotated tokens. That conflicts with a .NET process that also uses the account.

A Node sidecar running ring-client-api + ffmpeg is the most battle-tested path. Its drawback is that it duplicates or takes over Ring auth.

Frame decoding in all variants is easiest via the ffmpeg CLI. From .NET that means FFMpegCore (MIT, pipe support).

### Cited Findings
**SIPSorcery (C#)**
- License restriction — [sipsorcery LICENSE.md L18-31](https://github.com/sipsorcery-org/sipsorcery/blob/caa180d767c75668c9856419821df43c58db3f19/LICENSE.md):
  - Section 2, "Additional Use Restriction": "This software **must not be used** to further the apartheid policies of the state of Israel. Use, modification, or distribution **inside** Israel and the Occupied Territories is not permitted until the demands of the Boycott, Divestment and Sanctions (BDS) movement have been met …"
  - "In any instance where the BSD 3-Clause License conflicts with the above restriction, the above restriction shall be interpreted as superior".
- History of the clause:
  - The BDS restriction is present at least since commit `004f720` on 2025-05-18, whose patch adds a README note: "No use inside Israel or the Occupied Territories …". — [GitHub API commits for LICENSE.md](https://api.github.com/repos/sipsorcery-org/sipsorcery/commits?path=LICENSE.md)
  - Earlier license commits were not fully inspected, so the restriction may predate that: `f17671d` 2025-04-11 "Updated license file with AGPL-3.0 warning", `bdbb80f` 2025-04-24, `8723700` 2025-04-26, and `682a6f2` 2025-05-17. — [GitHub API commits for LICENSE.md](https://api.github.com/repos/sipsorcery-org/sipsorcery/commits?path=LICENSE.md)
  - Commit #1767 on 2026-07-29 states that the NuGet packages had declared `PackageLicenseExpression=BSD-3-Clause`, which "misrepresented the actual terms". They now embed LICENSE.md via `PackageLicenseFile`. `SIPSorceryMedia.FFmpeg` "is intentionally left as … LGPL-2.1-only". — [GitHub API commits for LICENSE.md](https://api.github.com/repos/sipsorcery-org/sipsorcery/commits?path=LICENSE.md)
  - The latest NuGet SIPSorcery version is 10.0.17. — [NuGet flat container index](https://api.nuget.org/v3-flatcontainer/sipsorcery/index.json)
- Technical capability, had it been usable:
  - targets include `net10.0` — [SIPSorcery.csproj L52](https://github.com/sipsorcery-org/sipsorcery/blob/caa180d767c75668c9856419821df43c58db3f19/src/SIPSorcery/SIPSorcery.csproj)
  - ships `H264Depacketiser`, `H265Depacketiser`, `AV1Depacketiser` and `RtpVideoFramer` — [src/SIPSorcery/net/RTP/Packetisation/](https://github.com/sipsorcery-org/sipsorcery/tree/caa180d767c75668c9856419821df43c58db3f19/src/SIPSorcery/net/RTP/Packetisation)
  - DTLS-SRTP classes exist (2020 commit "Added header blocks to DTLS SRTP classes") — [GitHub API commits](https://api.github.com/repos/sipsorcery-org/sipsorcery/commits?path=LICENSE.md)

**Other .NET options**
- tryAGI.WebRTC 0.2.9 — [NuGet tryAGI.WebRTC](https://www.nuget.org/packages/tryAGI.WebRTC):
  - updated 2026-10-19; "WebRTC transport for .NET 10, authored from standards and licensed under MIT"
  - ICE: UDP checks, trickle, consent, but no mDNS or ICE restart
  - DTLS 1.2 + SRTP over an "explicit cipher/handshake subset"
  - H264/VP8 "bounded frame reassembly"; Opus transport
  - "Experimental 0.x", "not yet a drop-in replacement", "not … a security-audited general WebRTC stack", with "real provider sessions … still listed as pending acceptance work"
- Existing .NET Ring library: KoenZomers.Ring.Api 1.0.0 (.NET 8) is described as "a .NET library for communicating with the Ring API, for retrieving details about Ring doorbells and Ring chimes". No live-view support was found in its package descriptions. — [NuGet KoenZomers.Ring.Api](https://www.nuget.org/packages/koenzomers.ring.api)
- No .NET project implementing Ring WebRTC live view was found.
- FFMpegCore:
  - "A .NET Standard FFMpeg/FFProbe wrapper", MIT
  - runs ffmpeg/ffprobe binaries from a configured folder
  - supports pipe input (`StreamPipeSource`, `RawVideoPipeSource`) and pipe output (`StreamPipeSink`), plus `FFMpeg.Snapshot`
  - CI tests against ffmpeg 8.1
  - Source: [FFMpegCore GitHub](https://github.com/rosenbjerg/FFMpegCore)

**go2rtc as a Ring sidecar**
- Ring source added in v1.9.13 by @seydx: "supports Ring cameras with two-way audio". Config is `ring:?device_id=XXX&refresh_token=XXX`, plus `&snapshot` for snapshot-only mode. Accounts can also be added via WebUI with email/password/2FA. — [go2rtc internal/ring/README.md](https://github.com/AlexxIT/go2rtc/blob/c245815e75e2a5fd60b4290f12bfc04e55a984d3/internal/ring/README.md); [internal/ring/ring.go](https://github.com/AlexxIT/go2rtc/blob/c245815e75e2a5fd60b4290f12bfc04e55a984d3/internal/ring/ring.go)
  - The code also requires `camera_id` ("ring: wrong query" if `refresh_token`, `device_id` or `camera_id` is missing). — [client.go L33-39](https://github.com/AlexxIT/go2rtc/blob/c245815e75e2a5fd60b4290f12bfc04e55a984d3/pkg/ring/client.go#L33-L39)
- Releases: v1.9.13 published 2025-12-14; v1.9.14 (latest) 2026-01-19. — [GitHub releases API](https://api.github.com/repos/AlexxIT/go2rtc/releases); [v1.9.13](https://github.com/AlexxIT/go2rtc/releases/tag/v1.9.13)
- go2rtc is MIT licensed. — [go2rtc LICENSE](https://github.com/AlexxIT/go2rtc/blob/c245815e75e2a5fd60b4290f12bfc04e55a984d3/LICENSE)
- Token handling:
  - The stream path calls `NewRestClient(RefreshTokenAuth{…}, nil)`, so the `onTokenRefresh` callback is nil. — [client.go L56](https://github.com/AlexxIT/go2rtc/blob/c245815e75e2a5fd60b4290f12bfc04e55a984d3/pkg/ring/client.go#L56)
  - When the token is refreshed, the new encoded token is stored in memory (`c.RefreshToken = encodeAuthConfig(...)`), and the callback fires only if one is set. — [api.go L316-326](https://github.com/AlexxIT/go2rtc/blob/c245815e75e2a5fd60b4290f12bfc04e55a984d3/pkg/ring/api.go#L316-L326)
  - Ring refresh tokens rotate. ring-client-api's README says Ring "restricted refresh tokens so that they expire shortly after use", and its wiki says consumers "MUST subscribe to `api.onRefreshTokenUpdated`". — [ring-client-api README](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/README.md); [dgreif wiki: Refresh-Tokens](https://github.com/dgreif/ring/wiki/Refresh-Tokens)
- Outputs: `frame.jpeg` (needs ffmpeg for H.264 to JPEG), `stream.mp4?duration=`, HLS, and WebRTC/RTSP. See §2. — [internal/mjpeg/mjpeg.go](https://github.com/AlexxIT/go2rtc/blob/c245815e75e2a5fd60b4290f12bfc04e55a984d3/internal/mjpeg/mjpeg.go); [internal/mp4/README.md](https://github.com/AlexxIT/go2rtc/blob/c245815e75e2a5fd60b4290f12bfc04e55a984d3/internal/mp4/README.md)
- API security defaults: `listen: ":1984"` (all interfaces) and `username: ""` (no Basic auth by default). `local_auth` defaults to false, and the API can be bound to localhost or a unix socket. — [internal/api/README.md L15-39](https://github.com/AlexxIT/go2rtc/blob/c245815e75e2a5fd60b4290f12bfc04e55a984d3/internal/api/README.md)
- ring-mqtt is listed among go2rtc integrations, and ring-mqtt 5.x used werift + go2rtc. — [go2rtc README L506](https://github.com/AlexxIT/go2rtc/blob/c245815e75e2a5fd60b4290f12bfc04e55a984d3/README.md); [ring-mqtt CHANGELOG v5.9.3](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/docs/CHANGELOG.md)

**ringstream (Go, ring-mqtt 6.0.0, MIT) — ticket-handoff design**
- Design: "ring-mqtt holds the authenticated Ring session, so it stays the only thing that can mint a signaling ticket; this carries the request to it and the camera list back." — [ringstream/control.go L13-17](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/ringstream/control.go#L13-L17)
- Flags — [session.go L121-138](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/ringstream/session.go#L121-L138):
  - `-daemon` with `-control-url ws://127.0.0.1:51883/ringstream`
  - single-session mode: `-ticket "Ring signaling session ticket"`, `-camera-id`, `-publish-url`
  - `-rtsp-listen :8554`; `-rtsp-user/-rtsp-pass` ("empty disables authentication")
  - `-video-codec h264|h265`; `-transport direct|rtsp|udp`; `-ffmpeg`
- ffmpeg is not in the live path by default: "The default transport publishes Ring's packets directly to the RTSP server". — [ringstream README Notes](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/ringstream/README.md)
- ring-mqtt is MIT licensed. — [ring-mqtt LICENSE](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/LICENSE)
- Maturity: v6.0.0 exists as a commit on `dev` dated 2026-10-20, with no tag yet. — [ring-mqtt dev commits](https://github.com/tsightler/ring-mqtt/commits/dev)

**Node sidecar (ring-client-api)**
- ring-client-api is MIT licensed and uses werift 0.24.4 for WebRTC. — [package.json L76](https://github.com/dgreif/ring/blob/925a3aa29a8b2ac8aa491d0eb045e520db079b33/packages/ring-client-api/package.json)
- It provides `streamVideo`, `recordToFile`, `startLiveCall`, return audio, and HLS examples (§2).
- It is the most actively maintained Node base: 14.3.0 released 2026-02-08, with commits through 2026-10-22. — [npm](https://registry.npmjs.org/ring-client-api)

**Scrypted**
- The Scrypted Ring plugin depends on a fork, `@koush/ring-client-api` (`file:../../external/ring-client-api`), plus `@scrypted/prebuffer-mixin`, `@scrypted/snapshot` and `@scrypted/webrtc`. It is a full home-automation server, not a lightweight sidecar. — [scrypted plugins/ring/package.json](https://github.com/koush/scrypted/blob/78320e94ad977a77fa2bb201346b98630b8b1d47/plugins/ring/package.json)

### Inferences
**Effort and risk comparison** (inference based on the evidence above)

| Option | Effort | Risk / notes |
|---|---|---|
| A. Pure .NET (C# signaling + tryAGI.WebRTC + FFmpeg) | High. Port signaling (~1–2 days), then build or validate an experimental WebRTC receive path against Ring's DTLS/ICE profile, plus a jitter/NACK/keyframe pipeline that ringstream shows is non-trivial. | Experimental stack and security not audited. Best long-term fit for ".NET only" if it proves interoperable. |
| A′. Pure .NET with SIPSorcery | Medium | Blocked by the license's Israel restriction. |
| B. .NET bridge + ringstream sidecar (ticket handoff) | Low–medium. .NET mints `signalsocket` tickets and either implements ringstream's small control-socket protocol (daemon mode) or spawns `ringstream -ticket … -camera-id … -publish-url …` per session. Frames via `ffmpeg -rtsp_transport tcp -i rtsp://127.0.0.1:8554/<id>_live -frames:v 1`. | Auth stays in one process, so there is no token-rotation conflict. ringstream is brand new (v6.0.0 untagged) and its control protocol is internal to ring-mqtt and may change. Clip/HLS needs ffmpeg or an extra server. |
| C. .NET bridge + go2rtc sidecar | Lowest code. `GET /api/frame.jpeg?src=ring_x`, `/api/stream.mp4?duration=10`, HLS/WebRTC for free. | go2rtc needs its own refresh token. It does not persist rotated tokens (callback nil), so it may break after a restart, and sharing one token with the .NET bridge can invalidate one of them. Mitigation: give go2rtc a separate Ring "authorized client" login, or patch go2rtc (MIT) to accept a ticket. Its `snapshot` mode is not forced-fresh. The API is unauthenticated on `:1984` by default, so it must bind to localhost. |
| D. .NET MCP facade + Node sidecar (ring-client-api owns all Ring access) | Medium. The Node process becomes the real Ring client and .NET is a thin MCP layer. | The most proven media path, but the ".NET-first" goal is largely nominal. Two runtimes. Token rotation is handled in Node via `onRefreshTokenUpdated`. |

- My ranking for this user: **B or C for the first iteration, with a spike to validate A** (tryAGI.WebRTC against Ring) for a later pure-.NET path.
  - C is fastest to a demo.
  - B is architecturally cleaner, because one process owns the Ring identity.
- A hybrid is also possible: a small go2rtc fork whose Ring source accepts `ticket=` from the .NET bridge (go2rtc is MIT). That would combine B's auth model with C's outputs.
- ffmpeg is a co-dependency in every option except raw RTP handling: go2rtc's `frame.jpeg`, ring-client-api `streamVideo`, and .NET frame extraction all use it. Driving it from .NET via FFMpegCore pipes avoids native bindings.
- The license status of FFmpeg.AutoGen was not checked. The CLI route avoids that question.
- Ship an LGPL ffmpeg build, or document GPL implications, if ffmpeg is redistributed. This is a standard FFmpeg licensing concern and was not researched here.

### Gaps
- tryAGI.WebRTC has no evidence of interoperating with Ring or AWS-KVS-style WebRTC endpoints. A spike is required.
- No maintained .NET libwebrtc (native) wrapper was found. Microsoft's MixedReality-WebRTC status was not re-verified in this pass.
- ringstream's control-socket message schema beyond `ticket_request`/`ticket`/`cameras` was not fully read.
- Whether go2rtc's Ring source auto-reconnects after Ring's ~10 min cutoff, or simply ends, was not verified. go2rtc does generic producer reconnect with backoff ([producer.go L185-205](https://github.com/AlexxIT/go2rtc/blob/c245815e75e2a5fd60b4290f12bfc04e55a984d3/internal/streams/producer.go#L185-L205)).
- Whether the user, as the developer and operator located in Israel, is bound by SIPSorcery's restriction is a legal question I cannot answer. The text plainly prohibits "use … inside Israel".

---

## 5. Delivering live video and frames to MCP clients

### Takeaway
MCP has no video content type. The 2026-07-28 spec's `ContentBlock` is text, image, audio, `resource_link`, or embedded resource. Claude's vision input accepts only JPEG/PNG/GIF/WebP, and animated GIFs use the first frame only.

For agent consumption, use:
- (a) one fresh JPEG for most questions, as the default;
- (b) a burst of a few downscaled JPEGs when motion or sequence matters.

For human viewing, use:
- (c) a short MP4 as a `resource_link` or embedded blob;
- (e) an MCP Apps viewer, which renders in claude.ai web, ChatGPT, VS Code and Goose.

The official ext-apps `video-resource-server` example plays an MP4 delivered as a base64 MCP resource inside an App with no external URL.

A "pseudo-live" App can poll an app-only `get_live_frame` tool through `tools/call`, which keeps all media inside the authenticated MCP channel. Real HLS or WebRTC streams (d) need declared CSP origins plus a publicly reachable, authenticated endpoint. That is the weakest option for privacy.

### Cited Findings
**MCP content model (spec 2026-07-28)**
- `export type ContentBlock = TextContent | ImageContent | AudioContent | ResourceLink | EmbeddedResource;` — [schema/2026-07-28/schema.ts L2305-2306](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/dae694f61a31f7a3ec2af3aff709e11f70f61e48/schema/2026-07-28/schema.ts#L2305-L2306)
- Tool results may contain image (`data` base64 + `mimeType`), audio, `resource_link` ("a URI that can be subscribed to or fetched by the client"), and embedded resources. All support `annotations` (audience, priority). — [server/tools.mdx L405-475](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/dae694f61a31f7a3ec2af3aff709e11f70f61e48/docs/specification/2026-07-28/server/tools.mdx#L405-L475)
- 2026-07-28 changes relevant to live sessions — [changelog.mdx](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/dae694f61a31f7a3ec2af3aff709e11f70f61e48/docs/specification/2026-07-28/changelog.mdx):
  - it removes protocol-level sessions: "Servers that need cross-call state use explicit, server-minted handles passed as ordinary tool arguments" (SEP-2567);
  - it moves Tasks into an extension (`io.modelcontextprotocol/tasks`) with polling via `tasks/get` (SEP-2663);
  - `resources/subscribe` is replaced by `subscriptions/listen`.
- The spec index describes MCP Apps as "Interactive UI elements (charts, forms, video players) rendered inline within conversations". — [2026-07-28/index.mdx L86-87](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/dae694f61a31f7a3ec2af3aff709e11f70f61e48/docs/specification/2026-07-28/index.mdx)

**MCP Apps (SEP-1865, "Stable (2026-01-26)")**
- Basics: UI is served as `ui://` resources with MIME `text/html;profile=mcp-app` and rendered in sandboxed iframes. — [ext-apps specification/2026-01-26/apps.mdx L1-12, L268-270](https://github.com/modelcontextprotocol/ext-apps/blob/266a9e3b70dbd4a4f0546dda95da2a2c1a8be4b7/specification/2026-01-26/apps.mdx)
- Default CSP when none is declared: `connect-src 'none'`, `media-src 'self' data:`, `img-src 'self' data:`. "Host MAY further restrict but MUST NOT allow undeclared domains". — [apps.mdx L272-286](https://github.com/modelcontextprotocol/ext-apps/blob/266a9e3b70dbd4a4f0546dda95da2a2c1a8be4b7/specification/2026-01-26/apps.mdx)
- Declarable CSP fields — [apps.mdx L110-160](https://github.com/modelcontextprotocol/ext-apps/blob/266a9e3b70dbd4a4f0546dda95da2a2c1a8be4b7/specification/2026-01-26/apps.mdx):
  - `connectDomains` (fetch/XHR/WebSocket, i.e. `connect-src`)
  - `resourceDomains` (`img-src`, `script-src`, `style-src`, `font-src`, `media-src`)
  - `frameDomains`
  - `baseUriDomains`
- Optional `permissions` for camera and microphone. — [apps.mdx L173-185](https://github.com/modelcontextprotocol/ext-apps/blob/266a9e3b70dbd4a4f0546dda95da2a2c1a8be4b7/specification/2026-01-26/apps.mdx)
- App-only tools: tools with `visibility: ["app"]` "are hidden from the agent but remain callable by apps via `tools/call`", and hosts MUST reject app calls to tools lacking `"app"`. — [apps.mdx L395-401, L1490](https://github.com/modelcontextprotocol/ext-apps/blob/266a9e3b70dbd4a4f0546dda95da2a2c1a8be4b7/specification/2026-01-26/apps.mdx)
- External-URL content was deliberately deferred "due to concerns around model visibility, inability to screenshot content, and review process". — [apps.mdx L1631](https://github.com/modelcontextprotocol/ext-apps/blob/266a9e3b70dbd4a4f0546dda95da2a2c1a8be4b7/specification/2026-01-26/apps.mdx)
- Official video example, "Demonstrates serving binary content (video) via MCP resources using the base64 blob pattern":
  - the `play_video` tool returns a `videoUri`;
  - the App calls `resources/read`, receives `{mimeType:'video/mp4', blob}`, and plays it via `URL.createObjectURL(new Blob([...]))`.
  - Sources: [examples/video-resource-server README](https://github.com/modelcontextprotocol/ext-apps/blob/266a9e3b70dbd4a4f0546dda95da2a2c1a8be4b7/examples/video-resource-server/README.md); [server.ts L68-119](https://github.com/modelcontextprotocol/ext-apps/blob/266a9e3b70dbd4a4f0546dda95da2a2c1a8be4b7/examples/video-resource-server/server.ts); [src/mcp-app.ts L105-113](https://github.com/modelcontextprotocol/ext-apps/blob/266a9e3b70dbd4a4f0546dda95da2a2c1a8be4b7/examples/video-resource-server/src/mcp-app.ts)
- CORS and stable origin: for Claude, the App origin is `<sha256(serverUrl)[0:32]>.claudemcpcontent.com` via `_meta.ui.domain`, which a media server could allowlist. — [ext-apps docs/csp-cors.md](https://github.com/modelcontextprotocol/ext-apps/blob/266a9e3b70dbd4a4f0546dda95da2a2c1a8be4b7/docs/csp-cors.md)
- "Remote hosts like Claude.ai cannot reach `localhost`". Testing a local server requires a public tunnel such as cloudflared. — [ext-apps docs/testing-mcp-apps.md L78](https://github.com/modelcontextprotocol/ext-apps/blob/266a9e3b70dbd4a4f0546dda95da2a2c1a8be4b7/docs/testing-mcp-apps.md)

**Which clients render what (as of 2026-10)**
- ext-apps README: UIs "render inline in Claude, ChatGPT and any other compliant chat client". Linked host docs: ChatGPT, Claude, VS Code (blog 2026-01-26), Goose. — [ext-apps README L10, L86-89](https://github.com/modelcontextprotocol/ext-apps/blob/266a9e3b70dbd4a4f0546dda95da2a2c1a8be4b7/README.md)
- Claude connectors doc, "Where connectors work" — [Claude docs: Get started with connectors](https://claude.com/docs/connectors/overview):
  - "claude.ai on the web: remote connectors, including MCP Apps that display interactive content in the conversation"
  - "Claude desktop app: remote connectors, plus local connectors installed as desktop extensions"
  - "Claude mobile app: remote connectors"
  - Claude Code gets claude.ai connectors in terminal and cloud sessions
- Conflict on Claude Desktop: the connectors page mentions MCP Apps only for claude.ai web, while the ext-apps quickstart says Views render "inside Claude Desktop and other MCP hosts". — [ext-apps docs/quickstart.md](https://github.com/modelcontextprotocol/ext-apps/blob/266a9e3b70dbd4a4f0546dda95da2a2c1a8be4b7/docs/quickstart.md)
- ChatGPT — [OpenAI: MCP Apps in ChatGPT](https://developers.openai.com/apps-sdk/mcp-apps-in-chatgpt/):
  - implements "the open MCP Apps standard for UI returned by an MCP server" (`text/html;profile=mcp-app`)
  - display modes: inline card, carousel, fullscreen, picture-in-picture
  - supports `connectDomains`/`resourceDomains`/`frameDomains`
  - "Call a tool from the UI" maps to `tools/call` (alias `window.openai.callTool`)
  - no media/video-specific capability statement; no page date

**Image cost for agents (Claude)** — all from [Claude docs: Vision](https://platform.claude.com/docs/en/build-with-claude/vision):
- Formula: "An image … costs `⌈width / 28⌉ × ⌈height / 28⌉` visual tokens".
- Tiers:
  - High-resolution (Claude 4.7 and later): max long edge 2,576 px, max 4,784 visual tokens.
  - Standard: 1,568 px, 1,568 tokens.
- A 1920×1080 frame costs 1,560 tokens on standard (downsized to 1456×819) or 2,691 on high-res.
- Example price: at Opus 5.5's "$4 USD per million", a 1000×1000 image is "about $5.18 USD per thousand".
- Limits:
  - 20 images per message on claude.ai; 100 or 600 per API request.
  - Above 20 images a stricter per-image dimension limit applies, and the doc advises keeping images at 2000 px or less. This counts "images nested inside `tool_result` content".
  - Max 10 MB per image on the API and claude.ai.
- Formats: "JPEG, PNG, GIF, and WebP … Animations are unsupported, and only the first frame is used."
- The doc recommends downsampling "If you don't need the additional fidelity", and the Files API to avoid resending base64 every turn.
- People identification: "Claude cannot be used to name people in images and refuses to do so".

### Inferences
**Option comparison for this bridge.** Token counts are computed from the documented formula. Clip sizes are illustrative.

| Option | Agent can "see" it? | Human can see it? | Cost | Privacy | Verdict |
|---|---|---|---|---|---|
| (a) Single fresh JPEG `image` block | Yes, natively in every MCP client that passes images to the model | Usually shown inline | 640×360 ≈ 23×13 = **299 tokens**; 1280×720 ≈ 46×26 = **1,196**; 1920×1080 = 1,560 (std) / 2,691 (hi-res) | Stays in the MCP channel | **Default.** Return the JPEG plus structured metadata (camera, `captured_at`, `age_s`, source = forced snapshot / notification / live-frame, battery). |
| (b) Burst of N frames over a few seconds | Yes, as N separate image blocks. An animated GIF only shows frame 1. | Yes | 5 frames at 640×360 ≈ **1.5k tokens**; 5 at 1080p hi-res ≈ **13.5k** | Same as (a) | Use for "is someone approaching / leaving?". Keep N ≤ 5–8 and downscale. Must stay under 20 images per claude.ai message, including history. |
| (c) Short MP4 via `resource_link` or embedded `resource` | No. Claude takes no video input, so the bridge must extract frames for the agent. | Only if the client fetches or plays it, or via an App | 10 s 1080p H.264 is a few MB; base64 adds ~33% | Embedded: stays in channel. Link: depends on the URL. | For humans and audit; pair with (b) for the agent. Use the Tasks extension or a server-minted handle when recording takes over 10 s. |
| (d) HLS / WebRTC / RTSP URL | No | Only in clients that open external URLs, or in an App with declared CSP | Bandwidth only | **Weakest.** It needs a publicly reachable endpoint (remote hosts can't reach localhost), so a tunnel exposes a live camera feed, and the URL can leak via transcripts. | Avoid as a plain URL. If used, require short-lived signed tokens and bind to the App origin via CORS. |
| (e) MCP Apps live viewer (`ui://`) | Not the live pixels; the model sees only tool results | **Yes**: claude.ai web, ChatGPT, VS Code, Goose (Claude Desktop conflicting) | Medium build effort | Better than (d), but not "private by being local". On claude.ai, the only Claude surface the connectors doc lists for MCP Apps, the bridge's MCP server must itself be reachable from the internet, because claude.ai can't reach localhost. A home-hosted bridge then needs a tunnel. The real gain over (d) is the auth model: an OAuth-protected MCP endpoint with frames as tool results under default CSP (`img-src data:`), instead of a bearer stream URL. | **Best "live" UX.** Version 1: an App polls `get_live_frame(handle)` (visibility `["app"]`) at 1–2 fps and renders the JPEGs, a pseudo-MJPEG. Version 2: an App plays a short MP4 from `resources/read` (official example pattern). Version 3 (optional): real HLS/WebRTC with declared `connectDomains`/`resourceDomains`. |

- Live-session state under the stateless 2026-07-28 protocol:
  1. `start_live_view(camera, max_seconds)` returns a `stream_handle`.
  2. `get_live_frame(stream_handle)`, `record_clip(stream_handle, seconds)` and `stop_live_view(stream_handle)` take that handle.
  3. The server enforces TTLs.
  - This matches SEP-2567's "server-minted handles".
- WebRTC directly from an App to Ring, using Ring's `SimpleWebRtcSession` REST path from the iframe, would put a Ring bearer token into a host-rendered iframe. It also needs `api.ring.com` in `connectDomains`, plus Ring CORS acceptance of the `claudemcpcontent.com` origin, which is unverified. Not recommended.
- For "who is at the door", Claude will not name people from images. The bridge should not promise face identification. Ring's own Familiar Faces is a separate feature, not exposed in community APIs.
- Frames from a live view should be downscaled server-side, to about 1024 px on the long edge, before returning. That cuts tokens roughly 2–3× vs native 1080p on high-res models. Use `annotations.audience` to mark large human-only images.

- Deployment consequence: a home-only deployment, a local stdio server with no tunnel, gets an App viewer on Claude only if Claude Desktop renders MCP Apps for local servers. The sources conflict on this point (see Gaps). Without it, local-only users get (a) and (b) image blocks but no live viewer. VS Code and Goose are local alternatives listed by ext-apps.

### Gaps
- **App-initiated polling limits (blocks the v1 viewer).** No source was found on whether claude.ai or ChatGPT throttle, rate-limit or approval-prompt app-initiated `tools/call` requests. The recommended v1 viewer polls `get_live_frame` at 1–2 fps. If hosts throttle these calls or require per-call approval, that viewer will not work and the MP4-blob pattern (v2) becomes the fallback.
- **Claude Desktop + local server + MCP Apps.** The connectors doc lists MCP Apps only for claude.ai web, while the ext-apps quickstart says Views render in Claude Desktop. Whether Desktop renders Apps from a local (stdio/MCPB) server is unresolved, and it decides whether a home-only deployment can have a viewer at all.
- No primary documentation was found on how Claude Desktop, Claude Code or ChatGPT render `resource_link` pointing to `video/mp4`, or embedded video resources outside an App.
- Whether MCP App sandboxes in claude.ai or ChatGPT permit `RTCPeerConnection` (WebRTC media) was not found. CSP `connect-src` covers the signaling websocket, but WebRTC media is not governed by the declared fields.
- Hosts' maximum `resources/read` blob size and message-size limits for embedded MP4s were not found.
- OpenAI's image token accounting for tool-result images in ChatGPT was not researched.

---

## 6. Privacy and security of exposing live streams and frames

### Takeaway
A live camera feed of the home is the most sensitive capability in the bridge. The safest design keeps Ring media inside the authenticated MCP channel: image blocks, embedded resources, and app-only tools. It does not publish URLs. Any local media server (go2rtc, ringstream RTSP) must bind to localhost with auth, because the defaults are open.

Every live view is also visible to the household as a Ring `on_demand` recording, which is useful as an audit trail. Agent-triggered live view should require explicit user consent and be rate-limited.

### Cited Findings
- go2rtc defaults: HTTP API `listen: ":1984"` on all interfaces, `username: ""` (no Basic auth), and `local_auth` false by default. It can bind `127.0.0.1:1984` or a unix socket, and `allow_paths` can restrict endpoints, e.g. only `/api/frame.jpeg`. — [go2rtc internal/api/README.md](https://github.com/AlexxIT/go2rtc/blob/c245815e75e2a5fd60b4290f12bfc04e55a984d3/internal/api/README.md); [go2rtc README L462-480](https://github.com/AlexxIT/go2rtc/blob/c245815e75e2a5fd60b4290f12bfc04e55a984d3/README.md)
- go2rtc's `/api/ring` accepts `email`, `password` and `code`, or a `refresh_token`, as URL query parameters to list devices. — [internal/ring/ring.go](https://github.com/AlexxIT/go2rtc/blob/c245815e75e2a5fd60b4290f12bfc04e55a984d3/internal/ring/ring.go)
- ringstream RTSP: `-rtsp-user`/`-rtsp-pass`, where "empty disables authentication"; it listens on `:8554` by default. — [ringstream/session.go L123-125](https://github.com/tsightler/ring-mqtt/blob/996be5b73537d845f9176eef6efcf5ed055be85e/ringstream/session.go#L123-L125)
- Ring's own recording URLs are pre-signed S3 URLs and expire. ring-mqtt treats them as valid for about 15 min and refreshes at 2/3 of their lifetime. — [ring-mqtt wiki: Video Streaming](https://github.com/tsightler/ring-mqtt/wiki/Video-Streaming); [camera.js L945-993 (5.9.3)](https://github.com/tsightler/ring-mqtt/blob/0a34496f4d583e663e1fa7136f6d4602c208e57f/devices/camera.js#L945-L993)
- MCP Apps security posture — [apps.mdx L272-286, L1631, L1698](https://github.com/modelcontextprotocol/ext-apps/blob/266a9e3b70dbd4a4f0546dda95da2a2c1a8be4b7/specification/2026-01-26/apps.mdx):
  - default CSP denies all network connections (`connect-src 'none'`);
  - "Host MUST NOT allow undeclared domains";
  - "All View content MUST be rendered in sandboxed iframes";
  - external URLs were deferred over review and visibility concerns.
- Remote MCP hosts can't reach localhost, so serving a stream to claude.ai requires a public tunnel. — [ext-apps docs/testing-mcp-apps.md L78](https://github.com/modelcontextprotocol/ext-apps/blob/266a9e3b70dbd4a4f0546dda95da2a2c1a8be4b7/docs/testing-mcp-apps.md)
- MCP core principles: "Users must explicitly consent to and understand all data access and operations"; "Hosts must not transmit resource data elsewhere without user consent". — [spec 2026-07-28 index.mdx](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/dae694f61a31f7a3ec2af3aff709e11f70f61e48/docs/specification/2026-07-28/index.mdx)
- Claude Vision FAQ: "Image uploads are ephemeral and not stored beyond the duration of the API request … Anthropic does not use uploaded images to train models". Frames returned in tool results still persist in the conversation transcript the host stores. That second point is inference. — [Claude docs: Vision](https://platform.claude.com/docs/en/build-with-claude/vision)
- With a Protect plan, live streams are recordings (`on_demand` events). — [ring-mqtt FAQ](https://github.com/tsightler/ring-mqtt/wiki/Frequently-Asked-Questions-(FAQ))
- MCP 2026-07-28 tightens OAuth: `iss` validation (RFC 9207), issuer-bound client credentials, and `application_type` in DCR. — [changelog.mdx minor changes 7-9](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/dae694f61a31f7a3ec2af3aff709e11f70f61e48/docs/specification/2026-07-28/changelog.mdx)

### Inferences
**Recommended controls**
1. Bind all media sidecars (go2rtc/ringstream) to `127.0.0.1` or a unix socket, with credentials. Only the .NET bridge talks to them.
2. Expose no raw stream URLs to the model. If an App needs a stream, mint per-session, short-TTL (e.g., ≤ 2 min), single-viewer signed tokens bound to the stream handle. Restrict CORS to the host's App origin (`*.claudemcpcontent.com` for Claude). Revoke on `stop_live_view`.
3. Gate `start_live_view` and `fresh=true` frame grabs:
   - mark them destructive/non-idempotent in tool annotations so hosts prompt for approval;
   - apply per-camera rate limits and battery guardrails (§3);
   - make a household-visible audit log (Ring's `on_demand` entries plus bridge logs).
4. Avoid the go2rtc WebUI and `/api/ring` login path in production: credentials in query strings get logged. Provision go2rtc's token from the bridge if go2rtc is used.
5. Treat camera images as untrusted input to the agent. Visible text in the scene, such as a sign held to the doorbell, is a prompt-injection vector. Tool descriptions should tell the agent not to follow instructions seen in images.
6. Prefer in-channel delivery, (a), (b), (e) via `tools/call` or embedded resources, over URL delivery (d). Downscale to reduce how much bystander detail is retained.
7. In-channel delivery does not remove internet exposure on claude.ai. Remote hosts can't reach localhost, so a claude.ai deployment requires the MCP server itself to be internet-reachable, e.g., via a tunnel. The protection then rests on the MCP endpoint's OAuth (2026-07-28 rules: `iss` validation, issuer-bound credentials), not on network locality. Treat the tunnel endpoint as a high-value target: strong OAuth, a short token lifetime, and no unauthenticated health or debug routes that leak frames.

### Gaps
- No Ring policy statement was found on third-party live viewing or notification of live-view sessions to other household members. The ToS/legal side is covered in `legal_tos_privacy_risk.md` from the earlier pass.
- Host-side retention of tool-result images (claude.ai, ChatGPT transcripts) was not researched in detail.
- Israeli privacy-law implications of recording or AI-processing public-facing camera footage (passers-by) were not researched.
