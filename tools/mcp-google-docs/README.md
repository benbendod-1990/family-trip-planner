# google-docs MCP server

Write access to Google Docs for Claude Code.

## Why

The trip Doc is this project's source of truth — the app must never diverge from
it. But the claude.ai **Google Drive connector is read-only**: it exposes
`read_file_content`, `download_file_content`, `search_files`, `get_file_metadata`,
`get_file_permissions`, `copy_file` and `create_file`, with **no update/edit
tool**, and there is no Google Docs connector at all. So Claude could read the
Doc and diff it against the app, but every write back was a manual copy-paste.

This closes that gap. Zero dependencies — MCP over stdio is just newline-delimited
JSON-RPC 2.0, so an SDK would add supply-chain surface for ~80 lines of framing.

## Setup (one time)

1. **Enable the API** —
   [Google Docs API](https://console.cloud.google.com/apis/library/docs.googleapis.com)
   → Enable. Use the same Cloud project as the Gmail sync if you like; the
   credentials here are separate either way.

2. **Create an OAuth client** — APIs & Services → Credentials → Create
   credentials → OAuth client ID → application type **Desktop app**. Desktop
   clients accept any loopback redirect, so there is no redirect URI to register.

3. **Authorize**:
   ```bash
   node tools/mcp-google-docs/setup-auth.mjs
   ```
   Paste the client ID and secret when prompted, approve the consent screen, and
   the refresh token lands in the login Keychain under the service
   `family-trip-planner-google-docs`. Nothing is written to the repo.

4. **Register the server** with Claude Code:
   ```bash
   claude mcp add google-docs -s project -- node tools/mcp-google-docs/server.mjs
   ```
   Then **restart Claude Code** — MCP servers are only connected at session
   start, so a server added mid-session is not usable until you restart.

## Tools

| Tool | Use |
|---|---|
| `docs_read` | Read a doc. `blocks` (default) gives every text block with its character range and location **including inside table cells**; `text` gives plain text; `raw` gives the full API JSON. |
| `docs_replace_text` | Exact-string replacements across the whole doc, applied as one atomic batch. Returns per-replacement occurrence counts. |
| `docs_batch_update` | Raw Docs API `batchUpdate` requests — the escape hatch for styling, bullets, table row insertion. |

## Things that will bite you

- **Check the occurrence counts.** `docs_replace_text` reports how many matches
  each replacement hit. A count of `0` means the search string never matched
  (usually a smart-quote, a non-breaking space, or a soft line break inside the
  string) — it is *not* an error, so it fails silently if you do not read the
  report.
- **Replacement text is unstyled.** `replaceAllText` inserts plain text that
  inherits the formatting at the start of the replaced range. Bold, bullets and
  links inside your replacement string will not appear. For those, follow up
  with `docs_batch_update`.
- **Index-based edits are fragile.** Character indices shift as earlier requests
  in the same batch apply. Order index-based requests back-to-front.
- **The 7-day token expiry.** While the OAuth app is in *Testing* mode Google
  expires refresh tokens after 7 days — the same trap the Gmail sync hits. The
  fix is either re-running `setup-auth.mjs` (~30 seconds) or publishing the
  OAuth consent screen to Production. The server detects this and returns a
  message telling you which command to run.
- **Doc edits are effectively irreversible** from the API side. Google Docs
  version history is the undo — File → Version history → Name current version
  before a large batch.
