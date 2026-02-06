---
name: semantic-search
description: Semantic codebase search with pgvector. Finds code by MEANING. **USE THIS FIRST** before grep/glob. Returns file paths + byte ranges for precise reads.
allowed-tools: Bash(python:*)
argument-hint: "<natural language query> [project_path]"
---

# Semantic Codebase Search

Find code by meaning, not just keywords. **Always use this tool FIRST** before falling back to grep/glob.

## Quick Search

```bash
python ${CLAUDE_PLUGIN_ROOT}/cocoindex/main.py search "." "$ARGUMENTS"
```

## Search Strategy

**CRITICAL: Use semantic search FIRST for every code exploration task.**

### 1. Run Semantic Search

```bash
# Search current project
python ${CLAUDE_PLUGIN_ROOT}/cocoindex/main.py search "." "user authentication flow"

# Search specific project
python ${CLAUDE_PLUGIN_ROOT}/cocoindex/main.py search "P:/myproject" "database connection pool"

# With limit and threshold
python ${CLAUDE_PLUGIN_ROOT}/cocoindex/main.py search "." "query" 10 0.3
```

### 2. Read Results

Results include file paths and similarity scores. Read the relevant files to get full context.

### 3. Fall Back to Grep/Glob

Only use grep/glob if:
- Semantic search returns < 3 results
- You need exact string matching (regex)
- The query is a literal code pattern

## Upstream/Downstream Impact Review

**BEFORE making any edits**, review impact:

### Step 1: Find Callers (Upstream)

```bash
python ${CLAUDE_PLUGIN_ROOT}/cocoindex/main.py search "." "calls functionName"
python ${CLAUDE_PLUGIN_ROOT}/cocoindex/main.py search "." "imports from module-name"
```

### Step 2: Find Dependencies (Downstream)

```bash
python ${CLAUDE_PLUGIN_ROOT}/cocoindex/main.py search "." "dependencies of functionName"
```

### Step 3: Document Impact

Before proceeding with edits, list:
1. Files that will be affected by the change
2. Functions/components that depend on the code
3. Potential breaking changes

---

## Daemon Management

The indexer runs as a persistent background daemon (pure Python).

```bash
# Start daemon (runs in background, persists after Claude exits)
python ${CLAUDE_PLUGIN_ROOT}/cocoindex/daemon.py start

# Check daemon status
python ${CLAUDE_PLUGIN_ROOT}/cocoindex/daemon.py status

# View indexing logs
python ${CLAUDE_PLUGIN_ROOT}/cocoindex/daemon.py logs --tail 50

# Follow logs in real-time
python ${CLAUDE_PLUGIN_ROOT}/cocoindex/daemon.py logs --follow

# Stop daemon
python ${CLAUDE_PLUGIN_ROOT}/cocoindex/daemon.py stop
```

## Project Management

```bash
# Add project to watch list (for daemon)
python ${CLAUDE_PLUGIN_ROOT}/cocoindex/main.py projects add "P:/myproject"

# List all projects
python ${CLAUDE_PLUGIN_ROOT}/cocoindex/main.py projects list

# Remove project from watch list
python ${CLAUDE_PLUGIN_ROOT}/cocoindex/main.py projects remove "P:/myproject"
```

## Indexing

```bash
# Index a project once (no daemon)
python ${CLAUDE_PLUGIN_ROOT}/cocoindex/main.py index "P:/myproject"

# Index with file watching (foreground)
python ${CLAUDE_PLUGIN_ROOT}/cocoindex/main.py index "P:/myproject" --watch
```

## Setup

### Prerequisites
- Docker running
- Python 3.10+ with cocoindex, psycopg2
- Gemini API key

### Initial Setup

```bash
# 1. Start pgvector container
cd ${CLAUDE_PLUGIN_ROOT}/docker && docker-compose up -d

# 2. Install Python dependencies
pip install cocoindex psycopg2-binary

# 3. Set Gemini API key (create credentials.json)
echo '{"gemini_api_key": "your-key"}' > ${CLAUDE_PLUGIN_ROOT}/scripts/.semantic-indexer/credentials.json

# 4. Index your project
python ${CLAUDE_PLUGIN_ROOT}/cocoindex/main.py index "."
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
      "content": "async function authenticateUser...",
      "location": {"start": 1234, "end": 2345},
      "similarity": 0.87,
      "preview": "async function authenticateUser(credentials: Credentials)..."
    }
  ]
}
```

## Command Reference

| Command | Description |
|---------|-------------|
| `main.py search <project> <query> [limit] [threshold]` | Semantic search |
| `main.py index <project> [--watch]` | Index project |
| `main.py projects add <path>` | Add project to daemon watch list |
| `main.py projects list` | List watched projects |
| `main.py projects remove <path>` | Remove project from watch list |
| `daemon.py start` | Start background indexer |
| `daemon.py stop` | Stop indexer |
| `daemon.py status` | Check daemon status |
| `daemon.py logs [--tail N] [--follow]` | View logs |
