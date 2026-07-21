# Agentic usability improvements

Status: CLI implementation complete; API/OpenAPI follow-up pending

This document turns the agentic usability feedback for `@uptimerobot/cli/0.1.0` into an implementation contract. It separates work that can be completed entirely in this repository from changes that need to be made to the public API or its OpenAPI document.

The goal is that a developer or coding agent can discover, construct, validate, execute, and verify an API operation using only the installed CLI. Access to the UptimeRobot API repository or dashboard source must not be necessary.

## Outcomes

After the CLI work in this document:

- complex request fields explain their accepted shape and report an indexed field path when invalid;
- monitor create and update share the same typed request vocabulary where the API contract permits it;
- every failure is machine-readable when machine-readable output was requested;
- monitor request schemas and examples can be inspected without authentication or networking;
- monitor create and update requests can be compiled and validated without being sent;
- Keyword monitors cannot accidentally be created with `HEAD` through the CLI;
- human collection output makes another page visible without changing stdout or JSON contracts;
- common command-name guesses work;
- JSON output flags have one clearly documented model; and
- boolean help distinguishes an explicit value from an omitted value and displays API defaults when the contract provides them.

## Baseline facts that shaped the design

These details have been verified against the checked-in OpenAPI snapshot and current implementation:

- `AlertContactSettings` already described `alertContactId`, `threshold`, and `recurrence`, including required fields and property examples. The old generator reduced the item to `itemType: "object"`, so the help and validator lost that structure.
- Monitor-create request examples already existed on the `application/json` media type. The old generator ignored them and emitted only a bare command example.
- `UpdateMonitorDto` already existed and exposed update properties. The old generator only extracted named body fields from discriminated request bodies, so ordinary object bodies such as monitor update retained only `--body` and `--set`.
- The modern write field is `regionData`, the deprecated scalar write field is `regionalData`, and monitor responses expose an object under `regionalData`. That read/write mismatch cannot be repaired by renaming one CLI flag.
- Normalized JSON collection output already contains `items` and `nextCursor`. The missing behavior is a notice in table/plain output, not a new JSON pagination shape.
- The API already performs duplicate-monitor detection and can return a structured `409`. This reduces accidental duplicates but is not request idempotency.
- The API client retries only safe read methods. It does not automatically retry monitor creation.
- A Keyword request with an omitted method can inherit the API's `HEAD` behavior. Because a `HEAD` response has no body, this is a real Keyword-monitor correctness footgun.
- The current snapshot contains contract inconsistencies that must not be silently treated as truth. In particular, `successHttpResponseCodes` declares `default: []` while its description says the default is `[2xx, 3xx]`, and `AssertionCheckDto.target` is emitted as an object even though its examples and intended values include scalars.

## Responsibility boundary

### This CLI repository owns

- command and flag ergonomics;
- generated help presentation;
- preservation of useful OpenAPI metadata in generated operation descriptors;
- local, best-effort request validation;
- deterministic request compilation;
- output-mode selection and CLI error serialization;
- aliases and command suggestions;
- pagination notices based on response metadata already returned by the API; and
- compatibility aliases for CLI flag names.

### The API and OpenAPI contract own

- actual server defaults and accepted values;
- canonical read and write field names and shapes;
- cross-field and monitor-type-specific validity enforced by the server;
- the public error schema and validation-error paths;
- exact collection totals and cursor correctness;
- server-backed validation, if required;
- request idempotency and its retention/conflict semantics; and
- authoritative examples and descriptions of API behavior.

The CLI may add a narrowly scoped safety guard when current server behavior is dangerous, as with Keyword plus `HEAD`. It must not invent general API semantics or silently reshape raw JSON responses.

## Decisions at a glance

