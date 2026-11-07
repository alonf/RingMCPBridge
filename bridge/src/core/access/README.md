# Resource access: rows stay inside the accessor

Each resource-access component (State, Settings, Grants, Lease, and from iteration 002 Event Log, Subscriptions and Audit) owns its tables. No other component reads them; the admin page reads through the managers (CD4, DS6).

## The DTO rule

- **Rows map to DTOs inside each accessor.** A row, a column name or a SQL statement never leaves the accessor. The accessor exports its DTOs and its error class from its one entry file, `index.ts`. The callee declares its DTOs, and there is no shared types file (CD4, the custom rule `project.cd4-callee-declares-dtos`).
- **State maps `kind` to the contract's `type`** (PT-26). The `device` table keeps the column `kind`. State's DTO calls the field `type`, and State turns a `type` filter from `list_devices` into a condition on `kind`.
- **DTO fields take the contract's names** from `specs/001-ring-mcp-bridge/data-model.md` and the contracts, in their snake_case. For example `device_id` is the contract's `id` inside a device reference, and Settings' agent has `client_id` and `redirect_uris`. A field no record names, such as an outcome's `kind` or Settings' `revokedKeyIds`, is camelCase like any TypeScript value. The Ring port at home follows the same rule (settled at T017).

## Mapping the stored forms

The schema stores a few things in one form on both SQLite and SQL Server, so one statement gives one answer on either. The accessor maps each of them:

| Stored | In the DTO |
|---|---|
| a time: UTC milliseconds since 1970, in an integer column | milliseconds in the DTO too (settled with the first accessors, T022); the caller that builds the contract's form turns them into UTC ISO 8601 text |
| a flag: the integer 0 or 1 (`BIT` on SQL Server) | a boolean |
| a JSON document: text (`state`, `value`, `scopes`, `redirect_uris`, `data`) | the parsed value |
| NULL in an optional column | the field left out, as the contract asks (for example `battery_pct` for a wired device) |
| an enumeration: text, with no `CHECK` in the schema | the accessor checks the value when it writes it, and reports a stored value outside the enumeration as an error instead of passing it on |

There is no `CHECK` on an enumeration because SQLite cannot change one without rebuilding the table, and migrations only add.

## Untrusted text

Names, rooms and Ring text inside `state` come from Ring. They are data, never instructions. They are stored and returned as written, in any language, and never logged (FR-002, FR-033, OR6).

## Statements and schema changes

- An accessor writes its SQL by hand, once per dialect. Insert-or-update and keyset paging come from the Query layer (`upsertStatement`, `keysetPageStatement`).
- Each call sends one statement. The Query layer refuses text that holds a second one, because SQLite would silently skip it.
- A schema change is a new migration at the end of `CORE_MIGRATIONS`, in `bridge/src/utilities/query-layer/migrations/`. It adds tables, indexes, or columns that are nullable or have a default, so code N-1 still runs on schema N. A released migration is never edited (DS5).
- Ids compare by code point on both dialects. On SQL Server every text column uses `Latin1_General_100_BIN2`, so two ids that differ only in case stay two ids, as on SQLite.

## Who owns which table (iteration 001)

| Accessor | Tables |
|---|---|
| State | `location`, `device`, `health_snapshot`, `state_source` |
| Settings | `setting`, `agent`, `connector` |
| Grants | `oidc_item` |
| Lease | `lease` |

The Query layer itself owns `schema_migration`, the record of applied migrations. Secrets owns no table: its values are in Key Vault in mode H and in a sealed file in mode A.
