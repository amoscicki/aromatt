# Semantic Codebase Indexer

Semantic codebase search plugin for Claude Code using **CocoIndex**, **pgvector**, and **Gemini embeddings**.

## Architecture

- **Orchestrator**: CocoIndex (Python) - file watching & AST parsing
- **Parsing Engine**: Tree-sitter (language-aware chunking)
- **Embedding Model**: Google Gemini gemini-embedding-001
- **Vector Store**: PostgreSQL with pgvector

## Features

- **Semantic search** - Find code by meaning, not just keywords
- **Multi-project support** - One pgvector container serves all projects
- **Persistent daemon** - Background indexer runs independently of Claude
- **AST-aware chunking** - Tree-sitter extracts functions/classes for better results
- **SHA-256 deduplication** - Only re-embeds changed code
- **Gitignore-aware** - Respects `.gitignore` patterns

## Prerequisites

- **Docker** - For pgvector container
- **Python 3.8+** - For CocoIndex
- **Node.js 18+** - For CLI wrappers
- **Gemini API key** - For embeddings

## Quick Start

```bash
# 1. Install Node.js dependencies
cd semantic-indexer
npm install

# 2. Start pgvector container
node scripts/setup.js docker-up

# 3. Install CocoIndex Python dependencies
node scripts/setup.js install-python

# 4. Set Gemini API key
node scripts/setup.js auth set-key --key "your-api-key"

# 5. Check setup
node scripts/setup.js check-env

# 6. Start daemon
node scripts/daemon.js start

# 7. Add project to index
node scripts/projects.js add .

# 8. Search!
node scripts/search.js --query "user authentication" --project .
```

## Directory Structure

```
semantic-indexer/
├── cocoindex/
│   ├── main.py               # CocoIndex flow definition
│   └── requirements.txt      # Python dependencies
├── docker/
│   ├── docker-compose.yml    # pgvector container
│   └── init.sql              # Database schema
├── scripts/
│   ├── setup.js              # Docker + auth + Python install
│   ├── daemon.js             # Start/stop background indexer
│   ├── projects.js           # Project management
│   ├── search.js             # Semantic search CLI
│   ├── watcher-main.js       # Spawns CocoIndex daemon
│   └── lib/                  # Node.js libraries
└── skills/
    └── semantic-search/      # Claude Code skill
```

## Commands

### Setup
```bash
node scripts/setup.js docker-up          # Start container
node scripts/setup.js docker-down        # Stop container
node scripts/setup.js install-python     # Install CocoIndex
node scripts/setup.js auth set --file <path>   # Set API key from JSON
node scripts/setup.js auth paste-win     # Set from clipboard (Windows)
node scripts/setup.js check-env          # Verify setup
```

### Daemon
```bash
node scripts/daemon.js start    # Start background indexer (uses CocoIndex)
node scripts/daemon.js stop     # Stop indexer
node scripts/daemon.js status   # Check status
node scripts/daemon.js logs     # View logs
```

### Projects
```bash
node scripts/projects.js add <path>      # Add project to watch
node scripts/projects.js remove <path>   # Stop watching
node scripts/projects.js list            # List all projects
node scripts/projects.js reindex <path>  # Force reindex
node scripts/projects.js clear <path>    # Remove from DB
```

### Search
```bash
node scripts/search.js --query "..." --project . --limit 10 --threshold 0.7
```

## How It Works

1. **CocoIndex** watches configured project directories
2. When files change, **Tree-sitter** parses them into AST nodes
3. Functions, classes, and methods are extracted as semantic chunks
4. Each chunk is hashed (SHA-256) for deduplication
5. Changed chunks are embedded using **Gemini gemini-embedding-001**
6. Embeddings are stored in **pgvector** for fast similarity search

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_API_KEY` | - | Gemini API key (fallback if no credentials file) |
| `COCOINDEX_DATABASE_URL` | See below | Full Postgres connection URL |
| `PGVECTOR_HOST` | localhost | Database host |
| `PGVECTOR_PORT` | 5433 | Database port |
| `PGVECTOR_DB` | codebase_index | Database name |
| `PGVECTOR_USER` | indexer | Database user |
| `PGVECTOR_PASSWORD` | indexer_dev | Database password |

## Credentials Format

`credentials.json`:
```json
{
  "gemini_api_key": "AIza..."
}
```

## Database Schema

```sql
CREATE TABLE codebase_segments (
    id SERIAL PRIMARY KEY,
    project_root TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    content TEXT NOT NULL,
    start_line INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    symbol_name TEXT,
    node_type TEXT,
    content_hash TEXT NOT NULL,
    embedding vector(3072),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

## Supported Languages (via Tree-sitter)

- TypeScript/JavaScript (`.ts`, `.tsx`, `.js`, `.jsx`)
- Python (`.py`)
- Go (`.go`)
- Rust (`.rs`)
- Java (`.java`)
- C/C++ (`.c`, `.cpp`, `.h`)
- And 25+ more languages

## Sources

- [CocoIndex GitHub](https://github.com/cocoindex-io/cocoindex)
- [CocoIndex Documentation](https://cocoindex.io/docs/getting_started/quickstart)
- [Real-Time Codebase Indexing Example](https://github.com/cocoindex-io/realtime-codebase-indexing)

## License

MIT