|   # | Feedback                                | CLI decision                                                                                                                 | API/OpenAPI follow-up                                                                 |
| --: | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
|   1 | Alert-contact shape and unfielded error | Preserve recursive array-item schemas, show JSON shapes, accept a bare contact ID as a convenience, and report indexed paths | Optional canonical array example; the item schema itself already exists               |
|   2 | Keyword defaults to `HEAD`              | Default Keyword creates to `GET` locally and reject explicit `HEAD`                                                          | Make `GET` the server default for Keyword and describe/enforce it in the schema       |
|   3 | Create/update asymmetry                 | Generate typed flags from ordinary object bodies, including `UpdateMonitorDto`                                               | Clarify nullable and conditional PATCH semantics                                      |
|   4 | Three region representations            | Present `--region` and `--region-config`; keep old spellings as compatibility aliases                                        | Adopt one canonical request/response name and shape                                   |
|   5 | Mixed error formats                     | Add one error boundary and stable JSON envelope for parser, local, auth, network, and API failures                           | Publish and use a shared API error schema with field paths                            |
|   6 | Silent pagination                       | Write a continuation notice to stderr for human table/plain output                                                           | Return an exact total if “N of M” is desired and guarantee correct cursor termination |
|   7 | No dry-run or schema discovery          | Add request compilation via `--dry-run` and `monitors schema <type>`                                                         | Optional server validation endpoint for authoritative validation                      |
|   8 | Bare examples                           | Consume OpenAPI examples and generate variant-matched runnable invocations                                                   | Add/fix operation examples where the contract has none or is unsafe                   |
|   9 | Duplicate risk                          | Preserve structured `409`s, document safe verification, and do not add a racy existence check                                | Add `Idempotency-Key` semantics and document duplicate conflicts                      |
|  10 | Command guesses                         | Add `auth whoami` and `user get` aliases plus nearest-command suggestions                                                    | None                                                                                  |
|  11 | Three JSON flags                        | Keep compatibility and make the distinction explicit everywhere                                                              | None                                                                                  |
|  12 | Boolean defaults absent                 | Render documented API defaults without sending omitted flags; identify undocumented defaults                                 | Publish truthful defaults and fix contradictory defaults                              |

## Detailed CLI implementation

### 1. Preserve and explain structured array items

#### Problem

An array such as `assignedAlertContacts` reaches the generated operation descriptor only as “array of object.” The CLI therefore prints `<value>`, cannot show the object members, and validates only that each item is some object. Initial parsing errors also lose the flag and array index.

#### Decision

Introduce a reusable recursive request-schema descriptor. It must retain, where present:

- object properties and required members;
- array item schemas;
- types and nullability;
- descriptions, deprecation, examples, and defaults;
- enums;
- numeric and string bounds; and
- array size bounds.

The generator will dereference request `$ref` values into this bounded descriptor with cycle protection. Generated commands continue to be thin entrypoints; the richer metadata remains in the generated operation registry.

Help behavior:

- arrays of scalar values keep a scalar help value such as `<number>` or `<option>`;
- objects use `<json>`;
- arrays of objects use `<json>...`, not `<value>...`;
- the description includes a compact item shape or representative example; and
- array item enum/range information is rendered, including region choices such as `na|eu|as|oc`.

For the common alert-contact case, `--assigned-alert-contacts` accepts either form and remains repeatable:

```sh
# Convenience form
--assigned-alert-contacts 7448212

# Full API form
--assigned-alert-contacts '{"alertContactId":7448212,"threshold":0,"recurrence":0}'
```

A bare numeric ID is compiled to:

```json
{
  "alertContactId": 7448212,
  "threshold": 0,
  "recurrence": 0
}
```

This conversion is an explicit CLI curation for `assignedAlertContacts`, not a generic rule for all arrays of objects. Full JSON remains available when paid-plan threshold or recurrence behavior is needed.

Recursive validation reports the request path, including the item index. It runs against values supplied through a named flag, `--body`, or `--set` after those sources have been merged. Example error metadata:

```json
{
  "error": {
    "code": "INVALID_INPUT",
    "message": "Invalid assignedAlertContacts[0]: expected an object.",
    "path": "assignedAlertContacts[0]",
    "expected": "object"
  }
}
```

The error does not echo the original value because request fields can contain credentials or other sensitive data.

#### Acceptance criteria

