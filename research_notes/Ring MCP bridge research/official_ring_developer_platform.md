# Official Ring (Amazon) Developer Platform and Partner APIs (research as of 2026-10-23)

Method note: All 18 pages under `https://developer.amazon.com/docs/ring/` linked from the docs navigation were downloaded as raw HTML with curl on 2026-10-23, along with the landing page `https://developer.amazon.com/ring`. Text was extracted locally, so quotes are verbatim from the live pages. Nothing was JS-gated: every page returned full server-rendered content. The newest release-notes entry is dated **October 22, 2026**. Every content page returned server-rendered HTML; none was blocked or JS-only. `index.html` is just a "page moved" stub, and several pages were read only partially (depth noted per page below). "Verified" below means read in the primary doc. Anything marked *Inference* is my reasoning, not a doc statement.

---

## 1. Pages read, program identity, launch, eligibility, approval, fees, geography

### Takeaway
An official, public third-party Ring API now exists. The program is called **Ring Developer / "Ring Developer Experience"**, the marketplace is the **Ring Appstore**, and the API is the **"Ring Partner API"** (also "Amazon Vision API"/"AVA") at `api.amazonvision.com`. The Developer Portal went GA on **March 31, 2026**, announced as "opening our APIs to developers for the first time." Developer registration is framed as a **request**. You supply business or organization details and your use cases, and the account owner must pass government-ID verification. Whether approval is automatic or reviewed is unverified, and the MCP page's "apply for Developer Early Access" wording may be stale. Some features are still Early Access or invite-only. Publishing is free, Ring takes a 10% fee on paid subscriptions, and distribution is **US-only**. A **Private App** track (no certification, up to 10 allowlisted Ring accounts) explicitly covers personal and home-automation use.

