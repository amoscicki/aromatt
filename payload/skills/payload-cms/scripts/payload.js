#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { parseArgs, printJson, fail, requireFlags, parseJsonInput } = require('./lib/utils');
const { PID_FILE, callServer, checkHealth } = require('./lib/api');

const SERVER_SCRIPT = path.join(__dirname, 'server.ts');

async function startServer(flags) {
  const health = await checkHealth();
  if (health) {
    return printJson({ ok: true, message: 'Server already running', ...health });
  }

  const serverArgs = [SERVER_SCRIPT];
  if (flags.port) serverArgs.push('--port', String(flags.port));
  if (flags.timeout) serverArgs.push('--timeout', String(flags.timeout));
  if (flags['idle-timeout']) serverArgs.push('--idle-timeout', String(flags['idle-timeout']));
  if (flags['test-db-url']) serverArgs.push('--test-db-url', String(flags['test-db-url']));
  if (flags['test-db-port']) serverArgs.push('--test-db-port', String(flags['test-db-port']));

  const isWin = process.platform === 'win32';
  const spawnEnv = { ...process.env, USE_LOCAL_DB: 'true' };

  const child = isWin
    ? spawn(process.env.ComSpec || 'cmd.exe',
        ['/c', 'pnpm', 'tsx', ...serverArgs],
        { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: spawnEnv })
    : spawn('pnpm', ['tsx', ...serverArgs],
        { cwd: process.cwd(), detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: spawnEnv });

  if (!isWin) child.unref();

  const port = Number(flags.port) || 8100;
  const maxWait = 60000;
  const pollInterval = 1000;
  let waited = 0;
  let stderrOutput = '';

  child.stderr.on('data', (chunk) => {
    stderrOutput += chunk.toString();
  });

  while (waited < maxWait) {
    await new Promise(r => setTimeout(r, pollInterval));
    waited += pollInterval;

    const h = await checkHealth();
    if (h) {
      child.stderr.removeAllListeners('data');
      child.stderr.destroy();
      return printJson({
        ok: true,
        message: 'Server started',
        pid: child.pid,
        port,
        collections: h.collections,
        testDb: h.testDb,
      });
    }
  }

  const err = new Error(`Server failed to start within ${maxWait / 1000}s. Stderr: ${stderrOutput.slice(-500)}`);
  err.code = 'START_TIMEOUT';
  throw err;
}

async function stopServer(_flags) {
  const health = await checkHealth();
  if (!health) {
    return printJson({ ok: true, message: 'Server is not running' });
  }

  const result = await callServer('POST', '/shutdown');
  try { fs.unlinkSync(PID_FILE); } catch { /* ignore */ }
  printJson({ ok: true, message: 'Server stopped', ...result });
}

async function serverStatus(_flags) {
  const health = await checkHealth();
  if (!health) {
    return printJson({ ok: false, message: 'Server is not running' });
  }
  printJson({ ok: true, ...health });
}

async function listCollections(_flags) {
  const result = await callServer('GET', '/collections');
  printJson(result);
}

async function getSchema(flags, collectionSlug) {
  if (!collectionSlug) {
    const err = new Error('Missing collection slug. Usage: payload schema <collection>');
    err.code = 'MISSING_ARG';
    throw err;
  }
  const result = await callServer('GET', `/schema/${collectionSlug}`);
  printJson(result);
}

function buildQueryBody(collection, operation, flags) {
  const body = { collection, operation, db: flags.db || 'dev' };

  if (flags.where) body.where = JSON.parse(flags.where);
  if (flags.sort) body.sort = flags.sort;
  if (flags.limit !== undefined) body.limit = Number(flags.limit);
  if (flags.page !== undefined) body.page = Number(flags.page);
  if (flags.depth !== undefined) body.depth = Number(flags.depth);
  if (flags.select) body.select = JSON.parse(flags.select);
  if (flags.id) body.id = flags.id;

  return body;
}

async function findDocs(flags, collection) {
  if (!collection) throw Object.assign(new Error('Missing collection'), { code: 'MISSING_ARG' });
  const timeout = flags.timeout ? Number(flags.timeout) : undefined;
  const result = await callServer('POST', '/query', buildQueryBody(collection, 'find', flags), timeout);
  printJson(result);
}

async function findById(flags, collection) {
  if (!collection) throw Object.assign(new Error('Missing collection'), { code: 'MISSING_ARG' });
  requireFlags(flags, 'id');
  const timeout = flags.timeout ? Number(flags.timeout) : undefined;
  const result = await callServer('POST', '/query', buildQueryBody(collection, 'findById', flags), timeout);
  printJson(result);
}