- Help for every object-array flag says `<json>...` and displays its expected shape or an example.
- The alert-contact flag accepts a bare numeric ID and a full JSON object in the same invocation.
- Invalid JSON, the wrong item type, and missing required item properties identify `field[index]`.
- Item enums and numeric constraints are enforced locally where the OpenAPI contract provides them.
- The resulting API payload remains the documented API shape.

### 2. Prevent Keyword monitors from using `HEAD`

#### Problem

The existing API behavior can select `HEAD` when a Keyword create request omits `httpMethodType`. Such a monitor cannot inspect a response body.

#### Decision

Add a narrowly scoped monitor-create curation:

- `monitors create keyword` inserts `httpMethodType: "GET"` only when the merged request omits it;
- an explicit `HEAD`, whether supplied through `--method`, `--body`, or `--set`, fails locally before authentication or networking; and
- help and generated examples say that the CLI default is `GET` and that `HEAD` is invalid for Keyword monitors.

Generated operation metadata must distinguish a fallback default from a fixed discriminator value. `type: KEYWORD` is fixed and conflicts are rejected; `httpMethodType: GET` is a default and is overridden by any valid explicit non-HEAD method.

The guard applies only to Keyword creation. `HEAD` remains valid for HTTP monitors.

#### Acceptance criteria

- An omitted Keyword method produces `httpMethodType: "GET"` in the request.
- Explicit Keyword `HEAD` fails before credentials are resolved or a request is sent.
- Other allowed Keyword methods pass through unchanged.
- HTTP monitor behavior is unchanged.
- The Keyword help example is safe without requiring insider knowledge.

### 3. Generate typed flags for ordinary request bodies

#### Problem

The generator calls its body-field collector only when an `application/json` request uses a discriminator. `UpdateMonitorDto` is a normal object schema, so `monitors update` receives no named body flags even though the schema has properties.

#### Decision

Generalize request-body extraction:

1. Resolve the `application/json` schema.
2. If it has a valid discriminator, continue producing one command per mapped variant.
3. If it is a normal object schema, collect its fields into the single operation descriptor.
4. If it is an ambiguous union without a discriminator, keep `--body`/`--set` and do not fabricate a flattened model.

This is a general generator improvement, so other ordinary object request bodies receive typed flags as well. Existing collision checks, reserved flags, deprecation markers, and aliases continue to apply.

`monitors update <id>` remains one command. The current update contract is not discriminated by monitor type, so the CLI must not create fake `update http`, `update keyword`, and similar commands. Its help shows all update fields and their documented applicability. `--body` and `--set` remain the escape hatch, especially for nullable patch values that cannot be expressed naturally as boolean flags.

#### Acceptance criteria

- `monitors update --help` includes typed flags derived from `UpdateMonitorDto`, including the same curated names used by create where paths match.
- Typed update flags compile into the expected PATCH body and can be combined with `--body` and `--set` using the documented precedence.
- No field is incorrectly marked required merely because it is required inside an optional nested object.
- Ambiguous nondiscriminated unions remain JSON-only rather than generating misleading flags.
- Regeneration remains deterministic and detects flag collisions.

### 4. Present one understandable region model

#### Problem

The API exposes `regionData`, deprecated `regionalData`, and a response object also named `regionalData`. Repeating these names directly as first-class CLI flags makes the API inconsistency harder to understand.

#### Decision

Use presentation curation in the CLI:

- `--region <na|eu|as|oc>...` sets `regionData.REGION` and is the normal choice;
- `--region-config <json>` sets the modern `regionData` object and is the advanced choice;
- per-region threshold flags remain available for advanced use;
- existing `--region-data`, `--region-data-region`, and `--regional-data` spellings continue to be accepted during the `0.x` line as deprecated or hidden compatibility aliases; and
- help says: “Use `--region` unless you need per-region thresholds.”

When a complete `--region-config` and child flags are combined, child flags deterministically override the corresponding property of the JSON object. The simple `--region` flag therefore overrides only `regionData.REGION`, not thresholds.

The CLI does not rewrite raw or normalized monitor resource JSON to make the response look like the request. Machine-readable resource output continues to represent the API response faithfully.

#### Acceptance criteria

