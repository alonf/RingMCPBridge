# Official Ring Developer Platform / Ring Partner API — Re-check for an Israel-based personal + open-source MCP bridge (as of 2026-10-24)

## Eligibility gating — what does Ring gate on (developer country, Ring account country, device location, server IP), for public vs private apps, and does hosting in Azure US change anything?

### Takeaway
Ring's docs gate on four different things, and they are inconsistent.
- **No developer-country gate is documented.** There is ID verification, but no country rule appears in the Ring docs. The full Amazon Developer Services Agreement was not read.
- **Ring account country:** private apps are "Available to Ring accounts from any country". Public-app distribution is US-only unless Ring approves otherwise in writing.
- **Device location:** "Currently we only support devices located in the US". This appears under the Testing Process step, and the docs never say whether it also applies to private apps.
- **Server IP or region:** no country gate is documented. The only documented IP issue is a WAF block (HTTP 406) on datacenter/cloud IPs, fixed by registering a static egress IP with Ring support.
- **The Appstore web UI:** it "is only reachable from locations within the US". This is about where the end user's browser is, not the server.

**Per the docs, hosting the server in Azure US moves none of these gates.** The Israeli devices stay in Israel and the user's browser stays in Israel. The one thing US hosting *adds* is the obligation to use a static egress IP that Ring has allowlisted. To confirm this with evidence rather than relying on the docs being silent, see the residential-versus-Azure comparison in the empirical test under Inferences.

