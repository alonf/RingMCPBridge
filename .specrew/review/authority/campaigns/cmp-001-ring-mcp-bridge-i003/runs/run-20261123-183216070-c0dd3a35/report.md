# Review Result

- **Campaign**: `cmp-001-ring-mcp-bridge-i003`
- **Run**: `run-20261123-183216070-c0dd3a35`
- **Harness**: `claude-code-file-primary`
- **Target digest**: `9811e5035f8149f7d36d9d222d428af511fd981d`
- **Completion**: `complete`
- **Verdict**: `findings`
- **Runtime outcome**: `completed`
- **Currentness**: `current`
- **Can approve current snapshot**: `false`

## Summary

Risk-based static review of the iteration 003 media checkpoint (T064 probe, T065 staging, T066 expiry and deletion) with its query layer, host wiring, infrastructure and tests. Claim ownership, abort and shutdown handling, publication, read/deletion races, size limits and orphan reconciliation were traced on both backends. No blocking or major defect was established. One minor cleanup-isolation defect and one note on uncommitted Blob blocks are reported. The controller's governance command succeeded; it is the only command in the evidence, so tests were inspected but not run. T067 onward are open and were not treated as defects. The admin-page delete-now control is planned for iteration 004.

## Findings

| ID | Severity | Relevance | Location | Finding |
| --- | --- | --- | --- | --- |
| `finding-a980a961bcd0f27d` | minor | current | bridge/src/core/access/media/event-media.ts:318 | One failing object removal prevents orphan reconciliation for other objects: collect() continues past individual failures but rethrows the last one at the end. Both sweep() and deleteAll() await collect() before reconcileObjects(), so one tombstoned object that repeatedly fails removal prevents the orphan listing from running at all. Within reconcileObjects() a failed orphan removal also aborts the page, and sweep() leaves #objectCursor unchanged, so later orphans on that page and later pages wait until that object can be removed. The same retained cursor is retried if listing itself rejects it, until the process restarts. Bytes from a late remote commit can therefore outlive retention or delete-now because of an unrelated object's failure. They remain unreadable through EventMedia and the failure is logged or returned, which limits the impact. Run reconciliation even when collect fails, isolate failures per orphan, advance or reset the cursor on failure, then report the collected failure. The existing tests cover a one-time removal failure and successful pagin… |
| `finding-1c91af5fe502227d` | note | current | bridge/src/core/access/media/blob-media-objects.live.ts:50 | Delete-now does not address uncommitted Blob blocks from a failed upload: uploadStream stages blocks before committing the block list. If a clip upload aborts after staging a block, no committed blob exists: deleteIfExists does not discard those blocks and listBlobsFlat is called without includeUncommitedBlobs, so cleanup reports success while Azure retains the partial media until its own uncommitted-block expiry (normally about a week). The bytes are not readable as a blob and no bridge path serves them, so this is a retention limit rather than an access defect. Either record the limit in the retention/delete-now evidence or explicitly discard uncommitted data on failure. This is based on Blob semantics; it was not exercised against live Azure. |

_This Markdown is a controller-generated projection. Authority is the sibling immutable `result.json`._