- Create and update both expose `--region` and `--region-config` with the same meaning.
- `--region` is repeatable and validates the four documented region literals.
- Advanced thresholds compose with `--region` without deleting unrelated configuration.
- Compatibility names still work but are not the recommended help path.
- JSON and raw response bodies are not renamed or reshaped.

### 5. Use one error boundary and one machine-readable envelope

#### Problem

Errors produced after `run()` starts use the CLI envelope, while oclif argument/flag parsing failures can escape as decorated plaintext. Agents cannot reliably parse every outcome even when JSON was explicitly requested.

#### Decision

Introduce a shared command base and top-level error serialization path used by generated commands and handwritten auth commands. Errors that occur before command construction, such as an unknown command, must pass through the same formatter via the executable boundary or the appropriate oclif hook.

Machine mode is detected from raw arguments before parsing so that malformed invocations still honor:

- `--json`;
- `--raw`;
- `--format json` and `--format=json`;
- `--format jsonl` and `--format=jsonl`;
- `UPTIMEROBOT_OUTPUT=json`;
- explicit or detected agent mode; and
- redirected stdout unless a human format was explicitly selected.

All machine-readable failures are one compact JSON object followed by a newline on stderr; stdout remains empty. JSONL uses the same single error object on stderr. The stable envelope is:

```ts
interface CliErrorEnvelope {
  error: {
    code: string;
    message: string;
    status?: number;
    path?: string;
    expected?: string;
    details?: unknown;
  };
}
```

Rules:

- parser, relationship, confirmation, and local-schema failures use `INVALID_INPUT` or the existing specific CLI code and exit code `2`;
- authentication, network, and API status exit-code mappings remain unchanged;
- API `code`, `message`, `status`, and structured `details` are preserved when present;
- sensitive received values, API keys, authorization headers, and entire request bodies are never included; and
- human mode keeps a concise one-line error without ANSI decoration when stderr is not a TTY.

#### Acceptance criteria

- Unknown flags, missing arguments, invalid enum values, invalid structured fields, missing auth, confirmation failures, network failures, and API failures all produce valid JSON when JSON output is selected.
- Each of those failures leaves stdout empty.
- Local field validation includes `path` and `expected` where known.
- API error codes are not replaced by generic HTTP codes when the server provides one.
- No error snapshot contains a supplied API key or sensitive request value.

### 6. Signal that another collection page exists

#### Problem

A human table can show a full page without indicating that `nextCursor` is non-null. This makes a missing resource look like a failed create.

#### Decision

After normalizing a successful collection response, write this class of message to stderr when table or plain output has a non-empty `nextCursor`:

```text
More results are available. Next cursor: <opaque-cursor>
```

If the operation exposes `--cursor`, help also shows how to continue. The cursor is always treated as an opaque string. The notice goes to stderr so table/plain stdout remains usable and no renderer contract changes.

JSON and JSONL output are unchanged. Normalized JSON already exposes `nextCursor`; JSONL intentionally remains a homogeneous item stream, so automated pagination must use JSON. Raw output remains the original API response and receives no human notice.

The CLI must not say “showing N of M” without an authoritative total. The number of returned items can be counted locally; the total cannot.

#### Acceptance criteria

- Table/plain output with a usable next cursor writes exactly one continuation notice to stderr.
- Table/plain stdout is byte-for-byte unchanged by the notice.
- No notice is emitted when the cursor is null/empty or for JSON, JSONL, or raw output.
- Large numeric-looking cursors remain exact strings.

### 7. Add local schema discovery and dry-run request compilation

#### Problem

Agents currently have to infer complex input shapes from help, live errors, or existing resources. There is no side-effect-free way to inspect or compile a request.

#### Decision: pure request compiler

Separate request compilation from transport. A single pure boundary will merge and validate:

1. an optional `--body` object;
2. generated named flags;
3. repeatable `--set` assignments;
4. CLI fallback defaults; and
5. fixed values such as the monitor discriminator.

Both real execution and dry-run use this compiler. This prevents a preview from drifting away from the actual request.

#### Decision: `--dry-run`

Add `--dry-run` to generated operations with an `application/json` request body. It:

