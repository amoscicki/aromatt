#!/usr/bin/env python3
"""
Daemon management for CocoIndex semantic indexer.
Supports multiple projects — spawns one watcher subprocess per project.
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

if sys.platform == "win32":
    CREATE_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
    DETACHED_PROCESS = getattr(subprocess, "DETACHED_PROCESS", 0x00000008)
    CREATE_NEW_PROCESS_GROUP = getattr(
        subprocess,
        "CREATE_NEW_PROCESS_GROUP",
        0x00000200,
    )


def _windows_hidden_process_kwargs(*, detached: bool = False) -> dict:
    if sys.platform != "win32":
        return {}

    startupinfo = subprocess.STARTUPINFO()
    startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    startupinfo.wShowWindow = 0

    creationflags = CREATE_NO_WINDOW
    if detached:
        creationflags |= DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP

    return {
        "creationflags": creationflags,
        "startupinfo": startupinfo,
    }


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


def get_pids_path() -> Path:
    return ensure_dir() / "daemon-pids.json"


def get_legacy_pid_path() -> Path:
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
    log_path = get_log_path()
    timestamp = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    line = json.dumps({"timestamp": timestamp, "message": message})
    with open(log_path, "a") as f:
        f.write(line + "\n")
    print(line)


def is_running(pid: int) -> bool:
    if pid <= 0:
        return False

    if sys.platform == "win32":
        try:
            result = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
                capture_output=True,
                text=True,
                check=False,
                **_windows_hidden_process_kwargs(),
            )
            output = (result.stdout or "") + (result.stderr or "")
            if "No tasks are running" in output:
                return False
            return f"\"{pid}\"" in output or f",{pid}," in output
        except Exception:
            pass

    try:
        os.kill(pid, 0)
        return True
    except PermissionError:
        return True
    except (OSError, ProcessLookupError):
        return False


def _project_key(path: str) -> str:
    """Normalize project path for use as dict key."""
    normalized = os.path.abspath(path)
    if sys.platform == "win32" and len(normalized) >= 2 and normalized[1] == ":":
        normalized = normalized[0].upper() + normalized[1:]
    return normalized


# --- Multi-PID management ---

def load_pids() -> dict[str, int]:
    """Load per-project PIDs from daemon-pids.json."""
    pids_path = get_pids_path()
    if not pids_path.exists():
        return {}
    try:
        with open(pids_path) as f:
            data = json.load(f)
            return data.get("pids", {})
    except (json.JSONDecodeError, ValueError):
        return {}


def save_pids(pids: dict[str, int]):
    with open(get_pids_path(), "w") as f:
        json.dump({"pids": pids}, f, indent=2)


def migrate_legacy_pid():
    """Migrate old single daemon.pid to new daemon-pids.json format."""
    legacy = get_legacy_pid_path()
    if not legacy.exists():
        return
    try:
        pid = int(legacy.read_text().strip())
        if is_running(pid):
            # Can't know which project this was — kill it so we start fresh
            _kill_pid(pid)
        legacy.unlink()
    except (ValueError, FileNotFoundError):
        if legacy.exists():
            legacy.unlink()


def _kill_pid(pid: int):
    try:
        if sys.platform == "win32":
            subprocess.run(
                ["taskkill", "/F", "/PID", str(pid)],
                capture_output=True,
                **_windows_hidden_process_kwargs(),
            )
        else:
            os.kill(pid, signal.SIGTERM)
            for _ in range(50):
                if not is_running(pid):
                    break
                time.sleep(0.1)
            if is_running(pid):
                os.kill(pid, signal.SIGKILL)
    except (ProcessLookupError, OSError):
        pass


def get_live_pids() -> dict[str, int]:
    """Return only PIDs that are actually running."""
    pids = load_pids()
    return {proj: pid for proj, pid in pids.items() if is_running(pid)}


def load_projects() -> list[dict]:
    projects_path = get_projects_path()
    if not projects_path.exists():
        return []
    with open(projects_path) as f:
        data = json.load(f)
        return data.get("projects", [])


# --- Commands ---

def cmd_start():
    """Start daemon watchers for ALL registered projects."""
    migrate_legacy_pid()

    projects = load_projects()
    if not projects:
        print(json.dumps({
            "ok": False,
            "error": {"message": "No projects configured. Add with: python main.py projects add <path>"}
        }))
        sys.exit(1)

    ensure_dir()
    existing_pids = get_live_pids()

    log_file = open(get_log_path(), "a")
    started = {}
    skipped = {}

    for project in projects:
        project_path = _project_key(project["path"])

        # Skip if already running
        if project_path in existing_pids:
            skipped[project_path] = existing_pids[project_path]
            continue

        # Spawn detached subprocess for this project
        if sys.platform == "win32":
            process = subprocess.Popen(
                [sys.executable, __file__, "_run", project_path],
                stdout=log_file,
                stderr=log_file,
                stdin=subprocess.DEVNULL,
                start_new_session=True,
                **_windows_hidden_process_kwargs(detached=True),
            )
        else:
            process = subprocess.Popen(
                [sys.executable, __file__, "_run", project_path],
                stdout=log_file,
                stderr=log_file,
                stdin=subprocess.DEVNULL,
                start_new_session=True,
            )

        started[project_path] = process.pid

    # Merge with existing live PIDs
    all_pids = {**existing_pids, **started}
    save_pids(all_pids)

    project_names = [Path(p).name for p in all_pids]
    print(json.dumps({
        "ok": True,
        "action": "daemon.start",
        "started": len(started),
        "already_running": len(skipped),
        "total_projects": len(all_pids),
        "projects": project_names,
        "pids": all_pids,
        "logPath": str(get_log_path()),
    }))


def cmd_stop():
    """Stop ALL daemon watchers."""
    migrate_legacy_pid()

    pids = load_pids()
    if not pids:
        print(json.dumps({"ok": True, "action": "daemon.stop", "message": "No daemons running"}))
        return

    stopped = []
    for project_path, pid in pids.items():
        if is_running(pid):
            _kill_pid(pid)
            stopped.append({"project": Path(project_path).name, "pid": pid})

    save_pids({})

    print(json.dumps({
        "ok": True,
        "action": "daemon.stop",
        "stopped": len(stopped),
        "details": stopped,
        "message": f"Stopped {len(stopped)} daemon(s)",
    }))


def cmd_status():
    """Show per-project daemon status."""
    migrate_legacy_pid()

    pids = load_pids()
    projects = load_projects()
    log_path = get_log_path()

    project_statuses = []
    for project in projects:
        project_path = _project_key(project["path"])
        pid = pids.get(project_path)
        running = pid is not None and is_running(pid)
        project_statuses.append({
            "project": Path(project_path).name,
            "path": project_path,
            "running": running,
            "pid": pid if running else None,
        })

    # Check for orphan PIDs (in pids.json but not in projects.json)
    project_paths = {_project_key(p["path"]) for p in projects}
    for project_path, pid in pids.items():
        if project_path not in project_paths:
            project_statuses.append({
                "project": Path(project_path).name,
                "path": project_path,
                "running": is_running(pid),
                "pid": pid,
                "orphan": True,
            })

    any_running = any(s["running"] for s in project_statuses)

    result = {
        "ok": True,
        "action": "daemon.status",
        "running": any_running,
        "project_count": len(projects),
        "projects": project_statuses,
        "logPath": str(log_path),
    }

    if log_path.exists():
        stats = log_path.stat()
        result["logSize"] = stats.st_size
        result["logModified"] = datetime.fromtimestamp(stats.st_mtime, tz=timezone.utc).isoformat().replace("+00:00", "Z")

    print(json.dumps(result))


def cmd_logs(tail: int = 50, follow: bool = False):
    log_path = get_log_path()
    if not log_path.exists():
        print(json.dumps({"ok": True, "action": "daemon.logs", "message": "No logs yet"}))
        return

    if follow:
        if sys.platform == "win32":
            subprocess.run(["powershell", "-Command", f"Get-Content '{log_path}' -Tail {tail} -Wait"])
        else:
            subprocess.run(["tail", "-f", "-n", str(tail), str(log_path)])
    else:
        content = log_path.read_text(encoding="utf-8", errors="replace")
        lines = content.strip().split("\n")
        for line in lines[-tail:]:
            try:
                print(line)
            except UnicodeEncodeError:
                print(line.encode('ascii', 'replace').decode('ascii'))


def cmd_run(project_root: str):
    """Internal: run the actual watcher for ONE project (called by start)."""
    sys.path.insert(0, str(Path(__file__).parent))

    project_name = Path(project_root).name

    try:
        import cocoindex
        from main import codebase_index_flow, get_db_url, load_gemini_api_key
    except ImportError as e:
        log(f"[{project_name}] Missing required packages: {e}")
        log(f"[{project_name}] Install with: pip install cocoindex psycopg2-binary")
        sys.exit(1)

    log(f"[{project_name}] Daemon starting for: {project_root}")

    os.environ["SEMANTIC_INDEXER_PROJECT_ROOT"] = project_root
    os.environ["COCOINDEX_DATABASE_URL"] = get_db_url()
    os.environ["GEMINI_API_KEY"] = load_gemini_api_key()

    cocoindex.init(
        cocoindex.Settings(
            database=cocoindex.DatabaseConnectionSpec(url=get_db_url())
        )
    )

    log(f"[{project_name}] Setting up CocoIndex flow")
    codebase_index_flow.setup()

    running = True

    def handle_shutdown(signum, frame):
        nonlocal running
        log(f"[{project_name}] Received signal {signum}, shutting down")
        running = False

    signal.signal(signal.SIGTERM, handle_shutdown)
    signal.signal(signal.SIGINT, handle_shutdown)

    log(f"[{project_name}] Starting live updater")
    fallback_interval = get_fallback_interval_seconds()
    last_update = time.monotonic()
    if fallback_interval > 0:
        log(f"[{project_name}] Watch fallback: periodic reindex every {fallback_interval}s when idle")

    with cocoindex.FlowLiveUpdater(
        codebase_index_flow,
        cocoindex.FlowLiveUpdaterOptions(print_stats=True)
    ) as updater:
        log(f"[{project_name}] Live updater started, watching for changes")

        while running:
            try:
                updates = updater.next_status_updates()
                if updates.updated_sources:
                    for source in updates.updated_sources:
                        log(f"[{project_name}] Updated source: {source}")
                    last_update = time.monotonic()
                if not updates.active_sources:
                    time.sleep(1)

                if fallback_interval > 0 and (time.monotonic() - last_update) >= fallback_interval:
                    log(f"[{project_name}] No watcher updates, triggering fallback reindex")
                    try:
                        result = subprocess.run(
                            [sys.executable, str(Path(__file__).parent / "main.py"), "index", project_root],
                            capture_output=True,
                            text=True,
                            timeout=1800,
                            check=False,
                            **_windows_hidden_process_kwargs(),
                        )
                        if result.returncode == 0:
                            log(f"[{project_name}] Fallback index completed")
                        else:
                            stderr = (result.stderr or "").strip()
                            stdout = (result.stdout or "").strip()
                            snippet = stderr[:500] or stdout[:500] or "No output"
                            log(f"[{project_name}] Fallback index failed (exit {result.returncode}): {snippet}")
                    except Exception as e:
                        log(f"[{project_name}] Fallback index exception: {e}")
                    last_update = time.monotonic()
            except Exception as e:
                log(f"[{project_name}] Error in update loop: {e}")
                time.sleep(5)

    log(f"[{project_name}] Daemon stopped")


def main():
    if len(sys.argv) < 2:
        print(json.dumps({
            "ok": True,
            "commands": {
                "start": "Start watchers for all registered projects",
                "stop": "Stop all watchers",
                "status": "Show per-project daemon status",
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
        if len(sys.argv) < 3:
            print("Usage: daemon.py _run <project_root>")
            sys.exit(1)
        cmd_run(sys.argv[2])
    else:
        print(json.dumps({"ok": False, "error": f"Unknown command: {cmd}"}))
        sys.exit(1)


if __name__ == "__main__":
    main()
