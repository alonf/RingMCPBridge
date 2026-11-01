# Code & Implementation — Ring MCP Bridge

**Depth**: Medium.
**Status**: CLOSED 2026-11-01. The human said "move on" after the lens summary. Confirmation: human-confirmed, scope lens-question, per decision point (I1-I8). Still open after the close: questions 15 and 16 (the two permissions). Opened 2026-10-29. Lens 10 of 10, the last lens. I1 is decided ((a), 2026-10-29) and I2 is decided (as proposed, 2026-10-30). I3 is decided (exceptions, confirmed 2026-10-30). I4 is decided (as proposed, 2026-10-30). I5 is decided ((b), 2026-10-30). I6 is decided (as proposed, with devEngines, 2026-11-01). I7 is decided (as proposed, with `#private` and SQLite posture (a), 2026-11-01). I8 is decided (codex, 2026-11-01). Closed on "move on" (question 17, 2026-11-01).
**Context scope**: `feature_standalone` (V1). The rules are mostly product-level, so later features inherit them.

## Carried in

- **The stack (architecture-core B2):** TypeScript on Node everywhere, MCP TS SDK v2. The DI container choice was deferred here (P8).
- **component-design:**
  - the DI container (P8);
  - the CI dependency check (CD4: each component's one entry file; the Link transport knows no Ring or bridge words) and the "no GUID under infra/ or scripts/" check;
  - the validation library for the edge parsers and the brands (CD4 Q2);
  - publishing the Public Contract as JSON Schema, and the MCP schema snapshot test;
  - the query layer for SQLite and T-SQL.
- **data-storage:** the SQL Server driver with managed-identity sign-in from Node (assumed to work); the query layer and migrations for both dialects ("no new dependency" first).
- **observability-resilience:** the structured logger and its redaction (IDs, not content); passing the correlation IDs through the link messages.
- **devops-operations:** the secret-scan tool and the pre-commit hook; the CI job names behind the required checks.
- **ui-ux:** server-side templates and the CSS tokens ("no new dependency" first); visual smoke checks at the three widths in both themes.
- **The human's background (architecture-core):** C# is the human's strongest language; the .NET core was the runner-up and was not chosen.

## The lens at a glance (proposal)

```text
 LENS 10: HOW THE CODE IS WRITTEN (decided now, used while coding)

 NOW, IN THIS LENS                                 LATER, AT IMPLEMENT
 I1 your source of truth: a coding guideline,      the coding agent picks up a task
    an example project, or Specrew's defaults                    |
 I2 the stack posture: TypeScript on Node (B2);                  v
    the Node and TS versions (checked on the web),  the specrew-code-rules skill reads
    strict mode, modules, lint and format           implementation-rules.yml and shows
 I3 error handling inside the code                  only the rules for that task
 I4 the testing posture                                          |
 I5 the code layout: one package or workspaces                   v
 I6 dependencies: "no new dependency" first;        review checks the code against the
    each new one recorded (version, license,        recorded decision, by rule id
    upkeep, advisories, how easy to replace)
 I7 the baseline: 19 default rules, pre-checked;
    you name only the exceptions
 I8 who reviews the code (a second AI host)
          |
          v
 specs/001-ring-mcp-bridge/implementation-rules.yml  +  workshop/code-implementation.md

 Already settled by earlier lenses, carried in, not asked again: 17 of the catalog's
 choices (IDesign layers, edge mapping, retries, logging, outbox and lease, the MCP
 contract, authorization, cursors, protocols, Pub/Sub, caching, validation at edges).
```

## Decision points I1-I8 (from the lens; 2026-10-29, proposals awaiting the human)

- **I1 Source of code-rules truth.** Is there a coding guideline, or one or more example projects (a GitHub repo, a local path), to emulate for style, constructs and patterns? If so, the agent reads it and maps it onto the catalog (matches checked, conflicts flagged, other conventions recorded as custom rules with their source). If not, Specrew's defaults apply.
- **I2 The stack posture** (`code-rule.ts.strictness-posture`, `code-rule.lts-version-check`, `code-rule.type-inference-deliberate`): the Node LTS and TypeScript versions, checked on the web at this lens; strict mode; ES modules; formatting and linting.
- **I3 Error handling** (`code-rule.idiomatic-error-handling`): exceptions or result values inside the code, and where they turn into D7's error codes.
- **I4 The testing posture** (`code-rule.testing-posture`): test-first or not; the test runner; fakes for the four test-only seams (CD3); snapshot tests; what runs in CI and what runs only in the pilot.
- **I5 The code layout** (`code-rule.shared-code-packaging`): one package with two modes (CD3), plus the channel shim and the Public Contract: one npm package with several entry points, or npm workspaces.
- **I6 Dependencies (FR-013):** "no new dependency" first. Each new one records its version, license, source, upkeep, advisories, compatibility, cost, coupling, how easy it is to replace, and test impact. The open ones are the carried-in items above.
- **I7 The baseline:** the 19 baseline-default rules, pre-checked; the human names only the exceptions. The lighter choices (copy semantics, concurrency on the event loop, Strategy/State, collection style, performance evidence) are proposed with the baseline.
- **I8 The code reviewer:** which second AI host reviews the code. The agent runs `specrew review --list-hosts` (read-only) and shows its output before asking.
  - Recording the pick runs `specrew review --host <pick> --authorization-ref workshop-001-ring-mcp-bridge`, which writes `.specrew/reviewer-hosts.json`. The agent asks before running it, under the human's "no scripts or config during the workshop" rule.

## Already settled by earlier lenses (carried into the manifest; not asked again)

- `code-rule.complex-code-stable`: IDesign engines hold the rules and do no I/O (CD2).
- `code-rule.anti-corruption-layers`: Ring payloads are mapped in Normalize, a tolerant reader; each component owns its DTOs (CD4).
- `code-rule.polymorphism-mechanism`: a TS type taken in the constructor; no base classes (CD3, CD5).
- `code-rule.extension-points`: composition at start, policy as data, no plugins (CD5).
- `code-rule.careful-retries`: reconnect backoff 1-30 s with jitter; commands never retried (OR5).
- `code-rule.logging-traceability`: structured JSON logs, IDs not content, correlation IDs end to end (OR1, OR2). The logger itself is an I6 dependency.
- `code-rule.robustness-state-boundaries`: the outbox, at least once for events, at most once for commands, the lease, the circuit (D4, OR4, OR5).
- `code-rule.api-service-design` and `code-rule.public-api-reusable-design`: the D7 tools, the error envelope, the D2 additive rule, the Public Contract.
- `code-rule.authz-security-context`: scopes, client-bound one-time tokens, the disarm gate, a fresh sign-in (security-compliance).
- `code-rule.write-conflict-semantics`: commands at most once, under the single-instance lease (D4, B7).
- `code-rule.collection-query-semantics` and `code-rule.pagination-delivery`: cursors by seq, never skipping (D7, D8).
- `code-rule.protocol-choice`: MCP over HTTPS, the WSS link dialed out from home, platform webhooks.
- `code-rule.messaging-event-processing`: Pub/Sub for queued manager calls; the outbox; dedupe on event_id (CD2, D4).
- `code-rule.cache-boundaries`: the Media Cache (7 days) and Capture's max_age_s; no cache used to communicate.
- `code-rule.validation-boundaries`: validation at the edge parsers, which apply the brands (CD4 Q2). The library is an I6 dependency.

## Context rules that apply here (shown with the checklist, not asked separately)

- `code-rule.never-block-event-loop` (Node): ffmpeg and argon2id work stays off the event loop.
- `code-rule.render-purity` and `code-rule.rendering-hosting-model`: server-rendered pages (ui-ux U1).
- `code-rule.ui-controls-prevent-invalid-input`: the PIN field on the confirm page.
- `code-rule.framework-validation`: one schema system for the edge parsers and the published JSON Schema.
- `code-rule.vendor-neutral-observability`: OR1 chose structured logs to Log Analytics; OpenTelemetry is not in v1 (to confirm with the checklist).
- `code-rule.technology-enabler-shortlist`: no Dapr, Temporal or similar; settled by the topology.
- Not applicable: `code-rule.cncf-maturity` (App Service, not Kubernetes).

## The human on I1 (2026-10-29)

**The human, verbatim:** "I do not have any cosing standard for Node JS and TypeScript, check the web to see if the best appraoch. Check if Specrew default is updated and correct"

**The agent's reading:** there is no guideline and no example project. The human asks for two things: the current best approach for TypeScript on Node, and a check of whether Specrew's defaults are current and correct. The human did not pick a pace for I2-I8, so the agent continues one at a time, as in lens 9.

## Research: the best approach, and Specrew's defaults (2026-10-29)

**What the web shows (evidence tags):**
- **Node** (known, nodejs.org):
  - Node 26 became LTS on 28 Oct 2026; Node 24 and Node 22 are still LTS.
  - From Node 27, Node ships one major release a year.
  - Node's own TypeScript support (type stripping) is marked stable in the official docs. It runs only erasable syntax and ignores tsconfig.
- **TypeScript** (known, the TypeScript team's blog):
  - 6.0 (23 Mar 2026) was the last compiler written in JavaScript.
  - 7.0 (8 Jul 2026) is the Go compiler. Its new defaults: strict on, module esnext, types [], and rootDir ./. Removed: node10 and classic resolution, baseUrl, target es5, and amd, umd and systemjs.
  - 7.0 ships no compiler API. 7.1 (beta 20 Oct 2026) brings a new one.
  - Until then, Microsoft recommends aliasing `typescript` to `@typescript/typescript6` for tools that need the API, such as typescript-eslint.
- **typescript-eslint** (known, its docs; the version range is assumed, from a GitHub issue and blog reports):
  - Use its type-checked configs once typed linting is on.
  - `strict` and `strict-type-checked` are not semver-stable.
  - Its current release declares TypeScript below 6.1; support for 7.1 is in progress.
- **ESLint, Biome, Oxlint** (assumed, from secondary sources):
  - ESLint 10 (Feb 2026) accepts only flat config.
  - ESLint remains the mainstream, at about 134M weekly npm downloads vs about 8.8M for Biome and 6.7M for Oxlint (May 2026).
  - Biome replaces both Prettier and ESLint with one tool; its type-aware rules are newer.
  - Oxlint's type-aware mode is still alpha.
- **Published guides** (known): there is no official TypeScript style guide. The Google TypeScript Style Guide is the most complete public one (for example, named exports only, and no `export let`).

**The check of Specrew's defaults:**

```text
 SPECREW'S TYPESCRIPT DEFAULTS, CHECKED AGAINST THE WEB

 +----+----------------------+---------------------------------+-----------------------+
 | #  | Specrew default      | Now (29 Oct 2026)               | Proposal              |
 +----+----------------------+---------------------------------+-----------------------+
 | 1  | TS: strict mode for  | Still right. TypeScript 7.0 (8  | Keep.                 |
 |    | new code             | Jul 2026) turns strict on by    |                       |
 |    |                      | default.                        |                       |
 +----+----------------------+---------------------------------+-----------------------+
 | 2  | TS: pick ESM or CJS  | TS 6.0 deprecated and TS 7.0    | ESM only, nodenext    |
 |    | and a module         | removed node10 and classic      | (settled at I2).      |
 |    | resolution           | resolution and baseUrl.         |                       |
 +----+----------------------+---------------------------------+-----------------------+
 | 3  | Prettier to format;  | Still the mainstream: ESLint    | Keep, with flat       |
 |    | ESLint with          | about 134M weekly downloads vs  | config.               |
 |    | typescript-eslint to | Biome 8.8M and Oxlint 6.7M (May |                       |
 |    | lint                 | 2026). ESLint 10 accepts only   |                       |
 |    |                      | flat config.                    |                       |
 +----+----------------------+---------------------------------+-----------------------+
 | 4  | Typed linting where  | typescript-eslint says to use   | Typed linting on      |
 |    | justified            | its type-checked configs once   | everywhere: it        |
 |    |                      | typed linting is on.            | catches promises      |
 |    |                      |                                 | nobody awaits, a real |
 |    |                      |                                 | risk in Node.         |
 +----+----------------------+---------------------------------+-----------------------+
 | 5  | Not covered: TS 7    | TS 7.0 ships no compiler API    | Add as a rule; the    |
 |    | and lint tools       | until 7.1 (beta 20 Oct 2026);   | versions are settled  |
 |    |                      | typescript-eslint supports TS   | at I2.                |
 |    |                      | below 6.1. Microsoft's fix:     |                       |
 |    |                      | alias typescript to             |                       |
 |    |                      | @typescript/typescript6 for     |                       |
 |    |                      | tools.                          |                       |
 +----+----------------------+---------------------------------+-----------------------+
 | 6  | Not covered: Node    | Node's type stripping is        | Add as a choice at    |
 |    | runs TS itself       | stable; TS 5.8 added            | I2.                   |
 |    |                      | erasableSyntaxOnly (no enums,   |                       |
 |    |                      | no parameter properties, no     |                       |
 |    |                      | namespaces).                    |                       |
 +----+----------------------+---------------------------------+-----------------------+
 | 7  | Not covered: which   | Node 26 became LTS on 28 Oct    | Settled at I2.        |
 |    | Node                 | 2026; Node 24 is still LTS.     |                       |
 |    |                      | From Node 27, one release a     |                       |
 |    |                      | year.                           |                       |
 +----+----------------------+---------------------------------+-----------------------+
 | 8  | Baseline: the CALLER | Conflicts with your CD4 rule:   | Project override:     |
 |    | defines the DTOs it  | the component that declares the | your CD4 rule wins.   |
 |    | consumes             | schema exports its DTOs.        |                       |
 +----+----------------------+---------------------------------+-----------------------+
 | 9  | Lens text: reviewer  | The current Claude family is    | Stale example only;   |
 |    | examples name Opus   | 5.x.                            | the lens pins no      |
 |    | 4.8                  |                                 | model. Note for       |
 |    |                      |                                 | Specrew.              |
 +----+----------------------+---------------------------------+-----------------------+
 | 10 | The catalog says its | That was before TS 7.0, Node 26 | Corrections go in the |
 |    | sources were checked | LTS and the lint gap in row 5.  | project overlay, not  |
 |    | on 8 Jun 2026        |                                 | into Specrew's files. |
 +----+----------------------+---------------------------------+-----------------------+
```

- **Right and current:** the 19 baseline rules, apart from row 8, which conflicts with this project only.
- **Right in direction, but dated:** the TypeScript rule; its sources predate TS 7.0, Node 26 LTS and the lint-tool gap.
- **Wrong for this project:** row 8. The human's CD4 rule is stricter about coupling and wins here.
- **Stale text:** row 9, the reviewer examples in the lens.

## I1 in detail (proposal, awaiting the human)

- **(a) Specrew's defaults, with the corrections in rows 2-10.**
  - The enforced layer is TypeScript strict, ESLint with typescript-eslint's type-checked configs, and Prettier, all checked in CI.
  - No external style guide.
  - Naming gaps are covered by lint rules and a few custom rules.
  - The corrections are recorded here now. At lens close they go into the project overlay `code-rules.local.yml`; the agent confirms before writing it.
  - $0: open-source development tools. They are new dev dependencies, recorded at I6.
  - **The agent's lean:** an enforced lint config beats a long guide nobody checks.
- **(b) (a), plus the Google TypeScript Style Guide as the reference for anything (a) does not cover.**
  - Helpful on naming and exports.
  - Some of its rules conflict with choices still open. For example, it allows parameter properties, which the erasable-only option at I2 forbids. Each conflict would be recorded.
  - $0.
- **(c) Specrew's defaults as shipped.** Not recommended: they predate TypeScript 7 and the lint-tool gap. $0.
- **Either way, report the stale items to Specrew** (rows 5, 6, 7, 9, 10) as a need. The agent changes none of Specrew's own files.

**Sources (checked 2026-10-29):**
- https://nodejs.org/en/about/previous-releases
- https://nodejs.org/api/typescript.md
- https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/
- https://devblogs.microsoft.com/typescript/announcing-typescript-7-1-beta/
- https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/
- https://typescript-eslint.io/users/configs
- https://typescript-eslint.io/getting-started/typed-linting
- https://github.com/typescript-eslint/typescript-eslint/issues/12518
- https://dev.to/gabrielanhaia/typescript-7-has-no-stable-compiler-api-yet-thats-why-typescript-eslint-wont-install-4pa
- https://www.pkgpulse.com/guides/biome-vs-eslint-vs-oxlint-2026
- https://tech-insider.org/eslint-vs-biome-vs-oxlint-2026/
- https://google.github.io/styleguide/tsguide.html

## I1 decided (2026-10-29)

**The human, verbatim:** "a"

**The agent's reading:** I1 = (a), Specrew's defaults with the corrections in rows 2-10, and no external style guide (the Google TypeScript Style Guide, option (b), was not chosen).
- **The enforced layer:** TypeScript strict, ESLint with typescript-eslint's type-checked configs, and Prettier, all checked in CI.
- **(a) sets the direction only.** Rows 2, 5, 6 and 7 (modules, TypeScript 7 and the lint tools, Node running TypeScript, which Node) are decided at I2.
- **Row 8 is decided now:** the first I7 exception. Baseline `code-rule.dtos-between-services` ("the calling service defines the DTO types it consumes") is overridden for this project: CD4 wins, so the component that declares a schema exports its DTOs. I7 records it and does not ask it again.
- **The project overlay** `code-rules.local.yml` holds the corrections. It is written at lens close; the agent confirms with the human before writing it.
- **A need for Specrew, not a change to it:** report the stale items (rows 5, 6, 7, 9, 10). The agent changes none of Specrew's own files.
- **Not decided by (a):** rules such as "named exports only" and interface naming came from the Google guide, which was not chosen. If the agent proposes any of them, it does so at I7 on their own merits, not as part of a guide.

## I2 research (2026-10-29)

**What the web shows (evidence tags):**
- **Node** (nodejs.org):
  - Node 26 has been LTS since 28 Oct 2026; Node 24 and Node 22 are still LTS (known).
  - The page gives no end-of-life dates. Under the historic pattern for even releases (30 months of LTS from October), Node 26 would end about April 2029 and Node 24 about April 2028 (assumed).
  - Type stripping: enabled by default in v22.18.0 and v23.6.0; marked stable in v24.12.0 and v25.2.0; v26.0.0 removed the `--experimental-transform-types` flag (known).
  - What type stripping does not do (known): it ignores tsconfig; it refuses .ts files under `node_modules`; it rejects enums, parameter properties, namespaces with runtime code, import aliases and decorators; imports must name the `.ts` extension; type-only imports must use `type`.
  - Node's recommended tsconfig for it: `target esnext`, `module nodenext`, `rewriteRelativeImportExtensions`, `erasableSyntaxOnly`, `verbatimModuleSyntax` (known).
  - `crypto.argon2` and `crypto.argon2Sync` were added in v24.7.0 (known). The agent did not find their stability index (unknown).
  - `node:sqlite` has been a release candidate since v25.7.0 (known), so it is a release candidate on Node 26. On Node 24 its level is not confirmed; the history shows no 24.x entry for that change (unknown).
- **The key libraries:**
  - ring-client-api 14.3.0 (its main branch): Node `^22.19.0 || ^24 || ^26`; ES modules; pins werift 0.25.1 (known).
    - Corrected 2026-10-30 (I6 research): these are the unreleased main branch's values. The published 14.3.0 declares Node `^20 || ^22 || ^24` and pins werift 0.22.4.
  - The MCP server package `@modelcontextprotocol/server`: latest is 2.4.0 (23 Oct 2026); 2.0.0 was released 27 Jul 2026, so v2 is stable; Node `>=20`; ES modules; it depends on zod (known, the npm registry and its package.json).
  - oidc-provider 9.13.3: ES modules; it declares no Node engines (known). Support for Node 26 is assumed; a spike checks it.
- **TypeScript and the linter:**
  - typescript-eslint supports TypeScript `>=4.8.4 <6.1.0` and ESLint `^8.57.0 || ^9.0.0 || ^10.0.0` (known, its dependency-versions page).
  - The TypeScript 7.1 beta post plans a release candidate "in about a month" and the final release "shortly thereafter"; exact dates are unknown.
- **zod 4** generates JSON Schema itself with `z.toJSONSchema()` (known, zod.dev). This matters at I6.

## I2 in detail (proposal, awaiting the human)

```text
 I2 PROPOSAL: THE TOOLCHAIN (all open source, $0)

  you write .ts files: ES modules, strict, erasable syntax only
        |
        +--> while coding: Node 26 runs the .ts files directly, no build step
        |    (how the tests run is decided at I4)
        |
        +--> checks, at pre-commit and in CI:
        |      tsc --noEmit    TypeScript 6.0: type errors
        |      ESLint 10       typescript-eslint, strict and type-checked rules
        |      Prettier        formatting
        |
        +--> build: tsc writes .js --> container images on the node:26 base
                                         |-- Azure core (App Service B1)
                                         |-- home connector (Docker on the VM)
                                         '-- mode A (all in one, SQLite)

  later: TypeScript 7.1 replaces 6.0 once typescript-eslint supports it (one bump)
```

**The two real choices:**
- **I2.2 Which TypeScript.**
  - **(a) Microsoft's recommended path:** TypeScript 7.0 (the Go compiler, installed as `@typescript/native`) type-checks and builds; `typescript` is aliased to `@typescript/typescript6` so typescript-eslint can run. Two compilers; faster checks. $0.
  - **(b) TypeScript 6.0 alone for now (the agent's lean).** One compiler. The settings stay 7-ready (no option that TypeScript 7 removed). The switch to 7.1 is one dev-dependency bump once typescript-eslint declares support, tracked as a follow-up. This departs from Microsoft's recommended path; the reasons are one compiler, a small codebase where speed matters little, and a cheap switch later. $0.
  - **(c) TypeScript 7.0 with no typed linting.** Conflicts with I1 (a), row 4. Not recommended.
- **I2.3 How the TypeScript runs.**
  - **(a) Classic build:** tsc writes JS and everything runs the JS. Full TypeScript syntax: enums, parameter properties, decorators. The closest to C#. Coding needs a build or watch step.
  - **(b) Erasable syntax only, and Node runs the .ts everywhere, production included.** No build step at all. But Node refuses .ts under `node_modules` (affects I5), and the images carry the .ts sources.
  - **(c) Erasable syntax only; Node runs the .ts directly while coding; tsc builds JS for the container images (the agent's lean).**
    - What it costs: no enums (use `as const` objects with union types, which also map cleanly to JSON Schema string enums and to CD4's string-named brands); no parameter properties (declare the fields); no runtime namespaces; no decorators.
    - Affects I6: decorator-based DI containers are out. CD5's composition at start does not need one.
    - Affects I4: how the tests run is decided there.

**Proposed as defaults (change any of them):**
- **I2.1 Node:** Node 26 LTS on every part: the Azure core image, the home connector image and mode A. Node 24 is the fallback if a spike finds a break.
  - Both App Service and the home VM run our container, so App Service's own list of Node versions does not limit us.
  - Node 26 gets `node:sqlite` as a release candidate and `crypto.argon2` built in. That makes "no new dependency" for SQLite and for the PIN hash more credible at I6 (tagged above).
  - The `code-rule.lts-version-check` rule re-checks the LTS at each feature.
- **I2.4 Strictness:**
  - `strict`, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, and, with I2.3 (b) or (c), `erasableSyntaxOnly` and `rewriteRelativeImportExtensions`.
  - `exactOptionalPropertyTypes` can clash with some libraries' types. It can be relaxed later, with a recorded reason.
  - `code-rule.type-inference-deliberate`: explicit types on exported functions and at component boundaries; inference inside function bodies; `unknown` at the edges, then parsed by the validation library (I6); never `any`.
- **I2.5 Modules:** ES modules only (`"type": "module"`), with `module` and `moduleResolution` set to `nodenext`. ring-client-api, oidc-provider and the MCP server package are all ES modules, and TypeScript 7 removed the older resolution modes.
- **I2.6 Lint and format:**
  - ESLint 10 with flat config.
  - typescript-eslint `strictTypeChecked` plus `stylisticTypeChecked`, with versions locked. The strict presets are not semver-stable, so upgrades are deliberate.
  - The rules that matter most here: `no-floating-promises`, `no-misused-promises`, `switch-exhaustiveness-check` (it pairs with the union types that replace enums), `no-explicit-any`, `consistent-type-imports` (it matches `verbatimModuleSyntax`).
  - Prettier with its defaults; `eslint-config-prettier` switches off the lint rules that clash with it.
  - All of it runs at pre-commit and in CI.
- **Cost:** $0. All open source; no change to the Azure bill. The dev tools are recorded as dependencies at I6.

**Sources (checked 2026-10-29):**
- https://nodejs.org/en/about/previous-releases
- https://nodejs.org/api/typescript.html
- https://nodejs.org/api/crypto.html
- https://nodejs.org/api/sqlite.html
- https://raw.githubusercontent.com/dgreif/ring/main/packages/ring-client-api/package.json
- https://registry.npmjs.org/@modelcontextprotocol/server
- https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/packages/server/package.json
- https://registry.npmjs.org/oidc-provider/latest
- https://typescript-eslint.io/users/dependency-versions
- https://devblogs.microsoft.com/typescript/announcing-typescript-7-1-beta/
- https://zod.dev/json-schema

## I2 decided (2026-10-30)

**The human, verbatim:** "I go with your recomandations"

**The agent's reading:** the answer accepts I2 as proposed, all six parts. It does not answer I3-I8; each of those still gets its own turn.
- **I2.1 Node:** Node 26 LTS on every part (the Azure core image, the home connector image, mode A). Node 24 is the fallback if a spike finds a break.
  - Refined 2026-11-01 (I6, the engine check): the fallback's floor is Node 24.11 for the dev tools (Babel 8, through Stryker); the Node 26 spike also covers ring-client-api 14.3.0 (I6 finding (1), confirmed by the human).
- **I2.2 TypeScript:** (b), TypeScript 6.0 alone for now, with 7-ready settings. The switch to 7.1 is a tracked follow-up, made once typescript-eslint declares support. This departs from Microsoft's recommended two-compiler setup, knowingly.
- **I2.3 How the TypeScript runs:** (c). Erasable syntax only; Node runs the .ts directly while coding; tsc builds JS for the container images. So: no enums (`as const` objects with union types), no parameter properties, no runtime namespaces, no decorators.
- **I2.4 Strictness:** `strict`, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, `erasableSyntaxOnly` and `rewriteRelativeImportExtensions`. Explicit types on exported functions and at component boundaries; `unknown` at the edges; never `any`.
- **I2.5 Modules:** ES modules only, `module` and `moduleResolution` set to `nodenext`.
- **I2.6 Lint and format:** ESLint 10 with flat config; typescript-eslint `strictTypeChecked` plus `stylisticTypeChecked`, versions locked; Prettier with its defaults and `eslint-config-prettier`; at pre-commit and in CI.
- **Cost:** $0.

## I3 in detail (proposal, awaiting the human)

**Carried in, not asked again** (D7, D4, X2, CD4, integration-api):
- The D7 error codes and the envelope: `code`, `message`, `retry_after_s`, and `outcome` (not_done, unknown or done) on control calls.
- The 60 s deadline; TIMEOUT with outcome unknown; commands are never retried automatically.
- INVALID_ARGUMENT comes from the edge parsers (CD4 Q2).
- On a link drop, in-flight commands fail with BRIDGE_UNAVAILABLE, outcome unknown (X2).
- Protocol errors (a malformed request, an unknown tool) are JSON-RPC errors, not tool errors.
- The Public Contract is imported only by MCP Endpoint and Delivery (CD4 Q1).

**The question:** inside the code, how does a failure travel from where it happens to the client that answers? And who turns it into what the caller sees?

```text
 I3 OPTION (b): EXPECTED FAILURES ARE VALUES, BUGS ARE EXCEPTIONS

  WHO ASKED         WHAT THEY GET BACK, AND WHO MAPS IT
  an agent     <--  MCP Endpoint: the D7 envelope (code, message, retry_after_s,
                    and outcome on control calls); the only one that imports the
                    Public Contract (with Delivery)
  you, on a    <--  Web: the plain page states (expired, already used, wrong PIN
  page              with tries left, locked 15 min, home offline, outcome unknown)
  the other    <--  Connector Link and Core Link: the link's result message,
  end of link       with the command's outcome
  nobody       <--  Scheduler: logs it and feeds Health
                    Each client maps the errors it receives; the lint rule from
                    I2 flags a case it forgot. Any exception -> INTERNAL, logged.
        ^
  MANAGERS AND      return a Result: ok with a value, or a typed error from a
  ENGINES           union that this component declares (CD4: it does not import
                    the Public Contract); control errors always carry outcome
        ^
  RESOURCE ACCESS   the libraries throw (ring-client-api, SQL driver, Blob, ws).
                    Caught here: known failures become typed errors (the SQL
                    server is down -> "store unavailable"); the rest stay
                    exceptions, because they are bugs
        ^
  libraries, Ring, Azure
```

- **(a) Exceptions everywhere.**
  - Typed error classes (for example `HomeOfflineError`) carry the code and, on control calls, the outcome. Any layer throws them. Each client catches them and maps them.
  - The closest to C#. $0; no new dependency.
  - The weakness: TypeScript cannot declare or check what a function throws (there are no checked exceptions, and `catch` gives `unknown`). So the lint rule from I2 cannot flag a forgotten case, and a control error without its outcome shows up only in review or tests.
  - Corrected 2026-10-30: this overstated it. See "The human on I3" below.
- **(b) Expected failures are values; bugs are exceptions (the agent's lean).**
  - Managers, engines and resource access return a Result: ok with a value, or a typed error from a union that the component declares itself. Under CD4, no component outside MCP Endpoint and Delivery imports the Public Contract's code list; a component may reuse D7-like names, and MCP Endpoint maps them into D7, as it maps DTOs.
  - Resource access catches what the libraries throw. Known failures become typed errors; anything else stays an exception, because it is a bug.
  - Each client maps the errors it receives, in its own way: MCP Endpoint to the D7 envelope; Web to the page states already set in ui-ux; Connector Link and Core Link to the link's result message with the command's outcome; Scheduler logs and feeds Health. Any exception that reaches a client becomes INTERNAL (or the page's "something went wrong"), logged with its stack.
  - Why over (a): with the `switch-exhaustiveness-check` rule accepted in I2.6, every client's mapping is checked; a new error kind fails lint wherever a switch forgot it. `outcome` is a required field on control errors, so the type checker refuses a control error without it. (a) leaves both to review.
  - The cost: a hand-rolled Result type, about a dozen lines in a utility, $0 and no new dependency. A library such as neverthrow does the same with helpers; it would be an I6 dependency and is not proposed.
  - The weakness: more code at each call (check ok before using the value), and a new habit for a C# developer (the nearest C# analogues are the TryParse pattern and OneOf-style results).
- **(c) Other:** the human describes it.

**Proposed with I3 whichever option is chosen (new, not carried):**
1. **The message the caller sees is written by the bridge.** Raw text from Ring or a library goes only to the logs, redacted (OR1). Why: Ring strings are untrusted (Normalize), and an error message is one more path into an agent's context.
2. **Each error is logged once, where it is handled** (at the client), with the correlation ID. Causes are chained with the standard `cause` option, so the log keeps the original.
3. **Timeouts and cancellation use Node's AbortSignal,** passed down each async call, so the 60 s deadline also stops the work under it.
4. **Crash on the unknown.** An unhandled promise rejection or an uncaught exception is logged and the process exits; it is never swallowed.
   - Node exits on an unhandled rejection by default (known; its default since v15).
   - App Service restarts a crashed container (assumed, as component-design already states).
   - The home connector's restart policy is not recorded in devops-operations; it is a need for plan.

**Cost:** $0 for (a) and (b).

## The human on I3 (2026-10-30)

**The human, verbatim:** "Exceptions: Any thing unexpected that you could not participated. Also any error that the issuer wants to tell the original caller. So anything known can be handled"

**The agent's reading (awaiting the human's confirmation; I3 is not yet decided):**
- The human chose exceptions, not the agent's lean (b). The Result type is dropped.
- Exceptions are used for two things: anything unexpected that could not be anticipated, and any error that the raising component wants the original caller to see (the D7 kinds: home offline, Ring rejected, confirmation invalid, and the rest).
- A known case that the caller handles on the spot (no cached frame, an event seen before) is an ordinary return value. Exceptions are never used for normal flow.
- "The issuer" is read as the component that raises the error, not the Issuer sign-in component.

**A correction to option (a)'s weakness, as the agent wrote it above:** the agent said the lint rule cannot flag a forgotten case under exceptions. That is wrong for the design below.
- Each component's error class carries a closed `kind` union. The catcher narrows by class and then switches on `kind`, so `switch-exhaustiveness-check` still flags a missed kind.
- The constructor of a control error requires `outcome`, so the compiler still refuses a control error without it.
- What is really lost: the type system does not tell a caller which calls can throw. The client's catch-all (INTERNAL) and the tests cover that.

**How exceptions work here (the agent's proposal under the human's answer):**

```text
 I3 AS I READ YOUR ANSWER: EXCEPTIONS CARRY ERRORS UP TO THE CALLER

  CLIENTS           catch, then map by kind, each in its own way:
                      MCP Endpoint    -> the D7 envelope (code, message,
                                         retry_after_s, outcome)
                      Issuer          -> OAuth error replies (oidc-provider)
                      Web             -> the plain page states
                      Connector Link,
                      Core Link       -> the link's result message
                      Scheduler       -> the log and Health
                    any other exception (a bug) -> INTERNAL, logged once;
                    the process keeps serving
        ^ throws ControlError { kind: "home_offline", outcome: "not_done" }
  MANAGERS AND      engines throw their own declared errors; managers catch
  ENGINES           what lower components throw and pass on only their own
                    declared errors, with the original kept as the cause
        ^ throws RingAccessError { kind: "home_offline" }
  RESOURCE ACCESS   wrap what the libraries throw into their own declared errors
        ^ throws (ring-client-api, SQL driver, Blob, ws)
  libraries, Ring, Azure

  Not an error: a known case the caller handles on the spot (no cached frame,
  an event seen before) is a normal return value, never an exception.
  The same rules apply on the home connector.
```

- **Each component declares the errors it throws, next to its DTOs** (CD4: the callee declares). One error class per component, with a closed list of kinds, not one class per code.
- **A manager catches what lower components throw** and passes on only its own declared errors, keeping the original as `cause`. A client never sees a resource-access error class (IDesign).
- **This needs no change to the component map.** One shared list of kinds in a utility would need less code but would add a utility (a map change) and tie every component to one list; it is not proposed.
- **The Issuer is a client too.** Under X1 it calls Grants directly. Its errors reach OAuth clients as OAuth error replies rendered by oidc-provider, not as the D7 envelope.
- **Cost:** $0; no new dependency.

**The four points proposed with I3, revised (still awaiting the human; not answered yet):**
1. The message the caller sees is written by the bridge; raw text from Ring or a library goes only to the logs, redacted. (Unchanged.)
2. Each error is logged once, by the client that handles it, with the correlation ID; a component that rethrows does not log. The original is kept as `cause`. (Tightened.)
3. Timeouts and cancellation use Node's AbortSignal, passed down each async call. (Unchanged.)
4. Crash only on failures outside every handler. (Bounded.)
   - Inside a request, the client's catch-all turns a bug into INTERNAL and the process keeps serving.
   - Inside a Scheduler tick, the bug is logged and fed to Health.
   - Only a failure outside any handler (a stray promise, a timer, an event emitter) is logged, and then the process exits. Node exits on an unhandled rejection by default (known). App Service restarts the container (assumed). The home connector's restart policy is a need for plan.

## Input for I4, given early (2026-10-30)

**The human, verbatim:** "We need best test coverage with simulation of the real devices or services"

**The agent's reading:** an input to I4 (the testing posture), not an answer to I3. I4 is built around it when it is presented: high coverage, with simulators standing in for the real Ring devices and for the outside services. CD3 already has two such stand-ins (the simulated home for the Ring Adapter, fixed test images for Live Media); I4 extends this to the other services.

## I3 decided (2026-10-30)

**The human, verbatim:** "confirmed"

**The agent's reading:** this confirms the agent's reading of the human's I3 answer and all four points as revised.

**Confirmation:** human-confirmed (lens-question, scope I3).

**What was decided:**
- **Exceptions** carry two things: anything unexpected that could not be anticipated, and any error the raising component wants the original caller to see.
- **A known case the caller handles on the spot** is an ordinary return value. Exceptions are never used for normal flow.
- **Each component declares the errors it throws, next to its DTOs** (CD4): one error class per component, with a closed list of kinds. A manager catches what lower components throw and passes on only its own declared errors, keeping the original as `cause`. A client never sees a resource-access error class. No change to the component map.
- **Control errors require `outcome` in their constructor.** Each client switches on the kinds it receives, so `switch-exhaustiveness-check` flags a missed kind.
- **Each client maps in its own way:** MCP Endpoint to the D7 envelope; the Issuer to OAuth error replies (oidc-provider); Web to the page states; Connector Link and Core Link to the link's result message with the outcome; Scheduler to the log and Health. Any other exception becomes INTERNAL, and the process keeps serving.
- **The four points:**
  1. The message the caller sees is written by the bridge; raw Ring or library text goes only to the logs, redacted.
  2. Each error is logged once, by the client that handles it, with the correlation ID; components that rethrow do not log.
  3. Timeouts and cancellation use AbortSignal, passed down each async call.
  4. Only a failure outside every handler (a stray promise, a timer, an event emitter) is logged and exits the process; App Service restarts the container (assumed); the home connector's restart policy is a need for plan.
- **Cost:** $0; no new dependency (the Result type was dropped).

## I4 research (2026-10-30)

**What the web shows (evidence tags):**
- **Node's own test runner** (known, nodejs.org, v26 docs):
  - `node:test` is stable (since v20.0.0).
  - Snapshot testing is no longer experimental (v23.4.0); mock timers are stable (v23.1.0).
  - Code coverage is still Stability 1, experimental. Whether its CLI threshold flags exist and whether its coverage maps back to the .ts sources are unknown.
  - `mock.module` is early development, behind a flag. It does not count here: CD3 chose seams so the tests need no module mocking.
  - `node --test` finds `.test.ts` files by default while type stripping is on.
- **Vitest** (known, the npm registry): 5.0.5, MIT, Node `^22.12.0 || ^24.0.0 || >=26.0.0`. Vite is a peer dependency, so it comes along. Its V8 coverage with thresholds, fake timers and snapshots are assumed from its documentation (not checked this session).
- **StrykerJS mutation testing:** a dedicated Vitest runner plugin (known, Stryker's docs); `node:test` only through its TAP runner (a secondary source).
- **Azurite** 3.37.0 (known, its README): no blob immutability policies, no legal holds, no version-level WORM, no blob versions. So WORM is tested only in the pilot.
- **GitHub Actions** (known, GitHub's billing docs): Pro and Team include $18 of Actions usage a month; a standard Linux 2-core runner costs $0.006 a minute; standard runners are free in public repositories.
  - About 3,000 Linux minutes a month is the agent's arithmetic ($18 / $0.006).
  - The human's plan is assumed to be Pro or better (devops: protection works on the human's private repositories).

## I4 in detail (proposal, awaiting the human)

**The human's input (2026-10-30):** "We need best test coverage with simulation of the real devices or services"

**Carried in, not asked again:**
- CD3's four test-only seams: the fake clock, the in-memory link pair, the simulated home with fixed test images, the fake Entra sign-in.
- DS5: CI runs on SQLite and on SQL Server.
- ui-ux: page smoke checks at three widths, in both themes.
- The MCP schema snapshot test (the D2 additive check); NFR 5's kill-and-restart test.
- DO3 and DO5: no staging; the pilot runs on production with disarm off; a smoke test after each deploy.
- SC4: Ring secrets live only at home, so CI never touches the real Ring.

**I4.1 A stand-in for every real device or service (the agent's lean):**

```text
 I4 PROPOSAL: EVERY REAL DEVICE OR SERVICE HAS A STAND-IN IN CI

 +-----------------------+-------------------------------------+-----------------------+
 | The real thing        | Its stand-in in CI                  | Only the pilot tests  |
 +-----------------------+-------------------------------------+-----------------------+
 | Ring devices:         | The simulated home (CD3), grown     | Your real devices:    |
 | doorbell, cameras,    | into a scenario engine: every       | read-only checks, and |
 | the alarm, sensors    | device type the bridge supports,    | one light on and off  |
 |                       | scripted scenarios, and faults      | that you run          |
 |                       | (Ring down, slow, 406, a push gap,  |                       |
 |                       | a session expiring)                 |                       |
 +-----------------------+-------------------------------------+-----------------------+
 | Ring's real payload   | Real payloads that you record once  | -                     |
 | shapes                | at home, scrubbed of personal data  |                       |
 |                       | (where they live is your choice)    |                       |
 +-----------------------+-------------------------------------+-----------------------+
 | Live video and ffmpeg | Fixed test images (CD3); the real   | Real frames and clips |
 |                       | ffmpeg on short test clips          |                       |
 +-----------------------+-------------------------------------+-----------------------+
 | The home link (WSS)   | The in-memory pair (CD3), plus the  | Your real network     |
 |                       | real WSS on localhost with drops,   |                       |
 |                       | delays and duplicates               |                       |
 +-----------------------+-------------------------------------+-----------------------+
 | Azure SQL             | SQL Server in a container, and      | Managed-identity      |
 |                       | SQLite (DS5)                        | sign-in               |
 +-----------------------+-------------------------------------+-----------------------+
 | Blob storage          | Azurite, Microsoft's storage        | WORM immutability     |
 |                       | emulator                            | (Azurite has none)    |
 +-----------------------+-------------------------------------+-----------------------+
 | Key Vault             | The encrypted-file Secrets (the     | The real vault and    |
 |                       | mode A side of a production seam)   | its roles             |
 +-----------------------+-------------------------------------+-----------------------+
 | Entra sign-in         | The fake sign-in (CD3), served by a | The real Entra page   |
 |                       | second oidc-provider acting as      |                       |
 |                       | Entra                               |                       |
 +-----------------------+-------------------------------------+-----------------------+
 | Time                  | The fake clock (CD3)                | -                     |
 +-----------------------+-------------------------------------+-----------------------+
 | AI agents (MCP        | The MCP SDK's own client, end to    | The real agents, and  |
 | clients)              | end against mode A                  | S7 (clips in ChatGPT  |
 |                       |                                     | and Claude)           |
 +-----------------------+-------------------------------------+-----------------------+
 | ChatGPT webhooks, the | A local webhook receiver; a fake    | The real platforms    |
 | channel shim          | channel                             |                       |
 +-----------------------+-------------------------------------+-----------------------+
 | Browsers (the pages)  | Playwright: 3 widths, light and     | Your phone            |
 |                       | dark (ui-ux)                        |                       |
 +-----------------------+-------------------------------------+-----------------------+
```

- **New beyond CD3** (if accepted, these become amendments to component-design when this lens closes):
  - **The simulated home grows into a scenario engine.** CD3 has a doorbell, a camera, the alarm and a few sensors. The proposal adds every device type the bridge supports, scripted scenarios (for example "doorbell at night while armed Away", "flood sensor", "link drops mid-command") and fault injection. More build effort, estimated at plan; $0.
  - **In the repository the simulated home stays generic.** If the human wants their own home mirrored, that is a local-only scenario file, kept out of git (no user specifics in git).
  - **A second oidc-provider stands in for Entra** in the integration tests, so the real sign-in code is exercised over the real protocol. CD3's seam fake stays for unit tests. No new dependency (oidc-provider is already in).
- **The recorded Ring payloads** (a need, not a script):
  - The human records them once at home, where the Ring secrets live; the agent never runs it.
  - A scrub step replaces names, addresses, coordinates, IDs, emails and times. Ring locations carry an address, so the scrub is thorough.
  - **(i)** Committed after the scrub and the human's review, so CI uses them (the agent's lean: that is where they add the most). **(ii)** Kept local-only, out of git (the safer option for privacy; CI then uses generic fixtures only).
  - This is not spike S1 (S1 is the official-API PoC); it is a separate step, run when the human chooses.

**I4.2 The test runner:**
- **(a) Node's built-in runner: no new dependency.** It runs the .ts directly; snapshots and mock timers are stable. But its coverage is still experimental, its threshold flags and .ts mapping are unknown, and mutation testing works only through Stryker's TAP runner.
- **(b) Vitest 5 (the agent's lean).** Coverage with thresholds, fake timers, snapshots, watch mode, and a dedicated Stryker runner. The MCP SDK itself tests with it. It brings Vite as a dev dependency.
  - Why (b) over (a): the human asked for the best coverage, and coverage and mutation testing are where (a) is weakest today.
- Either way, Playwright brings its own runner for the page checks, so there are two runners.

**I4.3 The coverage bar:**
- **A CI gate of 90% lines and 85% branches** on the measured code (the agent's lean). "Best" is not 100%: the last few percent buy tests of trivial code.
- **Excluded, and listed so the numbers don't mislead:** the real Ring Adapter, Live Media, the Key Vault and the managed-identity SQL implementations, and the Host's wiring. The pilot tests these.
- **A completeness check:** every MCP tool, every D7 error kind, every event kind and every page state has at least one test. Tests may import the Public Contract (CD4's import rule covers the product code, not the tests).
- **Mutation testing (StrykerJS), weekly,** on the engines and Normalize. It shows whether the tests check results, not just run the lines.

**I4.4 Test-first:** the failing test comes first for the engines, the edge parsers, Normalize and every bug fix. Elsewhere, tests are written with the code. Review flags a behavior change that has no test.

**I4.5 Where each layer runs:**
- **Every PR (CI), about 12 minutes (an estimate):**
  - lint and types;
  - unit tests;
  - integration on SQLite, SQL Server in a container and Azurite, with the simulated home, the fake clock and the local WSS;
  - mode A end to end, driven by the MCP SDK's client;
  - the page smoke checks; the schema snapshot; the kill-and-restart test;
  - the coverage gate.
- **On main, before the deploy approval:** mode H end to end (the core and connector containers, SQL Server, Azurite). This is a new CI job name; devops left the job names to this lens.
- **Weekly (CI):**
  - mutation testing;
  - a "simulated week": seven days of events, token refreshes, purges and the key rotation on the fake clock, in minutes.
- **The pilot,** run by the human at home and on production with disarm off (the agent never runs it): real devices, read-only, plus one light on and off; the real Entra sign-in; managed identity; Key Vault; WORM; the real agents and S7.

**I4.6 Cost:**
- $0 in Azure.
- CI while the repository is private: about 100 PR runs at 12 minutes, 30 main runs at 15 minutes, and 4 weekly runs at 45 minutes, about 1,830 minutes a month. That is about $11 of the $18 included, so $0 extra (estimates; plan assumed). Beyond the included amount, about $0.36 an hour. Free once the repository is public.
- Build effort: the scenario engine and the fake Entra, estimated at plan.

**Sources (checked 2026-10-30):**
- https://nodejs.org/api/test.html
- https://registry.npmjs.org/vitest/latest
- https://stryker-mutator.io/docs/stryker-js/vitest-runner/
- https://deepwiki.com/stryker-mutator/stryker-js/4.1-test-runners
- https://github.com/Azure/Azurite
- https://docs.github.com/en/billing/concepts/product-billing/github-actions

## I4 decided (2026-10-30)

**The human, verbatim:** "agree with your recommendation"

**The agent's reading:** this accepts I4 as proposed, all six parts, with the agent's leans: the recorded payloads as (i) and the runner as (b) Vitest. It covers I4 only, not I5-I8.

**Confirmation:** human-confirmed (lens-question, scope I4).

**What was decided:**
- **I4.1 A stand-in for every real device or service,** as in the table above. Two items go beyond CD3 and become component-design amendments at close:
  - the simulated home grows into a scenario engine: every device type the bridge supports, scripted scenarios and fault injection; generic in the repository, with the human's own home only as an optional local-only scenario file, kept out of git;
  - a second oidc-provider stands in for Entra in the integration tests; CD3's seam fake stays for the unit tests.
- **Recorded payloads: (i).** The human records them once at home (the agent never runs it). A scrub step removes names, addresses, coordinates, IDs, emails and times. They are committed only after the scrub and the human's review, and the agent asks before that commit (no user specifics in git). Not part of S1.
- **I4.2 The runner: (b) Vitest 5.** Playwright runs the page checks with its own runner.
- **I4.3 The coverage bar:** a CI gate of 90% lines and 85% branches on the measured code; the listed exclusions (the real Ring Adapter, Live Media, the Key Vault and managed-identity SQL implementations, the Host's wiring); the completeness check (every MCP tool, D7 error kind, event kind and page state has a test); weekly mutation testing (StrykerJS) on the engines and Normalize.
- **I4.4 Test-first** for the engines, the edge parsers, Normalize and every bug fix; elsewhere tests are written with the code; review flags a behavior change with no test.
- **I4.5 Where each layer runs:** every PR (about 12 minutes); mode H end to end on main before the deploy approval (a new CI job); weekly mutation testing and the simulated week; the pilot, run by the human only, with disarm off.
- **I4.6 Cost:** $0 in Azure; about 1,830 CI minutes a month, within the $18 included while private (estimates; plan assumed); free once public. Build effort for the scenario engine and the fake Entra is estimated at plan.

## I5 research (2026-10-30)

**What the web shows (evidence tags):**
- **Node and TypeScript files** (known, nodejs.org, the TypeScript page): Node refuses TypeScript files inside folders under a `node_modules` path. It ignores tsconfig `paths`; the closest feature is subpath imports, which must start with `#`.
- **Symlinks** (known for `require`, nodejs.org, the modules page): Node resolves the real path of each module it loads, following symlinks. Whether type stripping checks the real path of a symlinked workspace package (so that it is not "under node_modules") is not stated (assumed; a spike if (c) is chosen).
- **Conditions** (known, nodejs.org, the packages page): custom conditions in `exports` and `imports` are switched on with `--conditions` (`-C`). TypeScript's `customConditions` adds conditions for `nodenext` resolution (known, typescriptlang.org). This is how a workspace package would point at its .ts while coding and at its .js in an image.
- **npm workspaces** (known, docs.npmjs.com, v11): `npm install` at the root symlinks each workspace into the root `node_modules`; commands take `--workspace`; with a workspace selected, npm works only on that workspace and not on the root project. Whether `npm ci --workspace=<x> --omit=dev` installs only that workspace's libraries is not documented for `npm ci` (unknown; a spike if (c) is chosen).
- **pnpm:** Corepack is no longer shipped with Node from v25 (secondary sources), so pnpm would be a separately installed tool.

## I5 in detail (proposal, awaiting the human)

**Carried in, not asked again:**
- One codebase in one repository; the core and the connector are the same code run in two modes; the run mode (core, connector or all-in-one) is a Config setting that the Host reads at start (architecture-core, CD3, CD5).
- The deployables: the core image (amd64, the human's registry), the connector image (amd64 and arm64, ghcr.io), mode A (the dev PC and open-source users), the channel shim (started by Claude Code on the PC), and the Public Contract published as JSON Schema files. DO3: the same images everywhere; only config differs.
- I2.3: Node runs the .ts while coding; tsc builds JS for the images.
- CD4: one entry file per component; a CI dependency check.

**The question:** how many npm packages, and where the folders go. `code-rule.shared-code-packaging` says to decide by the real reuse boundary, not convenience.

**I5.1 How many packages:**

```text
 I5 OPTIONS: HOW MANY NPM PACKAGES (all: one repository, one lockfile, $0)

 (a) ONE PACKAGE              (b) BRIDGE + SHIM (lean)     (c) ONE PER DEPLOYABLE
 C#: one .csproj              C#: a .sln, two projects     C#: a .sln, six projects
 
 ring-mcp-bridge/             ring-mcp-bridge/  (root)     ring-mcp-bridge/  (root)
   package.json                 package.json  dev tools      package.json  dev tools
   src/host/                    bridge/                      packages/utilities/
   src/core/                      package.json               packages/contract/
   src/connector/                 src/host/ core/            packages/core/
   src/utilities/                 src/connector/ ...         packages/connector/
   src/contract/                shim/                        packages/all-in-one/
   src/shim/                      package.json               packages/shim/
                                  src/
 1 package.json               3 package.json               7 package.json
 the shim carries every       the shim installs alone      each image may install
 bridge library wherever      with the MCP SDK only;       only its own (unverified);
 it is installed              no cross-package imports     needs a .ts/.js switch
```

- **All three need no new dependency** (workspaces are built into npm) and cost $0.
- **(a) One package.** Simplest. But the shim runs on another machine and shares no code with the bridge, yet carries every bridge library (Ring, werift, oidc-provider, the SQL Server driver, the Azure libraries) wherever it is installed.
- **(b) One bridge package and the shim as its own small package, in one npm workspace (the agent's lean).**
  - The bridge keeps "one package, two modes" exactly as decided. The shim installs alone, with the MCP SDK only.
  - The shim imports nothing from the bridge (it talks to it over MCP), so none of the extra plumbing of (c) is needed.
  - Cost: one more package.json and a `workspaces` line; still one lockfile.
  - Why: the real reuse boundary. The core and the connector share the utilities, the Link transport and the link messages, and run together in mode A, so they are one package. The shim runs on another machine, shares no code and has its own pace (Claude Code channels are a research preview), so it is its own package.
- **(c) One package per deployable** (utilities, contract, core, connector, all-in-one, shim).
  - The gain: each image could install only its own libraries.
  - The costs:
    - cross-package imports need a switch, so that Node and Vitest load the .ts while coding and the .js in the images (a custom condition in tsconfig, in Node's `--conditions` and in Vitest);
    - seven package.json files and project references;
    - two spikes: whether `npm ci --workspace` installs only one workspace's libraries (unknown), and whether type stripping accepts symlinked workspace packages (assumed);
    - it amends architecture-core and CD3 ("one package, two modes" becomes "one codebase").
  - The guarantee that the core never loads Ring libraries does not come free either: npm hoists every library into one root folder, so a stray import still resolves. The dependency check is needed anyway.
- **pnpm** is not offered: it would be a new tool, and it is no longer shipped with Node through Corepack.

**I5.2 The folders (with (b); the same inside one package with (a)):**

```text
 I5 PROPOSAL (b): THE REPOSITORY LAYOUT

 ring-mcp-bridge/                the repository; the npm workspaces root
 |-- package.json                private (never published); workspaces: bridge, shim;
 |                               dev tools: TypeScript, ESLint, Prettier, Vitest,
 |                               Playwright, StrykerJS
 |-- package-lock.json           one lockfile for both packages
 |-- tsconfig.base.json          the I2 settings; each package extends it
 |-- eslint.config.js  vitest.config.ts  playwright.config.ts
 |-- bridge/                     core + connector: one package, two modes (CD3)
 |   |-- package.json            the runtime libraries (MCP server, Ring, ...: I6)
 |   |-- Dockerfile              one image; the run mode is a Config setting (DO3)
 |   |-- src/
 |   |   |-- host/               the Host (CD5): main.ts reads the run mode and loads
 |   |   |                       one wiring file: core.ts, connector.ts, all-in-one.ts
 |   |   |-- core/
 |   |   |   |-- clients/        mcp-endpoint/ issuer/ web/ connector-link/ ...
 |   |   |   |-- managers/       inquiry/ control/ media/ event/ admin/
 |   |   |   |-- engines/        summary/ safety/ capture/ classify/ health/
 |   |   |   '-- access/         ring-access/ state/ event-log/ ... secrets/
 |   |   |-- connector/
 |   |   |   |-- clients/        setup-cli/ core-link/ push-listener/ home-scheduler/
 |   |   |   |-- managers/       execute/ ingest/
 |   |   |   |-- engines/        normalize/
 |   |   |   '-- access/         ring-adapter/ live-media/ outbox-store/ secrets-file/
 |   |   |-- utilities/          security/ logging/ pub-sub/ config/ clock/
 |   |   |                       link-transport/ query-layer/
 |   |   '-- contract/           the Public Contract (schemas only, no logic)
 |   '-- test/                   integration and end to end, grouped by subject
 |       |-- scenarios/          the simulated home's scenarios (generic);
 |       |                       local/ is git-ignored: your own home, if you want it
 |       '-- fixtures/ring/      the recorded payloads, after the scrub and your review
 |-- shim/                       the channel shim: its own small package
 |   |-- package.json            the MCP SDK only
 |   '-- src/
 |-- schemas/                    the Public Contract as JSON Schema files, generated;
 |                               CI fails if they are stale
 |-- infra/                      Bicep (DO2)
 |-- scripts/                    the PowerShell 7 scripts
 '-- .github/ .specify/ specs/   CI workflows and Spec Kit, as they are

 Inside each component folder: index.ts, the entry file (its operations, its DTOs and
 its error class, I3); private files; and x.test.ts beside x.ts (the unit tests).
 A seam's index.ts exports only its interface and DTOs (CD4); each implementation is
 its own file (for example query-layer/sqlite.ts, query-layer/tsql.ts), and only the
 Host's wiring files import them.
```

- **Grouped by side and layer, as in the component map.** One folder per component, with one entry file; everything else in the folder is private (CD4). The entry file's name `index.ts` is confirmed with the naming rules at I7.
- **The Host sits at the top of `src/`,** because it wires both sides. CD5 already has the Host wiring all three run modes (core, connector or all-in-one); the map draws it in the core box, and that does not change.
- **Each process loads only its own side's code.** ES modules load every static import at start, so one start that imports both sides would load everything everywhere (the connector would load oidc-provider and the Azure libraries; the core would load the Ring libraries). So:
  - the Host's `main.ts` reads the run mode and loads one wiring file (`core.ts`, `connector.ts` or `all-in-one.ts`) with a dynamic import of a literal path; tsc rewrites its .ts extension for the images (assumed; checked in the first build);
  - a seam's entry file exports only its interface and DTOs (as CD4 already says); each implementation is its own file, and only the Host's wiring files import those files;
  - one image, one start, the run mode a setting (DO3). Whether devops' two images are one build pushed twice or two builds from the same package is a plan detail; one build is the simpler default.
- **Imports between folders use relative paths with the .ts extension;** tsc rewrites them for the images. No path aliases: Node ignores tsconfig paths, and `#` aliases would need the same .ts/.js switch as (c).
- **Tests:** unit tests beside the code; integration and end-to-end tests in `bridge/test/`, grouped by subject; the generic scenarios and the recorded payloads there too, with `scenarios/local/` git-ignored. The image build leaves the tests out.
- **`schemas/` at the root** holds the published JSON Schema files, so open-source users find them without building. CI fails if they are stale.

**I5.3 What the CI dependency check enforces (the tool itself is an I6 choice; it must check what is reachable from each start, not only direct imports):**
- From the connector's wiring, no import path reaches the Azure libraries, oidc-provider or the SQL Server driver.
- From the core's wiring, no import path reaches the Ring libraries, werift or ffmpeg.
- Imports from another component go only through its entry file (CD4, carried). The one exception: the Host's wiring files import seam implementation files.
- `core/` never imports `connector/`, and `connector/` never imports `core/`, except the in-process Ring Access implementation of mode A, which calls Execute's entry file (the map has this call). `host/` may import both sides.
- The shim imports nothing from the bridge.
- The Public Contract imports nothing; only MCP Endpoint and Delivery import it (CD4, carried).

**The component map is unchanged.** Packages and folders are where the code lives; the components and their calls stay as decided.

**Not decided here (recorded for later):**
- **Publishing on npm:** product-domain names the package `ring-mcp-bridge`; whether the bridge or the shim is also published on npm is decided at the public release (DO7). A published package ships built JS, because Node refuses .ts under `node_modules`.
- **How open-source users run mode A and the shim** (the image with the run mode set to all-in-one, or a clone): the README path is a need for plan.

**Cost:** $0 for all three; no Azure change; no new dependency. Build effort: (a) the least; (b) about the same (one more package.json); (c) the most (seven package.json files, the .ts/.js switch and two spikes).

**Sources (checked 2026-10-30):**
- https://nodejs.org/api/typescript.html
- https://nodejs.org/api/modules.html
- https://nodejs.org/api/packages.html
- https://www.typescriptlang.org/tsconfig/#customConditions
- https://docs.npmjs.com/cli/v11/using-npm/workspaces
- https://docs.npmjs.com/cli/v11/commands/npm-ci
- https://blog.openreplay.com/manage-package-managers-node-corepack/ (secondary)

## I5 decided (2026-10-30)

**The human, verbatim:** "option b, you're lean"

**The agent's reading:** this accepts (b), the agent's lean, as it was proposed: with the folders (I5.2) and the dependency-check rules (I5.3). It covers I5 only, not I6-I8.

**Confirmation:** human-confirmed (lens-question, scope I5).

**What was decided:**
- **I5.1 (b):** one npm workspace with two packages: `bridge` (core and connector, one package, two modes, as CD3 and architecture-core decided) and `shim` (the channel shim, with the MCP SDK only). The root is private and holds the dev tools and one lockfile. No new dependency; $0.
- **I5.2 The folders** as drawn above:
  - `bridge/src/` holds `host/`, `core/` and `connector/` (each by layer: clients, managers, engines, access), `utilities/` and `contract/`;
  - one folder per component with its entry file `index.ts` (the name confirmed with the naming rules at I7); a seam's entry file exports only its interface and DTOs, and each implementation is its own file that only the Host's wiring imports;
  - the Host's `main.ts` reads the run mode and loads one wiring file (`core.ts`, `connector.ts` or `all-in-one.ts`) with a dynamic import of a literal path, so each process loads only its own side's code; that tsc rewrites the extension there is assumed and checked in the first build;
  - relative imports, no path aliases;
  - unit tests beside the code; integration and end-to-end tests, the generic scenarios (with a git-ignored `local/`) and the scrubbed payloads in `bridge/test/`; the image build leaves the tests out;
  - `schemas/` at the root holds the generated JSON Schema files, and CI fails if they are stale; `infra/` holds the Bicep; `scripts/` holds the PowerShell 7 scripts.
- **I5.3 The dependency-check rules** as listed above. The tool (an I6 choice) must check what is reachable from each wiring file, not only direct imports.
- **The component map is unchanged.**

## I6 research (2026-10-30)

**How it was gathered:** read-only queries of the npm registry (latest version, license, repository, publish dates, engines, install scripts, dependencies) and of GitHub's advisory database (`gh api /advisories`), checked against each latest version with semver. Nothing was installed. Advisories are shown as "affecting this version / ever recorded".

**What the web shows (evidence tags):**
- **ring-client-api** (known, the npm registry): the published 14.3.0 (2026-02-08) declares Node `^20 || ^22 || ^24`. **Correction to the I2 research,** which read the main branch's package.json (Node `^22.19.0 || ^24 || ^26`, werift 0.25.1): the main branch is unreleased. The repository is active (last commit 2026-10-25).
- **werift 0.22.4,** pinned by ring-client-api 14.3.0, depends on `ip` 2.0.1. GHSA-2p57-rm9w-gvfp (high, SSRF through `isPublic`) affects `<= 2.0.1` with no fixed version (known, GitHub advisory database). werift 0.25.x no longer depends on `ip` (known, the registry). Whether werift's use of `ip` is exposed in the bridge is not known (unknown; checked at plan).
- **ffmpeg:** ring-client-api depends on `@homebridge/camera-utils`, which depends on `ffmpeg-for-homebridge`. Its install script downloads a static ffmpeg (known, the registry). Its README shows build flags `--enable-nonfree`, `--enable-libfdk-aac`, `--enable-gpl` and states no license (known, its GitHub README). That FFmpeg calls a nonfree build unredistributable is assumed from FFmpeg's configure text; ffmpeg.org's legal page did not load this session.
- **The MCP SDK v2** (known, the registry): `@modelcontextprotocol/server` and `client` 2.4.0 (Apache-2.0) depend on `@modelcontextprotocol/core`, which depends on zod 4. Adapters: `@modelcontextprotocol/node` 2.1.2 (its dependencies are `hono` and `@hono/node-server`), `/hono` 2.0.2 (peer: hono), `/express` 2.0.2 (peer: express). The Node adapter's `NodeStreamableHTTPServerTransport.handleRequest(req, res)` works with `node:http` (known, its README on GitHub).
- **oidc-provider 9.13.3** depends on koa 3, jose 6 and debug (known, the registry).
- **SQL Server from Node with managed identity** (known, Microsoft Learn, updated 2026-10-19): `mssql` with `authentication: { type: 'azure-active-directory-default' }`, plus `options.clientId` for a user-assigned identity. This upgrades the data-storage assumption to known.
- **node:sqlite** (known, Node v26.13.0 docs): Stability 1.2, release candidate (since v25.7.0); no flag. On Node 26, `DatabaseSync` is a deprecated alias of `Database` (DEP0210).
- **crypto.argon2** (known, Node v26.13.0 docs): added in v24.7.0; the section has no separate stability line, and the crypto module is Stable.
- **Kysely and node:sqlite** (secondary sources): no official Kysely dialect for `node:sqlite`; three small community dialects exist.
- **dependency-cruiser** (known, its rules reference): rules can forbid what is *reachable*, not only direct imports; it understands TypeScript. Whether `reachable` follows dynamic `import()` is not stated (unknown; checked when it is first configured).
- **gitleaks** (known): MIT; latest release 8.30.1 (2026-03-21); the repository is active. gitleaks-action needs no license key for personal-account repositories, and a key for organization repositories (known, its README); its v2 stops working after 2026-09-16 (known, its README).
- **npm sbom** (known, npm v11 docs): built into npm; writes SPDX or CycloneDX, with each package's license; supports `--omit` and workspaces.
- **npm's "latest" tag for typescript** is 7.0.2; 6.0.3 is the newest 6.0 (known, the registry).
- **eslint-config-prettier:** its July 2025 advisory records hijacked versions; 10.1.8 is not affected (known, GitHub advisory database).
- **Dependabot** alerts and version updates are a free GitHub feature on private repositories (assumed).
- **The day-one check of the whole tree** (known, run 2026-10-30): a lockfile was resolved for the lean set with `npm install --package-lock-only --ignore-scripts` in a scratch folder (metadata only; no package code ran; 565 packages: 248 runtime, 318 dev), then `npm audit` and `npm sbom` were run on it.
  - **npm audit:** 3 high entries, all from one root: `ip` 2.0.1, through werift 0.22.4, through ring-client-api 14.3.0. npm's suggested "fix" is a downgrade to ring-client-api 9.13.0, which is not acceptable. 2 moderate entries, dev only: `qs` through `typed-rest-client`. Nothing critical. Runtime only (`--omit=dev`): the same 3 high entries.
  - **Licenses** (from `npm sbom`): MIT 453, Apache-2.0 42, BSD-3-Clause 20, ISC 17, BSD-2-Clause 6. Runtime also has BlueOak-1.0.0 (tar, chownr, minipass, yallist), 0BSD (tslib) and Unlicense (tweetnacl). Dev only: MPL-2.0 (lightningcss, through Vite) and CC-BY-4.0 (caniuse-lite). Two runtime packages declare no license: `@shinyoshiaki/jspack` 0.0.6 (through werift) and `ffmpeg-for-homebridge` 2.2.2. None of these is a use-restricted license.
  - **werift 0.22.4's wildcard dependencies:** it takes `werift-ice`, `werift-rtp`, `werift-dtls`, `werift-sctp` and `werift-common` at `"*"`. Today the lockfile resolved 0.2.3, 0.8.9, 0.5.8, 0.0.11 and 0.0.3.
- **Node 24 facts, checked on the local Node 24.13.0** (known): `node:sqlite` exposes only `DatabaseSync` (no `Database`) and prints an ExperimentalWarning; `crypto.argon2` exists; a global `WebSocket` client exists.
- **The engine check** (known, run 2026-11-01 on the day-one lockfile and on the local Node 24.13.0 with npm 11.9.0):
  - 403 of the 565 packages declare a Node range (the lockfile records each one). Against Node 26.0.0 and 26.2.0, only ring-client-api 14.3.0 falls outside its range. Against Node 24.7.0, 37 dev packages fall outside: Babel 8 (`^22.18.0 || >=24.11.0`), pulled in by `@stryker-mutator/instrumenter` 10.1.1. Against 24.13.0, none.
  - A mismatch prints `npm warn EBADENGINE` and the install exits 0. With `--engine-strict`, `npm ci` stops with `npm error code EBADENGINE`. npm's docs: `engine-strict` defaults to false, and only `--force` gets past it; `--force` also "removes various protections" of the install.
  - A root `devEngines.runtime` that excludes the running Node stops `npm install`, `npm ci` (also with `--ignore-scripts`), `npm ci -w bridge` and `npm run` inside `bridge/` with `EBADDEVENGINES`. A `devEngines` only in a workspace package is not checked. `^24.11 || ^26` passes on 24.13.0. devEngines was added in npm 10.9.0 (npm/cli PR #7766, 2024-10-03); its `onFail` defaults to error.
- **Node release facts** (known, the nodejs.org release index): Node 26.0.0 was released on 2026-05-05 (npm 11.12.1), three months after ring-client-api 14.3.0 (2026-02-08). Node 26.13.0 became LTS ("Lithium") on 2026-10-28 (npm 11.20.0), so I2's "Node 26 LTS" is known.

## I6 in detail (proposal, awaiting the human)

**Group A: already chosen by earlier lenses.** Recorded here; nothing to decide, only the findings.

```text
 I6 GROUP A: CHOSEN BY EARLIER LENSES (recorded, with findings)
 advisories = affecting this version / ever recorded, for the package itself;
 npm audit in CI covers the whole tree (group C)

 package                        version   license     last      adv.    used in
                                                      release
 -----------------------------  --------  ----------  --------  ------  ---------------
 RUNTIME
 ring-client-api                14.3.0    MIT         2026-02   0/0     connector (1)
   werift (pinned by it)        0.22.4    MIT         2026-01   (2)(7)  connector
   @eneris/push-receiver        4.3.0     MIT         2024-10   0/0     connector
 ffmpeg: the Linux package      distro    LGPL/GPL    distro    distro  connector (3)
 @modelcontextprotocol/server   2.4.0     Apache-2.0  2026-10   0/4     core, shim
 @modelcontextprotocol/client   2.4.0     Apache-2.0  2026-10   0/2     shim, tests
 oidc-provider                  9.13.3    MIT         2026-10   0/0     core (4)
 zod (comes with the SDK)       4.6.7     MIT         2026-10   0/2     core, connector
 mssql (tedious inside)         12.7.13   MIT         2026-10   0/0     core
 @azure/identity                4.14.1    MIT         2026-10   0/1     core
 @azure/keyvault-secrets        4.12.0    MIT         2026-10   0/0     core
 @azure/storage-blob            12.34.0   MIT         2026-09   0/0     core
 DEV AND CI
 typescript                     6.0.3     Apache-2.0  2026-04   0/0     dev (5)
 @types/node                    26.6.6    MIT         2026-10   0/0     dev
 eslint                         10.14.0   MIT         2026-10   0/2     dev
 typescript-eslint              8.72.1    MIT         2026-10   0/0     dev
 prettier                       3.9.10    MIT         2026-10   0/0     dev
 eslint-config-prettier         10.1.8    MIT         2025-07   0/1     dev (6)
 vitest                         5.0.5     MIT         2026-10   0/3     dev
 @vitest/coverage-v8            5.0.5     MIT         2026-10   0/0     dev
 vite (Vitest's peer)           8.3.5     MIT         2026-10   0/29    dev
 @stryker-mutator/core, runner  10.1.1    Apache-2.0  2026-10   0/0     dev
 @playwright/test               1.64.1    Apache-2.0  2026-10   0/0     dev
 gitleaks (a binary, not npm)   8.30.1    MIT         2026-03   -       hook, CI

 (1) The published 14.3.0 declares Node 20, 22 and 24, not 26. My I2 research read its
     main branch, which declares 26: corrected. Last release 8 months ago; the
     repository is active (last commit 2026-10-25).
 (2) werift 0.22.4 uses ip 2.0.1: one high advisory (SSRF in isPublic) with no fixed
     version, so npm audit will flag it. ring-client-api's main branch moved to werift
     0.25, which no longer uses ip.
 (3) ring-client-api pulls ffmpeg-for-homebridge, whose install script downloads an
     ffmpeg built with non-free parts (libfdk-aac). Our images would ship it publicly.
     So: the Linux distribution's ffmpeg, ring-client-api pointed at it, install
     scripts off.
 (4) It declares no Node version; the tracked Node 26 spike covers it.
 (5) npm's "latest" tag for typescript is now 7.0.2, so 6.0.3 is pinned exactly
     (I2.2).
 (6) Its npm account was hijacked in July 2025 and bad versions were published; 10.1.8
     is clean. A reason for exact pins (group C).
 (7) werift 0.22.4 takes its five werift-* parts at any version ("*"). A lockfile
     refresh could pull in any future release, so they are pinned with npm overrides
     (group C).
```

- **Finding (1) changes a fact behind I2, so it is asked as its own question** (question 8 below):
  - **keep I2** (Node 26 everywhere, Node 24 as the fallback), with the tracked Node 26 spike widened to ring-client-api 14.3.0 (the agent's lean: on Node 24, the connector's SQLite is experimental and warns, and ring-client-api's main branch already declares Node 26); or
  - **start the connector on Node 24,** which 14.3.0 declares, and accept experimental SQLite there.
- **Finding (2)** is handled by the audit exception in group C, until ring-client-api ships werift 0.25.
- **Finding (7)** is handled by npm overrides in group C.
- **Finding (3) changes how ffmpeg arrives:** the Linux distribution's ffmpeg in the image, ring-client-api pointed at it by its ffmpeg path option, and install scripts off, so the nonfree binary is never downloaded. Clip audio then uses ffmpeg's built-in AAC encoder (assumed; checked in S7).
- **mssql** is the driver Microsoft's guide uses for managed identity; tedious directly would add the pooling work.

**Group B: the real choices** ("no new dependency" listed first):

```text
 I6 GROUP B: THE REAL CHOICES ("no new dependency" listed first)

 +-----+---------------+-----------------------------------+----------------------------+
 | #   | Choice        | No new dependency (first)         | My lean                    |
 +-----+---------------+-----------------------------------+----------------------------+
 | B1  | HTTP server   | node:http + the SDK's Node        | Hono 4.13 + the SDK's Hono |
 |     |               | adapter (it brings Hono anyway);  | adapter; OAuth paths go to |
 |     |               | cookies, CSRF and headers         | oidc-provider              |
 |     |               | hand-written                      |                            |
 +-----+---------------+-----------------------------------+----------------------------+
 | B2  | Link          | none: Node has no WebSocket       | ws 8.22, on both ends      |
 |     | WebSocket     | server                            |                            |
 +-----+---------------+-----------------------------------+----------------------------+
 | B3  | Logger        | our own JSON logger, allow-list:  | = no new dependency        |
 |     |               | only declared fields are written  |                            |
 +-----+---------------+-----------------------------------+----------------------------+
 | B4  | DI            | hand-wired in the Host's wiring   | = no new dependency        |
 |     |               | files                             |                            |
 +-----+---------------+-----------------------------------+----------------------------+
 | B5  | SQLite        | node:sqlite (release candidate on | = no new dependency        |
 |     |               | Node 26)                          |                            |
 +-----+---------------+-----------------------------------+----------------------------+
 | B6  | Query layer,  | hand-written SQL per dialect;     | = no new dependency        |
 |     | migrations    | numbered migration files          |                            |
 +-----+---------------+-----------------------------------+----------------------------+
 | B7  | Page          | tagged templates that escape by   | = no new dependency        |
 |     | templates     | default                           |                            |
 +-----+---------------+-----------------------------------+----------------------------+
 | B8  | PIN hash      | crypto.argon2 (built in from      | = no new dependency        |
 |     |               | v24.7)                            |                            |
 +-----+---------------+-----------------------------------+----------------------------+
 | B9  | Dependency    | a hand-written import-graph walk  | dependency-cruiser 18.7    |
 |     | check         |                                   | (reachability rules)       |
 +-----+---------------+-----------------------------------+----------------------------+
 | B10 | Git hooks     | git's core.hooksPath, set by      | = no new dependency        |
 |     |               | npm's prepare                     |                            |
 +-----+---------------+-----------------------------------+----------------------------+
 | B11 | License check | npm sbom (built into npm) + an    | = no new dependency        |
 |     | (B15)         | allow-list                        |                            |
 +-----+---------------+-----------------------------------+----------------------------+
 | B12 | CI containers | GitHub Actions service            | = no new dependency        |
 |     |               | containers; compose locally       |                            |
 +-----+---------------+-----------------------------------+----------------------------+
 9 of 12 leans add nothing. New with the leans: Hono and its Node server, the SDK's
 Hono adapter, ws, dependency-cruiser (dev only).
```

- **B1 HTTP server.**
  - No new dependency: `node:http` with the SDK's Node adapter. Hono still arrives, because that adapter depends on it. The pages' cookies, CSRF protection, security headers and body limits would be hand-written, and they are security code.
  - **The lean: Hono 4.13** (MIT, no dependencies of its own), with `@hono/node-server` and the SDK's Hono adapter. It gives tested CSRF, secure-headers, cookie and body-limit helpers. A small `node:http` front sends the OAuth paths to oidc-provider, which is Koa inside. Hono has 56 advisories over its life, none affecting 4.13.14, and a fast release pace (67 in a year), so exact pins and Dependabot matter (group C).
  - Not leaned: Express 5 (28 dependencies) with the SDK's Express adapter.
- **B2 The link's WebSocket.** Node has a WebSocket client but no server, so the core needs `ws` (MIT, no dependencies). The lean uses ws on both ends: one API, with ping and pong frames. The built-in client on the connector would save nothing, because ws is in the bridge package anyway.
- **B3 Logger.** The lean is our own small JSON-lines logger in the Logging utility. It writes only declared fields (an allow-list), which matches OR1's "IDs, not content" better than pino's path-based redaction (a deny-list). Not leaned: pino 10.
- **B4 DI.** Hand-wired in the Host's wiring files; already implied by CD5, I2 (no decorators) and I5 (one wiring file per run mode). Not leaned: awilix 13 (no decorators needed).
- **B5 SQLite.** `node:sqlite`, a release candidate on Node 26 with no flag. On Node 24 it is experimental and prints a warning (known, checked locally), and its class is named `DatabaseSync`; on Node 26 it is `Database`, with `DatabaseSync` a deprecated alias. So the SQLite file uses `Database` when present, else `DatabaseSync`. Not leaned: better-sqlite3 13 (a native module: prebuilt binaries and per-platform builds).
- **B6 The query layer and migrations.** Hand-written SQL per dialect in each resource accessor, through the Query layer seam (CD3); data-storage expected "a few statements in two dialects". Migrations are numbered SQL files per dialect, applied by the Host at start while it holds the lease. Not leaned: Kysely 0.29 (pre-1.0): one typed query for both dialects and a migrator, but node:sqlite would need a small community dialect (two new dependencies), and its SQL Server dialect uses tedious directly rather than mssql.
- **B7 Page templates.** Tagged template literals with a helper that escapes every value unless it is marked safe. Not leaned: Eta 4.
- **B8 PIN hash.** `crypto.argon2`, built in. Not leaned: @node-rs/argon2 (prebuilt binaries) and argon2 (native, with an install script).
- **B9 The dependency check.** The lean is dependency-cruiser 18.7 (MIT, dev only), because I5.3 needs reachability rules. A hand-written graph walk is possible but becomes code to maintain. eslint-plugin-boundaries checks direct imports only.
- **B10 Git hooks.** git's own `core.hooksPath` pointing at a committed `.githooks/` folder, set by npm's `prepare` script. The hooks run gitleaks and the quick checks. Not leaned: husky 9 (last release 2024-11) and lefthook (downloads a binary at install).
- **B11 The license check (B15).** `npm sbom`, built into npm, plus an allow-list check in CI. Not leaned: license-checker-rseidelsohn.
- **B12 CI containers.** GitHub Actions service containers for SQL Server and Azurite, and a compose file for the same containers on the dev PC. Not leaned: testcontainers 12.

**Group C: the policy** (security T7 and B15):
- **Exact versions** (`save-exact`), one lockfile, and `npm ci` everywhere.
- **Install scripts off** in the CI and image install commands (`npm ci --ignore-scripts`), not in the committed `.npmrc`: there it would also stop npm's `prepare` script, which sets the git hooks on the dev PC (B10). With ffmpeg from the distribution, no runtime package is expected to need a script; protobufjs's postinstall is skipped harmlessly (assumed; checked in the first build). Any package that truly needs one is named in the record.
- **No `engine-strict`,** or the Node 26 build would refuse ring-client-api 14.3.0 (finding 1). Explained to the human on 2026-11-01 (see "The human on I6").
  - **Option under question 10 (the agent's lean):** `devEngines.runtime` at the root, Node `^24.11 || ^26`, onFail error. It checks only our own project's Node; built into npm; $0.
- **npm overrides pin werift's five wildcard parts** to the versions resolved today (finding 7). Dependabot changes to them are flagged for review.
- **`npm audit` in CI fails on high or critical, over the whole tree.** Moderate and low are reported but do not block (day one: 2 moderate, dev only). A written exception list holds each exception with the advisory, why it does not apply, and a review date. npm audit has no built-in ignore list, so this needs a small script over `npm audit --json` (a need for implement, not written now). The first entry is finding (2), removed when ring-client-api ships werift 0.25; whether it is exposed is checked at plan. Day one would otherwise fail on it.
- **The B15 allow-list,** from the day-one check:
  - runtime: MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD, BlueOak-1.0.0, Unlicense;
  - dev only, in addition: MPL-2.0 (lightningcss, through Vite) and CC-BY-4.0 (caniuse-lite);
  - reviewed entries for the two runtime packages that declare no license (`@shinyoshiaki/jspack` and `ffmpeg-for-homebridge`), checked against their repositories at plan;
  - ffmpeg recorded separately: LGPL or GPL, called as a separate program;
  - the check is a small script over `npm sbom` (a need for implement, not written now).
- **Dependabot:** alerts, and weekly grouped version updates (free).
- **A new dependency needs its FR-013 record** in `implementation-rules.yml` before it merges; review checks this.
- **gitleaks runs as the pinned binary,** checked by checksum, in the pre-commit hook and in CI. It needs no GitHub Action and no license key.

**Cost:** $0 for every item; no Azure change; the audit, license and secret checks add seconds to each PR run.

**The draft FR-013 records** (moved into `implementation-rules.yml` at close, for the human's picks). Fields: version; license; source; URL; upkeep; advisories; compatibility; cost; coupling; replaceability; tests.
- **ring-client-api:** 14.3.0; MIT; dgreif (community); https://github.com/dgreif/ring; last release 2026-02-08, commits to 2026-10-25; 0 own, ip via werift (finding 2); Node 20/22/24 declared (finding 1); $0; heavy, the whole unofficial Ring protocol, but only inside Ring Adapter and Live Media; replaceable behind Ring Access, and later by the official API; never in CI (SC4), the simulated home stands in, the pilot tests it.
- **werift (transitive):** 0.22.4, pinned by ring-client-api; MIT; shinyoshiaki; https://github.com/shinyoshiaki/werift-webrtc; 18 releases in a year; via ip (finding 2); Node >=16; $0; used only through ring-client-api; follows ring-client-api; fixed test images stand in.
- **@eneris/push-receiver (transitive):** 4.3.0, pinned; MIT; eneris; https://github.com/eneris/push-receiver; 4.4.0 released 2026-09; 0/0; Node >=20; $0; only through ring-client-api; follows ring-client-api; the simulated home stands in.
- **ffmpeg (system package):** the base image's distribution package; LGPL or GPL (assumed for the distribution's build); FFmpeg; https://ffmpeg.org; the distribution's security updates; the distribution's advisories; called by path; $0; a separate program; swapped by changing the package; the real ffmpeg runs on short test clips in CI (I4).
- **@modelcontextprotocol/server:** 2.4.0; Apache-2.0; the MCP project; https://github.com/modelcontextprotocol/typescript-sdk; 15 releases in a year, 2026-10-23; 0/4; Node >=20; $0; MCP Endpoint and the shim only; replacing it means rewriting the endpoint; the SDK's own client drives the end-to-end tests.
- **@modelcontextprotocol/client:** 2.4.0; Apache-2.0; the MCP project; same URL; 14 releases in a year; 0/2; Node >=20; $0; the shim and the tests; replacing it means rewriting the shim's link to the core; it is itself the end-to-end test driver.
- **@modelcontextprotocol/hono (B1 lean):** 2.0.2; Apache-2.0; the MCP project; same URL; 11 releases in a year; 0/1; peer hono ^4.11.4; $0; MCP Endpoint only; swap for the SDK's Node or Express adapter; covered by the end-to-end tests.
- **hono and @hono/node-server (B1 lean):** 4.13.14 and 2.1.5; MIT; honojs; https://github.com/honojs/hono; 67 and 31 releases in a year; 0/56 and 0/7; Node >=16.9 and >=20; $0; medium: MCP Endpoint's and Web's route handlers use its context object; Express 5 is the fallback; route tests through Hono's in-process requests (assumed), page checks through Playwright.
- **oidc-provider:** 9.13.3; MIT; panva; https://github.com/panva/node-oidc-provider; 27 releases in a year, 2026-10-29; 0/0; no engines declared (Node 26 spike); $0; heavy: the OAuth server, the Issuer and Grants (X1); no drop-in TypeScript alternative; a second oidc-provider acts as the fake Entra (I4).
- **ws (B2 lean):** 8.22.0; MIT; websockets; https://github.com/websockets/ws; 17 releases in a year; 0/7; Node >=10; $0; light: only inside the Link transport; replaced inside one utility; the real WSS on localhost with drops, delays and duplicates (I4).
- **zod:** 4.6.7; MIT; colinhacks; https://github.com/colinhacks/zod; frequent; 0/2; no engines; $0; heavy by design: the one schema system for the edge parsers and the Public Contract, also the MCP SDK's own; replacing it means rewriting every edge parser; the schema snapshot test (D2).
- **mssql (with tedious):** 12.7.13 (tedious 20.3.8); MIT; tediousjs; https://github.com/tediousjs/node-mssql; 35 releases in a year; 0/0; Node >=18.19 (tedious >=22); $0; light: only the Query layer's T-SQL implementation; tedious directly as the fallback; the SQL Server container in CI, managed identity only in the pilot.
- **@azure/identity, @azure/keyvault-secrets, @azure/storage-blob:** 4.14.1, 4.12.0, 12.34.0; MIT; Microsoft; https://github.com/Azure/azure-sdk-for-js; released monthly or more; 0/1, 0/0, 0/0; Node >=22; $0; light: only inside Secrets, Media Cache, Audit and the Query layer's T-SQL side; Azure REST by hand is the fallback; Azurite in CI, Key Vault, WORM and managed identity only in the pilot (excluded from coverage, I4.3).
- **typescript:** 6.0.3, pinned exactly (npm's latest tag is 7.0.2); Apache-2.0; Microsoft; https://github.com/microsoft/TypeScript; 2026-04-16; 0/0; $0; build and type check only; 7.1 later (tracked); not applicable.
- **@types/node:** 26.6.6; MIT; DefinitelyTyped; https://github.com/DefinitelyTyped/DefinitelyTyped; frequent; 0/0; $0; types only; follows Node; not applicable.
- **eslint, typescript-eslint, prettier, eslint-config-prettier:** 10.14.0, 8.72.1, 3.9.10, 10.1.8; MIT; eslint, typescript-eslint, prettier; their GitHub repositories; active (eslint-config-prettier last released 2025-07); 0/2, 0/0, 0/0, 0/1 (finding 6); typescript-eslint supports TypeScript <6.1.0; $0; dev only; swappable tools; not applicable.
- **vitest, @vitest/coverage-v8, vite:** 5.0.5, 5.0.5, 8.3.5; MIT; vitest-dev and vitejs; https://github.com/vitest-dev/vitest; frequent; 0/3, 0/0, 0/29; Node ^22.12, ^24 or >=26; $0; dev only, but every test uses its API; tests move to another runner with effort; it is the runner.
- **@stryker-mutator/core and vitest-runner:** 10.1.1; Apache-2.0; stryker-mutator; https://github.com/stryker-mutator/stryker-js; 7 releases in a year; 0/0; Node >=22; $0; the weekly job only; can be dropped; mutation testing itself.
- **@playwright/test:** 1.64.1; Apache-2.0; Microsoft; https://github.com/microsoft/playwright; frequent; 0/0; Node >=20; $0, with browsers downloaded in CI; the page checks only; replaceable; the page smoke checks.
- **dependency-cruiser (B9 lean):** 18.7.0; MIT; sverweij; https://github.com/sverweij/dependency-cruiser; 34 releases in a year; 0/0; Node ^22, ^24 or >=26; $0; dev only, one config file; a hand-written walk as the fallback; it is the check.
- **gitleaks:** 8.30.1 (a binary); MIT; gitleaks; https://github.com/gitleaks/gitleaks; latest release 2026-03-21, repository active; not in the npm advisory database; any OS; $0 (no Action, no key); the hook and CI only; replaceable; a deliberately planted test secret checks it (assumed).

**Sources (checked 2026-10-30):**
- https://registry.npmjs.org (each package's metadata)
- https://github.com/advisories (via `gh api /advisories`)
- https://github.com/advisories/GHSA-2p57-rm9w-gvfp
- https://github.com/modelcontextprotocol/typescript-sdk/tree/main/packages/middleware/node
- https://learn.microsoft.com/en-us/azure/azure-sql/database/azure-sql-passwordless-migration-nodejs
- https://nodejs.org/api/sqlite.html
- https://nodejs.org/api/crypto.html
- https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md
- https://github.com/gitleaks/gitleaks-action
- https://github.com/homebridge/ffmpeg-for-homebridge
- https://docs.npmjs.com/cli/v11/commands/npm-sbom
- https://github.com/nikeee/kysely-sqlite (secondary, for the Kysely option)

## The human on I6 (2026-11-01)

**The human, verbatim:** "1. Yes, your lean
2 - explain the no Engine strict"

**The agent's reading:**
- "1. Yes, your lean" answers question 8 only: keep I2 (Node 26 everywhere, Node 24 as the fallback), with the tracked Node 26 spike widened to ring-client-api 14.3.0. **Confirmation:** human-confirmed (lens-question, scope I6 finding (1)).
- "2 - explain the no Engine strict" asks for an explanation of the group C item "No `engine-strict`". It does not answer question 9: groups A, B and C are not yet accepted. Question 10 re-asks it after the explanation.

**Finding (1) decided:** I2 stands. The tracked Node 26 spike covers oidc-provider and ring-client-api 14.3.0.

**A refinement of the I2 fallback** (known, from the engine check; not a new decision): Stryker 10.1.1 pulls in Babel 8, which declares `^22.18.0 || >=24.11.0`, so the Node 24 fallback's floor is 24.11 for the dev tools (the runtime alone needs 24.7, for `crypto.argon2`). The dev PC's Node 24.13.0 passes.

**The explanation given (no engine-strict):**

```text
 WHAT CHECKS WHICH NODE VERSION (tested on your Node 24.13 with npm 11.9)

 +-----------------+-------------------------+---------------------+--------------------+
 | Setting         | What it checks          | On a mismatch       | On Node 26 today   |
 +-----------------+-------------------------+---------------------+--------------------+
 | engines, npm's  | every package's         | a warning; the      | 1 warning:         |
 | default         | declared Node range     | install goes on     | ring-client-api    |
 |                 | (403 of our 565 declare | (exit 0)            | 14.3.0             |
 |                 | one)                    |                     |                    |
 +-----------------+-------------------------+---------------------+--------------------+
 | engine-strict   | the same 403 ranges     | an error; the       | npm ci fails in    |
 | on              |                         | install stops. Only | CI, in each image  |
 |                 |                         | --force gets past   | build and on the   |
 |                 |                         | it                  | PC                 |
 +-----------------+-------------------------+---------------------+--------------------+
 | devEngines at   | only the Node running   | an error (default), | passes (our range: |
 | our root        | our own install, ci and | before anything     | Node 24.11 or      |
 | (option)        | run                     | runs                | later, or 26)      |
 +-----------------+-------------------------+---------------------+--------------------+
```

- **`engines`:** each npm package may declare the Node versions it supports. By default npm treats this as advisory: a mismatch prints an EBADENGINE warning and the install goes on.
- **`engine-strict`:** an npm setting (default off) that turns every mismatch, in any package of the tree, into an error that stops the install. Only `--force` gets past it, and `--force` also removes npm's other install protections, so using it everywhere would be worse than leaving engine-strict off.
- **On Node 26, exactly one package is outside its range:** ring-client-api 14.3.0. With engine-strict on, `npm ci` would fail in CI, in each image build and on the dev PC, which contradicts I2.
- **Why that warning is not evidence of a break:** 14.3.0 was published on 2026-02-08, before Node 26.0.0 existed (2026-05-05), so its range could not name 26. Its main branch already declares 26. The widened spike and the CI tests on the image's Node are what prove it works.
- **The cost of leaving it off:** every Node 26 install prints one EBADENGINE warning for ring-client-api until a release declares 26. npm has no setting to silence it for one package (assumed, from npm's config reference). A dependency update that newly declares it does not support our Node would only warn, not fail; the tests on the image's Node catch real breaks.

**One option added to group C (a proposal, the agent's lean; under question 10):**
- **`devEngines.runtime` in the root package.json:** Node `^24.11 || ^26`, with onFail error (the default).
  - It checks only the Node that runs our own project's `npm install`, `npm ci` and `npm run`, not the dependencies' declarations.
  - A contributor or a CI runner on the wrong Node is stopped at once with a clear message, instead of failing later (for example on a missing `crypto.argon2` or `node:sqlite` class).
  - It is built into npm (from 10.9.0), so no new dependency; $0.
  - Tested locally: `npm ci --ignore-scripts` still checks it, so group C's install flag does not switch it off; it also applies to `-w bridge` and inside `bridge/`; a `devEngines` only in `bridge/` is ignored, so it belongs at the root.
  - The images also pin their Node through the base image, so in the images it is a second check that costs nothing.
- **Not leaned:** a small CI check over the lockfile's recorded engines with an exception list (engine-strict's protection with per-package exceptions). It is one more script to maintain, for little gain while CI tests run on the image's Node.

**I6 at a glance** (what question 10 accepts):

```text
 I6 AT A GLANCE (what question 10 accepts; details in the record and my last message)

 A  CHOSEN BY EARLIER LENSES, recorded with findings (1)-(7)
    runtime: ring-client-api 14.3.0 (werift 0.22.4, push-receiver 4.3.0), ffmpeg
      from the Linux package, MCP server and client 2.4.0, oidc-provider 9.13.3,
      zod 4.6.7, mssql 12.7.13, @azure/identity 4.14.1, keyvault-secrets 4.12.0,
      storage-blob 12.34.0
    dev and CI: typescript 6.0.3, @types/node 26.6.6, eslint 10.14.0,
      typescript-eslint 8.72.1, prettier 3.9.10, eslint-config-prettier 10.1.8,
      vitest and coverage-v8 5.0.5, vite 8.3.5, Stryker 10.1.1, Playwright 1.64.1,
      gitleaks 8.30.1 (a binary)
    Node: I2 kept (Node 26; the fallback is Node 24.11 or later)

 B  THE TWELVE CHOICES (my leans; 9 of 12 add no dependency)
    B1 Hono 4.13 + the SDK's Hono adapter   B7  tagged templates, escaping by default
    B2 ws 8.22, on both ends                B8  crypto.argon2 (built in)
    B3 our own JSON logger (allow-list)     B9  dependency-cruiser 18.7 (dev only)
    B4 hand-wired in the Host's wiring      B10 git's core.hooksPath, set by prepare
    B5 node:sqlite (built in)               B11 npm sbom + a license allow-list
    B6 hand-written SQL, numbered           B12 GitHub Actions service containers
       migration files

 C  THE SUPPLY-CHAIN POLICY
    - exact versions, one lockfile, npm ci everywhere
    - install scripts off in the CI and image install commands only
    - no engine-strict
      + OPTION (my lean): devEngines at the root, Node ^24.11 || ^26
    - npm overrides pin werift's five parts
    - npm audit fails on high or critical; ip goes on a written exception list
    - the license allow-list; two no-license packages reviewed at plan
    - Dependabot alerts and weekly grouped updates
    - an FR-013 record for every new dependency before it merges
    - gitleaks as a pinned binary, checked by checksum

 Cost: $0 for all of it; no Azure change.
```

## I6 decided (2026-11-01)

**The human, verbatim:** "I accept"

**The agent's reading:** this accepts question 10 as presented: groups A, B and C as proposed, including the devEngines option in group C, which was shown as the agent's lean. It covers I6 only, not I7 or I8. If the human meant "without devEngines", that one line is removed.

**Confirmation:** human-confirmed (lens-question, scope I6; finding (1) was confirmed separately on 2026-11-01).

**What was decided:**
- **Group A:** recorded as listed, with findings (1)-(7) and their handling: I2 kept, with the Node 26 spike widened to ring-client-api 14.3.0 (finding 1); the `ip` advisory on the audit exception list (2); ffmpeg from the Linux package, with install scripts off (3); oidc-provider in the Node 26 spike (4); typescript 6.0.3 pinned exactly (5); exact pins (6); werift's parts pinned by overrides (7).
- **Group B, the twelve leans:** B1 Hono 4.13 with the SDK's Hono adapter; B2 ws 8.22 on both ends; B3 our own JSON logger (allow-list); B4 hand-wired DI in the Host's wiring files; B5 `node:sqlite`; B6 hand-written SQL per dialect, with numbered migration files; B7 tagged templates that escape by default; B8 `crypto.argon2`; B9 dependency-cruiser 18.7 (dev only); B10 git's `core.hooksPath`, set by npm's `prepare`; B11 `npm sbom` with a license allow-list; B12 GitHub Actions service containers, with compose locally.
- **Group C, the policy,** as listed under "Group C", plus `devEngines.runtime` at the root (Node `^24.11 || ^26`, onFail error).
- **The FR-013 records** for every new dependency are the ones listed under "I6 in detail"; they go into `implementation-rules.yml` (`dependency_policy`, stance `approved-new-dependencies`) at lens close.
- **Needs for implement, not written now:** the small audit-exception script over `npm audit --json`; the small license check over `npm sbom`.
- **Cost:** $0; no Azure change.

## I7 research (2026-11-01)

**How it was gathered:** Specrew's catalog `code-rules.yml` (the 19 `baseline-default` rules and the remaining `decision-prompt` rules) read in full; the earlier lens records checked for what each rule is already settled by; the docs below fetched; one local check on Node 24.13.0.

**What was found (evidence tags):**
- **node:sqlite is synchronous** (known, Node v26.13.0 docs): "All APIs exposed by this class execute synchronously", for `Database`, `Statement` and the SQL tag store; `DatabaseSync` is a deprecated alias of the same class. The page shows no promise or worker API. This meets `code-rule.never-block-event-loop`, so it is asked as question 11. better-sqlite3 is synchronous too, so B5 stands either way.
- **ESLint's `max-depth`** (known, its source on the main branch): it counts `if` (not `else if`), `switch`, `try`, the loops and `with`; each function, arrow function and static block starts its own count; the default maximum is 4. So with I3's exceptions, a `try` at a client edge uses one level.
- **ESLint's `no-restricted-exports`** (known, its docs): a built-in rule; its `restrictDefaultExports` option forbids default exports in all five forms. No new dependency.
- **typescript-eslint's `naming-convention`** (known, its docs): feature-frozen but maintained; needs type information only when its `types` option is used; its `custom` regex option forbids an `I` prefix on interfaces. Not in a shared preset; turned on by hand.
- **`crypto.argon2` and `crypto.argon2Sync`** both exist (known, checked on the local Node 24.13.0); the async one runs off the event loop (assumed, as Node's other async crypto functions do).
- **vendor-neutral-observability** is settled by OR1 (closed lens): the human chose "Reasonable", structured JSON logs to stdout, with no OpenTelemetry in v1.
- **Already decided at I2,** so carried, not asked: `code-rule.type-inference-deliberate`; `switch-exhaustiveness-check`; typescript-eslint's stylistic preset.

## I7 in detail (proposal, awaiting the human)

**I7.1 The baseline,** pre-checked; the human names only exceptions:

```text
 I7.1 THE BASELINE: SPECREW'S 19 DEFAULT RULES, PRE-CHECKED
 [x] applies   [ ] exception   * a change to how the rule is checked, with its reason

 [x]  1 intent-revealing-names        names say the role; the naming rules are I7.3
 [x]  2 short-functions               split by intent
 [x]  3 avoid-deep-nesting            two levels of logic; ESLint max-depth set to 3,
                                      because it also counts a try block (I3) *
 [x]  4 dependency-injection          seams taken in the constructor, wired by the Host
                                      (B4)
 [ ]  5 dtos-between-services         EXCEPTION 1, decided at I1: CD4 wins; the component
                                      that declares a schema exports its DTOs
 [x]  6 avoid-common-utility-libs     utilities/ holds only its 7 named folders; no
                                      common/, helpers/ or utils/
 [x]  7 immutability-intent           const, readonly, as const
 [x]  8 comments-wisely               names tell the story; TSDoc on every entry file's
                                      exports
 [x]  9 no-magic-numbers              named constants; checked in review only, because
                                      the lint rule flags HTTP codes and test data *
 [x] 10 optimize-apis-for-call-site   read each API from its caller's side
 [x] 11 stronger-domain-types         string unions and brands, not enums (I2, CD4)
 [x] 12 object-invariants             guard at construction; parse untrusted input at the
                                      edges (zod)
 [x] 13 no-leaky-mutable-internals    hand out readonly views, not internal arrays or
                                      maps
 [x] 14 normalize-state               one owner per fact; derive the rest
 [x] 15 simple-trustworthy-tests      as decided at I4
 [x] 16 docs-as-api-test              a tool that is hard to describe in its MCP
                                      description gets reshaped
 [x] 17 language-native-constructs    components are classes (CD3, CD5); logic helpers
                                      are module functions; DTOs are plain data, not
                                      classes
 [x] 18 secure-coding-defaults        as decided at security-compliance
 [x] 19 solid-baseline                SRP, OCP, LSP, ISP, DIP, in TypeScript's idiom

 Exceptions: 1 (decided). Checking changes: 2 (marked *). Nothing else changes.
```

- **Exception 1 is decided** (I1, row 8): `code-rule.dtos-between-services` is unchecked; CD4's rule replaces it as a custom rule.
- **Two changes to how a rule is checked** (not exceptions; each recorded with its reason):
  - `code-rule.avoid-deep-nesting`: ESLint `max-depth` at 3, not 2. ESLint counts a `try` block as a level, and I3's error mapping puts one at each client edge. Review still flags more than two levels of conditions and loops.
  - `code-rule.no-magic-numbers`: enforcement `[review]` instead of the catalog's `[review, analyzer]`. The lint rule flags HTTP status codes, 0 and 1, and test data; review checks for named constants.
- **The other notes are how each rule reads in TypeScript here,** taken from decisions already made. They do not change the rules.

**I7.2 The lighter choices, I7.3 naming and exports, I7.4 the context rules:**

```text
 I7.2 THE LIGHTER CHOICES (my leans)
 L1 copy-semantics           DTOs are readonly data; each component maps to its own
                             DTOs at its boundary (CD4); structuredClone only for an
                             explicit snapshot
 L2 concurrency-over-locks   one event loop, no locks; no check-then-act across an
                             await on shared state; a queue per key where order matters
 L3 strategy-state           a handler map by kind, or a state object, instead of the
                             same switch in several places; one exhaustive switch is
                             fine (I2)
 L4 declarative-collections  array methods when clearer; for...of for awaits in
                             sequence and early exits; no lodash
 L5 evidence-driven-perf.    no tuning without a measurement; the 0.5 s p95 CI test is
                             the budget; node --cpu-prof (built in) finds the cause

 I7.3 NAMING AND EXPORTS (new project rules, my leans; N1-N4 checked by lint)
 N1  files and folders in kebab-case; each component's entry file is index.ts
 N2  named exports only (ESLint's built-in no-restricted-exports); the tool config
     files at the root are exempt
 N3  PascalCase for types and classes, camelCase for values and functions, UPPER_SNAKE
     for module constants (typescript-eslint naming-convention)
 N4  no I prefix: the seam is the role (QueryLayer), the implementation adds its
     technology (SqliteQueryLayer). IDesign's role words stay (InquiryManager,
     SafetyEngine, RingAccess): they name roles, not symbol kinds
 N5  a class's private state: JavaScript #private fields (my lean) or TypeScript's
     private readonly (the C# habit)

 I7.4 CONTEXT RULES THAT APPLY HERE (shown; one needs your answer)
 never-block-event-loop   ffmpeg as a child process; the async crypto.argon2, never
                          argon2Sync; no sync file calls after start. node:sqlite is
                          synchronous: question 11
 render-purity, hosting   server-rendered pages; templates are pure functions of their
                          data (B7)
 ui-controls-prevent-...  the PIN field takes digits only; the server checks again
 framework-validation     zod at the edges; the JSON Schema comes from zod (I6)
 vendor-neutral-observ.   carried from OR1: JSON on stdout, no vendor SDK in the code;
                          no OpenTelemetry in v1
 technology-enablers      none, settled by the topology. cncf-maturity: not applicable

 Carried from I2, not asked again: explicit types at boundaries, never any;
 switch-exhaustiveness-check; the stylistic preset.   Cost of all of I7: $0.
```

- **I7.2** are the catalog's remaining decision prompts (`copy-semantics`, `concurrency-over-locks`, `strategy-state-over-repeated-conditionals`, `declarative-collections`, `evidence-driven-performance`), each with the agent's lean.
- **I7.3** are new project rules (custom rules, proposed by the agent on their own merits, not from a guide; I1). N1 confirms the entry file's name `index.ts` (from I5). N2 exempts the root's tool config files (ESLint, Vitest, Playwright, Stryker), which need a default export. N3 uses `naming-convention` without its `types` option, so it stays cheap. N5 is a choice:
  - **`#private` fields (the agent's lean):** real privacy at run time, native in Node, erasable-safe; a test or another component cannot reach in, even with a cast. Our tests use fakes for the seams, not spies on private members.
  - **TypeScript's `private readonly`:** the C# habit; checked only at compile time.
- **I7.4** are the applicability-filtered rules that apply here; `cncf-maturity` does not apply (App Service, not Kubernetes).

**Question 11, the SQLite posture:**

```text
 QUESTION 11: node:sqlite RUNS EVERY CALL SYNCHRONOUSLY (Node 26 docs)

 where it matters: the connector's outbox store; in mode A also State and the Event
 Log, on the 0.5 s p95 event path. The core on Azure uses SQL Server (mssql, async).

 (a) accept it, with a recorded reason (my lean)
     short indexed statements on a local file; batches bounded by the D8 pages;
     the 0.5 s p95 CI test also runs in mode A, so it measures this; if it fails,
     move to (b)
 (b) SQLite in a worker thread (worker_threads, built in)
     the loop never waits on the disk; every call becomes a message to the worker:
     more code, a copy of each row, and errors crossing the thread boundary

 better-sqlite3 is synchronous too, so B5 stands either way. Cost: $0 both.
```

**Cost:** $0. Everything is checked by tools already chosen (ESLint's built-in rules, typescript-eslint, tests and review).

## The human on I7 (2026-11-01)

**The human, verbatim:** "I guess the syncronus call to SQLite is non blocking, just might take some time, if so it is OK. And I accept all"

**The agent's reading:**
- **The SQLite part is conditional:** the human accepts (a) "if so", that is, if a synchronous call is non-blocking. That premise is not correct, so (a) is not recorded as decided. The agent corrects the fact and re-asks it as question 13.
- **"And I accept all" answers question 12:** I7.1-I7.4 as proposed, with N5 as `#private` fields (the agent's lean, shown). **Confirmation:** human-confirmed (lens-question, scope I7 question 12). I7 is not marked decided until question 13 is answered.

**The corrected fact** (known, Node's docs and how Node runs JavaScript): Node runs our JavaScript on one thread. A synchronous call holds that thread until it returns, so nothing else in that process runs meanwhile: no other request, no link ping, no timer. "Takes some time" and "blocks" are the same thing here. (A C# comparison: synchronous I/O on a WPF UI thread, except that Node has only that one thread for everything.) The real question is how long each pause lasts.

**How long each pause lasts** (a throwaway timing check in the scratch folder, not project code; run 2026-11-01): `node:sqlite` on the dev PC (Windows, SSD, Node 24.13.0), WAL mode, 2000 rows of 1 KB:

| One call | synchronous=FULL | synchronous=NORMAL |
|---|---|---|
| insert one row, with its own commit | p50 1.5 ms, p95 2.6 ms, max 10.8 ms | p50 0.07 ms, p95 0.18 ms, max 10.4 ms |
| read one row by event_id | p50 0.012 ms, p95 0.023 ms | p50 0.012 ms, p95 0.024 ms |
| read a page of 100 rows by seq | p50 0.17 ms, p95 0.31 ms | p50 0.26 ms, p95 0.39 ms |

- These numbers are known for the dev PC only. On the Hyper-V Ubuntu VM in Docker they are assumed to be similar; the first build measures them.
- That the roughly 10-11 ms maximum in both runs is a WAL checkpoint is assumed.
- Even the worst pause is about 2% of the 0.5 s p95 budget, so (a) stays the agent's lean.

## I7 decided (2026-11-01)

**The human, verbatim:** "a is fine" (question 13), after "And I accept all" (question 12).

**The agent's reading:** question 13 = (a), given the corrected fact: each synchronous `node:sqlite` call pauses that process while it runs, and that is accepted with the recorded reason. Together with question 12, all of I7 is decided. It covers I7 only, not I8.

**Confirmation:** human-confirmed (lens-question, scope I7: question 12 on I7.1-I7.4, question 13 on the SQLite posture).

**What was decided:**
- **I7.1 The baseline:** the 19 rules checked, except `code-rule.dtos-between-services` (exception 1, decided at I1: CD4's rule replaces it as a custom rule). Two changes to how a rule is checked, each with its reason: `avoid-deep-nesting` with ESLint `max-depth` 3 (ESLint counts a `try` as a level; I3 puts one at each client edge); `no-magic-numbers` by review only (the lint rule flags HTTP codes, 0 and 1, and test data).
- **I7.2 The lighter choices** L1-L5 as proposed.
- **I7.3 Naming and exports** N1-N5 as proposed, with N5 = JavaScript `#private` fields.
- **I7.4 The context rules** as shown; `vendor-neutral-observability` carried from OR1 (no OpenTelemetry in v1); `cncf-maturity` not applicable.
- **The SQLite posture (a):** `code-rule.never-block-event-loop` applies, with one recorded exception: `node:sqlite`'s synchronous calls, kept short (indexed statements on a local file; batches bounded by the D8 pages). The 0.5 s p95 CI test also runs in mode A, so it measures this. If that test fails, SQLite moves to a worker thread (option (b)).
- **Cost:** $0.

## I8 research (2026-11-01)

**How it was gathered:** `specrew review --help`, then the module's own script checked before running anything: `--list-hosts` "prints the reviewer catalogue; authorizes nothing" and exits before any review or gate. Then the agent ran `specrew review --list-hosts --code-writer-host claude` (read-only). Its output, verbatim:

```text
=== Continuous co-review: reviewer-host choices ===
(best-effort detection - reflects THIS shell's PATH; the reviewer ultimately spawns in the
 navigator's environment, whose PATH may differ.)

RECOMMENDED (independent of your code-writer - a fresh second opinion), strongest first:
  [DEFAULT] codex  (review-class rank 85)
            copilot  (review-class rank 80)
            cursor-agent  (review-class rank 70)

ALSO SELECTABLE - your current code-writer (NOT independent; pick only if quota/availability
forces it - a same-host fresh-context review is still valid, just a weaker check):
            claude  (review-class rank 85)

NOT AVAILABLE here (no headless CLI on PATH - shown, not dropped):
  antigravity  -  no 'antigravity' command resolved on PATH (best-effort; a desktop-only install exposes no headless CLI)

You may pick ANY listed host - INCLUDING your own code-writer. Independence is the RECOMMENDATION,
not a rule: only you know each host's quota/token status, and you may have to reuse your own.
DEFAULT if you make no choice: codex (the strongest independent host).
Record your pick in reviewer_preference as mode=human-selected with the chosen host.
(Model: Specrew uses each host's OWN default model - it does not yet discover or pin a specific
 model, so none is shown here.)
```

## I8 in detail (proposal, awaiting the human)

- **The choice:** which host reviews the code that Claude (this host) writes.
- **The agent's lean: codex,** the default the command marks. It is independent of the code writer and ranked strongest among the independent hosts. copilot is the next independent choice; claude is selectable but is not an independent check.
- **No model is pinned.** Specrew uses each host's own default model; `reviewer_preference` records the host only.
- **Cost:** each review runs on the chosen host's own plan or quota (assumed); Specrew adds no charge. Only the human knows each host's plan limits.
- **Recording the pick:** `reviewer_preference` in `implementation-rules.yml` (mode `human-selected`), written at lens close. The navigator reads `.specrew/reviewer-hosts.json`, which only `specrew review --host <pick> --authorization-ref workshop-001-ring-mcp-bridge` writes. The agent asks before running it (the human's rule: no scripts or config during the workshop without asking) and never writes that file by hand. If the command errors, the agent shows the error and stops.

## I8 decided (2026-11-01)

**The human, verbatim:** "codex"

**The agent's reading:** the reviewer host is codex (the default the command marks and the agent's lean). It covers the pick only. It does not answer the second half of question 14 (may the agent run the recording command), so that is asked again as question 15.

**Confirmation:** human-confirmed (lens-question, scope I8).

**What was decided:** `reviewer_preference`: mode `human-selected`, host `codex`, no model or effort pinned (Specrew uses the host's own default), source `code-implementation-workshop`, rationale: Claude writes the code, so codex gives an independent review. `authorization_ref` is `workshop-001-ring-mcp-bridge` once the recording command has run.

**Checked before asking (known, Specrew 0.40.0's own script):** with `--host` and `--authorization-ref` and no `--live`, `specrew review` writes only `.specrew/reviewer-hosts.json`, prints "Authorized reviewer host ...", and exits; it runs no review and spends nothing. Neither `.specrew/reviewer-hosts.json` nor `code-rules.local.yml` is git-ignored, and neither holds anything about the human.

## Lens summary (2026-11-01; the lens closed on "move on")

```text
 LENS 10 SUMMARY: HOW THE CODE IS WRITTEN (all eight decision points decided)

 I1 source        Specrew's defaults with the corrections (rows 2-10); no outside style
                  guide
 I2 stack         Node 26 LTS everywhere (fallback 24.11 or later); TypeScript 6.0
                  alone, 7.1 later; erasable syntax, tsc builds JS for the images; ES
                  modules with nodenext; strict plus extras; ESLint 10 with
                  typescript-eslint's strict and stylistic type-checked presets;
                  Prettier
 I3 errors        exceptions; each component declares its own error class with a closed
                  kind union; each client maps errors to D7's codes
 I4 tests         stand-ins for the seams; the scenario engine; a fake Entra (a second
                  oidc-provider); payloads committed after the scrub and your review;
                  Vitest 5; coverage 90% lines, 85% branches; weekly Stryker; test-first
                  for engines, parsers, Normalize and bug fixes
 I5 layout        one npm workspace: bridge/ (core and connector) and shim/; one wiring
                  file per run mode; relative imports; unit tests beside the code
 I6 dependencies  groups A, B and C as proposed, with devEngines; 9 of 12 choices add
                  nothing; new: Hono, ws, dependency-cruiser (dev only)
 I7 rules         the 19 defaults minus exception 1 (CD4: the declaring component
                  exports its DTOs); max-depth 3; magic numbers by review; L1-L5; N1-N5
                  with #private; synchronous SQLite, posture (a)
 I8 reviewer      codex, independent of Claude, the code writer

 Cost: $0 in Azure; CI about 1,830 minutes a month, within the included allowance (I4).
```

```text
 CLOSING THE LENS WRITES (on your "move on"), under specs/001-ring-mcp-bridge/

 implementation-rules.yml          the manifest: rules by id, the decisions, the custom
                                   rules (CD4, N1-N5), the dependency records, reviewer
 lens-applicability.json           the lens entry (human-confirmed)
 workshop/component-design.md      the two I4 amendments: scenario engine, fake Entra
 workshop/code-implementation.md   marked CLOSED
 and .specrew/handover/            refreshed by Specrew's own script

 ONLY WITH YOUR YES
 Q15 .specrew/reviewer-hosts.json  written by: specrew review --host codex
                                   --authorization-ref workshop-001-ring-mcp-bridge
                                   (records the pick only; no review runs, nothing spent)
 Q16 code-rules.local.yml          the corrections file at the project root (below)
```

**The corrections file** (from I1 (a): written at close only with the human's confirmation):

```text
 Q16: code-rules.local.yml at the project root (adds to Specrew's catalog, drops nothing)

 code-rule.ts.strictness-posture (overrides the shipped text; rows 2-4)
     strict plus the project's extra checks; ES modules only, nodenext (TS 6.0
     deprecated and 7.0 removed node10, classic and baseUrl); Prettier formats; ESLint
     flat config (ESLint 10 takes no other) with typescript-eslint's type-checked
     presets, typed linting everywhere

 code-rule.ts.tooling-compiler-api (new; row 5)
     TypeScript 7.0 has no compiler API (7.1 brings one); pin the TypeScript the lint
     tools support (6.0 for typescript-eslint today), and move up when they declare
     support

 code-rule.ts.erasable-syntax (new; row 6)
     Node's type stripping is stable but runs only erasable syntax (no enums,
     namespaces or parameter properties); decide it per project; here: erasable only,
     with tsc building JS for the images

 Not in this file: row 7 (which Node) and row 8 (CD4) go into the manifest; rows 9-10
 are notes for Specrew (a need, reported later; no Specrew file is changed).
```

## Recorded for later decision points (from I1-I8; 2026-10-29 to 2026-11-01)

- **I4:** decided (see "I4 decided").
- **Component-design amendments, accepted with I4 (write at close):** the scenario engine (generic in the repository; the human's own home only as a local-only file); a second oidc-provider as the fake Entra for the integration tests.
- **I5:** decided (see "I5 decided").
- **For I6, from I5:** the dependency-check tool must check reachability from each wiring file.
- **For I7, from I5:** the entry file's name `index.ts`. (Taken into the I7 proposal as N1.)
- **Later, from I5:** whether the bridge or the shim is also published on npm is decided at the public release (DO7); a published package ships built JS. How open-source users run mode A and the shim (the README path) is a need for plan.
- **I6:**
  - zod already comes with the MCP server package, and zod 4 writes JSON Schema itself, so the validation library and the JSON Schema export may need no new dependency.
  - `crypto.argon2` is built in from v24.7.0 (its stability index is not yet found), so the PIN hash may need no native package.
  - `node:sqlite` is a release candidate on Node 26, so SQLite may need no new dependency.
  - Decorator-based DI containers are out (I2.3 (c), decided 2026-10-30).
  - New dev dependencies from I4, each needing the full FR-013 record: Vitest 5; its V8 coverage provider (to verify whether it is a separate package); Vite (a peer of Vitest); StrykerJS and its Vitest runner; Playwright. CI tools, not npm dependencies: the SQL Server and Azurite container images.
- **I7:** exception 1 is decided (row 8, CD4 wins). Named exports and naming conventions, if proposed, are proposed there on their own merits.
- **Tracked follow-ups (from I2):**
  - switch to TypeScript 7.1 once typescript-eslint declares support;
  - spike: check oidc-provider (it declares no engines) and ring-client-api 14.3.0 (it declares Node 20, 22 and 24) on Node 26, widened 2026-11-01 (I6 finding (1)); fall back to Node 24.11 or later if a spike finds a break.
- **Plan (from I3):** the home connector's container restart policy (devops-operations records none).
- **Plan (from I7):** SQLite's `synchronous` setting, FULL or NORMAL. Each commit costs about 1.5 ms against about 0.07 ms on the dev PC. NORMAL in WAL mode may lose the last commits on a power cut (assumed, not checked in SQLite's docs). That touches the outbox's at-least-once promise, so plan decides it with data-storage's D4.
- **From I4, for implement:** committing the recorded payloads needs the human's review of the scrubbed files and an explicit ask before the commit.

## Questions to the human

1. I1: do you have a coding guideline or example project(s) to emulate, or should Specrew's defaults apply? (Answered 2026-10-29: none; check the web and Specrew's defaults.)
2. I1: (a) Specrew's defaults with the corrections, (b) the same plus the Google TypeScript Style Guide, or (c) as shipped? (Answered 2026-10-29: "a".)
3. I2: accept the toolchain as proposed (Node 26 LTS; TypeScript 6.0 alone now, 7.1 later; erasable syntax only, built to JS for the images; strict plus the extras; ES modules with nodenext; ESLint 10 with typescript-eslint's strict type-checked rules, and Prettier), change any part, or step through the parts one at a time? (Answered 2026-10-30: "I go with your recomandations", read as all of I2 as proposed.)
4. I3: (a) exceptions everywhere, (b) expected failures as values and bugs as exceptions, or (c) other? And the four points proposed with it? (Answered 2026-10-30 with exceptions, in the human's own words; the four points were not answered.)
5. I3: is the agent's reading right (exceptions for the unexpected and for errors meant for the original caller; known local cases are ordinary return values; each component declares its own errors)? And do the four points, as revised, stand? (Answered 2026-10-30: "confirmed".)
6. I4: accept I4.1-I4.6 as proposed (with the recorded payloads as (i) or (ii), and the runner as (a) or (b)), change any part, or step through them one at a time? (Answered 2026-10-30: "agree with your recommendation", read as all of I4 as proposed, with (i) and (b).)
7. I5: accept (b), a bridge package and a shim package in one npm workspace, with the folders (I5.2) and the dependency-check rules (I5.3) as proposed; pick (a) or (c); change any part; or step through them one at a time? (Answered 2026-10-30: "option b, you're lean", read as (b) with I5.2 and I5.3 as proposed.)
8. I6, finding (1): keep I2 (Node 26 everywhere, the spike widened to ring-client-api), or start the connector on Node 24? (Answered 2026-11-01: "Yes, your lean", read as keep I2 with the spike widened.)
9. I6: accept group A's records and findings, the twelve group B leans and the group C policy; change any part; or step through B1-B12 one at a time? (2026-11-01: the human asked "explain the no Engine strict" first; re-asked as question 10.)
10. I6: accept groups A, B and C as proposed, with or without the devEngines option in group C; change any part; or step through B1-B12 one at a time? (Answered 2026-11-01: "I accept", read as A, B and C as proposed, with devEngines.)
11. I7, the SQLite posture: (a) accept node:sqlite's synchronous calls with a recorded reason, measured by the 0.5 s p95 test run in mode A, or (b) SQLite in a worker thread? (2026-11-01: accepted on the condition that the calls are non-blocking, which is not correct; re-asked as question 13.)
12. I7: accept I7.1-I7.4 as proposed (with N5 as `#private` fields or `private readonly`); change any part; or step through the four parts one at a time? (Answered 2026-11-01: "And I accept all", read as I7.1-I7.4 as proposed, with `#private`.)
13. I7, the SQLite posture, re-asked: knowing that each synchronous call pauses everything else in that process while it runs (on the dev PC, under 3 ms at p95, about 11 ms at worst), is (a) still OK, or (b) a worker thread? (Answered 2026-11-01: "a is fine".)
14. I8: which host reviews the code (codex, the default and the agent's lean; copilot; cursor-agent; or claude), and may the agent run `specrew review --host <pick> --authorization-ref workshop-001-ring-mcp-bridge` to record it? (Answered 2026-11-01: "codex"; the second half was not answered, so it is question 15.)
15. May the agent run `specrew review --host codex --authorization-ref workshop-001-ring-mcp-bridge` (it writes only `.specrew/reviewer-hosts.json`; no review runs)? (Still open: "move on" did not answer it. Not run; `authorization_ref` is null in the manifest.)
16. May the agent write `code-rules.local.yml` at the project root with the three rules shown? (Still open: "move on" did not answer it. Not written; the corrections live in the manifest's decisions meanwhile.)
17. Lens 10: "move on" to close it, or change anything first? (Answered 2026-11-01: "move on".)

## Pacing

The lens has 8 decision points (I1-I8). The agent asks I1 first, as the lens requires, and offers a choice for I2-I8: all at once, or one at a time. The human said there is no guideline and asked for web research and a check of Specrew's defaults; the human did not pick a pace, so the agent goes one at a time. The agent researched, found Specrew's TypeScript rule right in direction but dated, and one baseline rule in conflict with CD4, and asked I1 as (a), (b) or (c). The human picked (a) for I1. The agent researched I2 (Node and library versions, type stripping, TypeScript 7 and the linter) and presented I2, with the two real choices (I2.2 and I2.3) first and the rest as defaults. The human accepted I2 as proposed (read as I2 only, not I3-I8). The agent presented I3 with options (a), (b) and (c), the per-client mapping, and four points proposed with it. The human answered I3 with exceptions, in their own words; the agent stated its reading, corrected its earlier claim about (a), and asked to confirm the reading and the four points. The human also gave an early input for I4 (simulation of the real devices and services), recorded for I4. The human confirmed I3. The agent researched I4 (test runners, coverage, Azurite, CI minutes) and presented it in six parts, built on the human's input. The human accepted I4 as proposed (read as I4 only, with payloads (i) and Vitest), and the agent began preparing I5. The agent researched I5 (Node and TypeScript files, symlinks, conditions, npm workspaces) and presented three options for the packages, the folders and the dependency-check rules. Before presenting, the agent corrected I5.2 and I5.3 so that each process loads only its own side's code (one wiring file per run mode; seam implementations in their own files; the check counts what is reachable from each start). The human accepted I5 as (b), the agent's lean (read as I5 only, with the folders and the check rules as proposed), and the agent began preparing I6. The agent researched I6 (registry metadata and advisories for every candidate, the MCP SDK's adapters, node:sqlite, crypto.argon2, managed identity for SQL, ffmpeg's build, gitleaks, npm sbom) and presented it in three groups: already chosen, the twelve real choices, and the policy. It corrected an I2 research fact (ring-client-api 14.3.0 does not declare Node 26). Before presenting, the agent ran a day-one check of the whole tree (npm audit and npm sbom on a lockfile resolved from metadata only) and checked node:sqlite on the local Node 24, then adjusted group C (the audit exception and the license allow-list need small scripts; install scripts off only in CI and image commands; werift's wildcard parts pinned) and asked finding (1) as its own question. The human kept I2 (finding (1), the agent's lean) and asked for an explanation of "no engine-strict". The agent checked every package's declared Node range in the day-one lockfile, tested npm's engine warning, engine-strict and devEngines on the local Node 24, explained why engine-strict would block Node 26, offered devEngines at the root as an option for group C, recorded the fallback's 24.11 floor, and re-asked the rest of I6 as question 10. The human accepted I6 ("I accept", read as groups A, B and C as proposed, with devEngines), and the agent began preparing I7. The agent read Specrew's 19 baseline rules and the remaining decision prompts, checked what earlier lenses already settle, and found that node:sqlite runs synchronously, which meets the event-loop rule; it presented I7 in four parts, with the SQLite posture as its own question. The human accepted I7.1-I7.4 ("I accept all", with `#private`) and accepted the SQLite posture on the condition that synchronous calls do not block. That premise is not correct, so the agent timed single node:sqlite calls on the dev PC in the scratch folder, corrected the fact, and re-asked the SQLite posture as question 13. The human confirmed SQLite posture (a) ("a is fine"), so I7 is decided. The agent checked that `specrew review --list-hosts` only reads, ran it, and presented its output verbatim for I8, with codex as the lean. The human picked codex for I8. The agent checked that the recording command writes only the reviewer file and spends nothing, then presented the lens summary, what closing writes, and the corrections file, and asked for the two permissions and "move on" as separate questions. The human said "move on". The agent read it as question 17 only, closed the lens, wrote implementation-rules.yml by hand (validated with Specrew's own validator: no errors), recorded the lens in lens-applicability.json, added the two I4 amendments to component-design.md, and left questions 15 and 16 open, re-asking them.

## Lens closed

2026-11-01: the human, verbatim: "move on". Lens 10 is closed, and with it the workshop (all ten lenses closed).

- **Written at close:**
  - `specs/001-ring-mcp-bridge/implementation-rules.yml`: 55 rule selections by id (two unchecked: `code-rule.dtos-between-services`, exception 1; `code-rule.cncf-maturity`, not applicable), 8 custom rules (CD4, N1-N5, the built-in-first choices, the supply-chain policy), 30 FR-013 dependency records, the reviewer preference, `resolved_stack` `typescript-javascript`. Validated with Specrew 0.40.0's `Test-SpecrewImplementationRulesManifest` against the schema and the catalog: no errors.
  - the `code-implementation` record in `lens-applicability.json`;
  - the two I4 amendments in `component-design.md`.
- **Not done, awaiting the human:** question 15 (the reviewer recording command; until it runs, the co-review at implement finds no authorized host in `.specrew/reviewer-hosts.json`) and question 16 (`code-rules.local.yml`). Rows 2-6 of the corrections are in the manifest's decision for `code-rule.ts.strictness-posture`, row 7 in `code-rule.lts-version-check`, row 8 in the CD4 custom rule.
- **Next:** speckit-specify writes the spec from the ten lens records; then the agent stops at the specify boundary for "approved for specify".
