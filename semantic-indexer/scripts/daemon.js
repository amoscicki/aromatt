#!/usr/bin/env node
'use strict';

/**
 * Daemon management - start/stop/status/logs
 * Spawns watcher-main.js as a detached background process
 */

const {spawn} = require('child_process');
const fs = require('fs');
const path = require('path');
const {parseArgs, printJson, fail, ensureDir, readJson} = require('./lib/utils');
const {INDEXER_DIR} = require('./lib/auth');

const PID_PATH = path.join(INDEXER_DIR, 'daemon.pid');
const LOG_PATH = path.join(INDEXER_DIR, 'daemon.log');
const WATCHER_SCRIPT = path.join(__dirname, 'watcher-main.js');

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function getPid() {
  if (!fs.existsSync(PID_PATH)) {
    return null;
  }
  const pid = parseInt(fs.readFileSync(PID_PATH, 'utf8').trim(), 10);
  if (isNaN(pid)) {
    return null;
  }
  return isRunning(pid) ? pid : null;
}

function savePid(pid) {
  ensureDir(INDEXER_DIR);
  fs.writeFileSync(PID_PATH, String(pid), 'utf8');
}

function removePid() {
  if (fs.existsSync(PID_PATH)) {
    fs.unlinkSync(PID_PATH);
  }
}

const COMMANDS = {
  start: async () => {
    const existingPid = getPid();
    if (existingPid) {
      printJson({
        ok: false,
        error: {message: `Daemon already running with PID ${existingPid}`},
      });
      process.exit(1);
    }

    ensureDir(INDEXER_DIR);

    // Open log file for writing
    const logFd = fs.openSync(LOG_PATH, 'a');

    // Spawn detached process
    const child = spawn(process.execPath, [WATCHER_SCRIPT], {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      cwd: __dirname,
    });

    child.unref();
    fs.closeSync(logFd);

    savePid(child.pid);

    printJson({
      ok: true,
      action: 'daemon.start',
      pid: child.pid,
      logPath: LOG_PATH,
    });
  },

  stop: async () => {
    const pid = getPid();
    if (!pid) {
      printJson({ok: true, action: 'daemon.stop', message: 'Daemon not running'});
      return;
    }

    try {
      // Send SIGTERM for graceful shutdown
      process.kill(pid, 'SIGTERM');

      // Wait for process to exit (up to 5 seconds)
      let attempts = 50;
      while (isRunning(pid) && attempts > 0) {
        await new Promise((r) => setTimeout(r, 100));
        attempts--;
      }

      if (isRunning(pid)) {
        // Force kill if still running
        process.kill(pid, 'SIGKILL');
      }

      removePid();
      printJson({ok: true, action: 'daemon.stop', pid, message: 'Daemon stopped'});
    } catch (err) {
      if (err.code === 'ESRCH') {
        // Process doesn't exist
        removePid();
        printJson({ok: true, action: 'daemon.stop', message: 'Daemon not running'});
      } else {
        throw err;
      }
    }
  },

  status: async () => {
    const pid = getPid();
    const running = !!pid;

    const result = {
      ok: true,
      action: 'daemon.status',
      running,
      pid: pid || null,
      pidPath: PID_PATH,
      logPath: LOG_PATH,
    };

    // Get log file stats
    if (fs.existsSync(LOG_PATH)) {
      const stats = fs.statSync(LOG_PATH);
      result.logSize = stats.size;
      result.logModified = stats.mtime.toISOString();
    }

    printJson(result);
  },

  logs: async (flags) => {
    if (!fs.existsSync(LOG_PATH)) {
      printJson({ok: true, action: 'daemon.logs', message: 'No logs yet'});
      return;
    }

    const tail = parseInt(flags.tail || '50', 10);
    const follow = Boolean(flags.follow || flags.f);

    if (follow) {
      // Stream logs
      const child = spawn('tail', ['-f', '-n', String(tail), LOG_PATH], {
        stdio: 'inherit',
      });

      process.on('SIGINT', () => {
        child.kill();
        process.exit(0);
      });

      await new Promise((resolve) => {
        child.on('exit', resolve);
      });
    } else {
      // Read last N lines
      const content = fs.readFileSync(LOG_PATH, 'utf8');
      const lines = content.trim().split('\n');
      const lastLines = lines.slice(-tail);

      for (const line of lastLines) {
        console.log(line);
      }
    }
  },

  reload: async () => {
    const pid = getPid();
    if (!pid) {
      printJson({
        ok: false,
        error: {message: 'Daemon not running'},
      });
      process.exit(1);
    }

    try {
      process.kill(pid, 'SIGHUP');
      printJson({ok: true, action: 'daemon.reload', pid, message: 'Reload signal sent'});
    } catch (err) {
      throw err;
    }
  },

  help: async () => {
    printJson({
      ok: true,
      commands: {
        start: 'Start the daemon (detached background process)',
        stop: 'Stop the daemon',
        status: 'Show daemon status',
        logs: 'Show daemon logs (--tail N, --follow/-f)',
        reload: 'Reload project configuration',
      },
    });
  },
};

async function main() {
  const {positional, flags} = parseArgs(process.argv.slice(2));
  const command = positional[0];

  if (!command || command === 'help' || flags.help) {
    await COMMANDS.help();
    return;
  }

  const handler = COMMANDS[command];
  if (!handler) {
    const err = new Error(`Unknown command: ${command}`);
    err.code = 'UNKNOWN_COMMAND';
    throw err;
  }

  await handler(flags);
}

main().catch(fail);
