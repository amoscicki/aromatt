#!/usr/bin/env python3
"""
CocoIndex-based codebase indexer for semantic search.
Uses Tree-sitter for AST-aware chunking and Gemini for embeddings.
"""

import os
import sys
import json
import shutil
import subprocess
from pathlib import Path
from datetime import datetime, timezone

try:
    import cocoindex
except ImportError:
    print("Missing required packages. Install with:", file=sys.stderr)
    print("  pip install cocoindex psycopg2-binary", file=sys.stderr)
    sys.exit(1)

PLUGIN_ROOT = Path(__file__).resolve().parent.parent
LEGACY_INDEXER_DIR = PLUGIN_ROOT / "scripts" / ".semantic-indexer"
GLOBAL_INDEXER_DIR = Path.home() / ".semantic-indexer"

DEFAULT_DB_URL = "postgresql://indexer:indexer_dev@localhost:5433/codebase_index"


def get_indexer_dir() -> Path:
    configured = os.environ.get("SEMANTIC_INDEXER_HOME")
    if configured:
        return Path(configured).expanduser().resolve()
    return GLOBAL_INDEXER_DIR.resolve()


def migrate_legacy_state(indexer_dir: Path):
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
    projects_path = get_projects_path()
    if not projects_path.exists():
        return []
    with open(projects_path) as f:
        data = json.load(f)
        return data.get("projects", [])


def get_db_url() -> str:
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


# --- Daemon health check helpers ---

def _load_daemon_pids() -> dict[str, int]:
    pids_path = ensure_indexer_dir() / "daemon-pids.json"
    if not pids_path.exists():
        return {}
    try:
        with open(pids_path) as f:
            data = json.load(f)
            return data.get("pids", {})
    except (json.JSONDecodeError, ValueError):
        return {}


def _is_pid_running(pid: int) -> bool:
    if pid <= 0:
        return False

    if sys.platform == "win32":
        try:
            result = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
                capture_output=True,
                text=True,
                check=False,
            )
            output = (result.stdout or "") + (result.stderr or "")
            if "No tasks are running" in output:
                return False
            return f'"{pid}"' in output or f",{pid}," in output
        except Exception:
            pass

    try:
        os.kill(pid, 0)
        return True
    except PermissionError:
        return True
    except (OSError, ProcessLookupError):
        return False


def check_daemon_status(project_root: str) -> dict:
    """Check if daemon is running for a specific project."""
    pids = _load_daemon_pids()
    pid = pids.get(project_root)
    if pid is None:
        return {"running": False, "reason": "no_pid_registered"}
    if not _is_pid_running(pid):
        return {"running": False, "reason": "pid_dead", "pid": pid}
    return {"running": True, "pid": pid}