- performs argument and local schema validation;
- builds the final method, path/query, content type, and body;
- emits a deterministic JSON preview;
- does not resolve credentials;
- does not prompt for destructive confirmation; and
- does not create an API client or perform network I/O.

Example shape:

```json
{
  "dryRun": true,
  "method": "POST",
  "path": "/monitors",
  "contentType": "application/json",
  "body": {
    "friendlyName": "checkout",
    "type": "KEYWORD",
    "httpMethodType": "GET"
  }
}
```

The preview never contains authorization material. `--dry-run` implies JSON; a conflicting explicit human format is rejected clearly.

Recognizable credential fields in the compiled body are replaced with `[REDACTED]`, and a `redacted` array reports their request paths. This keeps previews safe for CI and agent logs while making the deliberate difference from the live request explicit.

#### Decision: `monitors schema <type>`

Add a handwritten discovery command whose type choices come from generated monitor-create variants:

```sh
uptimerobot monitors schema keyword
uptimerobot monitors schema keyword --example
```

The default output contains the command ID, fixed discriminator, resolved OpenAPI request schema, and canonical example. `--example` emits only the example request body for easy reuse. It reads the packaged, pinned contract/generated descriptor and requires neither authentication nor network access.

The command describes this as local OpenAPI validation. It does not claim that a dry-run proves current server acceptance.

#### Acceptance criteria

- Dry-run output is compiled by the same code used for a live request.
- Dry-run works without an API key and tests prove no HTTP server was contacted.
- Dry-run catches the same local field errors as live execution.
- Schema choices always match generated monitor-create types after regeneration.
- Schema output includes nested object-array member schemas and a type-matched example.
- `--example` produces valid JSON that passes the CLI's local validator.

### 8. Generate useful, runnable help examples

#### Problem

Generated help currently hardcodes only the command path. For create commands, that bare command is invalid because required input is missing.

#### Decision

Preserve media-type examples and schema/property examples in generated operation metadata. For a discriminated command, select only examples whose discriminator matches the command variant.

For monitor creates, render at least one canonical example as a copy-pasteable `--body` invocation. This safely represents nested arrays and objects without manufacturing dozens of shell flags:

```sh
uptimerobot monitors create keyword --body '{"friendlyName":"My Keyword monitor",...}'
```

The Keyword example is passed through the CLI safety curation and therefore includes `httpMethodType: "GET"` even before the upstream example is corrected.

For operations without authored examples:

- include required path arguments using stable, obviously illustrative values;
- synthesize required body inputs from property examples, safe enum values, and constraints;
- when every body property is optional, include one non-sensitive property example so mutation help remains useful;
- do not label a fabricated payload “runnable” if the schema lacks enough information to validate it.

Important hand-curated commands may add a second task-oriented example, but the generator owns the baseline so new operations cannot regress to an invalid bare stub.

#### Acceptance criteria

- Every monitor-create help page contains a complete type-matched example that passes local validation.
- Structured fields are represented with valid JSON rather than placeholders.
- Examples from one discriminator variant never appear under another.
- Shell quoting is deterministic and embedded single quotes are escaped safely.
- Regeneration produces stable example ordering.

### 9. Make retry and duplicate behavior explicit without a racy client check

#### Problem

When output parsing or list verification fails, an agent may rerun create. A client-side “list, then create” operation is not atomic and has no unambiguous universal identity rule.

#### Decision

Do not add `--if-not-exists` in this phase. It would introduce a time-of-check/time-of-use race, would require the CLI to invent identity semantics such as name plus URL, and could miss resources outside a bounded page.

Instead, the CLI will:

- continue to avoid automatic retries for POST/PATCH/DELETE;
- preserve the API's duplicate `409` code/message/details in the structured error envelope;
- document that callers should retain the ID returned by create and verify it with `monitors get <id>`;
- mention that filtered list output can assist discovery but is not an idempotency guarantee; and
- expose pagination clearly so a later page is not mistaken for absence.

#### Acceptance criteria

- Mutation requests are not automatically retried by the API client.
- A duplicate `409` is valid structured JSON in machine mode and retains server details.
- Documentation never describes duplicate detection as idempotency.
- No list-before-create behavior is added.

