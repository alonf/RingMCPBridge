# Iteration 003 camera media evidence

## Signed camera callback handoff, 26 November 2026

The home pilot can watch one selected camera on a linked account. A signed motion or doorbell notification supplies the device, event ID, event time and any contributing camera component. The pilot resolves the household from that account's inventory. It uses the same five-second window for both media requests and retries only a representation still processing. Removing the link cancels its watch. [Ring webhook media fields](https://developer.amazon.com/docs/ring/api-documentation.html) · [Field procedure](../../quickstart.md#iteration-003-acceptance-run-planned)

A local test delivered a signed synthetic doorbell notification through the webhook handler. The receiver harness imported the resulting private manifest and media, and the MCP client took the event, camera and household identifiers from `get_events`. The separate receiver fetched matching bytes with its own credential and item grant. The same MCP lookup and handoff also passed for the two Ring recordings saved on 23 November.

A signed motion callback supplied the identity for a live Ring retrieval on 26 November. The five-second clip request exceeded the event window. The pilot automatically retried from the same start with a four-second request, and Ring returned a clip starting 1 ms into the window with a measured duration of 4,061 ms. The JPEG timestamp was 4,999 ms into the same window. A separately authenticated local receiver retrieved both saved items through the MCP handoff and verified their bytes. Range reads succeeded and withdrawal denied further access. Private media and identifiers stay on the home computer.

The deployed connector-to-core path still needs to carry that verified identity to the production media source. ChatGPT and Claude playback with sound remains open.

## Retention limit for interrupted Blob uploads

Delete-now invalidates the media item in the bridge and removes committed objects. If an upload stops before its block list is committed, Azure may still hold individual blocks. The bridge cannot serve those blocks as media, and its committed-object scan cannot confirm their physical removal. Azure documents garbage collection after a week without a successful block upload or block-list commit for that blob. This service-level limit also applies when the configured bridge retention is shorter. The expiry timing has not been measured on live Azure. [Microsoft Azure Storage Put Block remarks](https://learn.microsoft.com/en-us/rest/api/storageservices/put-block#remarks)

## Implementation evidence

| Work item | Evidence | Remaining check |
| --- | --- | --- |
| M01 / T064 | On 23 November 2026, the linked-account pilot retrieved a matching JPEG and MP4 for each of two recorded events, a motion detection and a doorbell press. Each JPEG was captured 4,999 ms after the event start. Each clip started at the event start and played to completion in local Chromium. Both clips contained AAC audio. | T064 stays open for S7 until playback with sound is verified in ChatGPT and Claude. |
| M02 / T065 and T066 | Commit `11ebf4d` implements private staging, expiry and owner deletion. Tests exercised SQLite with local files and SQL Server with Azurite. A doorbell event reached delivery while another camera's clip was pending. | M02 storage is implemented. An authenticated receiver fetching the same item is the separate M05 / T070 acceptance check. |

The post-link event correlation established in M01 supplied the event identity and time window needed to proceed with M02. The private media files, manifest and download URLs stay outside the repository. [Field observations](../../research.md) · [Storage CI](https://github.com/alonf/RingMCPBridge/actions/runs/45161926922)

## Storage checkpoint retest, 23 November 2026

The cleanup-isolation retest passed 101 cases across the four suites using SQLite, local files, SQL Server and Azurite. Two CI-only checks were skipped locally. Injected persistent failures during tracked and untracked object removal left unrelated removal attempts running on the same and subsequent pages. An invalid listing cursor produced an error and the next sweep began at the first page.

The media, Ring pilot, core deployment and deploy workflow suites ran with local SQL Server and Azurite enabled. Across the four suites, 85 tests passed. The two CI-only environment checks were skipped locally. The cases include caller disconnect, core shutdown, failed or stalled cleanup, per-kind size limits and partial clips ending exactly at or beyond the event window. Type checking, the public schema checks and compilation of `infra/main.bicep` also passed.

After the next review, the same four suites passed 95 tests with SQLite, local files, SQL Server and Azurite. A synthetic body stalled on its second chunk and ignored cancellation during cleanup. The write timed out or stopped at shutdown on both backends. A separate test simulated a lost upload acknowledgement by making bytes visible after cleanup and reopening the media store. Both the periodic sweep and owner deletion removed those bytes. The sweep checks one page of Blob names per tick against current database claims. Owner deletion checks every page. The timing of a lost acknowledgement on live Azure remains unverified.
