---
name: payload-cms
description: Query and mutate Payload CMS collections via persistent local server. Use for reading/writing data in dev or test databases.
allowed-tools: Bash(node:*), Bash(pnpm tsx:*)
argument-hint: "find users --limit 10 | create customers --data '{...}'"
---

Persistent HTTP server + thin CLI client for Payload CMS Local API.

## Quick Start

```bash
# Resolve plugin root even when CLAUDE_PLUGIN_ROOT is missing
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(node -e "const fs=require('fs');const path=require('path');const os=require('os');const c=['C:/.config/vercel-skills/skills/payload-cms',path.join(os.homedir(),'.claude/skills/payload-cms'),path.join(os.homedir(),'.agents/skills/payload-cms'),'P:/aromatt/payload/skills/payload-cms'];const hit=c.find(p=>fs.existsSync(path.join(p,'scripts','payload.js')));if(!hit){process.exit(1)};process.stdout.write(hit);")}"

# 1. Start the server (from project root)
node "$PLUGIN_ROOT/scripts/payload.js" start

# 2. Query data
node "$PLUGIN_ROOT/scripts/payload.js" find users --limit 5
node "$PLUGIN_ROOT/scripts/payload.js" schema tutors
```

## CLI

```bash
node "$PLUGIN_ROOT/scripts/payload.js" $ARGUMENTS
```

Run with `help` for full command list.
Use `$PLUGIN_ROOT` from Quick Start in all examples below when `CLAUDE_PLUGIN_ROOT` is not set.

---

## Server Lifecycle

The server initializes Payload once and serves requests over HTTP. This avoids re-initializing Payload for each query (~10-15s cold start).

| Command | Description |
|---------|-------------|
| `start [flags]` | Start persistent Payload server (background) |
| `stop` | Graceful shutdown |
| `status` | Check if server is running + uptime |

### Start Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--port` | `8100` | HTTP port |
| `--idle-timeout` | `1800000` | Auto-shutdown after idle (ms, default 30min) |
| `--test-db-url` | env `TEST_POSTGRES_URL` | Test database connection string |
| `--test-db-port` | env `POSTGRES_TEST_PORT` or `7357` | Test database port |

### Examples

```bash
# Start with defaults
node $PLUGIN_ROOT/scripts/payload.js start

# Start with custom port and test DB
node $PLUGIN_ROOT/scripts/payload.js start --port 9000 --test-db-url "postgresql://localhost:7357/test"

# Check status
node $PLUGIN_ROOT/scripts/payload.js status

# Stop server
node $PLUGIN_ROOT/scripts/payload.js stop
```

---

## Schema & Discovery

| Command | Description |
|---------|-------------|
| `collections list` | List all collection slugs, field counts, labels |
| `schema <collection>` | Full field definitions (name, type, required, relationships) |

Schema includes recursive field mapping for: text, number, email, relationship, upload, array, group, blocks, select, radio, checkbox, date, point, json, code, richText, tabs, collapsible, row.

### Examples

```bash
# List all collections
node $PLUGIN_ROOT/scripts/payload.js collections list

# Get schema for a collection
node $PLUGIN_ROOT/scripts/payload.js schema users
node $PLUGIN_ROOT/scripts/payload.js schema calendarEntries
```

---

## Query Operations

All query commands require a running server (`start` first).

| Command | Description |
|---------|-------------|
| `find <collection> [flags]` | Find documents with filters, sort, pagination |
| `find-by-id <collection> --id <id> [flags]` | Get a single document by ID |
| `count <collection> [flags]` | Count matching documents |

### Query Flags

| Flag | Description | Example |
|------|-------------|---------|
| `--db` | Database: `dev` (default) or `test` | `--db test` |
| `--where` | JSON filter object | `--where '{"status":{"equals":"active"}}'` |
| `--sort` | Sort field (prefix `-` for desc) | `--sort -createdAt` |
| `--limit` | Max results | `--limit 10` |
| `--page` | Page number (1-indexed) | `--page 2` |
| `--depth` | Population depth (default 1) | `--depth 0` |
| `--select` | Field selection | `--select '{"name":true,"email":true}'` |
| `--timeout` | Per-request timeout (ms) | `--timeout 60000` |

