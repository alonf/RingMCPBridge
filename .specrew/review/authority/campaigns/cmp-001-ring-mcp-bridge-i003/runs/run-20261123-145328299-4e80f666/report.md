# Review Result

- **Campaign**: `cmp-001-ring-mcp-bridge-i003`
- **Run**: `run-20261123-145328299-4e80f666`
- **Harness**: `claude-code-file-primary`
- **Target digest**: `becc6d0d43afde8d7ae33017e14ddad74b0876d1`
- **Completion**: `complete`
- **Verdict**: `findings`
- **Runtime outcome**: `completed`
- **Currentness**: `current`
- **Can approve current snapshot**: `false`

## Summary

Risk-based static review of the T064 probe and T065/T066 private event media: claims, deduplication, publish, reads, expiry, delete-now, failed-write cleanup, shutdown, both object stores, migration, host wiring, query layer and infrastructure. The database-first visibility design, post-read recheck, per-kind byte limits and tombstone sweep hold up. Two gaps remain in abort handling: a stalled media body is not bounded by the write timeout or shutdown, and an ambiguous cancelled Blob commit can leave an untracked private object. No tests were run by the reviewer. The controller record covers only the governance validator (exit 0); it contains no unit or integration test result, and the 85-test claim in media-evidence.md was not independently verified. T067-T079 are still open in tasks.md and were not treated as missing work.

## Findings

| ID | Severity | Relevance | Location | Finding |
| --- | --- | --- | --- | --- |
| `finding-d5456cd092152ab1` | minor | current | bridge/src/core/access/media/event-media.ts:189 | A stalled media body escapes the write timeout and can hang core shutdown: [demoted to minor: no concrete failure scenario, so it cannot gate; reported as major by the reviewer] claimAndStage races only load() against writeSignal. The subsequent objects.write() is awaited directly, and checkedChunks checks the signal only after the next body chunk arrives. If a body stalls without itself observing the producer signal, the 10-minute timeout and stop() cannot release the pending iterator.next(). FileMediaObjects uses pipeline over the async iterable, which waits for that source pump to settle after abort. BlobMediaObjects uses uploadStream over Readable.from; its abort signal is applied to requests, not to a wait for the next source chunk. EventMedia.stop() then waits without a bound in Promise.allSettled, and core-assembly stop() awaits it before links.stop() and lease.stop(), so the lease and the link are not released and the database is not closed. The existing shutdown test covers a loader that ignores cancellation, but not a body that does so after its fir… |
| `finding-b5da3706e216f832` | minor | current | bridge/src/core/access/media/event-media.ts:221 | Ambiguous cancelled Blob commit can leave a private object with no tombstone: On any write error cleanupFailedWrite immediately sets write_until=0, deletes the object and then deletes the row. With Blob storage, aborting or losing the connection during the final block-list commit does not establish that the service abandoned it. The commit can take effect after deleteIfExists has found nothing. The row is then gone, so neither sweep nor deleteAll (both enumerate rows in status 'deleting') can find the blob, and storage.bicep defines no lifecycle rule as a backstop. That event media would outlive FR-021 retention and FR-037 delete-now, although it stays unreadable through EventMedia. The window is narrow and was not reproduced. Suggested fix: keep the tombstone for a grace period after an ambiguous write failure and delete the object again before removing the row, or periodically reconcile objects against rows. |

_This Markdown is a controller-generated projection. Authority is the sibling immutable `result.json`._