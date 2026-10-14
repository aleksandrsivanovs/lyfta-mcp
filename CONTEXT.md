# CONTEXT.md — project and API background

Facts about this fork and the Lyfta API. How to work in the repo lives in `CLAUDE.md`.

## The project

`aleksandrsivanovs/lyfta-mcp` is a fork of `jkronlachner/lyfta-mcp`, an MCP server for the
Lyfta Community API. It is used as a fitness-coaching data source: an MCP client reads the user's
training data and plans, and can create programs and templates.

The upstream server (v0.3.1) wrapped 7 endpoints. The fork adds the remaining read endpoints
(PR #1 on the fork). Its design spec, including the Non-Goals, is in
`docs/superpowers/specs/2026-06-15-lyfta-mcp-design.md`.

## API sources

- Human reference: https://my.lyfta.app/community/api
- OpenAPI spec: https://my.lyfta.app/openapi.json. This is more complete than the human page and
  is the authority for params.
- Auth: `Authorization: Bearer <key>`. Rate limits: 60 req/min and 5,000 req/day.

## Endpoint coverage

The OpenAPI spec lists 14 operations. Only two of them write, and there is no PUT, PATCH or
DELETE anywhere, so nothing created through the API can be edited or deleted through it.

| Endpoint | Tool | Params |
|---|---|---|
| `GET /api/v1/workouts` | `list_workouts` | `page`, `limit` (≤ 100), `from`, `to`, `client_id` |
| `GET /api/v1/workouts/summary` | `list_workout_summaries` | `page`, `limit` (≤ 1000), `client_id` |
| `GET /api/v1/exercises` | `list_exercises` | `client_id` |
| `GET /api/v1/exercises/progress` | `get_exercise_progress` | `exercise_id`, `duration` (days), `client_id` |
| `GET /api/v1/exercises/library` | `search_exercise_library` | `search`, `limit`, `offset` |
| `GET /api/v1/collections` | `list_collections` | `page`, `limit`, `client_id` |
| `GET /api/v1/collections/{id}` | `get_collection` | `view` = `summary` (default) \| `full`, `client_id` |
| `GET /api/v1/templates` | `list_templates` | `page`, `limit`, `client_id` |
| `GET /api/v1/templates/{id}` | `get_template` | `client_id` |
| `GET /api/v1/schedule` | `get_schedule` | `from`, `to`, `include_completed`, `client_id` |
| `GET /api/v1/clients` | `list_clients` | — |
| `POST /api/v1/collections` | `create_collection` | body: `{ collection: {…}, client_id? }` |
| `POST /api/v1/templates` | `create_template` | body: `{ collectionId, workout, clientId? }` |
| `GET /api/sandbox/v1/workouts` | not wrapped | sample data without auth; not useful for coaching |

## API behaviour worth knowing

- **Dates:** `from`/`to` are `YYYY-MM-DD`, UTC and inclusive. Lyfta returns 400 for invalid
  dates or for `from > to`.
- **Schedule defaults:** without dates, `from` is today and `to` is +90 days, and only
  incomplete items are returned unless `include_completed=true`. Completed history comes from
  `/workouts`, not `/schedule`.
- **`client_id` (coach only):** the preferred value is `lyfta.coach.public_id` from
  `GET /api/v1/clients`, although numeric ids also work. The key owner must be the client's
  accepted coach.
- **Ids:** the spec types the `{id}` path params as integers. The tools take strings to match
  the existing `exercise_id`.
- **Spelling:** `excercise_name` is spelled that way by Lyfta.
- **Missing docs:** the spec documents no params for `/exercises`, `/exercises/progress` or
  `/exercises/library`. What the tools send there comes from the original task brief.
- **Error format:** errors are `{ status: false, message }`. `request()` treats
  `status: false` as an error even with HTTP 200, as a defensive check; no documented case is
  known. A 429 may carry `retry-after`.

## Response shapes

Responses are passed through unchanged; reshaping Lyfta's quirky encodings is a design Non-Goal.

- `list_collections` → `{ status, count, total_records, total_pages, current_page, limit, collections: [{ id, title, image, pinned, workout_ids[], workout_count, date_created, date_updated }] }`
- `get_collection` → `{ status, data: { id, title, description, image, pinned, workout_ids[], workout_count, workouts: [...] } }`. With `view=full`, each workout carries its full template JSON (exercises and sets), so the response is large.
- `list_templates` → `{ status, ..., templates: [{ id, title, picture, color, exercise_count, date_created, date_updated, collection_id, collection_title }] }`
- `get_template` → `{ status, data: { id, title, note, color, picture, user_id, exercises: [{ exercise_id, excercise_name, exercise_type, exercise_image, sets: [{ set_type_id, reps, weight }] }] } }`
- `get_schedule` → `{ status, ..., from, to, workouts: [{ id, source, template_id, title, scheduled_date, scheduled_time, status, is_completed, note }] }`
- `search_exercise_library` → `{ status, data: { results: [...], pagination: { limit, offset, total, hasMore } } }`. This is a different envelope from the others, but `request()` only checks the top-level `status`, so it works.
- `list_exercises` returns equipment, body-part and muscle ids as JSON-stringified arrays.

## What was confirmed against the live API (2026-10-14)

- Every read endpoint returns `status: true`.
- On the library endpoint, `search`, `limit` and `offset` are honoured: the full catalogue is
  about 7,600 exercises, and "bench" narrows it to 230.
- Lyfta accepts `from`/`to` on `/workouts` and `include_completed` on `/schedule`. The test
  account had no workout history, so whether they actually filter is unconfirmed.
- `client_id` has not been tested live, because no coach account was available.
- Deployed over HTTP and used from Claude Desktop, the assistant picks the right tool for
  schedule, program, routine and library questions.

## Design decisions in the code, and why

- **Local date checks.** Dates are checked for the `YYYY-MM-DD` pattern and must be a real
  calendar day. `from > to` returns an `isError` result before any request is sent, which saves
  a request and gives a clearer message than Lyfta's 400. This check lives in the handler
  (`rangeError`) because a raw-shape `inputSchema` can't express cross-field rules.
- **`dateSchema()` and `clientIdSchema()` are factories.** Reusing one zod instance makes the
  generated JSON Schema emit `$ref`, which some MCP clients mishandle. `create_template` still
  emits `$ref`: this comes from its older nested schemas, and that tool is excluded from the
  no-`$ref` test.
- **Empty strings are dropped from query strings.** LLMs often send `client_id: ""`, and that
  should mean "not given".
- **Some ids are rejected locally.** `""`, `"."` and `".."` are rejected with a plain `Error`
  rather than a `LyftaApiError`, because URL resolution would collapse them into a different
  endpoint and Lyfta never sees the request.
- **`include_completed` is sent only when true.**
- **Per-request keys over HTTP.** The HTTP transport runs each request in
  `keyContext.run(key, …)`, so concurrent callers never share a key. `test/http.test.ts` covers
  this.
- **Tool descriptions are written for an LLM.** They say when to use each tool and how the tools
  chain (for example, `list_templates` → `get_template`), and every `client_id` description
  points to `list_clients`.
