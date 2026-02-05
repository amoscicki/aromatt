#!/usr/bin/env python3
"""
CocoIndex-based codebase indexer for semantic search.
Uses Tree-sitter for AST-aware chunking and Gemini for embeddings.
"""

import os
import sys
import json
import hashlib
from pathlib import Path
from typing import Optional
from datetime import datetime

import cocoindex
from cocoindex.sources import LocalFile
from cocoindex.storages import Postgres

# Configuration
INDEXER_DIR = Path(__file__).parent.parent / "scripts" / ".semantic-indexer"
PROJECTS_PATH = INDEXER_DIR / "projects.json"
CREDENTIALS_PATH = INDEXER_DIR / "credentials.json"

# Default DB config (matches docker-compose)
DEFAULT_DB_URL = "postgresql://indexer:indexer_dev@localhost:5433/codebase_index"


def load_gemini_api_key() -> str:
    """Load Gemini API key from credentials file or environment."""
    # Try credentials file first
    if CREDENTIALS_PATH.exists():
        with open(CREDENTIALS_PATH) as f:
            data = json.load(f)
            if "gemini_api_key" in data:
                return data["gemini_api_key"]

    # Fallback to environment
    key = os.environ.get("GEMINI_API_KEY")
    if key:
        return key

    raise ValueError(
        "Missing Gemini API key. Set via:\n"
        "  node setup.js auth set --file /path/to/credentials.json\n"
        "Or set GEMINI_API_KEY environment variable."
    )


def load_projects() -> list[dict]:
    """Load project list from projects.json."""
    if not PROJECTS_PATH.exists():
        return []
    with open(PROJECTS_PATH) as f:
        data = json.load(f)
        return data.get("projects", [])


def save_projects(projects: list[dict]):
    """Save project list to projects.json."""
    INDEXER_DIR.mkdir(parents=True, exist_ok=True)
    with open(PROJECTS_PATH, "w") as f:
        json.dump({"projects": projects}, f, indent=2)


def get_db_url() -> str:
    """Get database URL from config or environment."""
    config_path = INDEXER_DIR / "config.json"

    if config_path.exists():
        with open(config_path) as f:
            config = json.load(f)
            host = config.get("host", "localhost")
            port = config.get("port", 5433)
            db = config.get("database", "codebase_index")
            user = config.get("user", "indexer")
            password = config.get("password", "indexer_dev")
            return f"postgresql://{user}:{password}@{host}:{port}/{db}"

    return os.environ.get("COCOINDEX_DATABASE_URL", DEFAULT_DB_URL)


