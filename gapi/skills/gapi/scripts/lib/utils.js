'use strict';

const fs = require('fs');
const path = require('path');

function printJson(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

function toErrorJson(err) {
  const status = err?.response?.status;
  const data = err?.response?.data;
  return {
    ok: false,
    status: status ?? null,
    error: {
      message: err?.message || String(err),
      name: err?.name,
      code: err?.code,
      details: data ?? null,
    },
  };
}

function fail(err, exitCode = 1) {
  printJson(toErrorJson(err));
  process.exit(exitCode);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, {recursive: true});
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, obj) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      positional.push(a);
      continue;
    }

    const eqIdx = a.indexOf('=');
    const key = a.slice(2, eqIdx === -1 ? undefined : eqIdx);
    let value;

    if (eqIdx !== -1) {
      value = a.slice(eqIdx + 1);
    } else {
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        value = next;
        i++;
      } else {
        value = true;
      }
    }

    flags[key] = value;
  }

  return {positional, flags};
}

function requireFlags(flags, ...names) {
  for (const name of names) {
    const val = String(flags[name] || '').trim();
    if (!val) {
      const err = new Error(`Missing --${name}`);
      err.code = 'MISSING_ARG';
      throw err;
    }
  }
}

async function parseJsonInput(flags) {
  let raw = String(flags.data || '').trim();
  if (!raw) {
    if (process.stdin.isTTY) {
      const err = new Error('Missing --data <json> or pipe JSON to stdin');
      err.code = 'MISSING_INPUT';
      throw err;
    }
    raw = await new Promise((resolve, reject) => {
      let data = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', chunk => { data += chunk; });
      process.stdin.on('end', () => resolve(data));
      process.stdin.on('error', reject);
    });
  }
  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error('Invalid JSON input');
    err.code = 'INVALID_JSON';
    throw err;
  }
}

module.exports = {
  printJson,
  toErrorJson,
  fail,
  ensureDir,
  readJson,
  writeJson,
  parseArgs,
  requireFlags,
  parseJsonInput,
};
