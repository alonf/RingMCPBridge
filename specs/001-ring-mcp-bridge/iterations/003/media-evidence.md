# Iteration 003 camera media evidence

| Work item | Evidence | Remaining check |
| --- | --- | --- |
| M01 / T064 | On 23 November 2026, the linked-account pilot retrieved a matching JPEG and MP4 for each of two recorded events, a motion detection and a doorbell press. Each JPEG was captured 4,999 ms after the event start. Each clip started at the event start and played to completion in local Chromium. Both clips contained AAC audio. | T064 stays open for S7 until playback with sound is verified in ChatGPT and Claude. |
| M02 / T065 and T066 | Commit `11ebf4d` implements private staging, expiry and owner deletion. Tests exercised SQLite with local files and SQL Server with Azurite. A doorbell event reached delivery while another camera's clip was pending. | M02 storage is implemented. An authenticated receiver fetching the same item is the separate M05 / T070 acceptance check. |

The post-link event correlation established in M01 supplied the event identity and time window needed to proceed with M02. The private media files, manifest and download URLs stay outside the repository. [Field observations](../../research.md) · [Storage CI](https://github.com/alonf/RingMCPBridge/actions/runs/45161926922)

### Storage checkpoint retest, 23 November 2026

The media, Ring pilot, core deployment and deploy workflow suites ran with local SQL Server and Azurite enabled. Across the four suites, 85 tests passed. The two CI-only environment checks were skipped locally. The cases include caller disconnect, core shutdown, failed or stalled cleanup, per-kind size limits and partial clips ending exactly at or beyond the event window. Type checking, the public schema checks and compilation of `infra/main.bicep` also passed.
