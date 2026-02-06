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
from datetime import datetime

INDEXER_DIR = Path(__file__).parent.parent / "scripts" / ".semantic-indexer"
PID_PATH = INDEXER_DIR / "daemon.pid"
LOG_PATH = INDEXER_DIR / "daemon.log"
PROJECTS_PATH = INDEXER_DIR / "projects.json"


def ensure_dir():
    INDEXER_DIR.mkdir(parents=True, exist_ok=True)


def log(message: str):
    """Append to log file."""
    ensure_dir()
    timestamp = datetime.utcnow().isoformat() + "Z"
    line = json.dumps({"timestamp": timestamp, "message": message})
    with open(LOG_PATH, "a") as f:
        f.write(line + "\n")
    print(line)


def is_running(pid: int) -> bool:
    """Check if process is running."""
    try:
        os.kill(pid, 0)
        return True
    except (OSError, ProcessLookupError):
        return False


def get_pid() -> int | None:
    """Get daemon PID if running."""
    if not PID_PATH.exists():
        return None
    try:
        pid = int(PID_PATH.read_text().strip())
        return pid if is_running(pid) else None
    except (ValueError, FileNotFoundError):
        return None


def save_pid(pid: int):
    ensure_dir()
    PID_PATH.write_text(str(pid))


def remove_pid():
    if PID_PATH.exists():
        PID_PATH.unlink()


def load_projects() -> list[dict]:
    if not PROJECTS_PATH.exists():
        return []
    with open(PROJECTS_PATH) as f:
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
    log_file = open(LOG_PATH, "a")

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
        "logPath": str(LOG_PATH),
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
    result = {
        "ok": True,
        "action": "daemon.status",
        "running": pid is not None,
        "pid": pid,
        "pidPath": str(PID_PATH),
        "logPath": str(LOG_PATH),
    }

    if LOG_PATH.exists():
        stats = LOG_PATH.stat()
        result["logSize"] = stats.st_size
        result["logModified"] = datetime.fromtimestamp(stats.st_mtime).isoformat() + "Z"

    print(json.dumps(result))


def cmd_logs(tail: int = 50, follow: bool = False):
    """Show daemon logs."""
    if not LOG_PATH.exists():
        print(json.dumps({"ok": True, "action": "daemon.logs", "message": "No logs yet"}))
        return

    if follow:
        # Stream logs (like tail -f)
        import subprocess
        if sys.platform == "win32":
            # Windows: use PowerShell Get-Content -Wait
            subprocess.run(["powershell", "-Command", f"Get-Content '{LOG_PATH}' -Tail {tail} -Wait"])
        else:
            subprocess.run(["tail", "-f", "-n", str(tail), str(LOG_PATH)])
    else:
        # Read last N lines
        content = LOG_PATH.read_text(encoding="utf-8", errors="replace")
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
                if not updates.active_sources:
                    # No more active sources, wait a bit and check again
                    import time
                    time.sleep(1)
            except Exception as e:
                log(f"Error in update loop: {e}")
                import time
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
