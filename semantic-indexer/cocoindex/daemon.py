#!/usr/bin/env python3
"""
Daemon management for CocoIndex semantic indexer.
Pure Python - no Node.js wrapper needed.
"""

import os
import sys
import json
import signal
import subprocess
from pathlib import Path
from datetime import datetime, timezone
import shutil
import time

PLUGIN_ROOT = Path(__file__).resolve().parent.parent
LEGACY_INDEXER_DIR = PLUGIN_ROOT / "scripts" / ".semantic-indexer"
GLOBAL_INDEXER_DIR = Path.home() / ".semantic-indexer"


def get_indexer_dir() -> Path:
    configured = os.environ.get("SEMANTIC_INDEXER_HOME")
    if configured:
        return Path(configured).expanduser().resolve()
    return GLOBAL_INDEXER_DIR.resolve()


def migrate_legacy_state(indexer_dir: Path):
    if not LEGACY_INDEXER_DIR.exists() or LEGACY_INDEXER_DIR.resolve() == indexer_dir:
        return

    for name in ("credentials.json", "projects.json", "config.json", "daemon.pid", "daemon.log"):
        src = LEGACY_INDEXER_DIR / name
        dst = indexer_dir / name
        if src.exists() and not dst.exists():
            shutil.copy2(src, dst)


def ensure_dir() -> Path:
    indexer_dir = get_indexer_dir()
    indexer_dir.mkdir(parents=True, exist_ok=True)
    migrate_legacy_state(indexer_dir)
    return indexer_dir


def get_pid_path() -> Path:
    return ensure_dir() / "daemon.pid"


def get_log_path() -> Path:
    return ensure_dir() / "daemon.log"


def get_projects_path() -> Path:
    return ensure_dir() / "projects.json"


def get_fallback_interval_seconds() -> int:
    raw = os.environ.get("SEMANTIC_INDEXER_WATCH_FALLBACK_SECONDS", "60")
    try:
        return max(0, int(raw))
    except ValueError:
        return 60


def log(message: str):
    """Append to log file."""
    log_path = get_log_path()
    timestamp = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    line = json.dumps({"timestamp": timestamp, "message": message})
    with open(log_path, "a") as f:
        f.write(line + "\n")
    print(line)


def is_running(pid: int) -> bool:
    """Check if process is running."""
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
            return f"\"{pid}\"" in output or f",{pid}," in output
        except Exception:
            # Fall back to os.kill probe below.
            pass

    try:
        os.kill(pid, 0)
        return True
    except PermissionError:
        return True
    except (OSError, ProcessLookupError):
        return False


def get_pid() -> int | None:
    """Get daemon PID if running."""
    pid_path = get_pid_path()
    if not pid_path.exists():
        return None
    try:
        pid = int(pid_path.read_text().strip())
        return pid if is_running(pid) else None
    except (ValueError, FileNotFoundError):
        return None


def save_pid(pid: int):
    get_pid_path().write_text(str(pid))


def remove_pid():
    pid_path = get_pid_path()
    if pid_path.exists():
        pid_path.unlink()


def load_projects() -> list[dict]:
    projects_path = get_projects_path()
    if not projects_path.exists():
        return []
    with open(projects_path) as f:
        data = json.load(f)
        return data.get("projects", [])


