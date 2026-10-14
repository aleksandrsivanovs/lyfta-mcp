# CLAUDE.md — fork of jkronlachner/lyfta-mcp

Aleks's fork (`aleksandrsivanovs/lyfta-mcp`) of an MCP server for the Lyfta Community API.
Background lives in `CONTEXT.md`: endpoint coverage, response shapes, API quirks, what has
been confirmed live, and why the code does what it does. It is imported here so it loads every
session:

@CONTEXT.md

## Code conventions

- One method per endpoint on `LyftaClient` (`src/lyfta-client.ts`) and one
  `server.registerTool(...)` per tool in `src/server.ts`, wrapped in `runTool`. Keep the
  `${RATE}` suffix in descriptions.
- Pass Lyfta responses through unchanged.
- Ids are strings in tool inputs. Path ids go through `pathSegment()`, never raw
  interpolation.
- Reuse `dateSchema()`, `clientIdSchema()` and `rangeError()` for dates and coach params rather
  than writing new ones.
- GET tools carry `annotations: { readOnlyHint: true }`. The `create_*` tools stay
  unannotated.
- Tool descriptions are what an LLM reads to choose a tool. Say when to use the tool and which
  tool comes before or after it.
- Check params against Lyfta's OpenAPI spec (see `CONTEXT.md`), and say so wherever it is
  silent.

## Tests

- vitest with mocked fetch, never the network. Assert exact URLs and request bodies, and assert
  that fetch is *not* called whenever input is rejected locally.
- Server tests stub `globalThis.fetch`; restore it in `afterEach`.
- For a regression or security-relevant test, check that it fails against broken code before
  relying on it.
- `scripts/smoke.ts` is the only live check. It prints status and counts only, never contents
  or the key.

## Definition of done

```bash
npm test && npm run typecheck && npm run build
```
All three pass, the README "Tools" table matches the code, and each logical change is its own
Conventional Commit. Don't bump the version (release-please handles it upstream).

## Git and PRs

- Never commit straight to `main`. Work on a feature branch and open a PR against
  `aleksandrsivanovs/lyfta-mcp`. Never merge a PR yourself: only Aleks merges, or approves a
  merge explicitly.
- Keep `main` in sync with upstream. PRs to `jkronlachner/lyfta-mcp` carry only generally
  useful changes, never fork-only files (`CLAUDE.md`, `CONTEXT.md`).

## Rules

- Never log, print, commit, or echo a Lyfta API key. `.env*` is git-ignored — keep it that way.
- Live API calls only via `npm run smoke`, with a key the user provides in their own shell.
- Don't add write tools beyond the existing two.
- Keep anything about the user's local setup (hosts, IPs, ports, paths, container names) out
  of repo files, commits and PR text.
