# Legal, ToS, Privacy and Platform Risk of a Ring MCP Bridge (official and unofficial APIs)

*Research notes compiled 2026-10-23. This is not legal advice. It lays out risks and obligations as they appear in public sources. "Accessed" means the page was retrieved on 2026-10-23.*

## 1. What Ring's Terms of Service and Amazon/Ring developer terms say about automated access, reverse engineering, unofficial clients and third-party integrations

### Takeaway
The consumer Ring ToS (effective 2025-11-06) has no explicit "no bots/scraping/unofficial clients" clause. It does ban reverse engineering and "bypass[ing] any security" of Ring Software, and it lets Ring terminate accounts at its discretion. Since 2025-04-21 there has been an **official** route: the Ring Appstore / Partner API. Its Program Requirements and Content Policy are much more specific. They require Ring-specified authentication only, forbid circumventing security, ban safety-critical use, require licences before touching alarm services, ban facial recognition of non-tagged people, and ban "Ring" in product names. A "Private Use Apps" track (2026-07-21) supports up to 5 allowlisted accounts without certification, which suits a personal MCP bridge. The Partner API documents no alarm or lock control.

### Cited Findings
**Consumer Ring Terms of Service (ring.com/terms, "Effective Date: November 6, 2025", accessed 2026-10-23)**
- §2(h) Software: "You may not reverse engineer, decompile or disassemble, tamper with, or bypass any security" of the Software. The same section bars copying, modifying, distributing or licensing the Software, or putting parts of it into other programs. [Ring Terms](https://ring.com/terms)
- The ToS has no clause that specifically addresses scraping, bots, automated access, unauthorized client apps or API use. The closest language is §2(b): "If you alter any hardware, software, or other element of Ring Offerings, …". [Ring Terms](https://ring.com/terms)
- §2(a) Account: "Ring reserves the right to the fullest extent allowed by applicable law to refuse service, terminate accounts," suspend access, or remove content. [Ring Terms](https://ring.com/terms)
- §8(iv) Non-Ring Offerings: "When you use a Non-Ring Offering, you may be subject to separate terms, policies, and fees". §2(h) also says that using the Software may involve third-party services. [Ring Terms](https://ring.com/terms)
- §2(b) puts legal compliance on the owner. The owner is responsible for camera positioning and "whether audio recording is turned on", must "ensure that Ring Offerings are only used in a manner that complies with applicable laws", and must provide "any required consent and notice to third parties relating to recording or sharing of Content". [Ring Terms](https://ring.com/terms)
- A third-party ToS tracker rates the reverse-engineering/security-bypass clause "High severity" and tags it as relevant to the U.S. CFAA. It adds that this "does not constitute a legal determination about enforceability" (record verified 2026-05-10). [ConductAtlas](https://conductatlas.com/platform/ring/ring-terms-of-service/prohibition-on-reverse-engineering-software/)

**Official route: Ring Appstore API / Ring Developer Experience (developer.amazon.com/docs/ring)**
- The Ring Appstore API reached general availability on **2025-04-21**. It shipped the Partner API, webhooks, live video, Media Clips, Snapshots, Event History and the Subscriptions Query API. [Ring Appstore API Release Notes](https://developer.amazon.com/docs/ring/release-notes.html)
- The API is REST at api.amazonvision.com. Capabilities: device discovery, status and configuration; live video over WebRTC/WHEP and RTSP (30-second streams for battery devices, 60 seconds for line-powered); media clips and snapshots; motion, button-press and online/offline webhooks; event history; chime audio; and sensors (contact, flood/freeze, temperature/humidity, air quality). The getting-started documentation does **not** mention alarm or lock capabilities. [Getting Started](https://developer.amazon.com/docs/ring/get-started.html)
- Onboarding happens through the Amazon Developer Console. The account owner must pass government-ID identity verification. Auth is OAuth 2.0 account linking (Ring-driven one-way linking, plus partner-initiated OAuth with PKCE, invitation only since 2026-08-13) with bearer and refresh tokens, a Client ID/Secret and an HMAC webhook signing key. Webhooks must be verified with HMAC-SHA256. Certification reviews security, privacy, API usage and UX. Publishing is free, and Ring takes 10% of paid subscriptions. [Getting Started](https://developer.amazon.com/docs/ring/get-started.html); [Release Notes](https://developer.amazon.com/docs/ring/release-notes.html)
- The governing documents are the "Developer Agreement" (named, not linked on the page), the Ring Appstore Schedule, the Program Requirements, the Permitted Content Policy and Amazon's general "Terms & agreements". [Getting Started](https://developer.amazon.com/docs/ring/get-started.html)
- **Private Use Apps (2026-07-21):** "Private apps bypass certification and Appstore listing, support up to 5 allowlisted Ring accounts…". [Release Notes](https://developer.amazon.com/docs/ring/release-notes.html)
- **Mandatory watermark (2026-06-08):** "All media content delivered through the Ring Partner API now includes a mandatory visible watermark overlay". It shows the Ring logo, Device ID, App Name and a timestamp, is applied server-side and cannot be removed. The note warns that AI/ML developers may need to retrain models. [Release Notes](https://developer.amazon.com/docs/ring/release-notes.html)
- **Encryption effect (2026-09-16):** "Ring is rolling out two video-encryption modes: Throw Away the Key (TAKE) and End-to-End Encryption (E2EE)." During the initial rollout, TAKE devices stay visible to partner apps, but video requests return encrypted content the app cannot read. "E2EE devices are not returned by any Ring Partner API, because users can't grant partner apps access to them." On 2026-10-09 an `e2e_encryption.enabled` boolean was added to device configuration. [Release Notes](https://developer.amazon.com/docs/ring/release-notes.html)
- **Token behaviour (2026-10-22):** Ring documented that each refresh invalidates the previous refresh token. [Release Notes](https://developer.amazon.com/docs/ring/release-notes.html)
- **Computer Vision Guidelines (2026-10-19):** Ring added guidance on why wide-angle, night and backlit footage reduces accuracy, on the hallucination risk of vision-language models, and on output "Guardrails" (toxicity model, keyword block list, fallback). [Release Notes](https://developer.amazon.com/docs/ring/release-notes.html)

**Program Requirements (developer.amazon.com/docs/ring/program-requirements.html, accessed 2026-10-23, no effective date shown)**
- §2.5: partners may access the service only "through the authentication methods we specify", and "you will not disable, circumvent, or avoid any security device, mechanism, or protocol of the Ring Service". [Program Requirements](https://developer.amazon.com/docs/ring/program-requirements.html)
- §2.2: no removing, disabling, circumventing or interfering with features. §2.3: no modifying the Ring UI without written permission. [Program Requirements](https://developer.amazon.com/docs/ring/program-requirements.html)
- §2.8: "You may not use the Ring Service for any activity where the use or failure of the Ring Service could lead to death" (safety-critical use). [Program Requirements](https://developer.amazon.com/docs/ring/program-requirements.html)
- §2.19: partners "will not directly or indirectly trigger or interface with any alarm services without first obtaining" the required governmental licences and authorizations. [Program Requirements](https://developer.amazon.com/docs/ring/program-requirements.html)
- §2.9: partners must take "all reasonable security measures to ensure that no third party may gain unauthorized access", notify Ring of any unauthorized access, and cooperate. §2.7(iii): developer credentials must not be given to any third party. [Program Requirements](https://developer.amazon.com/docs/ring/program-requirements.html)
- §2.10 and §2.11: partners must delete end-user data on exit or when Ring or the user asks, unless the user has given explicit consent to retention. §2.12: partners may not circumvent user controls that prevent data sharing. §2.18: the product listing must explain how end-user data is used. §7: a change in "whether you … trains any AI model with any end user's Ring device data" is a material change that may require recertification. [Program Requirements](https://developer.amazon.com/docs/ring/program-requirements.html)
- §3 Branding: a product "must not have a product name, description, domain name, logo, or any other branding that includes, is a variant of, or is confusingly similar to 'Ring', 'Amazon'" or other Amazon marks. [Program Requirements](https://developer.amazon.com/docs/ring/program-requirements.html)

**Permitted Content Policy (developer.amazon.com/docs/ring/content-policy.html, accessed 2026-10-23, undated)**
- §4.2.1: "Any collection of biometric identifiers requires explicit customer consent", and biometric data may not be sold. §4.2.2: "Apps must not identify strangers, passersby, or any individual the customer has not personally tagged". Pre-loaded face databases and matching faces against social media are also banned. [Content Policy](https://developer.amazon.com/docs/ring/content-policy.html)
- §1.2.2 bans apps that "provide or enable third-party access to a customer's Ring device" without explicit knowledge and consent. §1.2.3 bans cross-property movement profiles. §4.3.1 bans giving law enforcement direct access to cameras or recordings without consent for each request. §4.1.2: "You may not use, transmit, or share personal data without first obtaining consent," and Ring customer data may not be used to build databases for sale. The policy has no provision on AI agents or on automating security functions. [Content Policy](https://developer.amazon.com/docs/ring/content-policy.html)
- Ring founder Jamie Siminoff said the Appstore terms will not permit privacy-invasive features such as facial-recognition tools or licence-plate readers (TechCrunch, 2026-03-31). The Appstore launched with about 15 apps, available "in the U.S. first". [TechCrunch](https://techcrunch.com/2026/03/31/ring-app-store-bets-on-ai-to-go-beyond-home-security/)

### Inferences
- **Unofficial route.** The ToS does not expressly ban third-party clients. But a reverse-engineered client that imitates the official app, or works around bot detection (see §2), runs close to the §2(h) wording "tamper with, or bypass any security". Ring can also terminate the account under §2(a). The most realistic enforcement risk is account or IP termination, not litigation, but the ToS leaves both open.
- **Official route.** The Partner API with a Private Use App (≤5 accounts, no certification) fits a single-user or family MCP bridge best and is the contractually clean option. Its limits:
  - no alarm or lock control is documented;
  - it requires a U.S. customer with a compatible paid Ring subscription;
  - §2.19 requires licences before an app interfaces with alarm services;
  - §2.8 bars safety-critical reliance;
  - all media carries a watermark;
  - TAKE/E2EE devices return unreadable or no video.
- If the official API is used, any feature that sends Ring video to an LLM provider for training, or that does face identification, collides with §7 (AI-training disclosure) and §4.2.2 (no identifying people the customer has not tagged).
- The Appstore is U.S.-first. A Ring account registered outside the U.S. (for example in Israel) may be unable to link a partner app. This is unverified; see Gaps.

### Gaps
- I did not retrieve the text of the Amazon "Developer Agreement" / Developer Services Agreement or the "Ring Appstore Schedule", so clauses on liability, indemnity, termination and governing law are not captured.
- The Program Requirements and Content Policy pages show no effective or revision dates, only a "© 2010–2026" footer.
- Whether the Partner API, and Private Use Apps in particular, can be used by non-U.S. Ring accounts is not stated in the documents I retrieved.
- The ToS has no explicit automated-access clause, so any "unauthorized access" theory (CFAA, DMCA §1201 anti-circumvention, or foreign equivalents) against an unofficial client is untested for Ring. I found no legal analysis specific to Ring.

## 2. Has Ring blocked, rate-limited, sent cease-and-desist letters to, or banned unofficial integrations (dgreif/ring, ring-mqtt, Home Assistant)? What is Ring's public stance?

### Takeaway
I found **no** cease-and-desist letter, DMCA takedown, lawsuit or public Ring/Amazon statement about the unofficial projects. All three are still actively maintained as of October 2026. The friction is **technical**. Ring forced OAuth/2FA, changes endpoints, and, most recently (2025–2026), its auth servers sit behind a Cloudflare WAF that returns `406 Not Acceptable` to clients that do not look like the official app. Maintainers report that the fix is to copy the app's User-Agent, and they describe occasional IP blocks. Ring's public "answer" to third parties is the official Appstore launched in 2025–2026.

### Cited Findings
- dgreif/ring ("Unofficial packages for Ring Doorbells, Cameras, Alarm System, and Smart Lighting") is active, with its last push on 2026-10-22, about 1.5k stars and an MIT licence. [GitHub API: dgreif/ring](https://github.com/dgreif/ring)
- tsightler/ring-mqtt is active (last push 2026-10-23, about 800 stars, MIT). [GitHub: ring-mqtt](https://github.com/tsightler/ring-mqtt)
- python-ring-doorbell (used by Home Assistant) is active (last push 2026-02-28, about 700 stars, LGPL-3.0). [GitHub: python-ring-doorbell](https://github.com/python-ring-doorbell/python-ring-doorbell)
- **2026 auth blocking (dgreif/ring #1717, opened 2026-03-06):** users report that from about 2026-02-23 "all authentication attempts fail with a `406 Not Acceptable` from Cloudflare", affecting both initial login and refresh. [dgreif/ring #1717](https://github.com/dgreif/ring/issues/1717)
- In the same thread, maintainer tsightler (2026-03-08) said the 406 "is not from Ring OAuth servers, this response is directly from Cloudflares Web Application Firewall… you are being filtered out as a bot/attacker". He also wrote: "I've seen a few cases where they've unexpectedly blocked some IPs on their auth servers." [dgreif/ring #1717](https://github.com/dgreif/ring/issues/1717)
- The fix (2026-03-09): "The only actual change in the dev branch is the use of the full user-agent header that the app is using (with version number)". tsightler noted the official app sends about 12 headers versus 3 from ring-client-api. On 2026-05-08 he wrote that "all that is required for most users is just to make the User-Agent string look exactly like the Ring app", and that WAF rules "may have been tightend a bit or at least retrained". [dgreif/ring #1717](https://github.com/dgreif/ring/issues/1717)
- A HomeSeer Ring plugin author (2026-05-07) reported that regenerating the plugin's hardware ID (HWID) cleared a 406 block. [dgreif/ring #1717](https://github.com/dgreif/ring/issues/1717)
- **API drift:** tsightler (2026-05-08) notes that the official app now uses a browser-based `/oauth/v2` flow (with passkey support) while a "legacy" in-app login remains, and that "the old v1 locations API returns no sites" for some users as Ring moves to v3. [dgreif/ring #1717](https://github.com/dgreif/ring/issues/1717)
- A user in dgreif/ring #1715 (2026-03-02) wrote that token failure "is typically due to either a firewall/vpn issue or that Ring has banned my IP temporarily". Other users reported the same multi-week outage. One later fixed it by downgrading Node 26 to Node 24 (2026-06-09), so not every failure is a block. [dgreif/ring #1715](https://github.com/dgreif/ring/issues/1715)
- Similar 406 auth failures were reported earlier, in dgreif/ring #1580 (2025-01-30). [dgreif/ring #1580](https://github.com/dgreif/ring/issues/1580)
- Earlier history: a Home Assistant community post states "Ring has started blocking all API access that's not using their Oauth2 provider" and describes the integration being moved to OAuth2. The post date was not verified in my retrieval. [Home Assistant Community](https://community.home-assistant.io/t/ring-configuration/159913/2)
- A Homey community thread reports a Ring API change tied to Firebase deprecating legacy FCM push, which forced third-party Ring apps to adapt. [Homey Community](https://community.homey.app/t/app-ring-home-security-video-doorbells-by-athom/107408?page=2)
- **E2EE (2021):** when Ring announced E2EE, dgreif wrote (2021-01-13): "Yes, this will almost certainly prevent video streams from working via the homebridge plugin… Not something I plan to support". He noted that E2EE was opt-in and only for wired cameras at the time. [dgreif/ring #549](https://github.com/dgreif/ring/issues/549)
- Ring's own support page lists "Third-party integrations" and "Alexa and Fire TV integration" among the features unavailable with E2EE. [Ring Support: Video End-to-End Encryption](https://ring.com/support/articles/myr75/using-video-end-to-end-encryption)
- **Official alternative:** Ring announced the Ring Appstore at CES (January 2026) for U.S. customers with a compatible subscription. The developer API reached GA on 2025-04-21. Coverage of the launch did not mention Home Assistant or unofficial integrations. [Ring Blog](https://blog.ring.com/?p=7763); [TechCrunch 2026-03-31](https://techcrunch.com/2026/03/31/ring-app-store-bets-on-ai-to-go-beyond-home-security/); [Release Notes](https://developer.amazon.com/docs/ring/release-notes.html)

### Inferences
- Ring's actual enforcement pattern against unofficial clients is passive and technical: WAF bot scoring, IP blocks, auth-flow and endpoint changes, push-system changes, and encryption that removes video access. I saw no legal enforcement. A bridge built on reverse-engineered APIs should expect periodic multi-week outages and should be designed to degrade gracefully.
- Getting past WAF bot detection by impersonating the official app's User-Agent, headers or HWID is the community's current workaround. Legally and contractually it is the most exposed technique, because it resembles the "bypass any security" language in ToS §2(h). This is an inference, and no court or Ring statement has said so.
- Now that an official API exists, Ring has a stronger product reason to tighten bot controls on private endpoints. I found no evidence that it has announced plans to do so.

### Gaps
- I found no public Ring or Amazon statement, positive or negative, about dgreif/ring, ring-mqtt, python-ring-doorbell or the Home Assistant integration.
- I found no reported account bans, as opposed to IP or WAF blocks, attributed to using these libraries.
- How TAKE (default from September 2026) affects unofficial clients' video access is unknown. A search of dgreif/ring and ring-mqtt issues created after 2026-08-15 found no TAKE-related reports as of 2026-10-23 ([dgreif/ring issues](https://github.com/dgreif/ring/issues), [ring-mqtt issues](https://github.com/tsightler/ring-mqtt/issues)). Absence of reports is not evidence of compatibility.
- I could not date the Home Assistant OAuth2 post.

## 3. Ring's security and privacy history relevant to the design (2019–2026)

### Takeaway
Ring's record includes:
- 2019 credential-stuffing takeovers;
- mandatory 2FA (February 2020);
- an FTC order (May/June 2023, $5.8M) over staff access to customer video and weak account security, with 20 years of obligations;
- E2EE (2021) and default "TAKE" encryption (announced 2026-08-26);
- a pivot from police "Request for Assistance" (ended January 2024) to Axon-powered "Community Requests" (2025), with a Flock tie-up announced and then cancelled (February 2026);
- "Familiar Faces" facial recognition (December 2025), geo-fenced out of Illinois, Texas and Portland and now the subject of a class action (June 2026);
- the "Search Party" Super Bowl ad backlash (February 2026).

Taken together, regulators and the public will treat Ring video, credentials and biometric outputs as high-sensitivity data.

### Cited Findings
**2019 hacks and the 2FA mandate**
- Ring attributed the 2019 intrusions, including a hacker talking to an eight-year-old through a bedroom camera, to credential stuffing: "credentials… from a separate, external, non-Ring service" reused on Ring. About 3,000 Ring accounts' credentials were reported compromised, and a later leak reportedly exposed more than 3,600 owners' emails, passwords and camera details. [The Hacker News](https://thehackernews.com/search/label/ring%20camera); [Boing Boing 2019-12-19](https://boingboing.net/2019/12/19/amazon-used-security-to-se.html)
- On 2020-02-18 Amazon made 2FA mandatory for all Ring users, using six-digit codes by SMS or email. Critics noted that NIST discourages SMS codes. [BankInfoSecurity](https://www.bankinfosecurity.com/amazons-ring-mandates-two-factor-authentication-a-13738); [TechCrunch 2020-01-30](https://techcrunch.com/2020/01/30/ring-security-control-center)

**FTC action (2023)**
- On 2023-05-31 the FTC alleged that Ring "illegally surveilled customers" and "failed to stop hackers from taking control of users' cameras". Hackers exploited weak account security to access about 55,000 U.S. customers' videos and accounts, and one employee viewed thousands of recordings of female users' intimate spaces. The $5.8M went to consumer refunds. [FTC press release](https://www.ftc.gov/news-events/news/press-releases/2023/05/ftc-says-ring-employees-illegally-surveilled-customers-failed-stop-hackers-taking-control-users); [FTC Complaint](https://www.ftc.gov/system/files/ftc_gov/pdf/complaint_ring.pdf)
- NBC reported that one employee in 2017 viewed recordings of at least 81 unique female users. [NBC News](https://www.nbcnews.com/business/consumer/ring-doorbell-camera-employees-mishandled-customer-videos-rcna87103)
- The stipulated order, entered 2023-06-16, requires Ring to delete "data products" (data, models and algorithms) derived from videos it unlawfully reviewed. Pre-March-2018 covered recordings had to be deleted within 30 days and face embeddings collected before 2018-03-01 within 90 days. Ring must run a privacy and security program with assessments for 20 years and disclose employee and contractor access. Ring denied wrongdoing. [FTC Stipulated Order](https://www.ftc.gov/system/files/ftc_gov/pdf/Ring-OrderEntered-6.16.2023(003).pdf); [FTC press release](https://www.ftc.gov/news-events/news/press-releases/2023/05/ftc-says-ring-employees-illegally-surveilled-customers-failed-stop-hackers-taking-control-users); [NBC News](https://www.nbcnews.com/business/consumer/ring-doorbell-camera-employees-mishandled-customer-videos-rcna87103)

**May 2025 login scare**
- Users saw unfamiliar "Authorized Client Devices", some from foreign IPs, dated 2025-05-28. Ring said a backend update displayed prior login dates incorrectly and that it had "no reason to believe this is the result of unauthorized access", and it later deployed a fix (reported 2025-07-21). Some users disputed this. [BleepingComputer](https://www.bleepingcomputer.com/news/security/ring-denies-breach-after-users-report-suspicious-logins); [Decrypt](https://decrypt.co/331120/ring-users-report-mysterious-logins-amazon-blames-backend-bug); [Cyber Daily](https://www.cyberdaily.au/security/12408-ring-blames-mysterious-logins-on-backend-update-but-customers-are-not-so-sure)

**Encryption**
- E2EE was rolled out to all U.S. users in July 2021, later internationally, and is not supported on many battery devices. [AppleInsider 2021-07-13](https://appleinsider.com/articles/21/07/13/ring-rolls-out-end-to-end-video-encryption-to-all-users); [Trusted Reviews](https://www.trustedreviews.com/news/ring-brings-end-to-end-encryption-to-europe-4150694)
- **TAKE (Throw Away the Key)** was announced around 2026-08-26 (the date on the white paper) and rolls out in phases from September 2026, becoming "the default for all Ring customers worldwide". Video is protected with rotating keys. A temporary key copy sits in a cloud secure enclave that Ring can use only to power intelligent features, and the customer and enabled Shared Users hold keys on enrolled devices. E2EE stays an opt-in, and under it "Shared Users and cloud-based features are not available." [About Amazon: TAKE](https://www.aboutamazon.com/md/news/devices/ring-take-encryption); [Ring E2EE/TAKE white paper 2026-08-26](https://assets.aboutamazon.com/e8/64/d5c572c74f11b5e55bcb93b63bd8/ring-ae-e2ee-whitepaper-august-26-2026.pdf)
- Sources disagree on whether Ring deletes its key copy after 24 hours. Search excerpts of the white paper and some coverage say so ([TechRepublic](https://www.techrepublic.com/article/news-ring-take-encryption-ai/); [PPC Land](https://ppc.land/ring-drops-its-copy-of-video-keys-as-take-becomes-default-in-september/)). The aboutamazon.com announcement page gives no deletion window ([About Amazon](https://www.aboutamazon.com/md/news/devices/ring-take-encryption)). Italian coverage claims keys rotate every five minutes and that video is blocked "even with a warrant"; I could not confirm either claim in Amazon materials ([SmartWorld](https://www.smartworld.it/news/ring-take-cifratura-limita-accesso-video-polizia.html)).

**Police access**
- In January 2024 Ring ended "Request for Assistance" in the Neighbors app. Police then needed a warrant, or had to show an emergency. [GeekWire 2024](https://www.geekwire.com/2024/ring-ends-feature-that-let-police-ask-users-for-videos-via-neighbors-app/); [AppleInsider 2024-01-24](https://appleinsider.com/articles/24/01/24/amazon-closing-down-law-enforcements-easy-access-to-ring-video-isnt-the-whole-story)
- In 2025 Axon announced a partnership letting police request Ring footage through Axon's evidence system ("Community Requests"). [Tom's Guide](https://www.tomsguide.com/home/home-security/ring-backtracks-lets-cops-once-again-request-video-from-your-doorbell-and-security-cameras); [Consumer Reports](https://www.consumerreports.org/electronics/privacy/ring-community-requests-lets-police-ask-for-user-videos-a2437818485/)
- In February 2026, days after the Super Bowl "Search Party" ad backlash, Ring cancelled a planned Flock Safety integration for Community Requests. Ring said it "would require significantly more time and resources than anticipated" and that no customer video was ever sent to Flock. [ABC7](https://abc7.com/18596207/); [Privacy Guides 2026-02-17](https://www.privacyguides.org/news/2026/02/17/amazon-cancels-ring-partnership-with-flock/)

**Search Party**
- Search Party is an AI feature that uses neighbours' cameras to find lost dogs. Its Super Bowl ad (February 2026) drew criticism that it could be used to track people. [ABC7](https://abc7.com/18596207/); [Mezha](https://mezha.net/eng/bukvy/ring_launched_search/)
- EFF argued that the tool "could be repurposed to track people" (2025-11-03). [EFF](https://www.eff.org/deeplinks/2025/11/legal-case-against-rings-face-recognition-feature)

**Familiar Faces (facial recognition)**
- Familiar Faces was announced for December 2025 and is limited to Ring Home Premium. Amazon said it is off by default but would not promise it will stay that way. It is unavailable in Illinois, Texas and Portland, Oregon. Biometrics are processed and stored on Amazon servers. Amazon "may keep untagged biometric data for up to six months" and says the data is not used for model training. Sen. Ed Markey urged Amazon to drop the feature. [EFF 2025-11-03](https://www.eff.org/deeplinks/2025/11/legal-case-against-rings-face-recognition-feature); [Ring answers to EFF (PDF)](https://www.eff.org/files/2025/11/04/ring_answers.pdf); [Android Authority](https://www.androidauthority.com/ring-familiar-faces-feature-backlash-3605662)
- A class action by Virginia resident Charles Sigwalt (reported 2026-06-03) alleges that the feature creates faceprints of non-users (family, postal workers, passersby) without consent, in violation of Virginia consumer-protection, computer-crime and privacy laws. It cites the FTC's 2023 biometric policy statement and seeks an injunction and damages. [The Register 2026-06-03](https://www.theregister.com/personal-tech/2026/06/03/ring-faces-class-action-over-facial-recognition-feature/5250661)
- **Retention figures conflict.** EFF and Ring (November 2025) say untagged data is kept up to about 6 months. The complaint, as reported, says 30 days for unrecognized faces and 180 days for saved profiles, and alleges profiles come back after re-subscription. [EFF](https://www.eff.org/deeplinks/2025/11/legal-case-against-rings-face-recognition-feature); [The Register](https://www.theregister.com/personal-tech/2026/06/03/ring-faces-class-action-over-facial-recognition-feature/5250661)
- Unofficial bridges are starting to surface these outputs. ring-mqtt PR #1120 (open, 2026-10-11) is titled "feat: expose Ring v3 AI event descriptions, detection types, and familiar faces". [ring-mqtt PR #1120](https://github.com/tsightler/ring-mqtt/pull/1120)

### Inferences
- The FTC order's themes are insider access to video, weak account security, and deletion of models derived from improperly accessed video. They are a template for what regulators expect from anyone holding Ring video: least-privilege access, MFA, audit, and not training models on footage without a lawful basis.
- Default TAKE (worldwide, from September 2026) plus opt-in E2EE means an increasing share of video will be unreadable to partner apps (per the Partner API release note) and possibly to unofficial clients. An MCP bridge should treat video access as best-effort and rely on events and metadata.
- An MCP bridge that passes through Familiar Faces names or identity labels moves biometric-derived output into an AI agent and out of Ring's geo-fencing. Ring blocks the feature in Illinois, Texas and Portland, but a third-party bridge used there could inherit the exposure if the data reaches it. This is an inference about risk, not a legal conclusion.
- Public backlash (Search Party, Flock, Familiar Faces) shows that features which correlate identities across cameras or share video with police are reputationally toxic. The Ring Content Policy (§1.2.3, §4.3.1) also bans them for partner apps.

### Gaps
- I did not retrieve the exact date of the Axon/Ring Community Requests announcement (2025) or the Flock announcement (late 2025).
- I could not determine the court or docket for the Sigwalt complaint. The Register links a CourtListener page that appears to be W.D. Wash., but that is my inference.
- Whether Familiar Faces has since been extended to more jurisdictions, or turned on by default, is unknown as of 2026-10-23.
- I did not find any 2026 FTC compliance action or modification involving Ring.

## 4. Privacy-law obligations when sending doorbell video and audio to AI (GDPR, CCPA/CPRA, biometric laws, wiretap and consent laws, EU AI Act, Israel)

### Takeaway
For a homeowner using their own bridge locally, the GDPR "household exemption" is narrow. Under Ryneš (CJEU 2014) it is lost once a camera captures public space or a neighbour's property, which is typical for doorbells. Biometric identification (face matching) triggers the strictest regimes:
- BIPA: $1,000/$5,000 per person after the 2024 amendment;
- Texas CUBI: AG-enforced, with Meta $1.4B and Google $1.375B settlements;
- Washington, Colorado, Maryland and Portland rules;
- Israel's Amendment 13, which makes biometric identifiers "information of special sensitivity".

Audio raises separate wiretap and two-party-consent questions that remain unsettled. The EU AI Act excludes purely personal, non-professional use from "deployer" duties, but a hosted or commercial service would not qualify for that exclusion.

### Cited Findings
**GDPR and EU**
- EDPB Guidelines 3/2019 on processing personal data through video devices (v2.0 adopted 2020-01-29) say, per Hunton's summary, that the household exemption must be narrowly interpreted in the context of video surveillance. Purposes stated only as "safety" are not specific enough. [EDPB Guidelines 3/2019 (PDF)](https://www.edpb.europa.eu/sites/default/files/files/file1/edpb_guidelines_201903_video_devices_en.pdf); [Hunton summary](https://www.hunton.com/privacy-and-cybersecurity-law-blog/edpb-adopts-guidelines-on-data-processing-through-video-devices)
- In *Ryneš* (C-212/13, judgment 2014-12-11), a home camera that also covered the public footpath and the house opposite fell outside the household exemption. [Inforrm (Lorna Woods) 2014-12-17](https://inforrm.org/2014/12/17/bringing-data-protection-home-the-cjeu-rules-on-data-protection-law-and-home-cctv-lorna-woods/); [Lexgo](https://www.lexgo.be/en/news-and-articles/2611-eu-data-protection-rules-may-apply-to-home-surveillance-cameras)
- The Irish DPC's domestic CCTV guidance (uploaded May 2026) applies Ryneš: the exemption does not apply when home CCTV captures images beyond the owner's boundary. [Irish DPC Domestic CCTV leaflet](https://www.dataprotection.ie/sites/default/files/uploads/2026-05/Domestic_CCTV_A5_ENG_Final.pdf)

**EU AI Act**
- The Article 3(4) "deployer" definition excludes use "in the course of a personal non-professional activity". Article 3(35) defines biometric identification as automated recognition against a stored database. Recital 15 excludes one-to-one verification. [EU AI Act Service Desk, Art. 3](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-3); [Recital 15](https://www.mishcon.com/eu-uk-ai-navigator/recital/no-15)

**CCPA/CPRA (California)**
- The CCPA applies to for-profit businesses doing business in California that meet one of three tests: more than $26,625,000 gross revenue (2025 inflation-adjusted figure), personal information of 100,000 or more California consumers or households, or at least 50% of revenue from selling or sharing personal information. Biometric data is personal information. This comes from secondary, vendor sources. [Enzuzo](https://www.enzuzo.com/blog/what-is-the-ccpa); [Usercentrics](https://usercentrics.com/knowledge-hub/ccpa-all-you-need-to-know/)

**U.S. biometric laws**
- Illinois BIPA, as amended by SB 2979 (signed 2024-08-02), makes damages accrue per person rather than per scan, still $1,000 for negligent and $5,000 for intentional or reckless violations. [Davis Wright Tremaine 2024-08](https://dwt.com/blogs/privacy--security-law-blog/2024/08/illinois-bipa-biometrics-law-amended-for-damages); [Fisher Phillips](https://www.fisherphillips.com/en/news-insights/breaking-bipa-news-illinois-curtails-massive-damage-awards-in-biometric-cases.html)
- A law-firm alert describes the same amendment as "limit[ing] damages and expand[ing] consent options". I did not retrieve the consent-option details. [Thompson Hine](https://www.thompsonhine.com/insights/illinois-legislature-amends-bipa-to-limit-damages-and-expand-consent-options/)
- EFF (2025-11-03) cites these as relevant to Familiar Faces:
  - Texas's biometric statute, with Google's $1.375B Texas settlement over Nest cameras and Meta's $1.4B Texas settlement;
  - Facebook's $650M Illinois settlement;
  - Washington's 2017 biometric law (never enforced) and its stronger 2023 law, which includes a private right of action;
  - Colorado, which requires consent from companies that jointly determine biometric processing;
  - Maryland, which "essentially prohibits collecting biometric data from bystanders";
  - Portland's biometric ordinance.

  EFF also argues that Amazon, as collector, has its own consent duties beyond those of camera owners. [EFF](https://www.eff.org/deeplinks/2025/11/legal-case-against-rings-face-recognition-feature)

**Audio recording and wiretap/consent laws**
- Legal commentary (Richmond JOLT, 2026-03-02) concludes that homeowner audio recording via Ring is currently legal where the device is visibly displayed, but notes unresolved questions in two-party-consent states. [Richmond JOLT 2026-03-02](https://jolt.richmond.edu/2026/03/02/smart-doorbells-and-the-legality-of-the-audio-recording-feature)
- An earlier JOLT piece (2022-01-24) argues that recording neighbours' conversations the owner is not part of could violate the federal Wiretap Act, noting Ring's roughly 40-foot audio pickup. [Richmond JOLT 2022](https://jolt.richmond.edu/2022/01/24/regulating-video-doorbell-surveillance-your-neighbors-are-recording/)
- A New Hampshire trial court (*State v. Burke*) admitted Ring audio over a two-party-consent objection because the conversation was public in nature. It is a single trial-level ruling. [Richmond JOLT 2026-03-02](https://jolt.richmond.edu/2026/03/02/smart-doorbells-and-the-legality-of-the-audio-recording-feature)
- California commentary from 2018 raises Penal Code §632 (confidential communications) for Ring audio. [Wallin & Klarich 2018-04-18](https://www.southerncaliforniadefenseblog.com/2018/04/do-ring-doorbell-cameras-violate-wiretapping-laws-pc-632.html)
- Ring's ToS puts audio-recording legality and third-party notice and consent on the owner. [Ring Terms §2(b)](https://ring.com/terms)

**Israel (author may be Israel-based)**
- Amendment 13 to the Protection of Privacy Law took effect on **2025-08-14**. It defines "information of special sensitivity" to include "a biometric identifier used or intended to be used to identify the person or to verify his or her identity via computer". [Library of Congress Global Legal Monitor 2025-11-17](https://www.loc.gov/item/global-legal-monitor/2025-11-17/israel-amendment-to-privacy-protection-law-goes-into-effect/); [Vixio](https://www.vixio.com/insights/pc-regulatory-influencer-israel-modernises-privacy-law-comprehensive)
- Amendment 13 gives the Privacy Protection Authority (PPA) expanded powers, including administrative fines without court approval, criminal investigations, and powers to freeze or delete databases. It also introduces DPO requirements in defined cases. [Israel Desks](https://israeldesks.com/israel-enacts-strict-privacy-reform/); [BigID](https://bigid.com/blog/what-israel-amendment-13-means-for-businesses-in-2025/)
- Vendor sources report thresholds and remedies inconsistently, and none were verified against the statute:
  - database registration: more than 10,000 data subjects in one source;
  - civil claims possible without proof of harm.

  [Clym](https://www.clym.io/blog/amendment-13-israels-updated-privacy-protection-law-and-what-businesses-must-do-now); [SayMine](https://advisor.saymine.com/blog-1/israel-enforces-major-privacy-reform-under-amendment-13)
- Unverified vendor-blog claims (see Gaps): penalties "up to 5% of annual turnover", registration for databases of special-sensitivity data on more than 100,000 people, and a first PPA fine of ₪70,000 on HOT.
- Israel has no specific statute on camera installation. Camera use is governed by the general Privacy Protection Law and PPA directives (State Comptroller audit, 2024). [State Comptroller 2024 Cameras report](https://library.mevaker.gov.il/sites/DigitalLibrary/Documents/2024/Shilton/EN/2024-Shilton-101-Cameras-EN.pdf)
- The PPA's 2017 guidance covers workplace cameras, and a 2011 draft CCTV guideline from its predecessor (ILITA) covered private and public entities. [IAPP](https://iapp.org/news/a/israeli-dpa-guidelines-on-workplace-surveillance); [IAPP 2011](https://iapp.org/news/a/2011-12-12-new-draft-guidelines-on-use-of-surveillance-cameras)
- Israel's cyber authorities warned home-camera owners about hacking by hostile actors during the war, advising them to change default passwords and use two-step verification. [Calcalist](https://www.calcalistech.com/ctechnews/article/syjznmfzt); [Graham Cluley](https://grahamcluley.com/israelis-told-to-secure-their-home-security-cameras-against-hackers/)
- **Ring in Israel:** Israeli retailer bug.co.il sells Ring doorbells with Hebrew product pages. [bug.co.il Battery Doorbell](https://www.bug.co.il/brand/ring/battery/doorbell); [bug.co.il Wired Doorbell 2K Plus](https://www.bug.co.il/brand/ring/wired/doorbell/2k/plus)

### Inferences
- **Personal, local use.** A homeowner running the bridge for themselves is the data controller for their camera footage. If the doorbell captures a street or a neighbour's property (Ryneš), GDPR or Israeli PPL duties likely apply to that homeowner: transparency signage, purpose limitation, minimization, retention limits. Sending frames to a cloud LLM adds a processor and possibly a cross-border transfer.
- **Hosted or SaaS.** If the author hosts the bridge for others, the author becomes a processor or service provider, or a controller if the author decides on AI uses. That brings:
  - DPAs and processor contracts (GDPR Art. 28);
  - Amendment 13 security and DPO obligations;
  - CCPA service-provider terms if thresholds are met;
  - for any face matching, biometric-consent duties toward bystanders who cannot practically consent (the EFF argument).
- **AI Act.** The personal non-professional exclusion in Art. 3(4) likely covers a hobbyist's own use. It would not cover a commercial or hosted offering. Any face-identification feature offered as a service raises "remote biometric identification" questions.
- **Design minimums implied by the sources:**
  - no face identification (follow Ring Content Policy §4.2.2);
  - audio off by default, or an explicit owner opt-in with a consent warning;
  - frames sent to LLMs only on demand;
  - no retention of video or derived embeddings beyond the session unless the user opts in;
  - no model training on footage;
  - geofence or disable biometric-derived fields (Familiar Faces names) for Illinois, Texas and Portland users, or drop them entirely.

### Gaps
- I did not verify the exact wording of EU AI Act Art. 2(10) or how Annex III and Art. 5 apply to a consumer bridge.
- I did not retrieve the CCPA statutory text on household or personal-use exclusions (Cal. Civ. Code §1798.140), and the threshold figures come from secondary sources only.
- I did not find a primary source for Texas CUBI requirements, for Washington RCW 19.375 or the My Health My Data Act details, or for Colorado's 2025 biometric amendment beyond EFF's summary.
- I did not find an authoritative, current count of two-party-consent states.
- The penalty ceiling (the "5% of turnover" figure), breach-notification timeline (a 72-hour figure appears only in vendor marketing), registration thresholds (10,000 vs 100,000) and the reported ₪70,000 HOT fine under Amendment 13 are unverified against the Hebrew statute or official PPA records.
- I found no PPA guidance specific to residential or doorbell cameras.
- I found no official Ring statement on whether Ring is sold, supported or localized (Hebrew app) in Israel, or whether Israeli accounts can use the Appstore. Only third-party retail listings were found.

## 5. Security of refresh tokens, local vs hosted deployment, multi-user hosting, and letting an AI agent disarm alarms or unlock doors

### Takeaway
A Ring refresh token gives full account access, Ring's history shows credential compromise causes real harm, and both the official program and the maintainers treat credentials and disarm codes as secrets. Ring's own Alexa integration requires a spoken PIN to disarm or unlock. The Partner API documents no alarm or lock control and bars safety-critical and unlicensed alarm use. Vision-language agents are vulnerable to visual prompt injection, for example text held up to a doorbell camera. Together these support local-first deployment, read-mostly tools, and human confirmation plus a PIN for any arm, disarm or unlock action.

### Cited Findings
- The FTC found that weak account security let hackers access about 55,000 U.S. customers' videos and accounts. The order requires a security program for 20 years. [FTC press release 2023-05-31](https://www.ftc.gov/news-events/news/press-releases/2023/05/ftc-says-ring-employees-illegally-surveilled-customers-failed-stop-hackers-taking-control-users)
- The Partner API uses OAuth bearer and refresh tokens. "Each refresh invalidates the prior refresh token" (2026-10-22), and partners should return 200 on token exchange only after storing the tokens. [Release Notes](https://developer.amazon.com/docs/ring/release-notes.html)
- The Client Secret must be stored securely and never committed. The HMAC key is shown only once. [Getting Started](https://developer.amazon.com/docs/ring/get-started.html)
- Program Requirements §2.9 requires partners to take reasonable measures against unauthorized third-party access and to notify Ring. §2.7(iii) bars sharing developer credentials. [Program Requirements](https://developer.amazon.com/docs/ring/program-requirements.html)
- The unofficial ring-client-api authenticates with a refresh token generated by `ring-auth-cli`. [ring-client-api README](https://cdn.jsdelivr.net/npm/ring-client-api@14.3.0/README.md)
- ring-mqtt merged PRs to "Mask livestream credentials and disarm code in debug logs" (#1111, 2026-09-13) and to "Pass livestream credentials to the ringstream helper in the environment instead of argv" (#1114, 2026-09-13). [ring-mqtt PR #1111](https://github.com/tsightler/ring-mqtt/pull/1111); [ring-mqtt PR #1114](https://github.com/tsightler/ring-mqtt/pull/1114)
- homebridge-ring added an `allowDisarm` option "to block disarm from HomeKit" (PR #1650 and issue #1651, 2025-09-01). [dgreif/ring PR #1650](https://github.com/dgreif/ring/pull/1650); [dgreif/ring #1651](https://github.com/dgreif/ring/issues/1651)
- Ring's Alexa integration requires the user to enable "Unlock by Voice" and create a voice code that Alexa asks for before unlocking. "Disarm by Voice" requires a 4-digit passcode. Anyone who knows the code can disarm, and there is also a "Bypass by Voice" feature for sensors. [Ring Support: Works with Ring Smart Locks + Alexa](https://ring.com/support/articles/od8uw/Controlling-Works-with-Ring-Smart-Locks-with-Alexa); [Ring AU Support: Arming/Disarming with Alexa](https://ring.com/au/en/support/articles/tu12s/Arming-and-Disarming-Your-Ring-Devices-with-Alexa)
- Ring Alarm digital arming and disarming requires a compatible Ring subscription. [Ring AU Support](https://ring.com/au/en/support/articles/tu12s/Arming-and-Disarming-Your-Ring-Devices-with-Alexa)
- Partner API limits: §2.8 bars use where failure "could lead to death"; §2.19 bars triggering or interfacing with alarm services without governmental licences; the API documents no alarm or lock endpoints. [Program Requirements](https://developer.amazon.com/docs/ring/program-requirements.html); [Getting Started](https://developer.amazon.com/docs/ring/get-started.html)
- **Visual prompt injection.** A Cloud Security Alliance research note (2026-03-08, labelled unofficial and AI-assisted) reports typographic image injection reaching up to 64% black-box success under stealth constraints. It lists physical-world signage as one embedding technique and concludes that no current defence fully neutralizes it, recommending privilege minimization and "human approval for high-stakes actions". [CSA Research Note](https://labs.cloudsecurityalliance.org/research/csa-research-note-image-prompt-injection-multimodal-llm-2026/)
- An arXiv preprint (2609.04533, September 2026) demonstrates an injected image causing an agent built on a frontier VLM to issue a malicious tool call. [arXiv 2609.04533](https://arxiv.org/pdf/2609.04533)
- Ring's Computer Vision Guidelines (2026-10-19) warn about VLM hallucination and recommend output guardrails before results reach users. [Release Notes](https://developer.amazon.com/docs/ring/release-notes.html)
- **Insurance analogy (UK, not smart-lock-specific):** UK Financial Ombudsman decisions show insurers declining theft claims where there was no "forced and violent entry" or where a door was left unlocked in breach of a locks endorsement. Outcomes depend on policy wording. [FOS DRN-5136458](https://www.financial-ombudsman.org.uk/decision/DRN-5136458.pdf); [FOS DRN1233120](https://financial-ombudsman.org.uk/decision/DRN1233120.pdf); [FOS DRN-6034370](https://www.financial-ombudsman.org.uk/decision/DRN-6034370.pdf)
- **May 2025 login scare:** unknown "Authorized Client Devices" alarmed users. Ring said it was a display bug. Every unofficial client appears as an authorized device, as the HomeSeer author noted when regenerating a HWID shows up as another device. [BleepingComputer](https://www.bleepingcomputer.com/news/security/ring-denies-breach-after-users-report-suspicious-logins); [dgreif/ring #1717](https://github.com/dgreif/ring/issues/1717)

### Inferences
- **Local single-user deployment** keeps the refresh token on the owner's machine. Store it in an OS keychain or DPAPI-encrypted store, never in MCP config JSON or logs, and handle rotation, since each refresh invalidates the old token. This is the lowest-risk posture.
- **Hosted or multi-user (SaaS) deployment** means holding other people's full-account Ring tokens (unofficial) or OAuth tokens (official). That turns the operator into a high-value target and a processor or controller under privacy law (§4). Under the official program it triggers §2.9 breach-notice duties, and under the unofficial route the operator is relying on ToS-grey access for many accounts.
- **AI-agent actuation (disarm, unlock, siren, arm) is the highest-liability feature.** Signals pointing the same way:
  - Ring's Alexa PIN gate;
  - the community `allowDisarm` guard;
  - Partner API §2.8 and §2.19;
  - documented visual and prompt-injection attacks;
  - insurers' reliance on "forced entry" or "locked door" conditions.

  Default to read-only tools. Expose disarm and unlock only behind out-of-band human confirmation plus a user PIN that is never placed in model context. Log every actuation. Never act on instructions derived from camera content.
- Disarm codes, livestream credentials and tokens must be masked in logs and kept off process command lines, following the ring-mqtt precedents.

### Gaps
- I found no smart-lock- or smart-alarm-specific insurance case or policy language about remote or automated unlocking. The FOS decisions are analogies only.
- I found no case law on liability when an AI agent, or any automation, disarms an alarm or unlocks a door.
- I did not retrieve Ring's Alarm Professional Monitoring terms, which may restrict third-party arming and disarming or false-alarm handling.
- I found no primary data on whether Ring revokes "Authorized Client Device" sessions for unofficial clients, or on per-account device limits.

## 6. Licensing of the community libraries and trademark use of "Ring" in a project name

### Takeaway
ring-client-api (dgreif/ring) and ring-mqtt are **MIT**. python-ring-doorbell is **LGPL-3.0**, which matters if the bridge modifies and ships it. Community projects describe themselves as "unofficial". Ring's developer terms ban "Ring" in partner product names and allow only descriptive phrasing such as "Compatible with Ring cameras". A project named "RingMCPBridge" would breach Program Requirements §3 if published through the official program, and it carries trademark risk in general.

### Cited Findings
- dgreif/ring (ring-client-api, homebridge-ring) is licensed MIT. The repo description reads "Unofficial packages for Ring Doorbells, Cameras, Alarm System, and Smart Lighting", and the README says it "contains unofficial packages to enable interaction and automation with the majority of Ring products". [GitHub: dgreif/ring](https://github.com/dgreif/ring); [README](https://raw.githubusercontent.com/dgreif/ring/main/README.md)
- tsightler/ring-mqtt ("Ring devices to MQTT Bridge") is licensed MIT. [GitHub: ring-mqtt](https://github.com/tsightler/ring-mqtt)
- python-ring-doorbell is licensed **LGPL-3.0** (GitHub SPDX `LGPL-3.0`, checked 2026-10-23). [GitHub: python-ring-doorbell](https://github.com/python-ring-doorbell/python-ring-doorbell)
- Ring Program Requirements §3: a Ring In-App Product "must not have a product name, description, domain name, logo, or any other branding that includes, is a variant of, or is confusingly similar to 'Ring', 'Amazon' or another Amazon trademark or logo", and must follow the Ring Marketing Guidelines. [Program Requirements](https://developer.amazon.com/docs/ring/program-requirements.html)
- Ring Marketing Guidelines (published 2026-09-09 per release notes):
  - Approved phrasing is "Compatible with Ring cameras" and "Integrates with Ring devices".
  - Partners must not use "with Ring" to imply partnership ("Powered with Ring", "Built with Ring", "Exclusive to Ring"), must not suggest Ring owns or endorses the app, and must not call themselves an "associate" of Ring or Amazon.
  - Press releases and videos need Ring PR approval 10–12 business days ahead.
  - Badge usage rules apply.

  [Ring Marketing Guidelines](https://developer.amazon.com/docs/ring/marketing-guidelines.html); [Release Notes](https://developer.amazon.com/docs/ring/release-notes.html)
- Content Policy §4.4 bans using third-party trademarks without rights, and §3.1 bans impersonating other apps or services. [Content Policy](https://developer.amazon.com/docs/ring/content-policy.html)
- Amazon's general trademark guidelines say third parties "may only use the specific trademarks identified by Amazon… and only in materials that have been approved in advance, in writing, by Amazon". [Amazon Trademark Usage Guidelines](https://digprjsurvey.amazon.com/csad/help/node/GNYNL3A8HPATWCH8)
- Analogous Amazon programmes (Alexa Built-in, Works with Alexa) require pre-approval, and misuse "will automatically terminate any license". [Alexa Built-in Trademark Guidelines](https://developer.amazon.com/support/legal/alexa_built_in_trademark_usage_guidelines); [WWA Trademark Guidelines](https://www.developer.amazon.com/zh/support/legal/wwa-trademark-usage-guidelines)

### Inferences
- **Licences.** MIT dependencies (ring-client-api) are permissive and need only attribution. Building on python-ring-doorbell (LGPL-3.0) means:
  - keep it a separately replaceable library;
  - ship its licence text;
  - publish any modifications to it under the LGPL.

  A permissively licensed MCP server can depend on it unmodified.
- **Naming.** Two options:
  - For a Ring Appstore or Private Use App, the product name cannot contain "Ring" at all. Use a neutral name, with descriptive copy such as "Compatible with Ring cameras".
  - For an unofficial open-source project, community precedent is descriptive use plus "unofficial" and a non-affiliation disclaimer, e.g. "unofficial … for Ring". This mitigates confusion, but given Amazon's pre-approval stance it is not permission.

  The repo name "RingMCPBridge" would need changing for the official route and is a trademark-risk point for the unofficial one.
- Do not use Ring logos, badges or product imagery except as the Marketing Guidelines allow. Badges are for Appstore partners only.

### Gaps
- I did not find a public Ring- or Amazon-specific nominative-use policy for open-source projects outside the developer program.
- I found no record of Amazon enforcing trademarks against "ring-*" community projects (no takedowns found).
- I did not retrieve or verify the licence of homebridge-ring separately from the dgreif/ring monorepo licence (MIT at the repo level).
