# Tasks for Ring MCP Bridge, iteration 003

The [approved plan](iterations/003/plan.md) allocates 42 points. Each checkbox names its plan work item. Task numbers continue after T063. The [iteration 002 checklist](tasks-iteration-002.md) and [iteration 001 checklist](tasks-iteration-001.md) preserve earlier task IDs, outcomes and open field checks. Paths beginning with `bridge/` or `infra/` are relative to the repository root. Paths beginning with `iterations/` are relative to this feature.

Use the [specification](spec.md), [MCP contracts](contracts/mcp-tools.md), [data model](data-model.md) and [agreed screen and media flow](iterations/003/design-analysis.md). Use failing tests first for engines, parsers and defect fixes. Run the positive and negative cases through the normal entry points. The implementer is Codex and the independent reviewer is Claude.

## 1. Establish the official API capability

The probe is the prerequisite for event media. Test the provider shape in `bridge/test/ring-pilot.test.ts` and confirm correlation with separately authorized field evidence. The existing home connector serves sensors and alarm.

- [ ] T064 [US3] [assigned_to: Implementer] [effort: 3] M01. Prove event correlation and clip playback (spike S7) with the linked account in `bridge/dev/ring-pilot/client.ts` and `bridge/test/ring-pilot.test.ts`. For a consented detection, use a search window after linking. Check source household, camera, event, capture time, JPEG and playable clip. Record pending, missing, and upstream failure separately. If either representation cannot be matched, bring the evidence back for a scope decision. (Trace: FR-014, FR-016, FR-018)

## 2. Stage media and authorize receiver reads

T065 follows T064’s provider correlation check. That check passed for two recorded events. T064 stays open for playback with sound in ChatGPT and Claude. [Iteration 003 evidence](iterations/003/media-evidence.md)

T066 and T067 use T065’s item contract. T068 uses T067’s grant contract. Serialize changes touching shared media storage or contract files. Verify the storage and access tests with `npm test` and `npm run schemas:check`.

- [X] T065 [US3] [assigned_to: Implementer] [effort: 3] M02. Implement private event-item staging in `bridge/src/core/access/media/` and `infra/modules/storage.bicep`. Key by event, camera, representation and audio policy. Record capture time, source and readiness. Publish ready only after the write succeeds. On a duplicate request reuse the matching item. Prove a partial write cannot be served and event delivery proceeds while media is pending. (Trace: FR-014, FR-016, FR-018)
- [X] T066 [US3] [assigned_to: Implementer] [effort: 2] M02. Implement configurable expiry (default seven days), cleanup after failed writes and owner delete-now in `bridge/src/core/access/media/` and `bridge/src/core/managers/admin/admin-manager.ts`. Exercise both storage modes, repeated deletion and a read racing deletion. After deletion or expiry the receiver cannot fetch the item. (Trace: FR-021, FR-037)
- [ ] T067 [US3] [assigned_to: Implementer] [effort: 3] M03. Expose `share_event_media` through `bridge/src/contract/tool-contract.ts` and `bridge/src/core/clients/mcp-endpoint/`. Test the published flat schema and calling client’s scope, rate limit, camera switch, household and event match. Resolve a registered receiver. Return pending for the same item or issue a five-minute, item-specific grant only when ready. Return an authenticated bridge link. Test that cached hits enforce the same policy. (Trace: FR-018, FR-020, FR-026, FR-030)
- [X] T068 [US3] [assigned_to: Implementer] [effort: 2] M03. Serve GET and Range in `bridge/src/core/clients/web/`. Require the receiver’s own credential, matching item grant, current camera permission and approval generation on every new request. Test expiry at the boundary, withdrawal during transfer, reapproval, repeated removal and unavailable authorization state. Limit upstream redirects to permitted destinations. Audit access by identifier and check logs for content or credentials. (Trace: FR-018, FR-020, FR-030, FR-034, FR-035)

## 3. Deliver event photos and clips through the approved household settings

T069 uses T067–T068. T070 exercises T064–T069 together and is the first milestone. T071 and T072 extend direct camera reads after that milestone, with T071 providing the limiter and session handling for T072. Verify settings with `npm run test:pages` and the two-identity scenario with `npm test` plus the real event.

