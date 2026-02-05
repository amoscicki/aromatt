#!/usr/bin/env node
'use strict';

const {execSync} = require('child_process');
const path = require('path');
const fs = require('fs');
const {parseArgs, printJson, fail, ensureDir, writeJson, readJson} = require('./lib/utils');
const {
  setCredentials,
  pasteWin,
  pasteMacos,
  setApiKeyDirect,
  checkStatus,
  INDEXER_DIR,
} = require('./lib/auth');
const {checkHealth, getConfig, CONFIG_PATH} = require('./lib/db');

const DOCKER_DIR = path.join(__dirname, '..', 'docker');
const COCOINDEX_DIR = path.join(__dirname, '..', 'cocoindex');

function findPython() {
  const candidates = ['python3', 'python', 'py'];
  for (const cmd of candidates) {
    try {
      execSync(`${cmd} --version`, {stdio: 'ignore'});
      return cmd;
    } catch {}
  }
  return null;
}

const COMMANDS = {
  'docker-up': async () => {
    execSync('docker compose up -d', {cwd: DOCKER_DIR, stdio: 'inherit'});
    printJson({ok: true, action: 'docker-up', message: 'pgvector container started'});
  },

  'docker-down': async () => {
    execSync('docker compose down', {cwd: DOCKER_DIR, stdio: 'inherit'});
    printJson({ok: true, action: 'docker-down', message: 'pgvector container stopped'});
  },

  'docker-status': async () => {
    try {
      const result = execSync('docker compose ps --format json', {
        cwd: DOCKER_DIR,
        encoding: 'utf8',
      });
      const containers = result.trim() ? JSON.parse(result) : [];
      printJson({ok: true, action: 'docker-status', containers: Array.isArray(containers) ? containers : [containers]});
    } catch {
      printJson({ok: true, action: 'docker-status', containers: [], running: false});
    }
  },

  'docker-logs': async (flags) => {
    const tail = flags.tail || '50';
    execSync(`docker compose logs --tail ${tail}`, {cwd: DOCKER_DIR, stdio: 'inherit'});
  },

  'auth': async (flags, subcommand) => {
    switch (subcommand) {
      case 'set':
        await setCredentials(flags);
        break;
      case 'paste-win':
        await pasteWin(flags);
        break;
      case 'paste-macos':
        await pasteMacos(flags);
        break;
      case 'set-key':
        await setApiKeyDirect(flags);
        break;
      case 'status':
        await checkStatus();
        break;
      default:
        printJson({
          ok: true,
          usage: {
            'auth set': 'node setup.js auth set --file /path/to/credentials.json',
            'auth paste-win': 'node setup.js auth paste-win [--overwrite]',
            'auth paste-macos': 'node setup.js auth paste-macos [--overwrite]',
            'auth set-key': 'node setup.js auth set-key --key "your-api-key"',
            'auth status': 'node setup.js auth status',
          },
        });
    }
  },

  'config': async (flags, subcommand) => {
    switch (subcommand) {
      case 'set': {
        const config = {};
        if (flags.host) config.host = flags.host;
        if (flags.port) config.port = parseInt(flags.port, 10);
        if (flags.db) config.database = flags.db;
        if (flags.user) config.user = flags.user;
        if (flags.password) config.password = flags.password;

        ensureDir(INDEXER_DIR);
        writeJson(CONFIG_PATH, config);
        printJson({ok: true, action: 'config.set', path: CONFIG_PATH, config});
        break;
      }
      case 'show': {
        const config = getConfig();
        printJson({ok: true, action: 'config.show', config});
        break;
      }
      case 'reset': {
        if (fs.existsSync(CONFIG_PATH)) {
          fs.unlinkSync(CONFIG_PATH);
        }
        printJson({ok: true, action: 'config.reset', message: 'Config reset to defaults'});
        break;
      }
      default:
        printJson({
          ok: true,
          usage: {
            'config set': 'node setup.js config set --host localhost --port 5433 --db codebase_index',
            'config show': 'node setup.js config show',
            'config reset': 'node setup.js config reset',
          },
        });
    }
  },

  'check-env': async () => {
    const checks = {
      GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
      DOCKER_RUNNING: false,
      DB_AVAILABLE: false,
      CREDENTIALS_FILE: fs.existsSync(path.join(INDEXER_DIR, 'credentials.json')),
      PYTHON_AVAILABLE: !!findPython(),
      COCOINDEX_INSTALLED: false,
    };

    try {
      execSync('docker info', {stdio: 'ignore'});
      checks.DOCKER_RUNNING = true;
    } catch {}

    try {
      checks.DB_AVAILABLE = await checkHealth();
    } catch {}

    // Check if CocoIndex is installed
    const python = findPython();
    if (python) {
      try {
        execSync(`${python} -c "import cocoindex"`, {stdio: 'ignore'});
        checks.COCOINDEX_INSTALLED = true;
      } catch {}
    }

    printJson({ok: true, action: 'check-env', checks});
  },

  'install-python': async () => {
    const python = findPython();
    if (!python) {
      const err = new Error('Python not found. Install Python 3.8+ and add to PATH.');
      err.code = 'PYTHON_NOT_FOUND';
      throw err;
    }

    printJson({ok: true, action: 'install-python.starting', python});

    // Install CocoIndex and dependencies
    const requirementsPath = path.join(COCOINDEX_DIR, 'requirements.txt');
    execSync(`${python} -m pip install -r "${requirementsPath}"`, {
      stdio: 'inherit',
      cwd: COCOINDEX_DIR,
    });

    printJson({ok: true, action: 'install-python', message: 'CocoIndex dependencies installed'});
  },

  'help': async () => {
    printJson({
      ok: true,
      commands: {
        'docker-up': 'Start pgvector container',
        'docker-down': 'Stop pgvector container',
        'docker-status': 'Show container status',
        'docker-logs': 'Show container logs (--tail N)',
        'install-python': 'Install CocoIndex Python dependencies',
        'auth set': 'Set Gemini API key from JSON file',
        'auth paste-win': 'Set from Windows clipboard',
        'auth paste-macos': 'Set from macOS clipboard',
        'auth set-key': 'Set API key directly',
        'auth status': 'Check auth status',
        'config set': 'Set database config',
        'config show': 'Show current config',
        'config reset': 'Reset to defaults',
        'check-env': 'Check environment setup',
      },
    });
  },
};

async function main() {
  const {positional, flags} = parseArgs(process.argv.slice(2));
  const command = positional[0];
  const subcommand = positional[1];

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

  await handler(flags, subcommand);
}

main().catch(fail);
