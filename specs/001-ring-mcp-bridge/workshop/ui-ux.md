# UI & UX — Ring MCP Bridge

**Depth**: Light.
**Status**: CLOSED 2026-10-28. The human said "move on" after the lens summary. Confirmation: human-confirmed, scope lens-question, per decision point U1-U5 (answered 2026-10-26).
**Inputs**:
- `security-compliance.md`: SC1 (the confirm page with a fresh Entra sign-in and the same-user check, a MUST; the admin page next to it), SC2 (connector enrollment by comparing a code), SC3 (control per client, disarm off by default, shared locations), SC4 (PIN, lockout), SC5 (the audit copy for the admin page), SC7 (per-camera switches, sound, owners' agreements, delete-now, platform privacy links, the clip player if S7 needs it);
- `integration-api.md`: the disarm sequence (URL elicitation, the page, PIN, result), the error and outcome states;
- `observability-resilience.md`: a health panel with the get_health data;
- `devops-operations.md`: "connector behind" on the admin page.

## Carried in

- Most of the bridge's UX is the agents' chat; the bridge owns only two small web surfaces, both served by the core: the **confirm page** (disarm) and the **admin page** (you only).
- Both need a fresh Entra sign-in (SC1). The confirm page is opened from an agent's link, usually on a phone.
- The admin page reads and writes through the managers, never the tables directly (DS6).

## Decision points U1-U5 (from the lens; 2026-10-26, proposals awaiting the human)

- **U1 Source of UX truth and technology.** No design assets exist; text intent and the sketch below are the source. Plain server-rendered HTML with a small stylesheet and a little script, no front-end framework and no build step ("no new dependency" first). Phone-first, because the confirm page opens on a phone.
- **U2 Journeys and recovery.**
  - disarm: the agent's link, a fresh sign-in, the plan summary, the PIN, the result;
  - first setup: sign in, enroll the connector (compare the code), set the PIN, check each agent's scopes;
  - a daily glance: health;
  - an incident: revoke one agent or all, or delete cached media and events now;
  - watching a clip, only if S7 shows the agents' apps cannot.
- **U3 Data and state.** All state lives on the server; nothing important in the browser. Pages are rendered on the server. The health panel refreshes every 15 s while it is open (plain polling, no browser WebSocket). The audit is paged and filtered on the server.
- **U4 Loading, error, offline and confirmation states.** A banner when something is down (home offline, Ring session lost, database down) says what it means and what to do. Every value shows its `as of`. Destructive or risky actions (revoke all, delete now, turning disarm on, enrolling a new connector) need a sign-in under 5 minutes old and a typed confirmation. The confirm page shows a countdown and plain reasons: expired, already used, wrong PIN (tries left), locked for 15 minutes, home offline, outcome unknown (check the state).
- **U5 Accessibility, language, theme.** English in v1. Semantic HTML, keyboard use, readable contrast, large touch targets; light or dark follows the device. Hebrew and right-to-left are a question to the human.

**The layout sketch (the lens diagram):**

```text
 ADMIN PAGE (you only, after a fresh Entra sign-in; served by the core)
 +-------------+-----------------------------------------------------------------------+
 | Health      | HEALTH                                    as of 14:02:10   [Refresh]  |
 | Agents      |  Home link    OK     connected 3 days                                 |
 | Cameras     |  Ring         OK     session 6 days old                               |
 | Locations   |  Push         OK     last event 14:01:55                              |
 | Data        |  Database     OK     0.3 of 2 GB                                      |
 | Audit       |  Connector    v1.4   core is v1.5: pull the new image at home         |
 | Settings    | ! A banner when something is down: what it means, what to do next     |
 +-------------+-----------------------------------------------------------------------+
  Agents:    each agent with platform, scopes, last seen, its control switch, [Revoke];
             [Enroll connector] shows the code to compare with the VM; [Revoke all]
  Cameras:   per camera: media to agents on/off, keep sound on/off, battery cap an hour
  Locations: shared ones off or read-only; the owner's agreement (who, date)
  Data:      [Delete cached media and events now]; the retention periods
  Audit:     newest first, filter by kind and agent, paged on the server
  Settings:  disarm on/off (off by default), set or change the PIN, light auto-off
             default, links to each platform's training and memory settings
  Clips:     a player, only if S7 shows the agents' apps cannot play clips

 CONFIRM PAGE (on your phone, from the agent's link; disarm only)
 +----------------------------------+
 | Ring MCP Bridge                  |
 | Signed in as you (fresh sign-in) |
 |                                  |
 | ChatGPT (the dot) asks to:       |
 |   DISARM   Home                  |
 |   Monitoring: on                 |
 |   Expires in 1:42                |
 |                                  |
 | PIN  [ ****** ]                  |
 |                                  |
 | [ Cancel ]          [ Disarm ]   |
 +----------------------------------+
 Then "Disarmed at 14:03", or a plain reason: expired, already used, wrong PIN
 (4 tries left), locked for 15 min, home offline, or outcome unknown (check the state).
```

## Evidence tags

- **Known:** the surfaces and their contents come from the confirmed lenses listed in Inputs.
- **Assumed:** the agents' apps open the confirm-page link in the phone's browser; S7 checks it per client.
- **Assumed:** server-rendered pages need no front-end dependency; code-implementation confirms the template approach.

## The human's answers (2026-10-26)

Verbatim:

> 1. I really like dark theme, but make it dark/light switchable. Have a modern slick look, desing for both the phone (I have a Galaxy Fold 6 phone - teo modes - folded and wide) and the PC.
> 2. English is OK
> 3. No

**Decided (human-confirmed, lens-question, U1-U5):**
- **U1 Look:** dark by default, with a dark/light switch remembered per browser (a per-viewer convenience, not durable state). A modern, slick look: the bridge's own small design system (colour, spacing and type tokens as CSS variables; cards; clear status badges), still plain server-rendered pages with no front-end framework ("no new dependency" first; code-implementation may revisit).
- **U1 Devices:** designed for three widths: the Galaxy Z Fold 6 folded (the narrow cover screen: one column, a menu button), unfolded (the near-square inner screen: a side menu and content), and the PC (a side menu, card grid and full-width tables). Responsive by width, so unfolding mid-task keeps the page state (the confirm page's countdown and typed PIN).
- **U2-U4:** as proposed (journeys, server-side state and paging, banners, `as of`, a sign-in under 5 minutes old plus a typed confirmation for risky actions, the confirm page's plain reasons).
- **U5:** English only in v1; keyboard use, readable contrast in both themes, large touch targets; status as a word and an icon, never colour alone.
- Nothing is missing from either page (answer 3).

**The as-decided layout (in addition to the page sketch above):**

```text
 ONE LAYOUT, THREE WIDTHS (dark by default; [Theme] switches dark/light, remembered)

 FOLD, FOLDED (cover)    FOLD, UNFOLDED (inner, near square)   PC (wide)
 +--------------------+  +---------------------------------+  +-------------------------+
 | Bridge [Theme] [=] |  | Bridge          [Theme]  you    |  | Bridge  [Theme] you Out |
 |--------------------|  +---------+-----------------------+  +--------+----------------+
 | HEALTH    14:02:10 |  | Health  | HEALTH       14:02:10 |  | Health | HEALTH 14:02:10|
 | Home   OK   3 d    |  | Agents  | Home    OK   3 d      |  | Agents | cards in a     |
 | Ring   OK   6 d    |  | Cameras | Ring    OK   6 d      |  | Camera | grid: home,    |
 | Push   OK   14:01  |  | Places  | Push    OK   14:01    |  | Places | Ring, push, DB,|
 | DB     OK  0.3/2GB |  | Data    | DB      OK   0.3/2 GB |  | Data   | connector;     |
 | Conn v1.4: update  |  | Audit   | Connector v1.4:       |  | Audit  | tables use the |
 |                    |  | Setting |  pull the new image   |  | Settng | full width     |
 | [=] opens the menu |  +---------+-----------------------+  +--------+----------------+
 +--------------------+
 The confirm page is one narrow column at every width; unfolding the phone mid-way keeps
 the countdown and what you typed. Status shows as a word and an icon, never color alone.
```

**Carry-forwards:**
- **code-implementation:** server-side templates and the CSS tokens ("no new dependency" first); visual smoke checks at the three widths in both themes.
- **Pilot:** check both pages on the Fold 6, folded and unfolded, and on the PC; check that the agents' apps open the confirm-page link in the phone's browser (S7).

## Questions to the human

1. Do you have a look to follow (for example Fluent UI, or one of your apps), or is plain and clean enough?
2. Hebrew or right-to-left in v1, or English only?
3. Is anything missing from the admin page or the confirm page?

## Pacing

The lens has 5 decision points (light depth). The agent offered all at once or one at a time; the human answered all at once. The agent presented the as-decided layout and asked whether to change anything or move on.

## Lens closed

2026-10-28: the human, verbatim: "move on". Lens 8 is closed; next is lens 9, component-design (full).