def cmd_start():
    """Start the daemon."""
    existing = get_pid()
    if existing:
        print(json.dumps({
            "ok": False,
            "error": {"message": f"Daemon already running with PID {existing}"}
        }))
        sys.exit(1)

    projects = load_projects()
    if not projects:
        print(json.dumps({
            "ok": False,
            "error": {"message": "No projects configured. Add with: node projects.js add <path>"}
        }))
        sys.exit(1)

    ensure_dir()

    # Spawn detached process running the watcher
    log_file = open(get_log_path(), "a")

    # Use cocoindex CLI directly for live updates
    project_root = projects[0]["path"]

    # Start as detached subprocess
    if sys.platform == "win32":
        # Windows: use CREATE_NEW_PROCESS_GROUP and DETACHED_PROCESS
        DETACHED_PROCESS = 0x00000008
        CREATE_NEW_PROCESS_GROUP = 0x00000200

        process = subprocess.Popen(
            [sys.executable, __file__, "_run", project_root],
            stdout=log_file,
            stderr=log_file,
            stdin=subprocess.DEVNULL,
            creationflags=DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP,
            start_new_session=True,
        )
    else:
        # Unix: use start_new_session
        process = subprocess.Popen(
            [sys.executable, __file__, "_run", project_root],
            stdout=log_file,
            stderr=log_file,
            stdin=subprocess.DEVNULL,
            start_new_session=True,
        )

    save_pid(process.pid)

    print(json.dumps({
        "ok": True,
        "action": "daemon.start",
        "pid": process.pid,
        "logPath": str(get_log_path()),
    }))


def cmd_stop():
    """Stop the daemon."""
    pid = get_pid()
    if not pid:
        print(json.dumps({"ok": True, "action": "daemon.stop", "message": "Daemon not running"}))
        return

    try:
        if sys.platform == "win32":
            # Windows: use taskkill
            subprocess.run(["taskkill", "/F", "/PID", str(pid)], capture_output=True)
        else:
            # Unix: send SIGTERM
            os.kill(pid, signal.SIGTERM)

            # Wait for exit
            import time
            for _ in range(50):
                if not is_running(pid):
                    break
                time.sleep(0.1)

            # Force kill if still running
            if is_running(pid):
                os.kill(pid, signal.SIGKILL)

        remove_pid()
        print(json.dumps({"ok": True, "action": "daemon.stop", "pid": pid, "message": "Daemon stopped"}))
    except ProcessLookupError:
        remove_pid()
        print(json.dumps({"ok": True, "action": "daemon.stop", "message": "Daemon not running"}))


def cmd_status():
    """Show daemon status."""
    pid = get_pid()
    pid_path = get_pid_path()
    log_path = get_log_path()
    result = {
        "ok": True,
        "action": "daemon.status",
        "running": pid is not None,
        "pid": pid,
        "pidPath": str(pid_path),
        "logPath": str(log_path),
    }

    if log_path.exists():
        stats = log_path.stat()
        result["logSize"] = stats.st_size
        result["logModified"] = datetime.fromtimestamp(stats.st_mtime).isoformat() + "Z"

    print(json.dumps(result))


def cmd_logs(tail: int = 50, follow: bool = False):
    """Show daemon logs."""
    log_path = get_log_path()
    if not log_path.exists():
        print(json.dumps({"ok": True, "action": "daemon.logs", "message": "No logs yet"}))
        return

    if follow:
        # Stream logs (like tail -f)
        import subprocess
        if sys.platform == "win32":
            # Windows: use PowerShell Get-Content -Wait
            subprocess.run(["powershell", "-Command", f"Get-Content '{log_path}' -Tail {tail} -Wait"])
        else:
            subprocess.run(["tail", "-f", "-n", str(tail), str(log_path)])
    else:
        # Read last N lines
        content = log_path.read_text(encoding="utf-8", errors="replace")
        lines = content.strip().split("\n")
        for line in lines[-tail:]:
            # Handle Unicode on Windows console
            try:
                print(line)
            except UnicodeEncodeError:
                print(line.encode('ascii', 'replace').decode('ascii'))


