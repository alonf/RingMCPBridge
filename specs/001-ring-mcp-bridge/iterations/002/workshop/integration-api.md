# Iteration 002 — integration-api (full)

**Closed**: 2026-11-17, the owner typed "all as recommended" and "move on".

```text
 RING CLOUD --push (ring-client-api's push receiver; "push: off" until now)--> HOME
     ^ history read after a gap (catch-up, through the shared limiter)
 CORE --MCP Events: signed webhook (draft spec, MCP 2026-07-28)--> ChatGPT (the dot, Work mode)
 CORE --listen stream (earlier MCP version)--> earlier-era clients
 CORE <--events/list, subscribe, unsubscribe, get_events-- agents
 RING OFFICIAL API (Spike S1) --> decides iteration 003's path
```

## Decisions (all as recommended)

1. **Ring's push, first contact.** Push has never been switched on in the bridge; in the pilot the push library logged
   "crypto-key is missing", unexplained in the records (research-needed, load-bearing).
   - CP-08b starts with a probe: push on at the home, log which Ring events arrive and which the library rejects, and
     compare with Ring's own history for the same hour. About 0.5 SP, 1 SP of effort (estimate).
   - If push loses events: a periodic history check (for example every 5 minutes) fills what push missed, marked late,
     at one Ring read per location every 5 minutes through the limiter.
2. **MCP Events to ChatGPT.** OpenAI's draft as published: `events/list`, `events/subscribe`, `events/unsubscribe` on
   the MCP endpoint, webhooks signed with Standard Webhooks (HMAC-SHA256), all inside Delivery's ChatGPT adapter. The
   recovery summary goes out as an ordinary event, since ChatGPT supports neither polling nor gap notices. The first
   real subscription answers the security area's research items (callback hosts, who issues the secret).
3. **Earlier-era clients.** A minimal listen stream that meets FR-012, tested with one client.
4. **The dot (CP-21b).** The owner checks that a HIGH event lights the dot and takes stopwatch samples. Research-needed
   first: MCP Events on the owner's ChatGPT plan (the docs found say dots and Work mode), confirmed before building far.
5. **Spike S1 (CP-20).** With the owner's Ring account, try registering an official Ring private app for a non-US
   account. Time-boxed at 1 SP, about 2 SP of effort (estimate). The answer decides iteration 003's path.