### 10. Support common command-name guesses

#### Problem

`auth whoami` and `user get` are reasonable guesses but currently fail.

#### Decision

Add aliases:

- `auth whoami` → `auth status`
- `user get` → `user me`

Aliases must invoke the same command class, output contract, and exit behavior as their canonical command. They must not duplicate implementation or call one CLI process from another.

Also enable a nearest-command suggestion at the command-not-found boundary. A close unambiguous match produces a `Did you mean ...?` hint in human mode and structured suggestion details in machine mode. It does not execute the suggestion automatically.

#### Acceptance criteria

- Both aliases work and return exactly the canonical command's output and exit code.
- Help identifies the canonical spelling without duplicating the command implementation.
- A close miss suggests a command; an unrelated value does not emit a misleading suggestion.
- Unknown-command JSON errors follow the shared envelope.

### 11. Explain normalized JSON, format selection, and raw JSON

#### Problem

`--json`, `--format json`, and `--raw` look like three equivalent switches even though they have two different responsibilities.

#### Decision

Keep all three for compatibility and document this model consistently:

- `--format <json|jsonl|table|plain>` selects the renderer;
- `--json` is shorthand for `--format json` and returns the CLI's normalized shape; and
- `--raw` bypasses normalization and emits the original API response as JSON, implicitly selecting JSON.

Use these exact concepts in generated flag descriptions, root help, and README examples. Keep existing conflict behavior: `--json` cannot be combined with `--format`, and `--raw` cannot be combined with a non-JSON explicit format.

Do not remove `--json` or make users write `--format json`; the shorthand is conventional and useful for agents.

#### Acceptance criteria

- Every generated command uses the clarified descriptions.
- Root documentation shows normalized and raw output side by side.
- `--json` and `--format json` produce identical successful output.
- `--raw` preserves the server envelope and does not hide pagination or error fields.
- Invalid combinations use the shared error envelope.

### 12. Show boolean omission and documented defaults accurately

#### Problem

An oclif `--[no-]flag` does not tell the user what happens if both forms are omitted. Displaying a guessed default would be worse than displaying none.

#### Decision

Preserve schema `default` metadata in the generated descriptor. For boolean help:

- if the contract declares a boolean default, append `(API default: on)` or `(API default: off)`;
- otherwise append `(not sent when omitted; API default not documented)`; and
- continue to use `--flag` and `--no-flag` so explicit true/false values are possible.

The metadata is for presentation only. Do not configure an oclif flag default from an API schema default, because that would cause the CLI to send a value the user did not provide and could change PATCH behavior.

The Keyword `GET` safety behavior is separately identified as a CLI default and must not be confused with a documented API default.

#### Acceptance criteria

- Help distinguishes omission from explicit true/false.
- A documented boolean API default appears in help but is absent from the outgoing payload when the flag is omitted.
- Explicit positive and negative flags send `true` and `false` respectively.
- The generator fixture proves defaults survive generation without becoming oclif defaults.

## OpenAPI and API follow-up for the API owner

The CLI can ship the changes above against the current contract. The following items remain API-owned and should be handled after the CLI work.

### A. Correct Keyword method semantics

- Make `GET` the server default for Keyword monitor creation.
- Reject `HEAD` for Keyword monitors at the API validation layer.
- Describe the default on the Keyword-specific property schema.
- Update the canonical Keyword example to include `httpMethodType: GET`.
- Do not change the default for ordinary HTTP monitors merely because they share part of the DTO hierarchy.

### B. Canonicalize region input and output

- Choose one public field name and object shape for create, update, and response.
- Prefer the modern structure that can represent multiple regions and per-region thresholds.
- Accept the canonical response shape on write so read-modify-write works.
- Publish a deprecation and removal policy for the scalar `regionalData` input.
- Make descriptions distinguish region selection, manual selection, infrastructure, and thresholds.

The CLI aliases can hide the current inconsistency for flag users, but `--body`, `--raw`, and direct API clients will continue to expose it until the contract is fixed.

### C. Publish one structured error contract

Define a reusable error schema and reference it for expected `400`, `401`, `403`, `404`, `409`, `422`, and `429` responses. At minimum it should define:

