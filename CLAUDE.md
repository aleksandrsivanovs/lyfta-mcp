# CLAUDE.md — fork of jkronlachner/lyfta-mcp

This is Aleks's fork (`aleksandrsivanovs/lyfta-mcp`) of an MCP server for the Lyfta Community API.
It runs in Docker on a home Ubuntu Mac mini (192.168.1.11, container `lyfta-mcp-aleks`,
port 4100 → 3000, Streamable HTTP) and is used by Claude Desktop through `mcp-remote` as a
fitness-coaching data source.

## Current task: add the missing read endpoints

The upstream server (v0.3.1) wraps only 7 endpoints. Lyfta's API now offers more read
endpoints, and the coaching use case needs them: reading the user's routines (templates),
programs (collections), planned schedule, and the full exercise catalogue.

Authoritative API reference: https://my.lyfta.app/community/api (fetch it if anything below is unclear).

### Tools to add (all read-only, GET)

| New tool | Endpoint | Query params |
|---|---|---|
| `list_collections` | `GET /api/v1/collections` | `limit?`, `page?`, `client_id?` |
| `get_collection` | `GET /api/v1/collections/:id` | `view?` = `"summary"` (default) \| `"full"`, `client_id?` |
| `list_templates` | `GET /api/v1/templates` | `limit?`, `page?`, `client_id?` |
| `get_template` | `GET /api/v1/templates/:id` | `client_id?` |
| `get_schedule` | `GET /api/v1/schedule` | `from?`, `to?` (YYYY-MM-DD, UTC, inclusive), `include_completed?` (bool), `client_id?` |
| `search_exercise_library` | `GET /api/v1/exercises/library` | `search?`, `limit?`, `offset?` |

### Also extend existing tools

- `list_workouts`: add optional `from` / `to` (YYYY-MM-DD, UTC, inclusive) and `client_id`.
  Lyfta returns 400 for invalid dates or `from > to`; validate with a zod regex so the
  user gets a clear message without a wasted request.
- `list_workout_summaries`, `list_exercises`, `get_exercise_progress`: add optional `client_id`
  (coach-only; harmless for personal keys).

### Response shapes worth knowing (pass through unchanged — see Non-Goals in the design spec)

- `list_collections` → `{ status, count, total_records, total_pages, current_page, limit, collections: [{ id, title, image, pinned, workout_ids[], workout_count, date_created, date_updated }] }`
- `get_collection` → `{ status, data: { id, title, description, image, pinned, workout_ids[], workout_count, workouts: [...] } }`; with `view=full` each workout carries the full template JSON (exercises + sets).
- `list_templates` → `{ status, ..., templates: [{ id, title, picture, color, exercise_count, date_created, date_updated, collection_id, collection_title }] }`
- `get_template` → `{ status, data: { id, title, note, color, picture, user_id, exercises: [{ exercise_id, excercise_name, exercise_type, exercise_image, sets: [{ set_type_id, reps, weight }] }] } }` — `excercise_name` misspelling is Lyfta's.
- `get_schedule` → `{ status, ..., from, to, workouts: [{ id, source, template_id, title, scheduled_date, scheduled_time, status, is_completed, note }] }`
- `search_exercise_library` → `{ status, data: { results: [...exercise catalog items], pagination: { limit, offset, total, hasMore } } }`.
  Note the different envelope; `request()` only checks top-level `status`, which is fine.

### Implementation notes

- Follow the existing pattern exactly: one method per endpoint on `LyftaClient`
  (`src/lyfta-client.ts`), one `server.registerTool(...)` per tool in `src/server.ts`,
  wrapped in `runTool`. Keep the `${RATE}` suffix in descriptions.
- Path params (`:id`) must be URL-encoded (`encodeURIComponent`). IDs are strings in tool
  inputs, consistent with the existing `exercise_id`.
- Booleans in query strings: send `include_completed=true` only when true; omit otherwise.
- Tool descriptions matter: they are what an LLM reads to choose a tool. Say when to use
  each (e.g. "list_templates → find a routine's id; get_template → its exercises and sets").
- Add `readOnlyHint: true` annotations to all GET tools if the installed
  `@modelcontextprotocol/sdk` version supports `annotations` in `registerTool`; leave
  the two create_* tools unannotated.

### Tests (vitest, mocked fetch — no network)

- `test/lyfta-client.test.ts`: one test per new client method asserting the exact URL
  (path + query string), including `encodeURIComponent` on ids and omission of
  undefined/false params.
- `test/server.test.ts`: update the "exposes all N tools" list (7 → 13) and add a
  call-through test for at least `get_template` and `get_schedule`.
- Optionally extend `scripts/smoke.ts` with the new read endpoints (read-only only).

### Definition of done

```bash
npm test && npm run typecheck && npm run build
```
All green, README "Tools" table updated with the six new tools and the new params,
one Conventional Commit per logical change (`feat: add collections/templates read tools`, …).
Do not bump the version manually (release-please handles upstream; see below).

## Deploying the fork on the Mac mini

The running container uses the upstream image. To run this fork instead, on the Mac mini:

```bash
cd ~/Documents && git clone https://github.com/aleksandrsivanovs/lyfta-mcp.git lyfta-mcp-src
```
Then in `~/Documents/lyfta-mcp-aleks/docker-compose.yml` replace the `image:` line with:
```yaml
    build: ../lyfta-mcp-src
    image: lyfta-mcp-aleks:local
```
and run `docker compose build && sudo systemctl restart lyfta-mcp-aleks`.
Verify: `curl -s http://192.168.1.11:4100/healthz` → `{"ok":true}`, then restart Claude
Desktop so `mcp-remote` re-lists the tools.

## Upstreaming

These endpoints are generally useful. Once it works, open a PR to `jkronlachner/lyfta-mcp`
from a feature branch (keep `main` in sync with upstream).

## Rules

- Never log, print, commit, or echo a Lyfta API key. `.env*` is git-ignored — keep it that way.
- Live API calls only via `npm run smoke` with a key the user provides in their own shell.
- Don't add write tools beyond the existing two.