def _ensure_project_registered(project_root: str):
    """Auto-add project to projects.json if not already there."""
    if not os.path.isdir(project_root):
        return

    projects = load_projects()
    existing = [p for p in projects if normalize_project_path(p["path"]) == project_root]
    if existing:
        return

    projects.append({
        "path": project_root,
        "addedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    })

    with open(get_projects_path(), "w") as f:
        json.dump({"projects": projects}, f, indent=2)


# --- CocoIndex flow definition ---

@cocoindex.op.function()
def extract_extension(filename: str) -> str:
    return os.path.splitext(filename)[1].lstrip(".")


@cocoindex.transform_flow()
def text_to_embedding(text: cocoindex.DataSlice[str]) -> cocoindex.DataSlice[list[float]]:
    return text.transform(
        cocoindex.functions.EmbedText(
            api_type=cocoindex.LlmApiType.GEMINI,
            model="gemini-embedding-001",
            task_type="RETRIEVAL_DOCUMENT",
        )
    )


@cocoindex.flow_def(name="CodebaseIndex")
def codebase_index_flow(flow_builder: cocoindex.FlowBuilder, data_scope: cocoindex.DataScope):
    project_root = os.environ.get("SEMANTIC_INDEXER_PROJECT_ROOT", ".")

    include_patterns = [
        "*.ts", "*.tsx", "*.js", "*.jsx",
        "*.py", "*.go", "*.rs",
        "*.java", "*.kt", "*.c", "*.cpp", "*.h",
        "*.vue", "*.svelte",
        "*.sql", "*.graphql",
        "*.yaml", "*.yml", "*.json", "*.toml",
        "*.md", "*.mdx",
    ]

    exclude_patterns = [
        "**/node_modules",
        "**/bower_components",
        "**/.pnpm",
        "**/.git",
        "**/.svn",
        "**/.hg",
        "**/dist",
        "**/build",
        "**/out",
        "**/.next",
        "**/.nuxt",
        "**/.turbo",
        "**/.cache",
        "**/target",
        "**/__pycache__",
        "**/*.egg-info",
        "**/coverage",
        "**/.nyc_output",
        "**/.venv",
        "**/venv",
        "**/vendor",
        "**/.idea",
        "**/.vscode",
        "**/.claude",
        "**/.swarm",
        "**/.specify",
        "**/packages/*/node_modules",
        "**/apps/*/node_modules",
        "**/libs/*/node_modules",
        "**/*.min.js",
        "**/*.min.css",
        "**/*.map",
        "**/*.d.ts",
        "**/*.lock",
        "**/package-lock.json",
        "**/yarn.lock",
        "**/pnpm-lock.yaml",
        "**/shrinkwrap.json",
        "**/*.wasm",
        "**/*.pyc",
        "**/*.pyo",
    ]

    data_scope["files"] = flow_builder.add_source(
        cocoindex.sources.LocalFile(
            path=project_root,
            included_patterns=include_patterns,
            excluded_patterns=exclude_patterns,
            max_file_size=512_000,
        )
    )

    code_embeddings = data_scope.add_collector()

    with data_scope["files"].row() as file:
        file["extension"] = file["filename"].transform(extract_extension)

        file["chunks"] = file["content"].transform(
            cocoindex.functions.SplitRecursively(),
            language=file["extension"],
            chunk_size=1000,
            chunk_overlap=100,
        )

        with file["chunks"].row() as chunk:
            chunk["embedding"] = chunk["text"].call(text_to_embedding)

            code_embeddings.collect(
                project_root=project_root,
                file_path=file["filename"],
                file_name=Path(file["filename"]).name if isinstance(file["filename"], str) else file["filename"],
                content=chunk["text"],
                location=chunk["location"],
                embedding=chunk["embedding"],
            )

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
    db_url = get_db_url()
    api_key = load_gemini_api_key()

    os.environ["COCOINDEX_DATABASE_URL"] = db_url
    os.environ["GEMINI_API_KEY"] = api_key

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
    initialize()

    os.environ["SEMANTIC_INDEXER_PROJECT_ROOT"] = project_root

    print(json.dumps({
        "event": "indexing_started",
        "project": project_root,
        "watch_mode": watch,
    }))

    codebase_index_flow.setup()

    if watch:
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
        codebase_index_flow.update(print_stats=True)
        print(json.dumps({
            "event": "indexing_completed",
            "project": project_root,
        }))


def search(project_root: str, query: str, limit: int = 10, threshold: float = 0.3):
    initialize()

    project_root = normalize_project_path(project_root)

    # Auto-register project if not in projects.json
    _ensure_project_registered(project_root)

    # Check daemon health for this project
    daemon_status = check_daemon_status(project_root)

    # Generate query embedding
    query_embedding = text_to_embedding.eval(query)

    table_name = cocoindex.utils.get_target_storage_default_name(
        codebase_index_flow, "codebase_segments"
    )

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

    output = {
        "ok": True,
        "query": query,
        "project_root": project_root,
        "result_count": len(results),
        "results": results,
    }

    # Include daemon health warnings
    if not daemon_status["running"]:
        output["daemon_status"] = "not_running"
        output["warning"] = "Daemon not running for this project. Index may be stale. Start with: python daemon.py start"

    if len(results) == 0 and not daemon_status["running"]:
        output["hint"] = "No results found. The project may not be indexed yet. Run: python main.py index \"" + project_root + "\""

    print(json.dumps(output, indent=2))


def projects_add(path: str):
    path = normalize_project_path(path)
    if not os.path.isdir(path):
        print(json.dumps({"ok": False, "error": f"Directory not found: {path}"}))
        sys.exit(1)

    ensure_indexer_dir()

    projects = load_projects()
    existing = [p for p in projects if normalize_project_path(p["path"]) == path]
    if existing:
        print(json.dumps({"ok": True, "message": "Project already in list", "path": path}))
        return

    projects.append({
        "path": path,
        "addedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    })

    with open(get_projects_path(), "w") as f:
        json.dump({"projects": projects}, f, indent=2)

    print(json.dumps({"ok": True, "action": "projects.add", "path": path}))


def projects_remove(path: str):
    path = normalize_project_path(path)
    projects = load_projects()
    new_projects = [p for p in projects if normalize_project_path(p["path"]) != path]

    if len(new_projects) == len(projects):
        print(json.dumps({"ok": False, "error": f"Project not found: {path}"}))
        sys.exit(1)

    with open(get_projects_path(), "w") as f:
        json.dump({"projects": new_projects}, f, indent=2)

    print(json.dumps({"ok": True, "action": "projects.remove", "path": path}))


def projects_list():
    projects = load_projects()

    # Enrich with daemon status per project
    enriched = []
    for p in projects:
        path = normalize_project_path(p["path"])
        status = check_daemon_status(path)
        enriched.append({
            **p,
            "path": path,
            "daemon_running": status["running"],
        })

    print(json.dumps({
        "ok": True,
        "action": "projects.list",
        "count": len(enriched),
        "projects": enriched,
    }, indent=2))


def main():
    if len(sys.argv) < 2:
        print(json.dumps({
            "ok": True,
            "usage": {
                "search": "python main.py search <project_path> <query> [limit] [threshold]",
                "index": "python main.py index <project_path> [--watch]",
                "projects add": "python main.py projects add <path>",
                "projects remove": "python main.py projects remove <path>",
                "projects list": "python main.py projects list",
            }
        }, indent=2))
        return

    command = sys.argv[1]

    if command == "index":
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
