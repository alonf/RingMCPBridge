# Design Analysis: Iteration 003

## Applicable Lenses

- **requirements-nfr**
  - Addressed: Acceptance requires the receiver to fetch a photo and a clip under one camera approval. Check the capture time against the detection.
- **architecture-core**
  - Addressed: The bridge mediates access between Ring, the requesting MCP client, and the separately authenticated receiver.
- **integration-api**
  - Addressed: The client passes an item URL to the approved service. The receiver presents its own identity when it fetches the item.
- **security-compliance**
  - Addressed: Each grant is scoped to one media item and one receiver. Grant lifetime and withdrawal behavior are plan-time questions.
- **data-storage**
  - Addressed: The approval belongs to a household, camera, and receiving service. The media item belongs to its source camera and event, regardless of where the bytes are stored.
- **observability-resilience**
  - Addressed: If event media is still being prepared, the client retries the same event. The capture timestamp lets the receiver check which detection it received.
- **devops-operations**
  - Addressed: The pilot can verify the handoff with a separately authenticated test receiver before a recognition service is available.
- **ui-ux**
  - Addressed: Household settings expose one approval per camera and receiving service, covering photos and clips together.
- **component-design**
  - Addressed: The map below assigns detection to the camera, event delivery and authorization to the bridge, orchestration to the client, and retrieval to the receiver.
- **code-implementation**
  - Addressed: Exercise the receiver-facing fetch with its own credentials. Test denial for another identity, an unapproved camera, another item, and an expired grant.

## Co-Design Record

### Component-to-responsibility map

| Component | Responsibility |
| --- | --- |
| Ring camera | Reports the detection and provides the source media. |
| Ring MCP Bridge | Delivers the event to the MCP client, identifies the requested photo or clip, and enforces the owner’s approval when issuing and checking a grant. |
| Household settings | Let the owner approve a receiving service for a specific camera in that household. |
| MCP client | Uses the detection to request a photo or clip and passes the item’s URL to the approved receiver. |
| Approved receiver | Authenticates with its own service identity and uses the short-lived grant to fetch the selected item. |

### Agreed flow

A camera reports a detection. The bridge sends the event to the MCP client. The client requests a photo or clip from that event for the approved receiver and passes the URL to it. The receiver authenticates as itself. The bridge checks that the grant is valid for that receiver and item before serving the media.

### Decision

One owner permission per household, camera, and receiving service covers both photos and video clips. For each fetch, the receiver uses its own service identity and a short-lived grant scoped to the selected item.

**Human-agreed**: yes. On November 22, 2026, the owner replied “Agree” to approving each receiving service once per camera in household settings. When asked whether clips needed separate approval, the owner replied “Yes, a single approve for both Video and photos”. On November 23, 2026, the owner closed the discussion with “move on”.

[Supporting note: Camera media handoff](workshop/integration-api.md)

#### Not decided here

Ask the owner at plan time:

- How long should a grant live?
- What should happen to outstanding grants when the owner withdraws an approval?
- Does the handoff include live view, or only event photos and clips?

## Human Decision