def cmd_run(project_root: str):
    """Internal: run the actual watcher (called by start)."""
    # Add parent dir to path for imports
    sys.path.insert(0, str(Path(__file__).parent))

    try:
        import cocoindex
        from main import codebase_index_flow, get_db_url, load_gemini_api_key
    except ImportError as e:
        log(f"Missing required packages: {e}")
        log("Install with: pip install cocoindex psycopg2-binary")
        sys.exit(1)

    log(f"Daemon starting for project: {project_root}")

    # Set environment
    os.environ["SEMANTIC_INDEXER_PROJECT_ROOT"] = project_root
    os.environ["COCOINDEX_DATABASE_URL"] = get_db_url()
    os.environ["GEMINI_API_KEY"] = load_gemini_api_key()

    # Initialize CocoIndex
    cocoindex.init(
        cocoindex.Settings(
            database=cocoindex.DatabaseConnectionSpec(url=get_db_url())
        )
    )

    # Setup flow
    log("Setting up CocoIndex flow")
    codebase_index_flow.setup()

    # Handle signals
    running = True

    def handle_shutdown(signum, frame):
        nonlocal running
        log(f"Received signal {signum}, shutting down")
        running = False

    signal.signal(signal.SIGTERM, handle_shutdown)
    signal.signal(signal.SIGINT, handle_shutdown)

    log(f"Starting live updater for: {project_root}")
    fallback_interval = get_fallback_interval_seconds()
    last_update = time.monotonic()
    if fallback_interval > 0:
        log(f"Watch fallback enabled: periodic reindex every {fallback_interval}s when idle")
    else:
        log("Watch fallback disabled (SEMANTIC_INDEXER_WATCH_FALLBACK_SECONDS <= 0)")

    # Use FlowLiveUpdater with context manager for proper cleanup
    with cocoindex.FlowLiveUpdater(
        codebase_index_flow,
        cocoindex.FlowLiveUpdaterOptions(print_stats=True)
    ) as updater:
        log("Live updater started, watching for changes")

        # Keep checking for updates
        while running:
            try:
                updates = updater.next_status_updates()
                if updates.updated_sources:
                    for source in updates.updated_sources:
                        log(f"Updated source: {source}")
                    last_update = time.monotonic()
                if not updates.active_sources:
                    # No more active sources, wait a bit and check again
                    time.sleep(1)

                if fallback_interval > 0 and (time.monotonic() - last_update) >= fallback_interval:
                    log("No watcher updates detected, triggering fallback one-shot index")
                    try:
                        result = subprocess.run(
                            [sys.executable, str(Path(__file__).parent / "main.py"), "index", project_root],
                            capture_output=True,
                            text=True,
                            timeout=1800,
                            check=False,
                        )
                        if result.returncode == 0:
                            log("Fallback index completed successfully")
                        else:
                            stderr = (result.stderr or "").strip()
                            stdout = (result.stdout or "").strip()
                            snippet = stderr[:500] or stdout[:500] or "No output"
                            log(f"Fallback index failed (exit {result.returncode}): {snippet}")
                    except Exception as e:
                        log(f"Fallback index exception: {e}")
                    last_update = time.monotonic()
            except Exception as e:
                log(f"Error in update loop: {e}")
                time.sleep(5)

    log("Daemon stopped")


def main():
    if len(sys.argv) < 2:
        print(json.dumps({
            "ok": True,
            "commands": {
                "start": "Start the daemon",
                "stop": "Stop the daemon",
                "status": "Show daemon status",
                "logs": "Show logs (--tail N, --follow/-f)",
            }
        }))
        return

    cmd = sys.argv[1]

    if cmd == "start":
        cmd_start()
    elif cmd == "stop":
        cmd_stop()
    elif cmd == "status":
        cmd_status()
    elif cmd == "logs":
        tail = 50
        follow = False
        for i, arg in enumerate(sys.argv[2:], 2):
            if arg == "--tail" and i + 1 < len(sys.argv):
                tail = int(sys.argv[i + 1])
            elif arg in ("--follow", "-f"):
                follow = True
        cmd_logs(tail, follow)
    elif cmd == "_run":
        # Internal command - run the watcher
        if len(sys.argv) < 3:
            print("Usage: daemon.py _run <project_root>")
            sys.exit(1)
        cmd_run(sys.argv[2])
    else:
        print(json.dumps({"ok": False, "error": f"Unknown command: {cmd}"}))
        sys.exit(1)


if __name__ == "__main__":
    main()
