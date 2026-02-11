#!/usr/bin/env python3
"""
CocoIndex-based codebase indexer for semantic search.
Uses Tree-sitter for AST-aware chunking and Gemini for embeddings.
"""

import os
import sys
import json
import shutil
from pathlib import Path

try:
    import cocoindex
except ImportError:
    print("Missing required packages. Install with:", file=sys.stderr)
    print("  pip install cocoindex psycopg2-binary", file=sys.stderr)
    sys.exit(1)

# Configuration
PLUGIN_ROOT = Path(__file__).resolve().parent.parent
LEGACY_INDEXER_DIR = PLUGIN_ROOT / "scripts" / ".semantic-indexer"
GLOBAL_INDEXER_DIR = Path.home() / ".semantic-indexer"

# Default DB config (matches docker-compose)
DEFAULT_DB_URL = "postgresql://indexer:indexer_dev@localhost:5433/codebase_index"


def get_indexer_dir() -> Path:
    """Resolve shared indexer state directory across agent installs."""
    configured = os.environ.get("SEMANTIC_INDEXER_HOME")
    if configured:
        return Path(configured).expanduser().resolve()
    return GLOBAL_INDEXER_DIR.resolve()


def migrate_legacy_state(indexer_dir: Path):
    """Copy legacy local state once so old installs keep working."""
    if not LEGACY_INDEXER_DIR.exists() or LEGACY_INDEXER_DIR.resolve() == indexer_dir:
        return

    for name in ("credentials.json", "projects.json", "config.json"):
        src = LEGACY_INDEXER_DIR / name
        dst = indexer_dir / name
        if src.exists() and not dst.exists():
            shutil.copy2(src, dst)


def ensure_indexer_dir() -> Path:
    indexer_dir = get_indexer_dir()
    indexer_dir.mkdir(parents=True, exist_ok=True)
    migrate_legacy_state(indexer_dir)
    return indexer_dir


def get_projects_path() -> Path:
    return ensure_indexer_dir() / "projects.json"


def get_credentials_path() -> Path:
    return ensure_indexer_dir() / "credentials.json"


def normalize_project_path(path: str) -> str:
    normalized = os.path.abspath(path)
    if sys.platform == "win32" and len(normalized) >= 2 and normalized[1] == ":":
        normalized = normalized[0].upper() + normalized[1:]
    return normalized


def load_gemini_api_key() -> str:
    """Load Gemini API key from credentials file or environment."""
    credentials_path = get_credentials_path()

    if credentials_path.exists():
        with open(credentials_path) as f:
            data = json.load(f)
            if "gemini_api_key" in data:
                return data["gemini_api_key"]

    key = os.environ.get("GEMINI_API_KEY")
    if key:
        return key

    raise ValueError(
        "Missing Gemini API key. Set via:\n"
        f"  echo '{{\"gemini_api_key\": \"YOUR_KEY\"}}' > {credentials_path}\n"
        "Or set GEMINI_API_KEY environment variable."
    )


def load_projects() -> list[dict]:
    """Load project list from projects.json."""
    projects_path = get_projects_path()
    if not projects_path.exists():
        return []
    with open(projects_path) as f:
        data = json.load(f)
        return data.get("projects", [])


def get_db_url() -> str:
    """Get database URL from config or environment."""
    config_path = ensure_indexer_dir() / "config.json"

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


# Helper function to extract file extension
@cocoindex.op.function()
def extract_extension(filename: str) -> str:
    """Extract file extension for language detection."""
    return os.path.splitext(filename)[1].lstrip(".")


# Transform flow for embeddings - allows reuse in search
@cocoindex.transform_flow()
def text_to_embedding(text: cocoindex.DataSlice[str]) -> cocoindex.DataSlice[list[float]]:
    """Embed text using Gemini gemini-embedding-001."""
    return text.transform(
        cocoindex.functions.EmbedText(
            api_type=cocoindex.LlmApiType.GEMINI,
            model="gemini-embedding-001",
            task_type="RETRIEVAL_DOCUMENT",
        )
    )


