# @aromatt/payload

Payload CMS CLI plugin for Claude Code. Query and mutate Payload collections via a persistent local HTTP server.

## How it works

1. **`server.ts`** — Persistent HTTP server that initializes Payload once (avoiding 10-15s cold start per query)
2. **`payload.js`** — Thin CLI client that routes commands to the server via HTTP

## Setup

1. Enable the plugin in Claude Code settings:
   ```json
   { "enabledPlugins": { "payload@aromatt": true } }
   ```

2. Start the server from your project root:
   ```bash
   node <plugin-root>/scripts/payload.js start
   ```

3. Query data:
   ```bash
   node <plugin-root>/scripts/payload.js find users --limit 5
   node <plugin-root>/scripts/payload.js schema tutors
   ```

## Requirements

- Project must have `@payload-config` resolvable (standard Payload CMS setup)
- `pnpm tsx` available in the project
- PostgreSQL running for dev (and optionally test) database

## Commands

| Command | Description |
|---------|-------------|
| `start` | Start persistent Payload server |
| `stop` | Graceful shutdown |
| `status` | Health check |
| `collections list` | List all collections |
| `schema <col>` | Field definitions |
| `find <col>` | Query documents |
| `find-by-id <col> --id <id>` | Get by ID |
| `count <col>` | Count documents |
| `create <col> --data <json>` | Create document |
| `update <col> --id <id> --data <json>` | Update document |
| `delete <col> --id <id>` | Delete document |

Run `node <plugin-root>/scripts/payload.js help` for full reference.
