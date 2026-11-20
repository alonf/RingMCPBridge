---
gate: design-analysis
feature: 001-ring-mcp-bridge
iteration: "001"
from_boundary: design-analysis
to_boundary: plan
verdict_shape: "approved for plan with Option <X>"
---

## What I Just Did

Drafted the iteration 001 design analysis for 001-ring-mcp-bridge after the clarify boundary was approved:
file:///C:/Dev/RingMCPBridge/specs/001-ring-mcp-bridge/iterations/001/design-analysis.md

- Problem framing from the spec and the two clarify answers (H: other owners deploy hybrid on their own cloud subscription; SC-011 is a $30 a month ceiling).
- Five decision points: first-slice scope, topology, when cloud spend starts, the order in which the risky unknowns are tested, and reconciling the quality profile.
- Three options: A (all-in-one first, hybrid in iteration 002), B (hybrid walking skeleton for US1 and US2), C (foundation first, layer by layer).
- The agreed co-design baseline restated unchanged: component map v3 (agreed 2026-10-28, lens closed 2026-10-29, I4 amendment 2026-10-30), every component's job, the armed-Away door-open flow, and the admin and confirm page layouts.
- Logged DRIFT-001-01: the quality resolver marked concurrency, resiliency, and retry/idempotency as not applicable, which contradicts FR-024, FR-042, FR-010/011, FR-044 and FR-013:
  file:///C:/Dev/RingMCPBridge/specs/001-ring-mcp-bridge/iterations/001/drift-log.md

## Why I Stopped

The slicing of v1 into iterations is the owner's decision. It sets when ChatGPT, the dot and Claude first connect, and when the cloud bill starts. Plan cannot be authored until the owner picks an option.

## What Needs Your Review

- The three options, with their cost and timing:
  - A: $0 cloud in iteration 001; agents connect in iteration 002; effort M.
  - B: about $23 a month from iteration 001 (agent-derived from Israel Central list prices read 2026-10-26); agents connect at the end of iteration 001; effort L.
  - C: the bill starts in iteration 001, with nothing usable until iteration 003; effort L+L.
- The baseline restated in the Co-Design Record section of the design analysis. The verdict confirms it unchanged.
- The proposed quality override (DRIFT-001-01), accepted with the verdict unless the owner objects.

## What Happens Next

After the verdict:

1. Record the Human Decision and commit it.
2. Persist this packet.
3. Pass the pre-plan gate.
4. Author plan.md, research.md, data-model.md, contracts/ and quickstart.md for the chosen option, with the quality override applied.
5. Run capacity planning.
6. Run the plan sync and stop again for the plan-boundary verdict.

## Discussion Prompts

1. Is the cloud bill of about $23 a month from iteration 001 acceptable, in exchange for testing every risky unknown first?
2. Should spikes S1 (official Ring API proof of concept) and S2 (one Ring request from the cloud) run alongside iteration 001? They still wait for the owner's separate go.
3. Does the quality override match your intent: at-most-once commands, reconnect and catch-up, and cursors that never skip?

## What I Need From You

The crew recommends Option B. Type one of:

  approved for plan with Option B
  approved for plan with Option <A|C>
  approved for plan with Option B - <your changes>
  changes needed: <what to change>