### Cited Findings
**Method:** On 2026-10-24 I re-downloaded all 17 content pages under `developer.amazon.com/docs/ring/` plus the landing page as raw HTML with curl, converted them to text, and searched them for every geography, IP and plan term. Quotes below are verbatim from those pages. The newest release-notes entry is still **October 22, 2026**, so nothing has been added since the earlier research on 2026-10-23 — [Release Notes](https://developer.amazon.com/docs/ring/release-notes.html).

**(1) Developer's own country and registration**
- Registration means supplying "contact info, details about your business or organization and the use cases your application is going to implement." The doc says "You can request registration at signup/registration" — [Get Started](https://developer.amazon.com/docs/ring/get-started.html).
- Identity verification is mandatory and is not tied to a country. The developer uploads "a valid, unexpired government-issued ID such as a passport, driver's license, or national ID card." The doc adds: "make sure the ID type and issuing country you select match the document you upload." It also says identity verification "applies to the individual account owner, even if you represent a business entity" — [Get Started](https://developer.amazon.com/docs/ring/get-started.html).
- Verification gates app creation: "Your developer account must have completed identity verification before you can create or submit applications" — [Configure](https://developer.amazon.com/docs/ring/configure.html).
- The agreement expects non-US developers to take part: "If you are not a permanent U.S. resident or citizen or a business entity organized or incorporated in the United States, then you agree that you will perform all services contemplated under the Agreement outside the United States unless you have otherwise notified us…" — [Ring Appstore Schedule §6](https://developer.amazon.com/docs/ring/ring-appstore-schedule.html).
- The certification questionnaire's General tab asks for the company's "location" and "whether you serve users outside the US" — [Certify](https://developer.amazon.com/docs/ring/certify.html). This applies to public apps only, because private apps skip certification.

**(2) Ring end-user account's country**
- Private apps: "Available to Ring accounts from any country", with a "Maximum 10 Ring accounts on the allowlist" — [Publish → Private Use Apps](https://developer.amazon.com/docs/ring/publish.html).
- Public apps: "Distribution is currently limited to the US. International locations are not yet supported." Distribution can be "United States (Nationwide)" or "Specific US States" — [Publish](https://developer.amazon.com/docs/ring/publish.html).
- Territory rule: "Unless otherwise approved by us in writing, you may not distribute, sell, license, or market Ring In-App Products outside the following territories: United States" — [Program Requirements §6](https://developer.amazon.com/docs/ring/program-requirements.html); also [Schedule §11](https://developer.amazon.com/docs/ring/ring-appstore-schedule.html). The "approved by us in writing" clause is the only documented exception path for a non-US public listing.
- Geographic filtering: "We will implement measures intended to identify an end user's geographic region … We may rely on our determination of an end user's geographic regions for all purposes under this Agreement" — [Schedule §5.d](https://developer.amazon.com/docs/ring/ring-appstore-schedule.html).
- Consumer-facing material: the Ring blog says the Appstore is available "for U.S. customers with a Ring subscription" — [Ring Blog, 2026-03-31](https://blog.ring.com/about-ring/introducing-the-ring-appstore-ring-cameras-just-got-smarter/). Ring's support article on Appstore integrations names no countries. It requires "A Ring subscription" and "At least one Ring camera or doorbell device", and shows "Last updated 1 month ago" — [Ring Support: Ring Appstore and Third-Party App Integrations](https://ring.com/support/articles/e2sg9/Ring-appstore-third-party-integrations).

**(3) Device location's country**
- "Warning: Only US Located Devices: Currently we only support devices located in the US." This sits under the "Testing Process" heading of the Test step, which is the public-app staging flow. Private apps skip Test, Certify and Publish — [Develop](https://developer.amazon.com/docs/ring/develop.html); [Publish](https://developer.amazon.com/docs/ring/publish.html).
- The Locations API returns `country` as an "ISO country code (e.g., "US", "CA", "GB")". `state` is "Provided for devices in the United States when available" and "May not be available for all countries". The sample compliance code branches on `country in ['GB', 'DE', 'FR']` for GDPR — [API Documentation → Locations](https://developer.amazon.com/docs/ring/api-documentation.html).
- The Develop page does not say what "located" means. It could be the Ring Location address, the device IP, or something else.

**(4) Server and hosting IP or region**
- No country or region restriction on API callers is documented anywhere. The only IP rule is: "If your backend server makes requests from a datacenter or cloud-hosting IP address, you may also receive 406 responses due to network-level security rules, even with the correct headers. Contact Ring developer support with your static egress IP address to resolve this" — [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html).
- Calls must come from a backend: "All requests to the Amazon Vision API (https://api.amazonvision.com) and the Ring OAuth server (https://oauth.ring.com) must be made server-to-server from your Partner App Backend. Browser-initiated requests … will be blocked by CORS policies" — [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html).
- Required headers are `User-Agent: YourAppName/version` and `Hardware_Id: <UUID>`. Requests missing them "may receive a 406 Not Acceptable response … Ring's web application firewall has blocked the request" — [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html).
- Ring classes "Moving between regions or hosts while keeping the same endpoint URLs and behavior" as an infrastructure change that needs no re-certification. Ring therefore treats hosting region as invisible to the program — [Certify → Updating a Live App](https://developer.amazon.com/docs/ring/certify.html).

**(5) Appstore UI reachability (where the end user's browser is)**
- FAQ Q21 says: "Currently, the Ring Appstore is only reachable from locations within the US. Users outside of the US are forwarded to the Ring top page." — [Developer FAQ Q21](https://developer.amazon.com/docs/ring/developer-faq.html).
- For private apps, FAQ Q19 says "Partly. Private apps bypass the state-level distribution restrictions … so any connected account can access the app from anywhere in the US regardless of state. The Ring Appstore itself is reachable only from US locations" — [Developer FAQ Q19](https://developer.amazon.com/docs/ring/developer-faq.html).

**How a private app is connected (relevant to the Q21 redirect)**
- The Connect step runs from the **Developer Portal**, not the Appstore: "click Connect Ring account and sign in with the Ring account credentials, including the two-factor authentication code if prompted … Your accounts can now find and access the app in the Ring App Store, where it appears with a private badge" — [Publish](https://developer.amazon.com/docs/ring/publish.html).
- FAQ Q16 describes the same flow. You "Navigate to the Connect section in your app overview" and then "Choose Log in with Ring". It "uses the same OAuth account linking flow as public apps — Ring sends an authorization code to your Token Exchange URL" — [Developer FAQ Q16](https://developer.amazon.com/docs/ring/developer-faq.html).
- Device-access changes after linking happen only in Ring AppStore → My Apps. "Partners have no API to change a user's device access or permissions" — [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html). The Ring support article also places pause and remove under "My Apps" — [Ring Support](https://ring.com/support/articles/e2sg9/Ring-appstore-third-party-integrations).

**Rules relevant to geo workarounds**
- §2.5: "You will not facilitate or provide access to the Ring Service through any means other than through the authentication methods we specify, and you will not disable, circumvent, or avoid any security device, mechanism, or protocol of the Ring Service" — [Program Requirements](https://developer.amazon.com/docs/ring/program-requirements.html).
- §2.12: "You will not circumvent controls we enact to allow end users to prevent sharing data with you" — [Program Requirements](https://developer.amazon.com/docs/ring/program-requirements.html).

### Inferences
**Gating matrix** (rows are the gating axes; *(a)* = public Appstore app, *(b)* = private app):

| Axis | (a) Public Appstore app | (b) Private app (personal use) | Does Azure-US hosting change it? |
|---|---|---|---|
| Developer country / registration | No country gate documented. ID verification is required. Certification asks about non-US users | Same ID verification. No certification | No |
| Ring account country | US-only distribution unless Ring approves "in writing" | "Available to Ring accounts from any country" | No |
| Device location country | "Only US Located Devices" (Test step) | **Unstated.** Publish says "any country" for accounts, but nothing for devices | No. The devices stay in Israel |
| Server/hosting IP | Datacenter IPs may get 406 → register a static egress IP | Same | **Adds** the static-egress-IP requirement. Does not unlock anything |
| End-user browser location (Appstore UI) | US only (Q21 redirect) | Initial Connect runs from the Developer Portal. Later "My Apps" management goes through the Appstore | No |

- The reading most consistent with the docs: a private app can *link* an Israel-registered Ring account. Whether the API then *returns and streams* Israel-located devices is the real unknown, because the only device-location statement is the US-only testing warning. The Locations API examples (CA/GB) and the GDPR branch weakly suggest non-US devices can appear in API responses. That is my inference from sample code, not a commitment.
- Ring's gates key on account, device location and the end user's browser location. None of them keys on the caller's IP country. So US hosting buys nothing for eligibility. It may *cost* something: Azure egress IPs are cloud IPs, so you should use a fixed egress (for example, an Azure NAT Gateway or a static public IP) and register it with Ring support, or expect 406 errors.
- A VPN or US proxy for the user's browser to reach the Appstore is not documented as allowed. Schedule §5.d (Ring "may rely on our determination of an end user's geographic regions") and Program Requirements §2.5 argue against it. **Do not design around it.**
- **Decisive empirical test** (about 1–3 days, most of it building minimal linking handlers):
  1. Register an Amazon developer account and pass ID verification. The doc wording accepts any "government-issued ID such as a passport … or national ID card".
  2. Create a **private app**. **Placeholder URLs will not work.** Ring POSTs a code that expires after 60 s to the Token Exchange URL. The handler must exchange it, store the tokens and return 200, and "Ring doesn't retry" — [Release Notes Oct 22, 2026](https://developer.amazon.com/docs/ring/release-notes.html).
  3. Device access also starts only "Once the integration reaches awaiting or completed status" — [API Documentation §8](https://developer.amazon.com/docs/ring/api-documentation.html). That requires the Account Link sign-in page, the nonce match, and `POST`/`PATCH /v1/accounts/me/app-integrations`. So build minimal **working** Token Exchange and Account Link handlers; adapting [ring-api-helloworld](https://github.com/AmazonAppDev/ring-api-helloworld) is one option. **A failure at token exchange or linking says nothing about Israel eligibility.** It is a handler bug until proven otherwise.
  4. Use **Connect Ring account** in the Developer Portal with the Israeli Ring account.
  5. Run the first API calls from a **residential IP**, for example the developer's machine with an HTTPS tunnel for the endpoints. Call `GET /v1/devices?include=location,configurations`, then try one RTSPS frame grab.
  6. Repeat the same token-authenticated `GET /v1/devices` from an **Azure US host**. That comparison answers "does Azure US hosting change anything?" with evidence.
- **How to read the results:**

  | Observation | What it means |
  |---|---|
  | Token exchange or linking fails | Handler or implementation problem. Not evidence about geography |
  | HTTP 406 from the API | WAF: datacenter/cloud IP not allowlisted, or missing `User-Agent`/`Hardware_Id`. Not geography. Register a static egress IP |
  | 406 only from Azure, success from residential | Cloud-IP WAF rule. Fix with a static egress IP allowlisted by Ring support |
  | Linking succeeds but `/v1/devices` is empty or lacks the Israeli devices | The "US located devices" gate applies to private apps too. Official path blocked for Israel |
  | Devices returned with `country: "IL"`, but video is unreadable or `e2e_encryption.enabled: true` | TAKE/E2EE encryption, not eligibility. Wait for Ring's 24-hour TAKE partner window, or disable encryption on that camera if the user accepts that |
  | Devices returned and an RTSPS frame grab produces a watermarked JPEG | Official path viable for this user |
  - The Playground ("one-click OAuth token generation (valid 30 minutes)") is cheaper to try first — [Release Notes May 28, 2026](https://developer.amazon.com/docs/ring/release-notes.html). But I could not confirm whether Playground tokens act on the developer's real devices or on simulated ones. The release note mentions "live view event simulation", so a Playground success proves less than a private-app success.

### Gaps
- No doc says whether the "Only US Located Devices" restriction applies to private apps, nor what "located" means (Ring Location address, device IP, or account billing country).
- No doc says whether the "Log in with Ring" OAuth/consent page (account.ring.com / oauth.ring.com) geo-redirects users browsing from outside the US. Q21 covers only the Appstore UI.
- No doc says whether an Israel-located user can open "My Apps" to change device selection after linking. Per Q21 that UI is US-reachable only, so it may be impossible from Israel.
- I found no forum post, GitHub issue or blog post from a non-US user reporting success or failure with private apps. Searches of the Amazon Developer Community and the wider web found only the official docs.
- The full Amazon Developer Services Agreement (country eligibility for Amazon developer accounts generally) was not read.

---

## Is there any documented way for a non-US (e.g., Israel) Ring account to authorize an app? Partner-region list? Contradictions between pages?

### Takeaway
The only documented path is the **Private App** track: "Available to Ring accounts from any country", connected via the Developer Portal's "Connect Ring account" button. No partner-region list is published. The only listed territory is "United States". Ring's international plans are unofficial "later" statements with no dates or countries. Several pages contradict each other on geography, the account cap, plan naming and the GA date.

### Cited Findings
- **The private-app path** is "Available to Ring accounts from any country" — [Publish](https://developer.amazon.com/docs/ring/publish.html).
- **No region list.** The only territory listed is "United States" — [Program Requirements §6](https://developer.amazon.com/docs/ring/program-requirements.html). Public distribution offers only "United States (Nationwide)" or "Specific US States" — [Publish](https://developer.amazon.com/docs/ring/publish.html).
- **International plans (secondary sources only):**
  - A CES 2026 report says the Appstore "debuts in the U.S., with Amazon confirming plans to expand to additional regions later" — [Android Headlines, Jan 2026](https://www.androidheadlines.com/2026/01/amazon-ring-new-ai-sensors-alerts-global-sidewalk-expansion-ces-2026.html) (search summary; not fetched).
  - TechCrunch says it was "initially limited to U.S. customers before expanding internationally" — [TechCrunch, 2026-03-31](https://techcrunch.com/2026/03/31/ring-app-store-bets-on-ai-to-go-beyond-home-security/) (search summary).
  - I found no dated announcement for Canada, the UK, the Middle East or Israel through 2026-10-24 (searches of Ring blog, Amazon Developer Community and news).
- **Partner-Initiated OAuth** (start linking from your own app) is "available by invitation only". It is "gated behind an internal allowlist. To request access … send an e-mail to ring-appstore-auth-support@amazon.com", and is "Free only (current phase)" — [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html). No geographic terms are stated for it.

**Contradictions (with URLs):**
1. **Geography of private apps:**
   - [Publish](https://developer.amazon.com/docs/ring/publish.html) says "Available to Ring accounts from any country".
   - [FAQ Q19](https://developer.amazon.com/docs/ring/developer-faq.html) says "Partly … any connected account can access the app from anywhere in the US regardless of state. The Ring Appstore itself is reachable only from US locations".
   - [Develop](https://developer.amazon.com/docs/ring/develop.html) says "Currently we only support devices located in the US".
2. **Private-app account cap:**
   - 10 per [FAQ Q15/Q16](https://developer.amazon.com/docs/ring/developer-faq.html) and [Publish](https://developer.amazon.com/docs/ring/publish.html).
   - "up to 5 allowlisted Ring accounts" per the [Release Notes, July 21, 2026](https://developer.amazon.com/docs/ring/release-notes.html). This is still uncorrected as of 2026-10-24.
3. **Plan requirement wording:**
   - "Basic Ring plan required" per [Publish](https://developer.amazon.com/docs/ring/publish.html).
   - "an active Ring subscription or a Ring trial (about 30 days)" and "either a paid Ring subscription or an active Ring trial" per [FAQ Q16/Q18](https://developer.amazon.com/docs/ring/developer-faq.html).
   - "an active Ring Protection subscription plan" per [Develop](https://developer.amazon.com/docs/ring/develop.html), and "Ring Protection plan or trial" per [FAQ Q7](https://developer.amazon.com/docs/ring/developer-faq.html).
4. **GA date:**
   - The [Release Notes](https://developer.amazon.com/docs/ring/release-notes.html) still say "April 21, 2025 … The Ring Appstore API is now generally available".
   - The portal GA is dated March 31, 2026 per the [Amazon Developer Community GA post](https://community.amazondeveloper.com/t/launch-announcement-ring-developer-portal-general-availability/28126) and the [Ring Blog](https://blog.ring.com/about-ring/introducing-the-ring-appstore-ring-cameras-just-got-smarter/).
5. **Stale "Early Access" wording on the MCP page:**
   - The page still says credentials "must be requested separately through the Ring Developer Early Access Program. Visit https://developer.amazon.com/ring and apply for Developer Early Access" — [Ring MCP](https://developer.amazon.com/docs/ring/ring-mcp.html).
   - That contradicts the self-serve registration described in [Get Started](https://developer.amazon.com/docs/ring/get-started.html).
   - Similarly, the RTSP section says the device ID is "issued by your Ring integration contact", which also reads like early-access text — [API Documentation → RTSP](https://developer.amazon.com/docs/ring/api-documentation.html).
6. **Release-note date reference:** FAQ Q7 and Develop cite "the September 10, 2026 release notes", but the entry is dated September 11, 2026 — [Developer FAQ](https://developer.amazon.com/docs/ring/developer-faq.html); [Release Notes](https://developer.amazon.com/docs/ring/release-notes.html).

### Inferences
- For an Israel-based user, the private-app track is the **only** documented route. Its viability depends entirely on the unresolved device-location question (see the first section).
- A public listing for Israeli users would need Ring's written approval under Program Requirements §6. That path is impractical for a hobby or open-source project.

### Gaps
- No official statement on when, or whether, the device-location restriction will be lifted or which countries come next.
- No first-hand non-US report was found.

---

## What can the API actually do today? Devices, events/webhooks, snapshots, clips, live view, control — anything new?

### Takeaway
The API is still **read and observe plus short live video**:
- device discovery, status and coarse location
- read-only configurations (zones, image settings, `e2e_encryption`)
- webhooks for motion, doorbell press, device lifecycle, integration and subscription events
- per-device event history
- live video via WHEP (WebRTC) or RTSPS, capped at 30 s on battery and 60 s on line power
- MP4 clips (≤15 min) and JPEG/PNG stills from **stored** media only
- subscriptions

Sensors and Chimes are Early Access. The only actuation is Chime sound playback. There is **no** Ring Alarm arm/disarm, mode, siren, light, lock or intercom control, no two-way audio, and no settings writes. **Nothing new since Oct 22, 2026.**

### Cited Findings
**Endpoints** (base `https://api.amazonvision.com`) — [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html):
- Devices:
  - `GET /v1/devices` (with `?include=status,capabilities,location,configurations`) and `/v1/devices/{id}`
  - `/status`, `/capabilities`, `/location`, `/configurations`
- History and media:
  - `GET /v1/history/devices/{id}/events`
  - WHEP: `POST/DELETE …/media/streaming/whep/sessions[/{session_id}]`
  - RTSP: `rtsps://video.rtsp.amazonvision.com:322/v1/devices/{device_id}/stream`
  - `POST …/media/video/download`, `POST …/media/image/download`, `POST …/media/audio/playback`
- Account and integration:
  - `GET /v1/users/me`
  - `POST/PATCH/DELETE /v1/accounts/me/app-integrations`
  - `GET /v1/accounts/me/subscriptions`

**Device coverage:**
- The Cameras and Doorbells scope covers "all Ring camera and doorbell models" and is "toggled as a whole". Its capabilities include "Livestream — Start and view a live video stream from a device" and "Video Download — Download recorded video from a device" — [Configure](https://developer.amazon.com/docs/ring/configure.html).
- Sensors (Early Access) cover "Contact Sensors (Indoor & Outdoor)", "Flood/Freeze Sensors", "Temperature & Humidity Sensors" and "Air Quality Monitors". Chimes cover "Ring Chime and Ring Chime Pro" — [Configure](https://developer.amazon.com/docs/ring/configure.html).
- Sensors are "Available through the Ring Developer Early Access Program and subject to change before general availability" — [Release Notes Aug 24, 2026](https://developer.amazon.com/docs/ring/release-notes.html).
- Ring Alarm base station, keypad, Alarm motion sensors and sirens are **not** listed as scopes or device pages — [Configure](https://developer.amazon.com/docs/ring/configure.html); [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html).
- Multi-camera devices (Ring Elite) report as one device with `component_id` per module — [Release Notes Aug 20, 2026](https://developer.amazon.com/docs/ring/release-notes.html).

**Events and webhooks:**
- Webhooks are HTTPS POST, signed with HMAC-SHA256 (`X-Signature: sha256=<hex>`), and must be answered within 5 s — [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html).
- Event types:
  - device and doorbell: `motion_detected`, `button_press`, `device_added`, `device_removed`, `device_online`, `device_offline`
  - integration and billing: `app_integration_added/removed`, `subscription_activated/deactivated`
  - plus sensor events in Early Access
  - Source: [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html); [Release Notes](https://developer.amazon.com/docs/ring/release-notes.html)
- Retries on 5xx run at 1s, 5s, 30s, 2m, 10m and 1h, then failed events go to a DLQ kept for 72 h. "10+ consecutive failures over 24 hours" may disable the endpoint. Ring does not publish a latency figure — [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html).
- Motion `sub_type`:
  - With Smart Alerts off, it is always `motion`.
  - With Smart Alerts on, it is `human`, `vehicle`, `package_delivery` or `other_motion`.
  - "No API reports whether Smart Alerts is enabled, so treat sub_type as an open-ended vocabulary" — [Release Notes Oct 5, 2026](https://developer.amazon.com/docs/ring/release-notes.html).
- Event History holds `motion`, `ding` and `on_demand` (live view) events. It contains only events after consent — [API Documentation → Event History](https://developer.amazon.com/docs/ring/api-documentation.html).

**Recorded clips:**
- "CRITICAL: This Endpoint Does NOT Trigger Recording. The media clips download endpoint retrieves existing recorded footage only … If the camera was not recording at the requested timestamp, you will receive a 416 MEDIA_NOT_FOUND error." The duration limit is ≤ 900,000 ms (15 min) — [API Documentation → Media Clips](https://developer.amazon.com/docs/ring/api-documentation.html).
- The recommended workflow is: "Start a live video session (which triggers recording on supported devices)", wait, stop, then download. Retry on 416/425 "with exponential backoff and jitter".
- `motion_detected` and `button_press` "are the only two event types that produce a recording" — [API Documentation → Media Clips](https://developer.amazon.com/docs/ring/api-documentation.html).

**Control:**
- "At this time, device capability values returned in the Devices API are read-only. They do not indicate active control functionality" — [Developer FAQ Q8](https://developer.amazon.com/docs/ring/developer-faq.html).
- "Chime settings are read-only to partners. Every chime operation available to your app is a read, with one exception: playback … No partner operation mutates a chime's configuration" — [API Documentation → Chimes](https://developer.amazon.com/docs/ring/api-documentation.html).
- **CONTRADICTION:** the [Configure](https://developer.amazon.com/docs/ring/configure.html) page describes the "Chime Controls" scope as "Play and change chime audio, ring tones, snoozes, and audio settings". The API doc explicitly warns: "Reading the description as a promise of write endpoints for volume, ring tone, or snooze will send you looking for endpoints that do not exist" — [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html).

**Recent additions** (all from [Release Notes](https://developer.amazon.com/docs/ring/release-notes.html)):
- Oct 9: `e2e_encryption` field
- Oct 12: location-scoped subscriptions
- Oct 22: token-exchange documentation
- Nothing after Oct 22, 2026, and no new control capability.

### Inferences
- MCP tools that can be built on the official API:
  - `list_devices`, `get_device_status/config`, `list_events`
  - `get_live_frame` / `start_live_view` (see the next section)
  - `get_snapshot_at` / `get_latest_snapshot` (stored media)
  - `get_clip`
  - event subscription via webhook→MCP notification
  - Early Access sensor state
  - `play_chime_sound`
- Anything that changes security state (alarm, siren, lights, locks, settings) is impossible on the official API.

### Gaps
- Whether Ring Alarm components appear at all in `/v1/devices` is undocumented.
- Whether Early Access scopes (sensors, chimes) work in a **private** app before GA is not stated. The docs only say such apps "can only be published once dynamic scopes reach general availability" — [Configure](https://developer.amazon.com/docs/ring/configure.html).

---

## Live view / live image capture — protocols, session limits, and how to get "the current frame"

### Takeaway
Live view is real and documented, using **WHEP (WebRTC)** or **RTSPS over TCP**:
- receive-only video, with optional receive-only audio
- capped at **30 s for battery devices and 60 s for line-powered devices**, after which "the session is automatically terminated"
- Ring explicitly suggests "reconnection logic if extended viewing is needed"

There is **no on-demand snapshot API**. The image endpoint returns a frame from *stored* media (`at_timestamp` or `latest_in_range`). A "live image of the current feed" therefore means opening a live session and grabbing a frame server-side; RTSPS + FFmpeg/GStreamer is the documented server-side path. All media is watermarked. Under TAKE encryption, now the worldwide default, video is unreadable to partner apps.

### Cited Findings
**Protocols and limits:**
- "WHEP (WebRTC) — Low-latency streaming using WebRTC HTTP Egress Protocol" and "RTSP — RTSP over TLS (RTSPS) streaming for server-side integrations and standard RTSP clients" — [API Documentation → Live Video](https://developer.amazon.com/docs/ring/api-documentation.html).
- "Session duration limits: Battery-powered devices support streams up to 30 seconds; line-powered devices support streams up to 60 seconds."
- "After the maximum duration, the session is automatically terminated. You should: Monitor session duration and close sessions proactively before the limit; Inform users of the remaining session time; Implement reconnection logic if extended viewing is needed" — [API Documentation → WHEP](https://developer.amazon.com/docs/ring/api-documentation.html).

**WHEP:**
- The client sends `POST …/whep/sessions` with `Content-Type: application/sdp`. The server answers `201 Created` with an SDP answer and a `Location` header, and the session is closed with `DELETE` on that URL.
- "All media tracks must use recvonly direction … Bidirectional media (sendrecv, sendonly) is not supported." Video is always required; audio is optional (Opus in the examples).
- The sample uses STUN `stun:stun.l.google.com:19302`. You must "Read the codec from the SDP answer, not from capabilities" (e.g., a Ring Elite 360 advertising HEVC answers with H264).
- Errors: 503 "Device is currently offline", 401, 404.
- Source: [API Documentation → WHEP](https://developer.amazon.com/docs/ring/api-documentation.html).

**RTSPS:**
- `rtsps://video.rtsp.amazonvision.com:322/v1/devices/<device_id>/stream`. It uses "RTSP 1.0 (RFC 2326)", "Plain rtsp:// isn't supported", and "Interleaved TCP media … there's no separate UDP media path". UDP is rejected with 461.
- Codecs: "H.264 or H.265 for video; Opus or PCMU for audio".
- Authentication happens once, at DESCRIBE, via `X-Auth-Token`, Basic auth (token as password), or `?token=`. The token is "a long JWT (around 1,300 characters)", which FFmpeg truncates in URL user-info, so FFmpeg should use `?token=`.
- "Streams disconnect automatically after the same maximum duration as WHEP."
- GStreamer is "recommended"; FFmpeg example: `ffplay -rtsp_transport tcp "rtsps://…/stream?token=<access_token>"`, or `ffmpeg -i "<url>" -c copy out.mp4` to record.
- Source: [API Documentation → RTSP Live Video Streaming](https://developer.amazon.com/docs/ring/api-documentation.html).

**Snapshots are not on-demand:**
- "Ring provides an endpoint to download image snapshots in JPEG or PNG formats by a specified timestamp of the last snapshot in a time range."
- Modes are `at_timestamp` ("Extract a frame at a specific point in time") or `latest_in_range` ("Find the most recent image within a time window"). Timestamps must be "Within last 180 days, ≤ now" and the window must be "≤ 24 hours". Maximum resolution is 1920×1080.
- The response is a 303 to a pre-signed URL, with `X-Media-Origin: "recording" (frame from video) or "snapshot" (stored still image)`.
- Source: [API Documentation → Image Snapshots](https://developer.amazon.com/docs/ring/api-documentation.html).

**Recording side effect of live view:**
- Starting a live view "triggers recording on supported devices", which makes a clip or still downloadable afterwards. Live views appear in history as `on_demand` events — [API Documentation → Media Clips / Event History](https://developer.amazon.com/docs/ring/api-documentation.html).

**Watermark:**
- "All media content delivered through the Ring Partner API now includes a mandatory visible watermark overlay containing the Ring logo (top-left), Device ID, App Name, and timestamp (top-right) … cannot be removed" — [Release Notes Jun 8, 2026](https://developer.amazon.com/docs/ring/release-notes.html).
- For snapshots, "Lower values increase the relative size of the watermark overlay" — [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html).

**Encryption:**
- "During the initial rollout, a TAKE device stays visible and callable through the Ring Partner API, but video requests return encrypted content, so your app cannot read recordings or snapshots, or open a live stream."
- "E2EE devices are not returned by any Ring Partner API."
- Ring is "working to enable partner apps to process the most recent 24 hours of a TAKE device's video and live stream from it."
- Source: [Developer FAQ Q10–Q11](https://developer.amazon.com/docs/ring/developer-faq.html).
- TAKE "will roll out as the default end-to-end encryption" for every Ring customer worldwide — [Amazon Developer Community Dev News, Aug 31, 2026](https://community.amazondeveloper.com/t/dev-news-aug-31-26-hackathon-ring-updates/29048).

**Docs contradictions:**
- **Audio:** the landing page still says "Video only — no audio" and its demo code says "Video only — do NOT add audio" — [Ring Developer landing](https://developer.amazon.com/ring). The API doc allows optional one-way audio — [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html).
- **Browser use:** WHEP is "recommended for browser-based and mobile integrations", yet "Browser-initiated requests … will be blocked by CORS policies" — [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html). In practice the WHEP POST has to be proxied through your backend.

### Inferences
- **"Current frame" MCP tool.** The cleanest server-side implementation, for example a .NET backend shelling out to FFmpeg:
  1. Read `configurations` and stop if `e2e_encryption.enabled == true`.
  2. Run `ffmpeg -rtsp_transport tcp -i "rtsps://video.rtsp.amazonvision.com:322/v1/devices/<id>/stream?token=<access_token>" -frames:v 1 frame.jpg`.
  3. Tear down the session.
  - This yields a watermarked frame that is seconds old, and it costs one live session. On battery cameras it also wakes the device and drains the battery.
  - An alternative with no live session: `latest_in_range` over the last few minutes. This returns only what was already stored and may be stale or missing.
- **Continuous streaming to an MCP client** is possible only as a chain of ≤30/60 s sessions with reconnects (which Ring sanctions). The stream must be served by the backend: either an RTSP→WebRTC/HLS relay, or WHEP proxied through the backend. MCP itself is not a video transport, so the bridge would return a viewer URL or a series of frames.
- If the user's cameras are on TAKE, which becomes increasingly likely as the default rolls out, none of this works until Ring ships the 24-hour partner window. TAKE status is therefore the first thing to check in the empirical test.

### Gaps
- No documented limit on concurrent sessions per device or per account, and no session-setup latency figure.
- No statement on whether reconnect-chaining has cooldowns or battery-protection throttles.
- No date for TAKE partner access.

---

## Constraints — watermark, E2EE/TAKE, plan requirements, rate limits, privacy/retention, review, and whether an open-source project can ship with users registering their own Private App

### Takeaway
**Binding constraints:**
- mandatory watermark
- TAKE/E2EE limits on video
- a paid Ring plan or trial on every connected account
- 100 TPS per partner
- strict privacy, deletion and AI-disclosure rules (enforced via certification for public apps, and contractually for all apps through the Schedule the developer must accept)
- no handing developer credentials to third parties

An open-source project fits best as **"bring your own private app"**. Each user registers their own Amazon developer account (with ID verification), creates their own private app, self-hosts the backend (HTTPS Account Link and Token Exchange endpoints, plus a webhook if wanted), and connects up to 10 of their own Ring accounts.

### Cited Findings
- **Plan:**
  - "Each connected account needs either a paid Ring subscription or an active Ring trial (about 30 days)" — [Developer FAQ Q18](https://developer.amazon.com/docs/ring/developer-faq.html).
  - "Basic Ring plan required" — [Publish](https://developer.amazon.com/docs/ring/publish.html).
  - The landing page says "Compatible Ring subscription required" — [Ring Developer landing](https://developer.amazon.com/ring).
- **Rate limit:** "Default rate: 100 requests per second (TPS) per partner". A 429 comes with `Retry-After` — [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html).
- **Contract acceptance even for private apps:** at creation you must check "I agree to the Ring Appstore Schedule to the Amazon Developer Services Agreement" — [Publish → Private Use Apps](https://developer.amazon.com/docs/ring/publish.html); [Configure](https://developer.amazon.com/docs/ring/configure.html).
- **Credentials:**
  - §2.7: "You will not … (ii) mask your usage of the Ring Service, for example, by using multiple accounts or multiple Ring In-App Products to accomplish the same feature, or (iii) provide your developer credentials to any third party" — [Program Requirements](https://developer.amazon.com/docs/ring/program-requirements.html).
  - Credentials are shown only once. To rotate them you delete and recreate the app — [Configure](https://developer.amazon.com/docs/ring/configure.html).
- **Data deletion:** §2.11 says "You will delete all data you receive from us … concerning an end user if we or the end user asks you to do so" — [Program Requirements](https://developer.amazon.com/docs/ring/program-requirements.html).
- **Safety:** §2.8 bars uses "where the use or failure of the Ring Service could lead to death, injury, or property damage" — [Program Requirements](https://developer.amazon.com/docs/ring/program-requirements.html) (as recorded in the earlier research note; clause numbering verified for §2.5/2.7/2.11/2.12 this session).
- **Review:**
  - Public apps get a five-tab Privacy & Legal questionnaire (including AI governance), and "90% of submissions are reviewed in less than 48 hours" — [Certify](https://developer.amazon.com/docs/ring/certify.html); [Get Started](https://developer.amazon.com/docs/ring/get-started.html).
  - Private apps: "No certification required" — [Publish](https://developer.amazon.com/docs/ring/publish.html).
- **Private-app operations:**
  - Endpoints: "Account Link URL and Token Exchange URL are required". The Webhook URL is optional — [Developer FAQ Q16](https://developer.amazon.com/docs/ring/developer-faq.html); [Publish](https://developer.amazon.com/docs/ring/publish.html).
  - Disconnecting: "Disconnect all" only; "Individual account disconnection is not currently supported" — [Developer FAQ Q17](https://developer.amazon.com/docs/ring/developer-faq.html).
  - Sharing: "Developer account sharing via the vendor/employee system supports up to 100 people (separate from the 10-account allowlist)" — [Publish](https://developer.amazon.com/docs/ring/publish.html).
- **Account linking** still requires your own sign-in page: "Users must sign in to your partner service through your web interface — this step is mandatory" — [Developer FAQ Q1](https://developer.amazon.com/docs/ring/developer-faq.html).
- **Branding:** no product name, domain or logo "confusingly similar to 'Ring', 'Amazon'" — [Program Requirements §3](https://developer.amazon.com/docs/ring/program-requirements.html) (per the earlier note).

### Inferences
- **Open-source distribution model:**
  - Ship the code and a setup guide, never shared credentials. Each user brings their own client_id, client_secret and HMAC key.
  - Ring's rules do not forbid this. It is the only model that respects §2.7(iii) without a certified, US-only public listing.
  - Friction per user: an Amazon developer account, government-ID verification, a publicly reachable HTTPS backend, and a paid Ring plan.
- The project name "RingMCPBridge" should not be used as the app or listing name, given the branding rule.
- Sending frames to an LLM is third-party processing. Disclose it in the project's documentation and privacy notes even for private use, and choose zero-retention LLM settings.

### Gaps
- No explicit rule on how long partners may retain video.
- No statement on whether ID verification or the developer agreement has country restrictions beyond what is quoted above.

---

## Official SDK? OAuth flow details (authorization code, refresh, scopes)

### Takeaway
"There is no official Ring Partner SDK", in any language, .NET included. Ring supplies only a sample repo (Python + Next.js/TypeScript, MIT). OAuth is Ring's own server (`oauth.ring.com`). One-way linking is the default:
- Ring POSTs an auth code to your Token Exchange URL; the code is valid for 60 s and is not signature-verifiable.
- You exchange it with client_id and secret. Access tokens last about 4 h; refresh tokens last about 30 days and rotate on each use.
- The user then signs in at your Account Link URL and you match an HMAC nonce.

Partner-Initiated OAuth with PKCE is invite-only and free-only. Scope selection ("dynamic scopes") is Early Access, and no full scope-string list is published.

### Cited Findings
- **SDK:** "There is no official Ring Partner SDK. Use standard HTTP libraries and tools" — [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html). No C#/.NET mention found anywhere in the docs (grep of all pages).
- **Sample repo:** [AmazonAppDev/ring-api-helloworld](https://github.com/AmazonAppDev/ring-api-helloworld) (fetched summary)
  - Python 3.8+ scripts plus a Next.js 14 TypeScript app, MIT licence
  - refresh-token mode with auto-renewal, Playground access-token mode (~30 min)
  - WHEP live view, and a webhook receiver at `/api/webhook` fanned out over SSE
  - no SDK; no region requirement stated
- **Token exchange and lifetimes:**
  - The Token Exchange request is "a form-encoded POST carrying code and client_id, and it can't be verified by signature. Return HTTP 200 only after you've exchanged the code and stored the tokens: a non-2xx response fails the link, and Ring doesn't retry it" — [Release Notes Oct 22, 2026](https://developer.amazon.com/docs/ring/release-notes.html).
  - The code "expires 60 seconds after Ring issues it" — [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html).
  - "each refresh invalidates the previous refresh token" — [Release Notes Oct 22, 2026](https://developer.amazon.com/docs/ring/release-notes.html). Token response `expires_in: 14400` (4 h) and ~30-day refresh tokens were recorded in the earlier research note from [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html).
- **Nonce:**
  - HMAC-SHA256 of `"{timestamp}:{account_id}"`, encoded as URL-safe Base64 without padding, with the time in milliseconds and a 600-second window.
  - The same HMAC key signs webhooks, but webhooks use a hex encoding.
  - "Nonce matching must only execute after the user has signed in to your partner service."
  - Source: [Developer FAQ Q1–Q3](https://developer.amazon.com/docs/ring/developer-faq.html).
- **Partner-Initiated OAuth 2.0:** "available by invitation only … gated behind an internal allowlist … send an e-mail to ring-appstore-auth-support@amazon.com". It is "Free only (current phase)" and uses PKCE (S256) — [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html); [Release Notes Aug 13, 2026](https://developer.amazon.com/docs/ring/release-notes.html).
- **Scopes:**
  - Four groups: Cameras and Doorbells (all or nothing), Sensors (per type), Chimes (plus optional Chime Controls), and Account and Lifecycle (always granted). "After certification, new scopes can be added but can't be removed" — [Configure](https://developer.amazon.com/docs/ring/configure.html).
  - The API doc lists scopes only generically: "Device discovery and status; Video streaming access; Notification subscriptions; Configuration reading" — [API Documentation → Scope and Permissions](https://developer.amazon.com/docs/ring/api-documentation.html).
  - The only literal scope string is `ava.devices`, in the certification checklist — [Developer FAQ](https://developer.amazon.com/docs/ring/developer-faq.html).

### Inferences
- A .NET/C# bridge must hand-roll the HTTP client: the JSON:API envelope, the required `User-Agent`/`Hardware_Id` headers, refresh rotation with persisted refresh tokens, and webhook HMAC verification. Live video needs either a WebRTC stack (e.g., SIPSorcery) for WHEP, or FFmpeg/GStreamer for RTSPS. RTSPS + FFmpeg is the lower-risk choice for frame grabs.
- Because refresh tokens rotate and expire after about 30 days of inactivity, the bridge needs a background refresh job and durable token storage. A local stdio-only MCP server holding tokens in memory will not survive.

### Gaps
- No published list of exact OAuth scope strings.
- No documented token-revocation endpoint for one-way-linked apps. DELETE unlink works only for Partner-Initiated apps — [Release Notes Sep 15, 2026](https://developer.amazon.com/docs/ring/release-notes.html).

---

## Ring's official MCP server — still docs-search only?

### Takeaway
Yes. The "Ring Appstore Knowledge MCP Server" is still documentation-only (`search_docs`, `get_doc` against a Bedrock Knowledge Base), with no device or account access. The landing page still implies device capabilities are reachable "via Ring APIs or the Ring MCP Server", and the MCP page still carries stale "Early Access" credential wording.

### Cited Findings
- It "connects your AI coding assistant (Kiro, Cursor, Cline, etc.) to Ring Appstore documentation" and is "backed by an Amazon Bedrock Knowledge Base". It exposes "two tools": `search_docs` and `get_doc`. Server URL: `https://knowledge.appstore-mcp.ring.amazon.dev/mcp` — [Ring MCP](https://developer.amazon.com/docs/ring/ring-mcp.html).
- Known issue: "The Kiro CLI (not IDE) cannot authorize with Ring Appstore MCP" — [Ring MCP](https://developer.amazon.com/docs/ring/ring-mcp.html).
- For the sample app, credentials "must be requested separately through the Ring Developer Early Access Program" — [Ring MCP](https://developer.amazon.com/docs/ring/ring-mcp.html). This is stale; see the contradictions above.
- The landing page FAQ says "Developers can access core Ring capabilities, including live video (such as WebRTC, RTSP), motion events, doorbell presses, device status, and event history, via Ring APIs or the Ring MCP Server." But elsewhere it describes the MCP server as providing "real-time access to API documentation, code examples, and integration guidance" — [Ring Developer landing](https://developer.amazon.com/ring).
- No GitHub repo or announcement of an official device-access MCP server was found. Searches surfaced only community MCPs built on the unofficial `ring-client-api`, such as [jpcors/ring-mcp on Glama](https://glama.ai/mcp/servers/jpcors/ring-mcp), which is "not affiliated with or endorsed by Ring/Amazon" per the search summary.

### Inferences
- The official MCP server is a dev-time aid for writing the bridge, not a substitute for it. A device-access MCP over the official API has to be built by the user (this project).

### Gaps
- None material. No sign of a device-capable official MCP server through 2026-10-24.
