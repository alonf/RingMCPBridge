# Iteration 002 — devops-operations (light)

**Closed**: 2026-11-17, the owner typed "Yes, and yes" and "move on".

```text
 FR-043 (in part, CP-18): alert the owner by email and SMS, outside the bridge, when
   - no heartbeat is seen for 10 minutes
   - the home is offline for more than 10 minutes
   - the Ring session is lost                       (added by the owner's second "yes")
   + from component-design: events have waited at home for more than about 5 minutes
 how: one Azure Monitor log alert rule, checked every 5 minutes -> an action group
      (the owner's email and phone, kept in the local parameters file, never in git)
 cost: the rule about $1.50 a month; email and SMS a few cents (feature plan, 2026-10-26)
 SC-010: an alert within 15 minutes of the bridge stopping
 shipping: the same deploy as iteration 001 (the GitHub workflow for the core, the image
   update on the home VM); the new tables arrive as add-only migrations
```

## Decisions

- **The alerts as proposed, in one rule** (the owner: "Yes").
- **The Ring-session-lost alert is added now** (the owner: "yes"). FR-043 lists it; the feature plan had placed it in a
  later iteration. It is the failure the 7-day soak (SC-003) watches for, and it shares the same rule.
- **Research-needed:** whether Azure Monitor's SMS reaches an Israeli number (+972). If it does not, email plus a push
  through the Azure mobile app is the fallback.