@cocoindex.flow_def(name="CodebaseIndex")
def codebase_index_flow(flow_builder: cocoindex.FlowBuilder, data_scope: cocoindex.DataScope):
    """
    CocoIndex flow for codebase indexing.

    1. Read source files from project directory
    2. Parse with Tree-sitter for AST-aware chunking
    3. Generate Gemini embeddings
    4. Store in pgvector
    """
    # Get project root from environment (set before running)
    project_root = os.environ.get("SEMANTIC_INDEXER_PROJECT_ROOT", ".")

    # File patterns to include
    include_patterns = [
        "*.ts", "*.tsx", "*.js", "*.jsx",
        "*.py", "*.go", "*.rs",
        "*.java", "*.kt", "*.c", "*.cpp", "*.h",
        "*.vue", "*.svelte",
        "*.sql", "*.graphql",
        "*.yaml", "*.yml", "*.json", "*.toml",
        "*.md", "*.mdx",
    ]

    # Exclude patterns (globset syntax: ** matches nested dirs)
    exclude_patterns = [
        # Dependencies — nested to catch monorepo/turborepo/submodule layouts
        "**/node_modules",
        "**/bower_components",
        "**/.pnpm",

        # VCS & metadata
        "**/.git",
        "**/.svn",
        "**/.hg",

        # Build outputs
        "**/dist",
        "**/build",
        "**/out",
        "**/.next",
        "**/.nuxt",
        "**/.turbo",
        "**/.cache",
        "**/target",              # Rust / Java
        "**/__pycache__",
        "**/*.egg-info",

        # Test & coverage artifacts
        "**/coverage",
        "**/.nyc_output",

        # Virtual environments
        "**/.venv",
        "**/venv",
        "**/vendor",

        # IDE & tooling
        "**/.idea",
        "**/.vscode",
        "**/.claude",
        "**/.swarm",
        "**/.specify",

        # Monorepo / workspace nested packages with own deps
        "**/packages/*/node_modules",
        "**/apps/*/node_modules",
        "**/libs/*/node_modules",

        # Minified & generated assets
        "**/*.min.js",
        "**/*.min.css",
        "**/*.map",
        "**/*.d.ts",

        # Lock files
        "**/*.lock",
        "**/package-lock.json",
        "**/yarn.lock",
        "**/pnpm-lock.yaml",
        "**/shrinkwrap.json",

        # Misc large/binary
        "**/*.wasm",
        "**/*.pyc",
        "**/*.pyo",
    ]

    # Source: Local files with pattern filtering
    # max_file_size: skip files > 500KB (bundled JS, large fixtures, etc.)
    data_scope["files"] = flow_builder.add_source(
        cocoindex.sources.LocalFile(
            path=project_root,
            included_patterns=include_patterns,
            excluded_patterns=exclude_patterns,
            max_file_size=512_000,
        )
    )

    # Create collector for code embeddings
    code_embeddings = data_scope.add_collector()

    # Process each file
    with data_scope["files"].row() as file:
        # Detect language from extension
        file["extension"] = file["filename"].transform(extract_extension)

        # Split with Tree-sitter (AST-aware chunking)
        file["chunks"] = file["content"].transform(
            cocoindex.functions.SplitRecursively(),
            language=file["extension"],
            chunk_size=1000,
            chunk_overlap=100,
        )

        # Process each chunk
        with file["chunks"].row() as chunk:
            # Generate embedding
            chunk["embedding"] = chunk["text"].call(text_to_embedding)

            # Collect with metadata
            code_embeddings.collect(
                project_root=project_root,
                file_path=file["filename"],
                file_name=Path(file["filename"]).name if isinstance(file["filename"], str) else file["filename"],
                content=chunk["text"],
                location=chunk["location"],
                embedding=chunk["embedding"],
            )

    # Export to Postgres with pgvector
    code_embeddings.export(
        "codebase_segments",
        cocoindex.storages.Postgres(),
        primary_key_fields=["project_root", "file_path", "location"],
        vector_indexes=[
            cocoindex.VectorIndexDef(
                field_name="embedding",
                metric=cocoindex.VectorSimilarityMetric.COSINE_SIMILARITY,
            )
        ],
    )


