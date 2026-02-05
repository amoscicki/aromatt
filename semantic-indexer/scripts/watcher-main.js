#!/usr/bin/env node
'use strict';

/**
 * Internal watcher process - spawned by daemon.js
 * Uses CocoIndex Python for indexing with live updates
 */

const {spawn} = require('child_process');
const fs = require('fs');
const path = require('path');
const {readJson, ensureDir} = require('./lib/utils');
const {INDEXER_DIR} = require('./lib/auth');

const PROJECTS_PATH = path.join(INDEXER_DIR, 'projects.json');
const LOG_PATH = path.join(INDEXER_DIR, 'daemon.log');
const COCOINDEX_SCRIPT = path.join(__dirname, '..', 'cocoindex', 'main.py');

function log(level, message, data = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...data,
  };
  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
  } else {
    console.log(line);
  }
}

function loadProjects() {
  if (!fs.existsSync(PROJECTS_PATH)) {
    return [];
  }
  const data = readJson(PROJECTS_PATH);
  return data.projects || [];
}

function findPython() {
  // Try common Python commands
  const commands = ['python', 'python3', 'py'];
  for (const cmd of commands) {
    try {
      const result = require('child_process').execSync(`${cmd} --version`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      if (result.includes('Python 3')) {
        return cmd;
      }
    } catch {
      // Continue to next
    }
  }
  return 'python';
}

async function main() {
  ensureDir(INDEXER_DIR);

  log('info', 'Watcher starting (CocoIndex)');

  const projects = loadProjects();
  if (projects.length === 0) {
    log('error', 'No projects configured. Add projects with: node projects.js add <path>');
    process.exit(1);
  }

  // Use first project (CocoIndex handles one project per flow)
  const project = projects[0];
  const projectRoot = project.path;

  log('info', 'Starting CocoIndex watcher', {project: projectRoot});

  const pythonCmd = findPython();
  log('info', 'Using Python', {command: pythonCmd});

  // Spawn CocoIndex with --watch mode
  const child = spawn(pythonCmd, [COCOINDEX_SCRIPT, 'index', projectRoot, '--watch'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {...process.env},
  });

  // Forward stdout
  child.stdout.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    for (const line of lines) {
      if (line.trim()) {
        // Try to parse as JSON, otherwise log as info
        try {
          const parsed = JSON.parse(line);
          log(parsed.level || 'info', parsed.message || line, parsed);
        } catch {
          console.log(line);
        }
      }
    }
  });

  // Forward stderr
  child.stderr.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    for (const line of lines) {
      if (line.trim()) {
        // Skip CocoIndex progress bars and info logs
        if (line.includes('INFO') || line.includes('✅') || line.includes('▕')) {
          console.log(line);
        } else {
          log('error', line);
        }
      }
    }
  });

  child.on('error', (err) => {
    log('error', 'Failed to start CocoIndex', {error: err.message});
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      log('info', 'CocoIndex terminated by signal', {signal});
    } else if (code !== 0) {
      log('error', 'CocoIndex exited with error', {code});
    } else {
      log('info', 'CocoIndex exited normally');
    }
    process.exit(code || 0);
  });

  // Handle signals
  process.on('SIGTERM', () => {
    log('info', 'Received SIGTERM, stopping CocoIndex');
    child.kill('SIGTERM');
  });

  process.on('SIGINT', () => {
    log('info', 'Received SIGINT, stopping CocoIndex');
    child.kill('SIGINT');
  });

  // SIGHUP for reload (Unix only)
  if (process.platform !== 'win32') {
    process.on('SIGHUP', () => {
      log('info', 'Received SIGHUP, reloading');
      // For now, just log - full reload would require restarting with new project
    });
  }

  log('info', 'Watcher ready', {projectCount: 1, project: projectRoot});
}

main().catch((err) => {
  log('error', 'Watcher crashed', {error: err.message, stack: err.stack});
  process.exit(1);
});