# Custom Gemini embedding function for CocoIndex
class GeminiEmbedding:
    """Gemini text-embedding-004 wrapper for CocoIndex."""

    def __init__(self, api_key: str, task_type: str = "RETRIEVAL_DOCUMENT"):
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        self.task_type = task_type
        self.model = "models/text-embedding-004"
        self.dimension = 768

    def embed(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for a batch of texts."""
        import google.generativeai as genai

        embeddings = []
        for text in texts:
            result = genai.embed_content(
                model=self.model,
                content=text,
                task_type=self.task_type,
            )
            embeddings.append(result["embedding"])
        return embeddings


@cocoindex.flow_def(name="CodebaseIndex")
def codebase_index_flow(
    flow_builder: cocoindex.FlowBuilder,
    data_scope: cocoindex.DataScope,
    project_root: str,
    gemini_api_key: str,
):
    """
    CocoIndex flow for codebase indexing.

    1. Read source files from project directory
    2. Parse with Tree-sitter for AST-aware chunking
    3. Generate Gemini embeddings
    4. Store in pgvector
    """
    # File patterns to include
    include_patterns = [
        "**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx",
        "**/*.py", "**/*.go", "**/*.rs",
        "**/*.java", "**/*.kt", "**/*.c", "**/*.cpp", "**/*.h",
        "**/*.vue", "**/*.svelte",
        "**/*.sql", "**/*.graphql",
        "**/*.yaml", "**/*.yml", "**/*.json", "**/*.toml",
        "**/*.md", "**/*.mdx",
    ]

    # Exclude patterns (gitignore-style)
    exclude_patterns = [
        "**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**",
        "**/.next/**", "**/__pycache__/**", "**/coverage/**",
        "**/.venv/**", "**/venv/**", "**/vendor/**",
        "**/.idea/**", "**/.vscode/**", "**/.claude/**", "**/.swarm/**",
        "**/*.min.js", "**/*.min.css", "**/*.map",
        "**/*.lock", "**/package-lock.json", "**/yarn.lock",
    ]

    # Source: Local files with pattern filtering
    data_scope["source_files"] = flow_builder.add_source(
        LocalFile(
            path=project_root,
            included_patterns=include_patterns,
            excluded_patterns=exclude_patterns,
        )
    )

    # Transform: Detect language from file extension
    data_scope["with_language"] = data_scope["source_files"].transform(
        cocoindex.functions.DetectLanguage()
    )

    # Transform: Split with Tree-sitter (AST-aware chunking)
    data_scope["chunks"] = data_scope["with_language"].transform(
        cocoindex.functions.SplitRecursively(
            chunk_size=1000,
            chunk_overlap=100,
            language_field="language",  # Use detected language for Tree-sitter
        )
    )

    # Add metadata
    data_scope["with_metadata"] = data_scope["chunks"].transform(
        lambda chunk: {
            **chunk,
            "project_root": project_root,
            "file_name": Path(chunk["file_path"]).name,
            "content_hash": hashlib.sha256(chunk["content"].encode()).hexdigest(),
            "updated_at": datetime.utcnow().isoformat(),
        }
    )

    # Generate embeddings using Gemini
    embedder = GeminiEmbedding(api_key=gemini_api_key, task_type="RETRIEVAL_DOCUMENT")
    data_scope["with_embeddings"] = data_scope["with_metadata"].transform(
        cocoindex.functions.Embed(
            embedding_func=embedder.embed,
            text_field="content",
            embedding_field="embedding",
        )
    )

    # Export to Postgres with pgvector
    flow_builder.add_target(
        Postgres(
            table_name="codebase_segments",
            primary_key=["project_root", "file_path", "start_line", "end_line"],
            vector_index={
                "embedding": {
                    "metric": "cosine_similarity",
                    "lists": 100,  # IVFFlat index config
                }
            }
        ),
        data_scope["with_embeddings"],
    )


def index_project(project_root: str, watch: bool = False):
    """Index a single project."""
    api_key = load_gemini_api_key()
    db_url = get_db_url()

    os.environ["COCOINDEX_DATABASE_URL"] = db_url

    print(json.dumps({
        "event": "indexing_started",
        "project": project_root,
        "watch_mode": watch,
    }))

    # Create and run the flow
    flow = codebase_index_flow.create(
        project_root=project_root,
        gemini_api_key=api_key,
    )

    if watch:
        # Run with file watching (incremental updates)
        flow.run(watch=True)
    else:
        # Run once (full index)
        flow.run()

    print(json.dumps({
        "event": "indexing_completed",
        "project": project_root,
    }))


def run_daemon():
    """Run the daemon, watching all configured projects."""
    projects = load_projects()

    if not projects:
        print(json.dumps({
            "event": "error",
            "message": "No projects configured. Add projects with: node projects.js add <path>",
        }))
        sys.exit(1)

    api_key = load_gemini_api_key()
    db_url = get_db_url()
    os.environ["COCOINDEX_DATABASE_URL"] = db_url

    print(json.dumps({
        "event": "daemon_started",
        "project_count": len(projects),
        "projects": [p["path"] for p in projects],
    }))

    # Index all projects with watch mode
    # CocoIndex handles incremental updates internally
    for project in projects:
        try:
            flow = codebase_index_flow.create(
                project_root=project["path"],
                gemini_api_key=api_key,
            )
            flow.run(watch=True, background=True)

            print(json.dumps({
                "event": "watching",
                "project": project["path"],
            }))
        except Exception as e:
            print(json.dumps({
                "event": "error",
                "project": project["path"],
                "error": str(e),
            }))

    # Keep daemon running
    import signal
    import time

    def handle_sighup(signum, frame):
        """Reload projects on SIGHUP."""
        print(json.dumps({"event": "reload_requested"}))
        # In a full implementation, we'd restart flows here

    signal.signal(signal.SIGHUP, handle_sighup)

    while True:
        time.sleep(60)


def search(project_root: str, query: str, limit: int = 10, threshold: float = 0.7):
    """Search the indexed codebase."""
    import psycopg2

    api_key = load_gemini_api_key()
    db_url = get_db_url()

    # Generate query embedding
    embedder = GeminiEmbedding(api_key=api_key, task_type="RETRIEVAL_QUERY")
    query_embedding = embedder.embed([query])[0]

    # Search in pgvector
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    embedding_str = "[" + ",".join(map(str, query_embedding)) + "]"

    cur.execute("""
        SELECT
            file_path,
            file_name,
            content,
            start_line,
            end_line,
            symbol_name,
            node_type,
            1 - (embedding <=> %s::vector) as similarity
        FROM codebase_segments
        WHERE project_root = %s
          AND 1 - (embedding <=> %s::vector) >= %s
        ORDER BY embedding <=> %s::vector
        LIMIT %s
    """, (embedding_str, project_root, embedding_str, threshold, embedding_str, limit))

    results = []
    for row in cur.fetchall():
        results.append({
            "file_path": row[0],
            "file_name": row[1],
            "content": row[2],
            "start_line": row[3],
            "end_line": row[4],
            "symbol_name": row[5],
            "node_type": row[6],
            "similarity": round(row[7], 2),
            "preview": row[2][:200] + ("..." if len(row[2]) > 200 else ""),
        })

    cur.close()
    conn.close()

    print(json.dumps({
        "ok": True,
        "query": query,
        "project_root": project_root,
        "result_count": len(results),
        "results": results,
    }, indent=2))


def main():
    """CLI entry point."""
    if len(sys.argv) < 2:
        print(json.dumps({
            "ok": True,
            "usage": {
                "daemon": "python main.py daemon",
                "index": "python main.py index <project_path>",
                "search": "python main.py search <project_path> <query>",
            }
        }))
        return

    command = sys.argv[1]

    if command == "daemon":
        run_daemon()
    elif command == "index":
        if len(sys.argv) < 3:
            print(json.dumps({"ok": False, "error": "Missing project path"}))
            sys.exit(1)
        project_path = os.path.abspath(sys.argv[2])
        watch = "--watch" in sys.argv
        index_project(project_path, watch=watch)
    elif command == "search":
        if len(sys.argv) < 4:
            print(json.dumps({"ok": False, "error": "Missing project path or query"}))
            sys.exit(1)
        project_path = os.path.abspath(sys.argv[2])
        query = sys.argv[3]
        limit = int(sys.argv[4]) if len(sys.argv) > 4 else 10
        threshold = float(sys.argv[5]) if len(sys.argv) > 5 else 0.7
        search(project_path, query, limit, threshold)
    else:
        print(json.dumps({"ok": False, "error": f"Unknown command: {command}"}))
        sys.exit(1)


if __name__ == "__main__":
    main()