- stable `code`;
- human `message`;
- HTTP `status`;
- optional field/path-aware validation details; and
- rate-limit metadata where relevant.

Server validation should return paths such as `assignedAlertContacts[0].threshold`. Once this is stable, the CLI can pass the metadata through rather than interpreting message strings.

### D. Clarify update/PATCH semantics

`UpdateMonitorDto` is sufficient for the CLI to generate named flags, but its contract should state:

- whether `type` may actually change;
- which fields are valid for each monitor type;
- whether omitted, `null`, and empty values mean keep, clear, or reset;
- how nested `config` is merged;
- which conditional fields are required after changing type; and
- whether fields irrelevant to the final type are rejected or ignored.

Ensure the schema agrees with descriptions. For example, if `config: null` clears configuration, the schema must permit null explicitly.

### E. Correct schema inconsistencies and enrich metadata

- Resolve the `successHttpResponseCodes` contradiction between `default: []` and the documented `[2xx, 3xx]` default.
- Model `AssertionCheckDto.target` as the actual accepted JSON-value union rather than `type: object` if scalar targets are valid.
- Add descriptions to currently undescribed nested fields, particularly region members and thresholds.
- Add truthful defaults only where the server actually applies them.
- Add array-level examples for important structured arrays when one canonical combination exists. `AlertContactSettings` property examples already allow the CLI to synthesize a shape, so this is an enhancement rather than a blocker.
- Add operation examples beyond monitor creation over time. The CLI will consume them automatically.

### F. Add accurate pagination totals only if the product needs them

The current cursor is enough to say that another page exists. To support “showing 50 of 75,” collection responses need a filter-aware authoritative total. If totals are too expensive, omit them rather than exposing a misleading count.

Also ensure cursor construction distinguishes “exactly one full final page” from “another page exists,” typically by fetching one extra row or using an equivalent datastore capability.

### G. Add true idempotency for mutation retries

Duplicate detection is useful but does not provide request idempotency. A future API design should:

- accept an `Idempotency-Key` header for supported mutations;
- scope keys to the authenticated account and operation;
- define retention duration;
- return the original successful result for a repeated identical request;
- reject reuse with a different payload using a stable conflict code; and
- document the header, responses, and examples in OpenAPI.

After that contract exists, the CLI can expose `--idempotency-key` and agents can safely retry uncertain requests.

### H. Optional authoritative validation endpoint

CLI dry-run is intentionally local and bound to the packaged OpenAPI snapshot. If users need validation against current account entitlements, plan limits, referenced resource IDs, or server-only rules without creating a resource, provide an API validation endpoint. Keep it separate from local dry-run so the CLI never implies that offline validation checks server state.

## Non-goals

This work does not:

- introduce OAuth;
- change API DTOs or server behavior from this repository;
- update the pinned OpenAPI snapshot merely to hide a contract defect;
- claim local validation is authoritative server validation;
- follow all pages automatically;
- add an exact total not returned by the API;
- add a list-before-create `--if-not-exists` implementation;
- call duplicate detection “idempotency”;
- reshape raw API responses;
- remove `--body`, `--set`, `--json`, or `--raw`;
- generate fake type-specific update commands without a discriminated update contract; or
- add CLI-specific vendor extensions to OpenAPI for presentation choices.

## Architecture and public seams

The implementation should deepen existing modules rather than scatter conditionals across generated entrypoints.

### Generated request metadata

`scripts/generate-openapi.ts` remains the OpenAPI interpretation layer. It produces operation descriptors containing normalized request schemas, examples, fixed values, and documented defaults without silently repairing known contract defects. Generated command files remain one-line adapters to `createOperationCommand()`.

The generator must reject unsupported or contradictory structures loudly during generation. Runtime commands should not reparse the entire OpenAPI YAML for ordinary execution.

### CLI curation registry

A small typed registry keyed by generated command ID or request path owns presentation and safety decisions that do not belong in OpenAPI:

