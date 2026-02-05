#!/usr/bin/env node
'use strict';

/**
 * Internal watcher process - spawns CocoIndex Python daemon
 * This is a thin wrapper that delegates to the Python CocoIndex implementation
 */

const {spawn} = require('child_process');
const path = require('path');
const fs = require('fs');

const COCOINDEX_DIR = path.join(__dirname, '..', 'cocoindex');
const COCOINDEX_MAIN = path.join(COCOINDEX_DIR, 'main.py');

function log(level, message, data = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...data,
  };
  console.log(JSON.stringify(entry));
}

function findPython() {
  // Try common Python executable names
  const candidates = ['python3', 'python', 'py'];

  for (const cmd of candidates) {
    try {
      const {execSync} = require('child_process');
      execSync(`${cmd} --version`, {stdio: 'ignore'});
      return cmd;
    } catch {
      // Continue to next candidate
    }
  }

  return null;
}

async function main() {
  log('info', 'Starting CocoIndex watcher');

  // Check Python is available
  const python = findPython();
  if (!python) {
    log('error', 'Python not found. Install Python 3.8+ and add to PATH.');
    process.exit(1);
  }

  log('info', `Using Python: ${python}`);

  // Check CocoIndex requirements are installed
  const requirementsPath = path.join(COCOINDEX_DIR, 'requirements.txt');
  if (!fs.existsSync(requirementsPath)) {
    log('error', 'CocoIndex requirements.txt not found');
    process.exit(1);
  }

  // Spawn CocoIndex daemon
  const child = spawn(python, [COCOINDEX_MAIN, 'daemon'], {
    cwd: COCOINDEX_DIR,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1',
    },
  });

  child.on('error', (err) => {
    log('error', 'Failed to start CocoIndex', {error: err.message});
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    log('info', 'CocoIndex daemon exited', {code, signal});
    process.exit(code || 0);
  });

  // Forward signals
  process.on('SIGTERM', () => {
    child.kill('SIGTERM');
  });

  process.on('SIGINT', () => {
    child.kill('SIGINT');
  });

  process.on('SIGHUP', () => {
    child.kill('SIGHUP');
  });
}

main().catch((err) => {
  log('error', 'Watcher crashed', {error: err.message});
  process.exit(1);
});
