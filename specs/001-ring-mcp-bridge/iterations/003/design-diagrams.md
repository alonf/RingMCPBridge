# Iteration 003 review diagrams

## Event media handoff

```mermaid
sequenceDiagram
    participant O as Owner
    participant C as MCP client
    participant B as Bridge
    participant R as Ring
    participant P as Private media store
    participant S as Registered receiver
    O->>B: Approve S for household and camera
    B-->>C: Detection with event and source identity
    C->>B: Request event item for S with client credential
    B->>R: Fetch the matching photo or clip
    B->>P: Stage once and publish ready metadata
    B-->>C: Item reference and five-minute grant for S
    C-->>S: Pass item reference
    S->>B: GET with receiver identity and item grant
    B->>B: Check recipient, item, expiry, approval generation and camera switch
    B->>P: Read private item
    B-->>S: Deliver bytes
    O->>B: Withdraw approval
    S->>B: New GET or Range
    B-->>S: Deny
```

The original event is independent of item readiness. The client retries a pending request for the same event. A later reapproval creates a new generation; an issued grant cannot regain access. [Design](design-analysis.md)
