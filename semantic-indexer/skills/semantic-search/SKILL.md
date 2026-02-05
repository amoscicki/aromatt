---
name: semantic-search
description: Semantic codebase search with pgvector. Finds code by MEANING. **USE THIS FIRST** before grep/glob. Returns file paths + exact line ranges for precise reads.
allowed-tools: Bash(node:*)
argument-hint: "<natural language query> [--project <path>]"
---

# Semantic Codebase Search

Find code by meaning, not just keywords. **Always use this tool FIRST** before falling back to grep/glob.

## Quick Search

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/search.js --query "$ARGUMENTS" --project .
```

## Search Strategy

**CRITICAL: Use semantic search FIRST for every code exploration task.**

### 1. Run Semantic Search

```bash
# Search current project
node ${CLAUDE_PLUGIN_ROOT}/scripts/search.js --query "user authentication flow" --project .

# Search specific project
node ${CLAUDE_PLUGIN_ROOT}/scripts/search.js --query "database connection pool" --project P:\myproject
```

### 2. Read Results with Line Ranges

Results include exact line numbers. Read files using those ranges:

```bash
# Example: result shows start_line: 45, end_line: 89
# Read exactly those lines (45 lines starting from line 45)
head -89 path/to/file.ts | tail -n +45
```

**DO NOT** read entire files. Use the line ranges from search results.

### 3. Fall Back to Grep/Glob

Only use grep/glob if:
- Semantic search returns < 3 results
- You need exact string matching (regex)
- The query is a literal code pattern

## Upstream/Downstream Impact Review

**BEFORE making any edits**, you MUST review impact:

### Step 1: Find Callers (Upstream)

Search for code that USES what you're about to modify:

```bash
# Find what calls this function
node ${CLAUDE_PLUGIN_ROOT}/scripts/search.js --query "calls functionName" --project .

# Find imports of this module
node ${CLAUDE_PLUGIN_ROOT}/scripts/search.js --query "imports from module-name" --project .
```

### Step 2: Find Dependencies (Downstream)

Search for what the code DEPENDS on:

```bash
# Find what this function uses
node ${CLAUDE_PLUGIN_ROOT}/scripts/search.js --query "dependencies of functionName" --project .
```

### Step 3: Document Impact

Before proceeding with edits, list:
1. Files that will be affected by the change
2. Functions/components that depend on the code
3. Potential breaking changes

### Step 4: Verify After Edits

After making changes, re-run semantic search to confirm no broken references.

---

## Daemon Management

The indexer runs as a persistent background daemon.

```bash
# Start daemon (runs in background, persists after Claude exits)
node ${CLAUDE_PLUGIN_ROOT}/scripts/daemon.js start

# Check daemon status
node ${CLAUDE_PLUGIN_ROOT}/scripts/daemon.js status

# View indexing logs
node ${CLAUDE_PLUGIN_ROOT}/scripts/daemon.js logs --tail 50

# Stop daemon
node ${CLAUDE_PLUGIN_ROOT}/scripts/daemon.js stop
```

## Project Management

```bash
# Add project to watch list
node ${CLAUDE_PLUGIN_ROOT}/scripts/projects.js add P:\myproject

# List watched projects
node ${CLAUDE_PLUGIN_ROOT}/scripts/projects.js list

# Remove project from watch list
node ${CLAUDE_PLUGIN_ROOT}/scripts/projects.js remove P:\myproject

# Force reindex a project
node ${CLAUDE_PLUGIN_ROOT}/scripts/projects.js reindex P:\myproject

# Clear project data from database
node ${CLAUDE_PLUGIN_ROOT}/scripts/projects.js clear P:\myproject
```

## Setup

### Prerequisites
- Docker running
- Python 3.8+ installed
- Gemini API key

### Initial Setup

```bash
# 1. Start pgvector container
node ${CLAUDE_PLUGIN_ROOT}/scripts/setup.js docker-up

# 2. Install CocoIndex Python dependencies
node ${CLAUDE_PLUGIN_ROOT}/scripts/setup.js install-python

# 3. Set Gemini API key (one of these):
node ${CLAUDE_PLUGIN_ROOT}/scripts/setup.js auth set --file /path/to/credentials.json
node ${CLAUDE_PLUGIN_ROOT}/scripts/setup.js auth paste-win --overwrite  # Windows clipboard
node ${CLAUDE_PLUGIN_ROOT}/scripts/setup.js auth set-key --key "your-api-key"

# 4. Check setup
node ${CLAUDE_PLUGIN_ROOT}/scripts/setup.js check-env

# 5. Start daemon (uses CocoIndex for file watching + Tree-sitter parsing)
node ${CLAUDE_PLUGIN_ROOT}/scripts/daemon.js start

# 6. Add project to index
node ${CLAUDE_PLUGIN_ROOT}/scripts/projects.js add .
```

## Search Output Format

```json
{
  "ok": true,
  "query": "user authentication",
  "project_root": "P:\\myproject",
  "result_count": 5,
  "results": [
    {
      "file_path": "src/auth/login.ts",
      "file_name": "login.ts",
      "start_line": 45,
      "end_line": 89,
      "similarity": 0.87,
      "symbol_name": "authenticateUser",
      "node_type": "function_declaration",
      "preview": "async function authenticateUser(credentials: Credentials)..."
    }
  ]
}
```

## Command Reference

| Command | Description |
|---------|-------------|
| `search.js --query "..." --project .` | Semantic search |
| `daemon.js start` | Start background indexer |
| `daemon.js stop` | Stop indexer |
| `daemon.js status` | Check daemon status |
| `daemon.js logs` | View indexing logs |
| `projects.js add <path>` | Add project to watch |
| `projects.js remove <path>` | Remove from watch |
| `projects.js list` | List watched projects |
| `projects.js reindex <path>` | Reindex project |
| `setup.js docker-up` | Start pgvector container |
| `setup.js docker-down` | Stop container |
| `setup.js auth set --file <path>` | Set API key from file |
| `setup.js check-env` | Check environment |
