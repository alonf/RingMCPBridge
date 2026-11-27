# Review Result

- **Campaign**: `cmp-001-ring-mcp-bridge-i001`
- **Run**: `run-20261110-071004856-9c5b0f5d`
- **Harness**: `codex-cli-file-primary`
- **Target digest**: `a9ba0c503cd2eb545d2a58880edaba41314cb049`
- **Completion**: `complete`
- **Verdict**: `findings`
- **Runtime outcome**: `completed`
- **Currentness**: `current`
- **Can approve current snapshot**: `false`

## Summary

Completed risk-based inspection of the frozen target, covering authentication and enrollment, MCP and connector boundaries, storage and freshness, Ring ingestion and recovery, secrets, single-instance startup, and deployment/verification configuration. Found two major defects: failed inventory writes can leave outdated data marked cached, and the two home run modes do not share an ownership guard. Controller evidence records success for the sole declared verification command (specrew-governance); it supplies no test-result counts. No tests or builds were run during this review.

## Findings

| ID | Severity | Relevance | Location | Finding |
| --- | --- | --- | --- | --- |
| `finding-c7105b45a119179f` | minor | current | bridge/src/connector/managers/ingest/ingest.ts:247 | Report freshness debt when a refreshed inventory cannot be queued: [demoted to minor: no concrete failure scenario, so it cannot gate; reported as major by the reviewer] After a healthy session has stored its initial inventory, adding or removing an alarm device triggers #readAgain and then #queueInventory. If the refreshed inventory cannot be appended to the outbox, for example because the disk is full, this branch sets #inventoryOwed but never sets #owedAfter. Only the separate #stateNotQueued path records that versioned debt. sendHeartbeat therefore continues sending inventory_owed_after:null while the Ring session remains ok. EventManager and HealthEngine do not treat the error count or unavailable outbox depth as stale, so the core continues returning the old device inventory as cached with an advancing as_of for as long as the write outage lasts. Record freshness debt for failed inventory writes as well as failed device-state writes, and clear it through the existing session-inventory recovery path. Cover an add/remove notification followed by a… |
| `finding-26522e3107517896` | minor | current | bridge/src/host/all-in-one.ts:215 | Use a shared ownership guard for both home run modes: [demoted to minor: no concrete failure scenario, so it cannot gate; reported as major by the reviewer] All-in-one mode protects bridge.db with its lease but opens outbox.db without exclusive:true, whereas connector mode acquires an exclusive outbox lock and never checks that lease. Start all-in-one mode, then start connector mode against the same BRIDGE_DATA_DIR while the outbox is between transactions: the connector can acquire its lock and open the same Ring identity even though all-in-one still holds a valid lease and an active Ring connection. The connector then blocks all-in-one's outbox operations, and both processes can independently rotate and overwrite the same saved Ring token. This defeats the single-instance guarantee and can interrupt ingestion or require a new Ring login. Both modes need the same ownership guard, acquired before opening Ring; add a mixed-mode startup regression check in both orders. The existing same-mode lease and connector-lock checks do not cover this … |

_This Markdown is a controller-generated projection. Authority is the sibling immutable `result.json`._