- flag aliases and preferred names;
- the alert-contact bare-ID convenience;
- Keyword's temporary `GET` safety default and `HEAD` guard;
- the temporary scalar assertion-target compatibility rule for API monitor examples, kept outside generation until the OpenAPI schema is corrected;
- region flag curation;
- command aliases; and
- task-oriented examples that cannot be derived safely.

Every registry command ID must be checked against `keyof typeof operations`, and tests must fail when stale curation points at a removed operation.

### Request compiler

A transport-independent request compiler accepts an operation plus parsed args/flags and returns the final request description. It owns merge precedence, recursive parsing, local validation, fallback defaults, and fixed values. Live execution and `--dry-run` both consume this result.

### Error presentation

One error presenter maps oclif/parser errors, typed CLI errors, authentication errors, network errors, and API errors into human text or the stable JSON envelope. Commands should throw typed errors to the boundary instead of logging and exiting at multiple call sites.

### Output presentation

Pagination signaling is a presentation strategy that consumes normalized output and writes only to stderr. It does not belong in the API client or normalization function.

## TDD strategy

Use red-green-refactor in small vertical slices. Prefer public behavior and generated artifacts over tests coupled to private helpers.

### Public test seams

- Spawned CLI tests through `test/helpers/run-cli.ts` for help, parsing, aliases, output streams, exit codes, dry-run, and real request payloads sent to local HTTP servers.
- Generator tests that run `scripts/generate-openapi.ts` against focused fixtures and inspect generated operations/command files.
- Exported pure request-compiler tests for merge precedence, recursive paths, defaults, fixed values, and secret-safe errors.
- Exported error-format tests for human and machine envelopes.
- Exported pagination-notice tests for format and cursor behavior.
- API client tests confirming mutation methods are not retried.

### Recommended red-green order

1. Preserve a recursive object-array schema in the generated descriptor.
2. Render `<json>...`, shapes, item enums, examples, and documented defaults in help.
3. Parse and validate complex values with indexed paths; add the alert-contact ID convenience.
4. Establish the shared error envelope for oclif parser and command-runtime failures.
5. Extract the pure request compiler and prove live requests remain unchanged.
6. Add Keyword `GET` fallback and the `HEAD` guard at the compiler seam.
7. Add `--dry-run`, proving no auth lookup or network request occurs.
8. Add schema discovery from the same generated metadata.
9. Generalize ordinary object body extraction and expose typed monitor-update flags.
10. Add region flag curation and compatibility aliases.
11. Generate canonical help examples.
12. Add pagination notices, command aliases/suggestions, and clarified output help.

For every slice, first add the smallest failing test at the public seam, implement only enough to pass it, then refactor shared logic without changing observable behavior.

## Global acceptance criteria

The CLI portion is complete when:

- all twelve feedback items have either an implemented CLI behavior or an explicit API-owned outcome in this document;
- an agent can construct the demonstrated Keyword monitor using help/schema output alone;
- the demonstrated request can be dry-run without an API key or network;
- every explicitly machine-mode failure is valid JSON on stderr with empty stdout;
- create and update expose consistent curated names for equivalent request paths;
- generated examples, schema choices, command files, and operation descriptors remain deterministic;
- human pagination never silently hides a non-null continuation cursor;
- no machine-readable success contract changes except for newly invoked discovery/dry-run commands;
- raw API output remains raw;
- no secret is included in help, previews, errors, test snapshots, or logs;
- README and command help describe the same output and validation semantics; and
- formatting, linting, type checking, the full Vitest suite, build, and OpenAPI generation checks pass.

## Rollout and commits

Keep the work reviewable rather than landing it as one opaque rewrite. The preferred commit order is:

1. generated request metadata and complex-field help/validation;
2. shared error boundary and structured parser errors;
3. request compiler, dry-run, and schema discovery;
4. ordinary body generation and typed monitor update;
5. Keyword, region, and alert-contact curation;
6. examples, pagination notice, command aliases, and output-help cleanup; and
7. documentation and final regression coverage.

Before release, regenerate from the pinned snapshot, inspect the generated diff, run the full quality suite, pack the npm artifact, and exercise its installed binary against a local API or controlled integration environment. Publish API/OpenAPI improvements independently only after their server behavior and generated contract agree.