### Where Clause Operators

```json
{ "field": { "equals": "value" } }
{ "field": { "not_equals": "value" } }
{ "field": { "greater_than": 100 } }
{ "field": { "less_than": 100 } }
{ "field": { "like": "partial" } }
{ "field": { "contains": "text" } }
{ "field": { "in": ["a", "b"] } }
{ "field": { "not_in": ["a", "b"] } }
{ "field": { "exists": true } }
```

Compound:
```json
{ "and": [{ "status": { "equals": "active" } }, { "role": { "equals": "tutor" } }] }
{ "or": [{ "status": { "equals": "active" } }, { "status": { "equals": "pending" } }] }
```

### Query Examples

```bash
# Find first 5 users
node $PLUGIN_ROOT/scripts/payload.js find users --limit 5

# Find active tutors sorted by name
node $PLUGIN_ROOT/scripts/payload.js find tutors --where '{"status":{"equals":"active"}}' --sort name

# Find recent calendar entries
node $PLUGIN_ROOT/scripts/payload.js find calendarEntries --sort -createdAt --limit 10

# Count customers
node $PLUGIN_ROOT/scripts/payload.js count customers

# Get user by ID with minimal depth
node $PLUGIN_ROOT/scripts/payload.js find-by-id users --id abc123 --depth 0

# Select specific fields only
node $PLUGIN_ROOT/scripts/payload.js find users --select '{"email":true,"name":true}' --limit 10

# Query test database
node $PLUGIN_ROOT/scripts/payload.js find users --db test --limit 5
```

---

## Mutate Operations

| Command | Description |
|---------|-------------|
| `create <collection> --data <json> [flags]` | Create a new document |
| `update <collection> --id <id> --data <json> [flags]` | Update an existing document |
| `delete <collection> --id <id>` | Delete a document |

Data can be passed via `--data` flag or piped through stdin.

### Mutate Flags

| Flag | Description |
|------|-------------|
| `--data` | JSON string with document data |
| `--id` | Document ID (required for update/delete) |
| `--db` | Database: `dev` (default) or `test` |
| `--depth` | Population depth in response |
| `--select` | Field selection in response |

### Mutate Examples

```bash
# Create a document
node $PLUGIN_ROOT/scripts/payload.js create customers --data '{"name":"John","email":"john@example.com"}'

# Create via stdin pipe
echo '{"name":"Jane","email":"jane@example.com"}' | node $PLUGIN_ROOT/scripts/payload.js create customers

# Update a document
node $PLUGIN_ROOT/scripts/payload.js update customers --id abc123 --data '{"name":"John Updated"}'

# Delete a document
node $PLUGIN_ROOT/scripts/payload.js delete customers --id abc123

# Mutate on test database
node $PLUGIN_ROOT/scripts/payload.js create customers --db test --data '{"name":"Test User"}'
```

---

## Output Format

All commands output JSON to stdout:

```json
// Success
{ "ok": true, "data": { ... } }

// Error
{ "ok": false, "error": { "message": "...", "code": "..." } }
```

Find results include Payload pagination:
```json
{
  "ok": true,
  "data": {
    "docs": [...],
    "totalDocs": 42,
    "limit": 10,
    "totalPages": 5,
    "page": 1,
    "pagingCounter": 1,
    "hasPrevPage": false,
    "hasNextPage": true,
    "prevPage": null,
    "nextPage": 2
  }
}
```

---

## Architecture

```
payload.js (CLI client, CommonJS, zero deps)
    │
    ▼ HTTP
server.ts (persistent, initialized Payload instances)
    │
    ▼ Local API
Payload CMS (dev DB + optional test DB)
```

- Server starts once, stays running (30min idle timeout)
- Each CLI call makes an HTTP request to the running server
- Server PID + port stored in `${PAYLOAD_CMS_HOME:-~/.payload-cms}/server.json`