- [ ] T069 [US8] [assigned_to: Implementer] [effort: 3.5] M04. Implement the approved household settings screen in `bridge/src/core/clients/web/` with `bridge/src/core/access/settings/settings-store.ts`. Display the selected household, camera, registered receiver, camera access and sound setting. A single approval covers photos and clips. Persist changes across restart and invalidate prior grants on withdrawal. In `bridge/test/pages/admin-page.spec.ts` exercise owner sign-in, unauthorized access and changing one camera without changing another. Preserve the shared-home media default. (Trace: FR-020, FR-036, FR-039)
- [ ] T070 [US3] [assigned_to: Implementer] [effort: 2] M05. Drive the end-to-end pilot through a separate test receiver in `bridge/test/scenarios/` using the [pilot procedure](quickstart.md#iteration-003-acceptance-run-planned). From a real detection, have the MCP client request both items and the receiver fetch the matching JPEG and playable clip with its own credential. Exercise wrong receiver, wrong camera, wrong item, expiry, withdrawal between range reads and reapproval. Keep raw bytes private and record sanitized evidence in `iterations/003/quality/quality-evidence.md`. (Trace: FR-016, FR-018, FR-020)
- [ ] T071 [US3] [assigned_to: Implementer] [effort: 2] M06. Implement `get_frame` and `get_burst` through `bridge/src/core/clients/mcp-endpoint/` and `bridge/src/connector/`. Return a frame of at most 1280 px with capture time, age and source. Exercise cached, fresh, unmet freshness and unavailable responses. Collect 5–8 frames in one bounded session. Test camera and per-agent hourly caps under concurrency, cache fallback and the shared Ring limiter. A battery camera starts live capture only on explicit request. (Trace: FR-016, FR-017, FR-019, FR-026, SC-008)
- [ ] T072 [US3] [assigned_to: Implementer] [effort: 2] M06. Implement direct `get_clip` in `bridge/src/connector/` and `bridge/src/core/clients/mcp-endpoint/`. Exercise event and finite-duration capture, key frames, authenticated playback, limits, timeout cleanup and per-camera sound suppression. Check that a cached clip with audio cannot satisfy a muted request. The delegated receiver contract covers event media only. (Trace: FR-018, FR-019, FR-020, FR-026, SC-008)

## 4. Apply household event and client push preferences

After T069, implement T073 using the same settings page and persistence. Verify through a subscription and paged history in `npm test`.

- [ ] T073 [US2] [assigned_to: Implementer] [effort: 3.5] F01. Wire household settings and `set_push_filter` to the policy and delivery path in `bridge/src/core/access/settings/settings-store.ts`, `bridge/src/core/engines/classify/` and `bridge/src/core/clients/mcp-endpoint/`. Cover household sensor type and individual camera by event kind, client sensors/priorities, and push/store only/drop. Verify with two households and clients that client preferences can narrow household permission and that retained history remains readable when push is muted. Test shared defaults (drop cameras, store sensors, owned-home alarm handling) and source household identity on multi-home events. (Trace: FR-008, FR-009, FR-010, FR-011, FR-036)

## 5. Answer motion and history queries and report low batteries

T074 can run alongside the isolated T064 pilot work. T075 follows T073 so it can apply stored preferences. Serialize edits to inquiry contracts, settings and scheduler wiring when their paths overlap. Verify with fixed-clock tests using `npm test`.

- [ ] T074 [P] [US1] [assigned_to: Implementer] [effort: 3] Q01. Implement `get_motion` and `get_history` in `bridge/src/core/managers/inquiry/` and `bridge/src/contract/inquiry-tools.ts`. Use fixed clocks to verify motion while disarmed, time-window boundaries, active rooms, unknown occupancy, and empty results. Page device and household history, including recorded control entries, across equal timestamps. Verify no gaps or cross-household results. (Trace: FR-003, FR-004)
- [ ] T075 [US1] [assigned_to: Implementer] [effort: 2] Q02. Implement battery threshold settings and alerts in `bridge/src/core/access/settings/settings-store.ts` and the digest in `bridge/src/core/clients/scheduler/`. Test default 20%, device overrides, Ring’s low flag, recovery, a second crossing, duplicate readings and restart. Advance a fake clock to verify periodic digest delivery and client preferences. Record the selected digest period with the test. (Trace: FR-007, FR-010)

## 6. Verify delivery, collect field evidence and review

T076 follows T073 and exercises the real delivery stack. T077 can begin with existing field evidence and run alongside development. T078 reviews the implementation and available verification evidence. T079 follows the review disposition. Use the quality evidence record to reproduce checks.

- [ ] T076 [assigned_to: Implementer] [effort: 2] V01. Extend `bridge/test/host/event-path.test.ts` and `bridge/test/mcp-endpoint/events.test.ts`. Measure receive-to-push p95 against 0.5 seconds. Kill and restart a process and drop the home link with two readers. Verify recovery from each cursor, oversized deliveries, refusal without read scope, signature verification and unsubscribe. Count duplicates by event ID. (Trace: FR-010, FR-011, FR-030, FR-042, SC-001, SC-002)
- [ ] T077 [P] [assigned_to: Implementer] [effort: 2] V02. Collect owner-observed evidence in `iterations/003/quality/quality-evidence.md`. For T049 measure trigger-to-visible notification against the HIGH and MEDIUM ceilings. For T056 record Azure evaluation and receipt of both alert channels, retaining the existing SMS evidence and keeping email open until received. For T061 record clocks, seven consecutive days without manual re-login, and the actual month-end bill against $30. Obtain separate authorization before any physical test or operational change. Keep unavailable observations open. (Trace: FR-010, FR-042, FR-043, SC-001, SC-003, SC-010, SC-011)
- [ ] T078 [assigned_to: Reviewer] [effort: 3] RV. Review the exact implementation commit independently as Claude and record findings in `iterations/003/review.md`. Inspect negative authorization, concurrent reads, retries, staged-media cleanup, degradation, and the pilot evidence. Check `npm run typecheck`, lint, schemas, dependency and secret checks, tests and coverage. Distinguish outstanding field evidence from passed tests. (Trace: FR-018, FR-020, FR-030, FR-034, FR-035)
- [ ] T079 [assigned_to: Implementer] [effort: 4] RW. Use the rework reserve for accepted findings. Add a failing regression first, fix the owning component, rerun affected tests and applicable pilot assertions, and link evidence and the reviewed commit in `iterations/003/quality/quality-evidence.md`. If review needs no changes, record the disposition and unused points. Return scope changes to the owner. (Trace: FR-018, FR-020, FR-030, FR-042)

## Bidirectional traceability

| In-scope requirement or criterion | Covering tasks |
| --- | --- |
| FR-003 | T074 |
| FR-004 | T074 |
| FR-007 | T075 |
| FR-008 | T073 |
| FR-009 | T073 |
| FR-010 | T073, T075, T076, T077 |
| FR-011 | T073, T076 |
| FR-014 | T064, T065 |
| FR-016 | T064, T065, T070, T071 |
| FR-017 | T071 |
| FR-018 | T064, T065, T067, T068, T070, T072, T078, T079 |
| FR-019 | T071, T072 |
| FR-020 | T067, T068, T069, T070, T072, T078, T079 |
| FR-021 | T066 |
| FR-026 | T067, T071, T072 |
| FR-030 | T067, T068, T076, T078, T079 |
| FR-034 | T068, T078 |
| FR-035 | T068, T078 |
| FR-036 | T069, T073 |
| FR-037 | T066 |
| FR-039 | T069 |
| FR-042 | T076, T077, T079 |
| FR-043 | T077 |
| SC-001 | T076, T077 |
| SC-002 | T076 |
| SC-003 | T077 |
| SC-008 | T071, T072 |
| SC-010 | T077 |
| SC-011 | T077 |

All 16 tasks trace to the [specification](spec.md). All 29 in-scope references have a task. Estimates sum to 42 points across the 13 approved work items. T069 covers US8 settings and the US3 camera approval flow. T073 covers US2 delivery and US8 household rules. T075 covers US1 health and US2 delivery.

Coverage describes planned work. FR-035 here covers identifier-only media-access evidence. The full audit chain and SC-009 remain later work. FR-039 covers the owner settings changes. The control-specific slices of FR-022 through FR-025 and FR-035 carry forward under the approved seven-point deferral. Receiver live view, recognition and Alexa announcements are outside this milestone.
