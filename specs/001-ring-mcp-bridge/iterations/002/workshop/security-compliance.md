# Iteration 002 — security-compliance (medium)

**Closed**: 2026-11-17, the owner typed "agree to all" and "move on", after asking two questions (below).

## What is new in iteration 002

```text
 ChatGPT --subscribe(callback URL, its token)--> CORE   (only a listed agent, read scope)
 CORE --signed POST(event)--> callback URL               <- new: the core calls out
 Ring text inside the event -> marked untrusted          (as in the reads)
 HOME: push credentials in the encrypted secrets file    (as decided, SC4)
```

## Decisions

1. **Untrusted text in pushed events.** The owner asked: "Ring is a reliable source - why is it untrusted?"
   - The answer given: "untrusted" means text is treated as data, never as instructions. Device, room and location
     names can be set by anyone on the Ring account, and camera-derived text (if it ever reaches the bridge) can carry
     words a person shows the camera. With push, ChatGPT can act on an event without the owner in the conversation.
   - Decided: an event's own fields (kind, priority, device id, time) stay in the bridge's words; Ring-sourced text goes
     only in the part marked untrusted, as in the reads (feature T1).
2. **Callback addresses.** The owner asked: "Do we want to use APIM?"
   - The answer given: APIM Consumption would cost about $0 a month at a home's volume (1 million calls a month free,
     then about $3.50 per million, third-party figure, estimate). But the new risk is outbound, and APIM is mainly an
     inbound gateway; the destination rule would still have to be written. It would add a resource, a hop and a second
     place for rules, and its Consumption limits for long streams were not confirmed.
   - Decided: no APIM in iteration 002; revisit if the bridge serves several homes or needs a public gateway.
   - Decided: the core's callback calls reuse the bounded fetch from DRIFT-001-86: HTTPS only, private and special-use
     addresses refused, short timeouts and size limits. Only listed agents with `read` can subscribe.
   - Research-needed (load-bearing, in the integration area's MCP Events test): whether ChatGPT's callbacks come from a
     fixed set of hosts that could be allow-listed, and who issues the signing secret.
3. **The home's push credentials** (the owner: "ok"): stay in the encrypted secrets file, never logged; re-registering
   Ring's push is a Setup CLI step only.
4. **Subscriptions and revocation** (the owner: "ok"): reading events needs `read`; each client sees only its own
   cursor and subscriptions; revoking an agent ends its subscriptions, and its webhooks stop at once.