### Cited Findings
**Pages read (all fetched in full as HTML; reading depth noted):**
- https://developer.amazon.com/docs/ring/developer-faq.html (full)
- https://developer.amazon.com/docs/ring/get-started.html (full)
- https://developer.amazon.com/docs/ring/configure.html (full)
- https://developer.amazon.com/docs/ring/develop.html (full)
- https://developer.amazon.com/docs/ring/certify.html (most)
- https://developer.amazon.com/docs/ring/publish.html (rollout and Private Use Apps sections)
- https://developer.amazon.com/docs/ring/reports.html (headings only)
- https://developer.amazon.com/docs/ring/ring-mcp.html (full)
- https://developer.amazon.com/docs/ring/ux-design-guide.html (partial: settings, tokens, privacy, engagement)
- https://developer.amazon.com/docs/ring/computer-vision-guidelines.html (partial: intro, media constraints, VLM, Stage 3)
- https://developer.amazon.com/docs/ring/marketing-guidelines.html (headings only)
- https://developer.amazon.com/docs/ring/api-documentation.html (~6,700 lines; targeted reads of overview, reference, tokens, both linking methods, Users, Status, Locations, Configurations, Notifications, Motion, Sensors, Chimes, Event History, Live Video/WHEP/RTSP, Media Clips, Snapshots, Subscriptions, Errors)
- https://developer.amazon.com/docs/ring/customer-lifecycle-analytics.html (headings only)
- https://developer.amazon.com/docs/ring/ring-appstore-schedule.html (full)
- https://developer.amazon.com/docs/ring/program-requirements.html (full)
- https://developer.amazon.com/docs/ring/content-policy.html (partial: intro, §1.2, §4.0–4.1, part of §4.2, §4.3.1)
- https://developer.amazon.com/docs/ring/release-notes.html (full)
- https://developer.amazon.com/docs/ring/index.html (a stub: "This page moved to Ring Developer Experience Documentation")
- https://developer.amazon.com/ring (landing page, full); https://developer.ring.com/ (summary via WebFetch)
- Not readable, because they need a login or were only linked: the Playground (https://developer.amazon.com/ring/console/playground), the console, and the GitHub sample https://github.com/AmazonAppDev/ring-api-helloworld (linked from develop.html, not fetched).

**Naming and launch:**
- The program is "Ring Developer Experience". Through the Ring Developer portal developers "build applications that integrate with Ring devices and publish them in the Ring App Store" — [Get Started](https://developer.amazon.com/docs/ring/get-started.html)
- The API is called "Ring Partner API". Its base URL is `https://api.amazonvision.com` and its OAuth server is `https://oauth.ring.com` — [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html)
- The GA announcement is dated **March 31, 2026**. It describes the portal as "opening our APIs to developers for the first time" and credits early-access developers MELD.AI, NSMedia.io and WTB.AI — [Amazon Developer Community GA post](https://community.amazondeveloper.com/t/launch-announcement-ring-developer-portal-general-availability/28126)
- The community welcome post is dated Feb 17, 2026 — [Welcome post](https://community.amazondeveloper.com/t/welcome-to-the-ring-developer-community/27702)
- TechCrunch says the app store was first announced at CES in January 2026 and launched with about 15 apps — [TechCrunch, 2026-03-31](https://techcrunch.com/2026/03/31/ring-app-store-bets-on-ai-to-go-beyond-home-security/)
- Ring's blog (Mar 31, 2026) says the Appstore is available "for U.S. customers with a Ring subscription" — [Ring Blog](https://blog.ring.com/about-ring/introducing-the-ring-appstore-ring-cameras-just-got-smarter/)
- **CONFLICT:** the release notes put GA at **"April 21, 2025"** ("The Ring Appstore API is now generally available"), then jump straight to May 28, 2026 — [Release Notes](https://developer.amazon.com/docs/ring/release-notes.html). This contradicts the March 31, 2026 GA in the [community GA post](https://community.amazondeveloper.com/t/launch-announcement-ring-developer-portal-general-availability/28126), [Ring Blog](https://blog.ring.com/about-ring/introducing-the-ring-appstore-ring-cameras-just-got-smarter/) and [TechCrunch](https://techcrunch.com/2026/03/31/ring-app-store-bets-on-ai-to-go-beyond-home-security/). The 2025 date is probably a typo or an early-access baseline.

**Eligibility, registration and approval:**
- Registration requires "contact info, details about your business or organization and the use cases your application is going to implement," and the doc says "You can request registration at signup/registration." The listed requirements are REST basics, some programming experience, and "At least one Ring device for testing (camera or doorbell)" — [Get Started](https://developer.amazon.com/docs/ring/get-started.html)
- Ring's blog says developers can "request access to the Ring Developer Portal" at developer.amazon.com/en/ring — [Ring Blog](https://blog.ring.com/about-ring/introducing-the-ring-appstore-ring-cameras-just-got-smarter/)
- Identity verification is mandatory: "Amazon requires all developer accounts to complete identity verification before you can submit apps," using a government-issued photo ID. It "applies to the individual account owner, even if you represent a business entity" — [Get Started](https://developer.amazon.com/docs/ring/get-started.html); also gated for app creation per [Configure](https://developer.amazon.com/docs/ring/configure.html)
- TechCrunch: developers "of all sizes" can participate — [TechCrunch](https://techcrunch.com/2026/03/31/ring-app-store-bets-on-ai-to-go-beyond-home-security/)
- Regulated or sensitive apps (financial, healthcare and similar) "should be submitted by a legal entity that provides the services, and not by an individual developer" — [Content Policy §4.0](https://developer.amazon.com/docs/ring/content-policy.html)
- Every public app must pass certification. It covers a Privacy & Legal questionnaire with five tabs (General, Data processing, AI governance, Data protection, Third-parties) plus reviewer notes. "On average, 90% of submissions are reviewed in less than 48 hours." There is no limit on resubmissions — [Certify](https://developer.amazon.com/docs/ring/certify.html); [Get Started FAQ](https://developer.amazon.com/docs/ring/get-started.html)
- **Invite-only and Early Access elements:**
  - Partner-Initiated OAuth 2.0 is "available by invitation only" and is requested by email to `ring-appstore-auth-support@amazon.com` — [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html)
  - Dynamic scopes, Sensors and Chimes are "Early Access". Apps using them "can only be published once dynamic scopes reach general availability" — [Configure](https://developer.amazon.com/docs/ring/configure.html); [Release Notes, Aug 24, 2026](https://developer.amazon.com/docs/ring/release-notes.html)
  - The MCP page still says API credentials "must be requested separately through the Ring Developer Early Access Program. Visit https://developer.amazon.com/ring and apply for Developer Early Access" — [Ring MCP](https://developer.amazon.com/docs/ring/ring-mcp.html). This conflicts with GA self-serve registration and is probably stale text.

**Public vs Private apps (the hobbyist path):**
- Private apps are for "Personal integrations and home automation projects," "Internal tools for a single organization," testing and proof of concept. Their lifecycle is Configure → Build → **Connect**, with no Test, Certify or Publish step — [Developer FAQ Q15](https://developer.amazon.com/docs/ring/developer-faq.html); [Publish](https://developer.amazon.com/docs/ring/publish.html)
- Private apps get "No certification required", "Maximum 10 Ring accounts on the allowlist", and a "Basic Ring plan required". They appear in the Ring App Store with a private badge — [Publish](https://developer.amazon.com/docs/ring/publish.html). Each connected account "must have an active Ring subscription or a Ring trial (about 30 days)." Accounts can only be removed with "Disconnect all"; there is no per-account removal — [Developer FAQ Q16–Q18](https://developer.amazon.com/docs/ring/developer-faq.html)
- **CONFLICT (account cap):** 10 accounts per [FAQ Q15/Q16](https://developer.amazon.com/docs/ring/developer-faq.html) and [Publish](https://developer.amazon.com/docs/ring/publish.html), but "up to 5 allowlisted Ring accounts" per the [Release Notes, July 21, 2026](https://developer.amazon.com/docs/ring/release-notes.html)
- A private app cannot be converted to a public app. You create a new public app and certify it, reusing the same backend — [Developer FAQ Q20](https://developer.amazon.com/docs/ring/developer-faq.html)

**Fees and monetization:**
- "Publishing on the Ring App Store is free. Ring takes a 10% revenue share on paid customer subscriptions" — [Get Started FAQ](https://developer.amazon.com/docs/ring/get-started.html). The Ring Fee is "10% of the Ring Product Price (i.e., excluding Taxes)" — [Program Requirements §5.2](https://developer.amazon.com/docs/ring/program-requirements.html)
- The Ring Billing System is mandatory for selling Ring In-App Products (§2.15), and subscriptions may be sold "on a monthly basis" only (§2.17) — [Program Requirements](https://developer.amazon.com/docs/ring/program-requirements.html). **CONFLICT:** the [Get Started FAQ](https://developer.amazon.com/docs/ring/get-started.html) says "monthly/annual subscriptions."
- Payouts arrive "approximately 30 days after the applicable sale." Price changes take effect in 30–45 days. Stripe Connect may be used — [Ring Appstore Schedule §6](https://developer.amazon.com/docs/ring/ring-appstore-schedule.html); [Program Requirements §5.1](https://developer.amazon.com/docs/ring/program-requirements.html)
- TechCrunch says apps don't go through Apple/Google in-app purchase, so Ring pays no app-store commission — [TechCrunch](https://techcrunch.com/2026/03/31/ring-app-store-bets-on-ai-to-go-beyond-home-security/). This is consistent with Ring running its own billing system rather than a contradiction.

**Geography:**
- Approved territories: "United States" only, unless approved in writing — [Program Requirements §6](https://developer.amazon.com/docs/ring/program-requirements.html); [Schedule §11](https://developer.amazon.com/docs/ring/ring-appstore-schedule.html)
- "Distribution is currently limited to the US. International locations are not yet supported." Apps can be distributed nationwide or to specific states — [Publish](https://developer.amazon.com/docs/ring/publish.html)
- "Currently, the Ring Appstore is only reachable from locations within the US" — [Developer FAQ Q21](https://developer.amazon.com/docs/ring/developer-faq.html)
- Testing: "Only US Located Devices: Currently we only support devices located in the US" — [Develop](https://developer.amazon.com/docs/ring/develop.html)
- **CONFLICT (private apps):** the [Publish](https://developer.amazon.com/docs/ring/publish.html) Private Use Apps section says "Available to Ring accounts from any country." [FAQ Q19](https://developer.amazon.com/docs/ring/developer-faq.html) says private apps can be accessed "from anywhere in the US regardless of state" and that the Appstore is US-only.

### Inferences
- A personal or hobbyist MCP bridge qualifies in principle through the **Private App** track. The builder still needs a verified developer account, public HTTPS endpoints, and a paid Ring plan or trial on each connected account.
- Teams or users with Ring devices outside the US face real uncertainty. The private-app geography conflict should be tested empirically, for example by connecting a non-US account, before committing.
- Before March 2026 there was no official third-party Ring device API. The GA post's "for the first time" wording supports this.

### Gaps
- It's unclear whether developer registration is approved automatically or reviewed by Ring, and how long it takes. The docs say "request registration", and I couldn't test signup without an account.
- I couldn't confirm whether the private-app cap is 5 or 10. The most recent pages say 10.
- I found no statement on whether non-US developers (as opposed to end users) can register. Schedule §6.e covers non-US developers' tax and service location, which implies they may participate — [Schedule §6.e](https://developer.amazon.com/docs/ring/ring-appstore-schedule.html).
- I didn't read the Amazon Developer Services Agreement itself.

---

## 2. Authentication model

### Takeaway
Authentication uses Ring's own OAuth 2.0 server (`oauth.ring.com`), not Login with Amazon. It issues user-scoped Bearer tokens: access tokens last about 4 hours, and refresh tokens last about 30 days and rotate on every refresh. There are two linking methods. **One-way (Ring-driven)** linking is the default: Ring POSTs an auth code to your Token Exchange URL, then the partner matches an HMAC nonce. **Partner-Initiated OAuth 2.0 with PKCE** is invite-only and limited to free apps. All Ring API calls must be made server-to-server.

### Cited Findings
- Token exchange: `POST https://oauth.ring.com/oauth/token` with `grant_type=authorization_code`, client_id, code and client_secret. The response carries `access_token`, `refresh_token`, `scope`, `"expires_in": 14400` and `token_type: Bearer` — [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html)
- Token lifetimes:
  - Authorization code: 60 seconds for one-way linking, 10 minutes for Partner-Initiated
  - Access token: ~4 hours
  - Refresh token: ~30 days. "each refresh returns a new refresh_token that invalidates the old one, and an expired refresh token requires the user to re-link from scratch"
  - Source: [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html); [Release Notes Oct 22, 2026](https://developer.amazon.com/docs/ring/release-notes.html)
- The docs recommend a background job that refreshes every 24 hours. "If a refresh token expires (after ~30 days of inactivity), the partner loses access" — [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html)
- **One-way flow:**
  1. The user installs the app in the Ring App Store and selects devices and scopes.
  2. Ring POSTs `code` and `client_id` (form-encoded) to the partner's Token Exchange URL. The partner exchanges the code, calls `/v1/users/me`, stores the tokens as "unclaimed", and returns 200. "Ring treats a non-2xx response as a failed link and doesn't retry."
  3. Ring redirects the user to the partner's Account Link URL with `time` and `nonce`. The user **must sign in to the partner service**.
  4. The partner matches the nonce (HMAC-SHA256 of `timestamp:account_id`, URL-safe Base64, 600-second window).
  5. The partner calls POST then PATCH `/v1/accounts/me/app-integrations`.
  - Sources: [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html); [Developer FAQ Q1–Q3](https://developer.amazon.com/docs/ring/developer-faq.html)
- "App-to-app login is not supported at this time." Only browser-based OAuth is supported — [Developer FAQ Q1](https://developer.amazon.com/docs/ring/developer-faq.html)
- **Partner-Initiated OAuth 2.0:**
  - Standard auth-code flow with PKCE (S256) via `https://account.ring.com/account/integrations/partner-link/authorize`
  - Redirect URIs must match exactly
  - "Free only (current phase)"; "available by invitation only"
  - One linking method per app; one active link per user per app
  - Partners can unlink with `DELETE /v1/accounts/me/app-integrations` (added Sep 15, 2026). One-way apps get 403 on that call.
  - Sources: [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html); [Release Notes](https://developer.amazon.com/docs/ring/release-notes.html)
- Credentials:
  - Client ID, Client Secret and an **HMAC Signature Key**, which is used both for webhook signatures (hex) and for nonces (URL-safe Base64)
  - All three are "shown one time only and can't be regenerated." To rotate before certification, you delete and recreate the app
  - Sources: [Configure](https://developer.amazon.com/docs/ring/configure.html); [Get Started](https://developer.amazon.com/docs/ring/get-started.html)
- Server-to-server only: "Browser-initiated requests ... will be blocked by CORS policies." Every request needs `User-Agent: YourAppName/version` and `Hardware_Id: <UUID per user+device combination>`, or the WAF may return 406. "If your backend server makes requests from a datacenter or cloud-hosting IP address, you may also receive 406 responses ... Contact Ring developer support with your static egress IP address" — [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html)
- **Scopes:** "dynamic scopes" (Early Access) are chosen at app creation in four groups:
  - Cameras and Doorbells: motion events, doorbell press, livestream, video download. This group is toggled as a whole.
  - Sensors: each type toggled individually.
  - Chimes: optional "Chime Controls".
  - Account and Lifecycle: always granted.
  - After certification "new scopes can be added but can't be removed."
  - Source: [Configure](https://developer.amazon.com/docs/ring/configure.html)
- The only literal scope string seen anywhere in the docs is `ava.devices`, in a certification checklist — [Developer FAQ](https://developer.amazon.com/docs/ring/developer-faq.html)
- The consent screen in the test flow reads "Access all Ring devices registered to your account", "Access third-party devices you have also linked to your Ring account" and "Access your Ring account and settings" — [Develop](https://developer.amazon.com/docs/ring/develop.html). In production the user "reviews the data access scopes" and "selects which Ring devices to share" — [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html)
- Device-selection changes happen only in Ring AppStore → My Apps. "Partners have no API to change a user's device access or permissions." Partners can pause an integration with PATCH `status: awaiting` — [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html)
- `GET /v1/users/me` returns the account ID, first and last name, email and phone number — [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html)
- Playground: "one-click OAuth token generation (valid 30 minutes)." No app, account linking or Ring subscription is needed — [Release Notes May 28, 2026](https://developer.amazon.com/docs/ring/release-notes.html)

### Inferences
- An MCP server can't simply be a local stdio process holding a user's Ring password. It needs a backend that receives the Token Exchange POST, hosts the Account Link sign-in page, stores and rotates refresh tokens, and calls the API from a server whose IP Ring allows.
- Personal use is still feasible through a private app, since the same OAuth flow is used. Ring's login page plus a sign-in page on your own service are both mandatory steps.
- The Playground's 30-minute tokens are the cheapest way to prototype MCP tool shapes before building the linking backend.

### Gaps
- No full list of scope strings is published.
- I found no token-revocation endpoint for one-way apps other than user-side removal.

---

## 3. Exact capabilities exposed, and what is NOT available

### Takeaway
The API is mostly **read and observe**:
- device discovery, metadata, status and coarse location
- read-only settings (motion zones, privacy zones, image settings, encryption flag)
- webhooks for motion, ding and lifecycle events
- per-device event history
- live video via WHEP/WebRTC or RTSPS, receive-only, capped at 30s (battery) or 60s (line-powered)
- MP4 clip download up to 15 minutes and JPEG/PNG snapshots, all **watermarked**
- subscription status

In Early Access only: Ring sensors (contact, flood/freeze, temp/humidity, air quality) and Chimes. The only "actuation" in the whole API is playing a sound on a Chime. There is **no** Ring Alarm arm/disarm or mode control, no siren, lights, locks or Intercom, no two-way audio, and no settings writes.

### Cited Findings
**Endpoints (base `https://api.amazonvision.com`)** — [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html):
- `GET /v1/devices` (with `?include=status,capabilities,location,configurations`) and `GET /v1/devices/{id}`
- `/status`: `online` boolean. Sensors add `reported_at`, `signal_strength` and `battery_status.percentage`
- `/capabilities`: codecs, motion detection, image enhancements, camera modules
- `/location`: country and state only. "No precise coordinates ... No city-level data"
- `/configurations`: motion zones, privacy zones, night vision, HDR, `auto_zoom_track`, and `e2e_encryption.enabled`. All read-only
- `GET /v1/history/devices/{id}/events`
- `POST .../media/streaming/whep/sessions` and `DELETE .../sessions/{session_id}`
- `rtsps://video.rtsp.amazonvision.com:322/v1/devices/{id}/stream`
- `POST .../media/video/download` (MP4) and `POST .../media/image/download` (JPEG/PNG via a 303 to a pre-signed URL)
- `POST .../media/audio/playback` (chime)
- `GET /v1/users/me`; `POST/PATCH/DELETE /v1/accounts/me/app-integrations`; `GET /v1/accounts/me/subscriptions`

**Device coverage:**
- The Cameras and Doorbells scope covers "all Ring camera and doorbell models" — [Configure](https://developer.amazon.com/docs/ring/configure.html)
- Multi-camera devices (Ring Elite) report as one device with `component_id` modules — [Release Notes Aug 20, 2026](https://developer.amazon.com/docs/ring/release-notes.html)

**Live video:**
- WHEP (recommended for browsers) or RTSPS over TCP-interleaved transport (FFmpeg/GStreamer). Battery devices stream up to 30 seconds and line-powered devices up to 60 seconds, then the session is "automatically terminated"
- "All media tracks must use recvonly ... Bidirectional media (sendrecv, sendonly) is not supported"
- Audio is optional and receive-only
- The codec must be read from the SDP answer (H.264/H.265 video; Opus/PCMU audio on RTSP)
- Sources: [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html). **CONFLICT:** the [landing page](https://developer.amazon.com/ring) says "Video only — no audio", while current API docs allow optional one-way audio.

**Recorded video and snapshots:**
- Clip download "does NOT Trigger Recording". It returns 416 MEDIA_NOT_FOUND if nothing was recorded. Requests can be up to 900,000 ms, ≤1920×1080, ≤25 fps, avc or hevc, with optional audio
- The recommended workaround is "Start a live video session (which triggers recording on supported devices)" and then download
- Snapshots return either the image "at_timestamp" or the last snapshot in a range
- Source: [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html)
- **Watermark:** all live video, clips and snapshots carry a "mandatory visible watermark overlay containing the Ring logo (top-left), Device ID, App Name, and timestamp (top-right) ... cannot be removed" (since June 8, 2026) — [Release Notes](https://developer.amazon.com/docs/ring/release-notes.html); [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html)

**Event history:**
- Event types are `motion` (subtypes human, vehicle, animal, other_motion), `on_demand` (live view) and `ding`. It returns metadata only, newest first, with cursor pagination
- "Time-gated — only events that occurred after the user granted consent to your app"
- A per-event `is_third_party_reviewed` flag shows whether your app already pulled the media
- Source: [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html)

**Motion classification:**
- `sub_type` is `motion` when Smart Alerts are off. When they're on it is `human`, `vehicle`, `package_delivery` or `other_motion`
- "No API exposes whether Smart Alerts is enabled"
- Motion events fire only inside the configured motion zones
- Sources: [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html); [Developer FAQ Q14](https://developer.amazon.com/docs/ring/developer-faq.html)
- **Subtype vocabularies are inconsistent:**
  - Webhook `sub_type` includes `package_delivery` and has no `animal`
  - Event History subtypes include `motion.animal` and have no `package_delivery` — [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html)
  - The landing page says webhook events carry "classification data like human, animal, or vehicle" — [Ring Developer landing](https://developer.amazon.com/ring)
  - Ring says to treat `sub_type` as "an open-ended vocabulary". An MCP event schema should accept the union of these values.

**Sensors (Early Access):**
- Contact sensors: `contact_sensor_faulted`/`cleared`, tamper
- Flood/freeze: flood, freeze and tamper events
- Indoor temp/humidity: threshold exceeded/cleared events
- Indoor air quality: PM2.5, CO, temperature and humidity thresholds
- Sensors have no media endpoints
- "Event History supports camera and doorbell events only, so no sensor event is queryable"
- "no battery webhook is delivered at any level"
- "Do not use co_exceeded as a life-safety trigger"
- The docs mention "Alarm motion sensors declare motion_detection", but the sensor quick-reference documents no Alarm motion-sensor events
- Sources: [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html); [Release Notes Aug 24, 2026](https://developer.amazon.com/docs/ring/release-notes.html)

**Chimes (Early Access):**
- "Chime settings are read-only to partners." The only command is playback of audio in the app's own slots (`ring-appstore-event-1/2` on Chime Pro)
- Volume and snooze can't be changed
- Slot audio is assigned outside the device API
- Source: [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html)

**Read-only capabilities:** "At this time, device capability values returned in the Devices API are read-only. They do not indicate active control functionality" — [Developer FAQ Q8](https://developer.amazon.com/docs/ring/developer-faq.html)

**Settings only in the Ring app:** Smart Alerts and motion recording, motion zones, privacy zones, color night vision and HDR. "Never imply that customers can change these settings in your partner app" — [UX Design Guide](https://developer.amazon.com/docs/ring/ux-design-guide.html)

**Explicitly NOT available or not documented** (verified absent across the API reference and configure scopes; the API doc has no Alarm, siren, light, lock or intercom endpoints):
- Ring Alarm security modes, arm/disarm, keypad/base station, alarm monitoring dispatch. There is no endpoint or scope; [Program Requirements §2.19–2.20](https://developer.amazon.com/docs/ring/program-requirements.html) separately require licensing for any interface with alarm services
- Siren, floodlight/spotlight or Smart Lighting control
- Locks, Ring Intercom, garage
- Two-way audio, talk-back or sending audio to cameras ("Bidirectional media ... is not supported" — [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html))
- Any settings write: motion zones, modes, notifications, chime volume/snooze ([Developer FAQ Q8](https://developer.amazon.com/docs/ring/developer-faq.html); [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html))
- Triggering a recording directly. Only the live-session side effect is available ([API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html))
- Pre-consent history, sensor history, battery events, Smart Alerts status ([API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html))
- Camera and doorbell health or battery. The documented camera status response carries only `"online": true/false`. `battery_status.percentage` and `signal_strength` are documented only for sensors, and chimes report neither ([API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html)). The landing page's "camera telemetry, device health signals" wording ([Ring Developer landing](https://developer.amazon.com/ring)) overstates what the documented camera API offers.
- E2EE devices, which are invisible to the API, and readable video from TAKE devices during the initial rollout ([Developer FAQ Q10–Q11](https://developer.amazon.com/docs/ring/developer-faq.html))
- No official SDK: "There is no official Ring Partner SDK" ([API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html))

### Inferences
- A useful official-API MCP tool set is roughly:
  - `list_devices`, `get_device_status`, `get_device_config`
  - `list_events` (history)
  - `get_snapshot`, `get_clip`
  - `start_live_view`, returning a short-lived WHEP/RTSP session or one grabbed frame
  - `subscribe_events` (webhook → MCP notifications)
  - sensor state (Early Access)
  - `play_chime_sound` (Early Access)
- Anything that **controls** security state (arm/disarm, sirens, lights, locks) can't be built on official APIs today.
- Agent-facing video tools must deal with three limits: the 30–60s stream cap, the "no download without prior recording" rule, and the watermark.

### Gaps
- I didn't verify the exact device-model list in the portal's "Supported devices" dropdown.
- Whether Ring Alarm motion sensors or other Alarm components appear in `/v1/devices` isn't clearly documented. There is only the one passing mention.

---

## 4. Event delivery model, payloads, latency

### Takeaway
Events arrive by **HTTPS webhook push** to one partner-wide Webhook URL configured in the portal. Payloads are JSON:API "v1.1" envelopes carrying `account_id` and `request_id`, signed with HMAC-SHA256 in `X-Signature`. The endpoint must answer in under 5 seconds. Failures get 6 retries over about 1h12m and then go to a dead-letter queue kept for 72 hours. The only pull alternative is the Event History API. There is no SNS/EventBridge delivery and no published latency figure.

### Cited Findings
- Webhook requirements: HTTPS (TLS 1.2+), publicly reachable, POST, `application/json`, response within 5 seconds. "Your webhook URL cannot be changed via API" — it's set in the portal — [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html)
- Signature: `X-Signature: sha256=<hex HMAC-SHA256 of raw body>` using the HMAC Signature Key. "Verify first, parse second" — [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html)
- Envelope: `meta{version:"1.1", time, request_id, account_id}`, `data{id, type, attributes{source, source_type, timestamp(ms), sub_type, component_ids}, relationships}` — [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html)
- Event types:
  - Camera, doorbell and lifecycle: `motion_detected`, `button_press`, `device_added`, `device_removed`, `device_online`, `device_offline`, `app_integration_added`, `app_integration_removed`, `subscription_activated`, `subscription_deactivated`
  - Sensor events are added in Early Access
  - Sources: [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html); [Configure](https://developer.amazon.com/docs/ring/configure.html). (Stale text in [Develop](https://developer.amazon.com/docs/ring/develop.html) says "three webhook types".)
- Response semantics:
  - 2xx means delivered
  - 4xx is a permanent failure with no retry. "10+ consecutive failures over 24 hours" may disable the endpoint
  - 5xx or timeout triggers retries at 1s, 5s, 30s, 2m, 10m and 1h ("6 retries (7 total attempts)")
  - After that, events go to a dead-letter queue "retained for 72 hours". Replay is by request to Ring
  - Handlers must be idempotent on `meta.request_id`
  - Source: [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html)
- Polling: "If your architecture cannot support inbound webhooks ... you can use Ring's Event History API to poll." A Webhook URL returning 200 is still required — [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html)
- `device_online` behaves as a heartbeat and `device_offline` lags actual loss of connectivity for sensors — [Release Notes Aug 24, 2026](https://developer.amazon.com/docs/ring/release-notes.html)
- Media after a webhook may not be ready yet: expect 416/425 responses. The docs suggest "5-second initial delay and 2-minute retry window", which are "client recommendations, not media-availability guarantees" — [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html)
- Marketing copy: "low-latency endpoints and scalable webhook delivery", with the motion API pitched for "predictive alerting and AI agent workflows" — [Landing page](https://developer.amazon.com/ring)

### Inferences
- An MCP bridge needs an always-on public webhook receiver: ack fast, persist, fan out to MCP clients. For sensors this is mandatory, because missed sensor events can't be recovered.
- Ring's CV guide recommends "Ring webhook -> API Gateway -> Lambda (ack fast) -> SQS -> CV pipeline (async)" — [CV Guidelines](https://developer.amazon.com/docs/ring/computer-vision-guidelines.html). The same pattern fits an agent bridge.

### Gaps
- There is no numeric end-to-end latency claim or SLA for webhook delivery.
- I found no per-user webhook routing; it's one URL per app and environment.

---

## 5. Rate limits, SLAs, retention, privacy/consent, encryption, certification, branding, AI/ML and storage restrictions

### Takeaway
- **Rate limits:** 100 TPS per client_id across all endpoints. No SLA is published.
- **Policy:** heavy privacy obligations covering consent, data minimization, deletion including downstream processors, and audit logs.
- **AI:** AI use is allowed, and even promoted, but goes through an AI-governance questionnaire. Starting or stopping AI training on Ring data is a re-certifiable material change with 45-day notice.
- **Banned:** stalking, covert surveillance, cross-account correlation, watchlists, standing law-enforcement access, and non-enrolled facial recognition.
- **Encryption:** Ring's new default **TAKE** encryption (rolling out from Sept 2026) makes video unreadable to partner apps during the initial rollout, and E2EE devices disappear from the API entirely.

### Cited Findings
**Rate limits and quotas:**
- "Default rate: 100 requests per second (TPS) per partner ... across all endpoints." The API returns `X-RateLimit-Limit`/`Remaining`, and a 429 with `Retry-After` — [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html)
- "No rate limits apply in sandbox" — [Get Started glossary](https://developer.amazon.com/docs/ring/get-started.html)
- Subscriptions API page size is fixed at 25 — [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html)

**API stability:**
- "Ring follows semantic versioning with 12-month backward compatibility. You'll receive 30+ days advance notice before any breaking changes" — [Get Started FAQ](https://developer.amazon.com/docs/ring/get-started.html)

**Retention:**
- Webhook DLQ: 72 hours. Event History: only events after consent. Sensor events: not stored for partners — [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html)
- When you leave the program you must delete end-user data unless the user explicitly consents otherwise (§2.10). You must delete on Ring's or the user's request and provide an easy deletion mechanism (§2.11) — [Program Requirements](https://developer.amazon.com/docs/ring/program-requirements.html)
- Deletion must cover "all copies, backups, and archived data", with confirmation to the user and audit logs. Data shared with third-party processors must be deleted "from all downstream recipients within the same timeframe" — [Content Policy §4.1.3](https://developer.amazon.com/docs/ring/content-policy.html)

**Consent and data use:**
- "You may not use, transmit, or share personal data without first obtaining consent ... Data collected for one purpose may not be repurposed without further consent" — [Content Policy §4.1.2](https://developer.amazon.com/docs/ring/content-policy.html)
- Unexpected data use requires a prominent in-app consent dialog obtained by affirmative action — [Content Policy §4.1.2](https://developer.amazon.com/docs/ring/content-policy.html)
- Camera data may not be used "for marketing, advertising, or use-based data mining without explicit consent" — [Content Policy §4.1.2](https://developer.amazon.com/docs/ring/content-policy.html)
- Data minimization applies, and account deletion must be available in-app — [Content Policy §4.1.1](https://developer.amazon.com/docs/ring/content-policy.html)
- "You will not circumvent controls we enact to allow end users to prevent sharing data with you" — [Program Requirements §2.12](https://developer.amazon.com/docs/ring/program-requirements.html)
- Privacy zones must be respected when processing video — [UX Design Guide](https://developer.amazon.com/docs/ring/ux-design-guide.html); [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html)

**Access, safety and credentials:**
- "You will not facilitate or provide access to the Ring Service through any means other than through the authentication methods we specify" (§2.5)
- No masking usage through multiple accounts or apps, and "provide your developer credentials to any third party" is prohibited (§2.7)
- No use "where the use or failure of the Ring Service could lead to death, injury, or property damage" (§2.8)
- Alarm-service interfacing requires governmental licenses (§2.19), and you are liable for false-dispatch fines (§2.20)
- Source: [Program Requirements](https://developer.amazon.com/docs/ring/program-requirements.html)

**AI/ML:**
- The certification questionnaire has a "Data processing" tab that asks "whether data is used for AI training", and an "AI governance" tab covering "AI models in use, performance monitoring ... explainability of AI decisions, content and output controls, automated decision-making safeguards" — [Certify](https://developer.amazon.com/docs/ring/certify.html)
- Material changes include "changes in whether you or your Ring In-App Product trains any AI model with any end user's Ring device data" — [Program Requirements §7](https://developer.amazon.com/docs/ring/program-requirements.html)
- "Starting or stopping training an AI model on Ring device data" requires a new version plus an updated privacy policy. Material changes need "at least 45 days' advance notice" — [Certify](https://developer.amazon.com/docs/ring/certify.html); [Schedule §8](https://developer.amazon.com/docs/ring/ring-appstore-schedule.html)
- The CV guide endorses vision LLMs as a "heavy model, used sparingly" stage and warns "Never treat VLM output as ground truth". It recommends output guardrails: a toxicity model, keyword block list and fallbacks — [CV Guidelines](https://developer.amazon.com/docs/ring/computer-vision-guidelines.html); [Release Notes Oct 19, 2026](https://developer.amazon.com/docs/ring/release-notes.html)
- After the watermark change, developers "may need to retrain models to account for the watermark overlay" — [Release Notes Jun 8, 2026](https://developer.amazon.com/docs/ring/release-notes.html)

**Prohibited app categories:**
- Stalking and harassment, covert third-party surveillance
- Cross-account correlation of individuals ("facial embeddings, watchlists, appearance data")
- Vigilante watchlists, suspect registries, child-directed apps
- Standing law-enforcement access. Each sharing instance must be customer-initiated
- Facial recognition only of "individuals that the Ring customer has explicitly enrolled". Biometrics and LPR face additional review "at Ring's sole discretion"
- Source: [Content Policy §1.2, §4.2, §4.3](https://developer.amazon.com/docs/ring/content-policy.html)
- **CONFLICT:** TechCrunch quotes Siminoff as saying terms will not permit facial-recognition or license-plate-reader apps — [TechCrunch](https://techcrunch.com/2026/03/31/ring-app-store-bets-on-ai-to-go-beyond-home-security/). The Content Policy instead allows both under strict conditions and heightened review — [Content Policy §4.2.2–4.2.3](https://developer.amazon.com/docs/ring/content-policy.html).

**Video encryption (TAKE / E2EE):**
- "During the initial rollout, a TAKE device stays visible and callable through the Ring Partner API, but video requests return encrypted content, so your app cannot read recordings or snapshots, or open a live stream"
- "E2EE devices are not returned by any Ring Partner API"
- Ring is "working to enable partner apps to process the most recent 24 hours of a TAKE device's video and live stream from it"
- Apps should check `e2e_encryption.enabled` (a JSON boolean), added Oct 9, 2026
- Sources: [Developer FAQ Q9–Q13](https://developer.amazon.com/docs/ring/developer-faq.html); [Release Notes Sep 16 & Oct 9, 2026](https://developer.amazon.com/docs/ring/release-notes.html)
- Secondary sources: TAKE was announced Aug 26, 2026 as the "default encryption for customer video worldwide", with a phased rollout from September 2026 and no completion date — [PPC Land](https://ppc.land/ring-drops-its-copy-of-video-keys-as-take-becomes-default-in-september/). A search summary also claimed Ring deletes its enclave key copy after 24 hours, attributed to an Amazon whitepaper ([Amazon E2EE whitepaper PDF](https://assets.aboutamazon.com/e8/64/d5c572c74f11b5e55bcb93b63bd8/ring-ae-e2ee-whitepaper-august-26-2026.pdf), not read). The fetched PPC Land article states no duration, so treat the 24h figure as unverified apart from the FAQ's "most recent 24 hours" partner target.

**Certification operations:**
- Ring's reviewers test with your **production** account-linking endpoints
- Webhook must return 200 within 5 seconds
- Reviewer notes must explain how to create an account and link it
- Endpoints must not change during review
- Support SLAs: respond to critical requests within 24 hours, and to end-user requests within 5 business days
- Sources: [Developer FAQ](https://developer.amazon.com/docs/ring/developer-faq.html); [Certify](https://developer.amazon.com/docs/ring/certify.html); [Schedule §9](https://developer.amazon.com/docs/ring/ring-appstore-schedule.html)

**Branding:**
- No product name, domain or logo that "includes, is a variant of, or is confusingly similar to 'Ring', 'Amazon'" — [Program Requirements §3](https://developer.amazon.com/docs/ring/program-requirements.html)
- Press releases or videos about the integration go to Ring PR 10–12 business days before publication — [Release Notes Sep 9, 2026](https://developer.amazon.com/docs/ring/release-notes.html); [Marketing Guidelines](https://developer.amazon.com/docs/ring/marketing-guidelines.html)
- UX rules: never display tokens or device IDs, refresh tokens silently, give customers notification controls — [UX Design Guide](https://developer.amazon.com/docs/ring/ux-design-guide.html)

**Ring subscription requirement:**
- Users need an active Ring base plan on any device they share
- "Cascading cancellation": cancelling the Ring plan deactivates the partner subscriptions
- Sources: [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html); [Ring Developer landing](https://developer.amazon.com/ring) ("Compatible Ring subscription required")

### Inferences
- An MCP bridge that sends Ring frames or clips to a third-party LLM (Anthropic, OpenAI, Bedrock and so on) is **third-party data sharing**. It must be disclosed in the privacy policy and the questionnaire's Third-parties and AI-governance tabs, and deletion must reach downstream processors. Choose LLM providers with zero-retention terms.
- Under §2.7(iii) a single developer's client_id/secret can't simply be handed to many unrelated users who self-host. Two models fit the rules:
  - (a) one hosted, certified public app (US-only, with privacy review)
  - (b) each user creates their own private app under their own verified developer account
- Program Requirements §2.8 and the CO warning argue against marketing an AI agent bridge for safety-critical automation.
- As TAKE becomes the default, video tools will increasingly return unreadable media. Any MCP video tool must check `e2e_encryption.enabled` and degrade gracefully. This is a moving target worth re-checking monthly.

### Gaps
- There is no published uptime, latency or support SLA for the API itself.
- I found no explicit rule on how long partners may retain Ring video. Retention is left to the partner's disclosed policy plus deletion-on-request.
- I didn't find a published date for when TAKE partner access (the 24-hour window) will ship.
- Content Policy §4.2–4.3 and the Marketing, Reports and Customer Lifecycle pages were read only partially.

---

## 6. Other official integration paths (Alexa, Works with Ring, SmartThings, IFTTT, Google, Ring for Business, Sidewalk, Matter, Ring's own MCP)

### Takeaway
Ring's official **"Ring Appstore MCP Server" is documentation-only**. It exposes `search_docs` and `get_doc` against a Bedrock knowledge base and gives **no device access**, despite marketing copy suggesting otherwise. The Alexa Ring skill offers consumer voice control: live view on Echo Show and Ring Alarm arm/disarm with a PIN. I found no developer API path through Alexa. Matter isn't supported on Ring devices, per secondary sources as of mid-2026. SmartThings and IFTTT integrations are historical, narrow and poorly documented. The Ring Partner API is the only official programmatic route.

### Cited Findings
- **Ring Appstore MCP:**
  - It is a "remote Model Context Protocol server backed by an Amazon Bedrock Knowledge Base" at `https://knowledge.appstore-mcp.ring.amazon.dev/mcp` over streamable HTTP
  - Two tools: `search_docs` (query, max_results, min_confidence) and `get_doc` (uri)
  - Supported IDEs: Kiro, Cursor, Cline and Claude Desktop
  - A Known Issue says the Kiro CLI "cannot authorize with Ring Appstore MCP", which implies the docs MCP requires sign-in
  - Source: [Ring MCP](https://developer.amazon.com/docs/ring/ring-mcp.html)
- **Misleading marketing:** the landing page says developers "access core Ring capabilities, including live video ... motion events, doorbell presses, device status, and event history, via Ring APIs or the Ring MCP Server" — [Ring Developer landing](https://developer.amazon.com/ring); [developer.ring.com](https://developer.ring.com/). The MCP doc itself lists only doc-search tools, and its sample app pastes a separately obtained access token into code — [Ring MCP](https://developer.amazon.com/docs/ring/ring-mcp.html)
- Ring markets the platform for "AI agent workflows" and AI coding tools including Claude, Cursor, Lovable and Replit — [Ring Developer landing](https://developer.amazon.com/ring)
- **Alexa:**
  - The Ring skill links the two accounts. Live view works on Alexa devices with screens. Arm/disarm by voice works, but disarming needs a 4-digit "Disarm by Voice" passcode
  - Ring Alarm digital arming and "integration with other Ring, Echo, and third party products" require a subscription
  - Source: Ring support pages [Control Ring with Alexa](https://support.ring.com/hc/articles/360031246432), [Connecting Alexa devices with Ring](https://support.ring.com/hc/articles/115003247146) (via search summary, not fetched)
- **Matter:** secondary sources say Ring had not certified any Matter devices as of mid-2026, even though Matter 1.5 (Nov 2025) added cameras and doorbells — [MatterHubs blog](https://blog.matterhubs.com/ring-matter/); [The Gadgeteer](https://the-gadgeteer.com/2026/06/03/matter-1-5-cameras-doorbells-home-security-2026/) (search summaries)
- **SmartThings/IFTTT:** community reports say Ring's SmartThings integration covered cameras only, Ring Alarm sensors don't appear, and users bridge them via Alexa routines or IFTTT — [SmartThings Community](https://community.smartthings.com/t/ring-alarm/131509) (secondary, older posts)
- A Program Requirement anticipates alarm-adjacent apps but requires licensing (§2.19) — [Program Requirements](https://developer.amazon.com/docs/ring/program-requirements.html)

### Inferences
- The official Ring MCP server is useful as a **dev-time companion** for the team building the bridge. It is not a substitute for the bridge.
- Alexa arm/disarm is a consumer feature. The Alexa Smart Home API lets skills expose *their own* devices, not read other skills' devices (my general knowledge; not verified this session). So Alexa doesn't offer a sanctioned way for a third party to arm or disarm Ring Alarm.

### Gaps
- I didn't verify Amazon Sidewalk developer access to Ring devices, Ring for Business/Ring Pro APIs, a "Works with Ring" certification program, the current status of Ring's IFTTT service, or Google Home integration. None turned up in the official developer docs.
- The Alexa and Matter claims come from search summaries rather than full page reads.

---

## 7. News 2024–2026 affecting third-party access

### Takeaway
I found no evidence of an official Ring third-party API in 2024–2025. In 2026:
- Jan: announced at CES
- Feb: community opened
- Mar 31: GA plus the Ring Appstore launch (about 15 apps, US-only, 10% fee)
- Summer: rapid feature additions — Playground, watermark, private apps, RTSP, partner OAuth, multi-camera, sensors and chimes
- Late August: TAKE encryption announced, which immediately limits partner video access

### Cited Findings
- **CES, Jan 2026:** first announcement. **Mar 31, 2026:** launch with about 15 apps (Density Routines, QueueFlow, Minut, WhatsThatBird.AI, memories.ai, Lumeo, LawnWatch, ProxView, StoreTraffic, Package Protect, Cheer Chime). Siminoff's goal is "hundreds of apps in tens of verticals" by year-end. TechCrunch also notes Ring had cancelled its Flock Safety partnership after customer backlash — [TechCrunch](https://techcrunch.com/2026/03/31/ring-app-store-bets-on-ai-to-go-beyond-home-security/)
- **Feb 17, 2026:** community welcome post — [Welcome post](https://community.amazondeveloper.com/t/welcome-to-the-ring-developer-community/27702). **Mar 31, 2026:** portal GA — [GA post](https://community.amazondeveloper.com/t/launch-announcement-ring-developer-portal-general-availability/28126); [Ring Blog](https://blog.ring.com/about-ring/introducing-the-ring-appstore-ring-cameras-just-got-smarter/)
- Release-note timeline, all from [Release Notes](https://developer.amazon.com/docs/ring/release-notes.html):
  - May 28: Playground sandbox
  - Jun 8: mandatory watermark
  - Jun 16: lifecycle analytics guide
  - Jul 21: Private Apps and RTSP
  - Aug 13: Partner-Initiated OAuth (invite)
  - Aug 20: multi-camera/Ring Elite
  - Aug 24: dynamic scopes and Sensors (Early Access)
  - Aug 28: Reports
  - Sep 9: Marketing guidelines
  - Sep 11: no purchase needed for staging users
  - Sep 15: partner DELETE unlink
  - Sep 16: TAKE/E2EE partner impact
  - Oct 5: motion sub_type clarification
  - Oct 9: `e2e_encryption` field
  - Oct 12: location-scoped subscriptions
  - Oct 19: CV guardrails
  - Oct 22: token-exchange documentation
  - (Minor inconsistency: FAQ and Develop cite a "September 10, 2026" note, but the entry is dated September 11.)
- **Aug 26, 2026:** TAKE announced as the worldwide default, with a phased rollout from September 2026 — [PPC Land](https://ppc.land/ring-drops-its-copy-of-video-keys-as-take-becomes-default-in-september/); see also [Marketplace interview, Sep 1, 2026](https://www.marketplace.org/episode/2026/09/01/ring-founder-jamie-siminoff-on-default-encryption-and-ai-privacy) (not read)

### Inferences
- The platform is young (about 7 months GA) and changing weekly, so MCP designs should treat endpoints and policies as volatile. In its favor, Ring commits to "12-month backward compatibility" — [Get Started FAQ](https://developer.amazon.com/docs/ring/get-started.html).

### Gaps
- I couldn't find the exact date of the Flock Safety cancellation.
- I didn't check for any announcements after Oct 22, 2026.

---

## 8. What it would take to build an MCP bridge on official APIs (synthesis)

### Takeaway
It's feasible for **read, observe and alert, plus limited video** use cases, and infeasible for **control** use cases (alarm, lights, sirens, locks, settings). A compliant bridge looks like this:
- a hosted backend (OAuth linking endpoints, token store with a refresh job, webhook receiver, static egress IP)
- an MCP server in front of it
- distribution either as a certified US-only public Ring Appstore app, or as per-user private apps with up to 10 accounts each

The biggest swing factor for video tools is **TAKE encryption**, which became the worldwide default with a phased rollout from September 2026. During the initial rollout partner apps can't read TAKE video (recordings, snapshots or live view), and E2EE devices aren't visible at all. So snapshot, clip and live-view tools may return unreadable media for a growing share of users until Ring ships the promised "most recent 24 hours" partner access.

### Cited Findings
- Required partner-hosted HTTPS endpoints:
  - Account Link URL and Token Exchange URL are required even for private apps; Webhook URL is optional for private apps
  - Webhook URL is required for Partner-Initiated OAuth and for certification
  - Sources: [Configure](https://developer.amazon.com/docs/ring/configure.html); [Publish](https://developer.amazon.com/docs/ring/publish.html); [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html)
- Server-to-server only, with User-Agent and Hardware_Id headers, and a possible WAF block on cloud IPs — [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html)
- Each user needs a Ring subscription or trial — [Developer FAQ Q18](https://developer.amazon.com/docs/ring/developer-faq.html)
- Sample code: the Next.js reference app ("ring-api-helloworld") covers OAuth refresh, WHEP, and SSE fan-out of webhooks — [Develop](https://developer.amazon.com/docs/ring/develop.html); repo https://github.com/AmazonAppDev/ring-api-helloworld (not fetched)

### Inferences
- **Viable MCP tools:**
  - device and status listing
  - read-only config with privacy zones and encryption flag
  - event history queries
  - push notifications of motion, ding and sensor events
  - snapshot or clip retrieval after events
  - short live-view frame grabs
  - chime sound playback (Early Access)
- **Not viable on official APIs:**
  - arm/disarm, alarm mode
  - siren, lights, locks, intercom
  - two-way talk
  - changing motion settings
  - reading TAKE-encrypted or E2EE video
- **Compliance work:**
  - privacy policy plus questionnaire disclosure of LLM processing (AI-governance and Third-parties tabs)
  - user deletion flows with downstream deletion
  - guardrails on VLM output
  - no cross-account person correlation
  - 45-day notice for material changes
  - US-only distribution for public apps
- **Naming:** Program Requirements §3 bars product names, domains or logos that "include" or are "confusingly similar to" "Ring" or "Amazon" — [Program Requirements §3](https://developer.amazon.com/docs/ring/program-requirements.html). The repo or working name "RingMCPBridge" would therefore need a different public or app-listing name if published, and the private app name should probably avoid "Ring" too.
- **TAKE gating:** every video tool should first read `GET /v1/devices/{id}/configurations` and short-circuit when `e2e_encryption.enabled == true`. It should return a clear "video encrypted; not readable by third-party apps" result rather than retrying — [API Documentation](https://developer.amazon.com/docs/ring/api-documentation.html); [Developer FAQ Q13](https://developer.amazon.com/docs/ring/developer-faq.html)
- **Fastest path to a prototype:** use Playground tokens (30 minutes) to shape the tools. Then build a private app with your own Ring account for persistent access. Move to certification only if distributing publicly.

### Gaps
- Whether Early Access scopes (sensors, chimes) can be used in a **private** app before GA isn't stated. The docs only say they can't be *published*.
- Whether a non-US Ring account can connect to a private app is unresolved (see conflicts in §1).