async function countDocs(flags, collection) {
  if (!collection) throw Object.assign(new Error('Missing collection'), { code: 'MISSING_ARG' });
  const timeout = flags.timeout ? Number(flags.timeout) : undefined;
  const result = await callServer('POST', '/query', buildQueryBody(collection, 'count', flags), timeout);
  printJson(result);
}

async function createDoc(flags, collection) {
  if (!collection) throw Object.assign(new Error('Missing collection'), { code: 'MISSING_ARG' });
  const data = await parseJsonInput(flags);
  const body = {
    collection,
    operation: 'create',
    db: flags.db || 'dev',
    data,
  };
  if (flags.depth !== undefined) body.depth = Number(flags.depth);
  if (flags.select) body.select = JSON.parse(flags.select);
  const timeout = flags.timeout ? Number(flags.timeout) : undefined;
  const result = await callServer('POST', '/mutate', body, timeout);
  printJson(result);
}

async function updateDoc(flags, collection) {
  if (!collection) throw Object.assign(new Error('Missing collection'), { code: 'MISSING_ARG' });
  requireFlags(flags, 'id');
  const data = await parseJsonInput(flags);
  const body = {
    collection,
    operation: 'update',
    db: flags.db || 'dev',
    id: flags.id,
    data,
  };
  if (flags.depth !== undefined) body.depth = Number(flags.depth);
  if (flags.select) body.select = JSON.parse(flags.select);
  const timeout = flags.timeout ? Number(flags.timeout) : undefined;
  const result = await callServer('POST', '/mutate', body, timeout);
  printJson(result);
}

async function deleteDoc(flags, collection) {
  if (!collection) throw Object.assign(new Error('Missing collection'), { code: 'MISSING_ARG' });
  requireFlags(flags, 'id');
  const body = {
    collection,
    operation: 'delete',
    db: flags.db || 'dev',
    id: flags.id,
  };
  const timeout = flags.timeout ? Number(flags.timeout) : undefined;
  const result = await callServer('POST', '/mutate', body, timeout);
  printJson(result);
}

const COMMANDS = {
  'start':            startServer,
  'stop':             stopServer,
  'status':           serverStatus,
  'collections list': listCollections,
};

const COLLECTION_COMMANDS = {
  'schema':    getSchema,
  'find':      findDocs,
  'find-by-id': findById,
  'count':     countDocs,
  'create':    createDoc,
  'update':    updateDoc,
  'delete':    deleteDoc,
};

function printHelp() {
  const usage = {
    'Server lifecycle': {
      'start [flags]': 'Start persistent Payload server',
      'stop': 'Graceful shutdown',
      'status': 'Check if server is running',
    },
    'Data operations (require running server)': {
      'collections list': 'List all collection slugs + field count',
      'schema <collection>': 'Full field definitions',
      'find <collection> [flags]': 'Find documents',
      'find-by-id <collection> --id <id> [flags]': 'Get document by ID',
      'count <collection> [flags]': 'Count documents',
      'create <collection> --data <json> [flags]': 'Create document',
      'update <collection> --id <id> --data <json> [flags]': 'Update document',
      'delete <collection> --id <id>': 'Delete document',
    },
    'Common flags': {
      '--db dev|test': 'Database to use (default: dev)',
      '--where \'{"field":{"equals":"value"}}\'': 'Filter',
      '--sort -createdAt': 'Sort order',
      '--limit 10': 'Limit results',
      '--page 1': 'Page number',
      '--depth 1': 'Population depth',
      '--select \'{"name":true}\'': 'Field selection',
      '--timeout 60000': 'Per-request timeout (ms)',
    },
    'Start flags': {
      '--port 8100': 'HTTP port',
      '--idle-timeout 1800000': 'Idle shutdown timeout (ms)',
      '--test-db-url <url>': 'Test DB connection string',
      '--test-db-port <port>': 'Test DB port (default: 7357)',
    },
  };
  printJson({ ok: true, usage });
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));

  if (positional.length === 0 || ['help', '--help', '-h'].includes(positional[0])) {
    return printHelp();
  }

  const cmd2 = positional.slice(0, 2).join(' ');
  if (COMMANDS[cmd2]) {
    return await COMMANDS[cmd2](flags);
  }

  const cmd1 = positional[0];
  if (COMMANDS[cmd1]) {
    return await COMMANDS[cmd1](flags);
  }

  if (COLLECTION_COMMANDS[cmd1]) {
    const collection = positional[1];
    return await COLLECTION_COMMANDS[cmd1](flags, collection);
  }

  const err = new Error(`Unknown command: ${positional.join(' ')}. Run with 'help' for usage.`);
  err.code = 'UNKNOWN_COMMAND';
  throw err;
}

main().catch(fail);