def initialize():
    """Initialize CocoIndex with database settings."""
    db_url = get_db_url()
    api_key = load_gemini_api_key()

    # Set environment variables for CocoIndex
    os.environ["COCOINDEX_DATABASE_URL"] = db_url
    os.environ["GEMINI_API_KEY"] = api_key

    # Initialize CocoIndex
    docker_dir = Path(__file__).parent.parent / "docker"
    try:
        cocoindex.init(
            cocoindex.Settings(
                database=cocoindex.DatabaseConnectionSpec(url=db_url)
            )
        )
    except RuntimeError as e:
        if "connect" in str(e).lower() or "timed out" in str(e).lower():
            raise RuntimeError(
                f"Cannot connect to database. Start pgvector container:\n"
                f"  cd {docker_dir} && docker-compose up -d\n"
                f"Original error: {e}"
            ) from e
        raise


def index_project(project_root: str, watch: bool = False):
    """Index a single project."""
    initialize()

    # Set project root for flow
    os.environ["SEMANTIC_INDEXER_PROJECT_ROOT"] = project_root

    print(json.dumps({
        "event": "indexing_started",
        "project": project_root,
        "watch_mode": watch,
    }))

    # Setup the flow (creates tables)
    codebase_index_flow.setup()

    if watch:
        # Live update mode with file watching
        updater = cocoindex.FlowLiveUpdater(
            codebase_index_flow,
            cocoindex.FlowLiveUpdaterOptions(print_stats=True)
        )
        updater.start()
        print(json.dumps({
            "event": "watching",
            "project": project_root,
        }))
        updater.wait()
    else:
        # One-time update
        update_info = codebase_index_flow.update(print_stats=True)
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

    initialize()

    print(json.dumps({
        "event": "daemon_started",
        "project_count": len(projects),
        "projects": [p["path"] for p in projects],
    }))

    # For multi-project support, we use the first project
    # TODO: Support multiple projects with separate flows
    project = projects[0]
    os.environ["SEMANTIC_INDEXER_PROJECT_ROOT"] = project["path"]

    # Setup and start live updater
    codebase_index_flow.setup()

    updater = cocoindex.FlowLiveUpdater(
        codebase_index_flow,
        cocoindex.FlowLiveUpdaterOptions(print_stats=True)
    )
    updater.start()

    print(json.dumps({
        "event": "watching",
        "project": project["path"],
    }))

    # Keep daemon running
    import signal

    def handle_signal(signum, frame):
        print(json.dumps({"event": "shutdown_requested"}))
        updater.abort()
        sys.exit(0)

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    # SIGHUP for reload (Unix only)
    if hasattr(signal, 'SIGHUP'):
        def handle_sighup(signum, frame):
            print(json.dumps({"event": "reload_requested"}))

        signal.signal(signal.SIGHUP, handle_sighup)

    # Wait for updater
    updater.wait()


def search(project_root: str, query: str, limit: int = 10, threshold: float = 0.3):
    """Search the indexed codebase."""
    initialize()

    # Normalize drive-letter case so query path matches indexed project_root.
    project_root = normalize_project_path(project_root)

    # Generate query embedding using the transform flow
    query_embedding = text_to_embedding.eval(query)

    # Get table name
    table_name = cocoindex.utils.get_target_storage_default_name(
        codebase_index_flow, "codebase_segments"
    )

    # Search in pgvector
    import psycopg2
    db_url = get_db_url()
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    cur.execute(f"""
        SELECT
            file_path,
            file_name,
            content,
            location,
            1 - (embedding <=> %s::vector) as similarity
        FROM {table_name}
        WHERE project_root = %s
          AND 1 - (embedding <=> %s::vector) >= %s
        ORDER BY embedding <=> %s::vector
        LIMIT %s
    """, (query_embedding, project_root, query_embedding, threshold, query_embedding, limit))

    results = []
    for row in cur.fetchall():
        location = row[3]
        # Convert location (NumericRange or similar) to dict
        if hasattr(location, 'lower') and hasattr(location, 'upper'):
            location_dict = {"start": location.lower, "end": location.upper}
        else:
            location_dict = str(location)

        results.append({
            "file_path": row[0],
            "file_name": row[1],
            "content": row[2],
            "location": location_dict,
            "similarity": round(row[4], 3),
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


def projects_add(path: str):
    """Add a project to the watch list."""
    path = normalize_project_path(path)
    if not os.path.isdir(path):
        print(json.dumps({"ok": False, "error": f"Directory not found: {path}"}))
        sys.exit(1)

    ensure_indexer_dir()

    projects = load_projects()
    existing = [p for p in projects if p["path"] == path]
    if existing:
        print(json.dumps({"ok": True, "message": "Project already in list", "path": path}))
        return

    from datetime import datetime
    projects.append({
        "path": path,
        "addedAt": datetime.utcnow().isoformat() + "Z",
    })

    with open(get_projects_path(), "w") as f:
        json.dump({"projects": projects}, f, indent=2)

    print(json.dumps({"ok": True, "action": "projects.add", "path": path}))


def projects_remove(path: str):
    """Remove a project from the watch list."""
    path = normalize_project_path(path)
    projects = load_projects()
    new_projects = [p for p in projects if p["path"] != path]

    if len(new_projects) == len(projects):
        print(json.dumps({"ok": False, "error": f"Project not found: {path}"}))
        sys.exit(1)

    with open(get_projects_path(), "w") as f:
        json.dump({"projects": new_projects}, f, indent=2)

    print(json.dumps({"ok": True, "action": "projects.remove", "path": path}))


def projects_list():
    """List all projects in watch list."""
    projects = load_projects()
    print(json.dumps({
        "ok": True,
        "action": "projects.list",
        "count": len(projects),
        "projects": projects,
    }, indent=2))


def main():
    """CLI entry point."""
    if len(sys.argv) < 2:
        print(json.dumps({
            "ok": True,
            "usage": {
                "search": "python main.py search <project_path> <query> [limit] [threshold]",
                "index": "python main.py index <project_path> [--watch]",
                "projects add": "python main.py projects add <path>",
                "projects remove": "python main.py projects remove <path>",
                "projects list": "python main.py projects list",
                "daemon": "python main.py daemon",
            }
        }, indent=2))
        return

    command = sys.argv[1]

    if command == "daemon":
        run_daemon()
    elif command == "index":
        if len(sys.argv) < 3:
            print(json.dumps({"ok": False, "error": "Missing project path"}))
            sys.exit(1)
        project_path = normalize_project_path(sys.argv[2])
        watch = "--watch" in sys.argv
        index_project(project_path, watch=watch)
    elif command == "search":
        if len(sys.argv) < 4:
            print(json.dumps({"ok": False, "error": "Missing project path or query"}))
            sys.exit(1)
        project_path = normalize_project_path(sys.argv[2])
        query = sys.argv[3]
        limit = int(sys.argv[4]) if len(sys.argv) > 4 else 10
        threshold = float(sys.argv[5]) if len(sys.argv) > 5 else 0.3
        search(project_path, query, limit, threshold)
    elif command == "projects":
        if len(sys.argv) < 3:
            print(json.dumps({"ok": False, "error": "Usage: projects add|remove|list [path]"}))
            sys.exit(1)
        subcommand = sys.argv[2]
        if subcommand == "add":
            if len(sys.argv) < 4:
                print(json.dumps({"ok": False, "error": "Missing path"}))
                sys.exit(1)
            projects_add(sys.argv[3])
        elif subcommand == "remove":
            if len(sys.argv) < 4:
                print(json.dumps({"ok": False, "error": "Missing path"}))
                sys.exit(1)
            projects_remove(sys.argv[3])
        elif subcommand == "list":
            projects_list()
        else:
            print(json.dumps({"ok": False, "error": f"Unknown subcommand: {subcommand}"}))
            sys.exit(1)
    else:
        print(json.dumps({"ok": False, "error": f"Unknown command: {command}"}))
        sys.exit(1)


if __name__ == "__main__":
    main()
