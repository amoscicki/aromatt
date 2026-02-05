'use strict';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const https = require('https');
const {printJson, ensureDir, readJson, writeJson} = require('./utils');

const INDEXER_DIR = path.join(__dirname, '..', '.semantic-indexer');
const CREDENTIALS_PATH = path.join(INDEXER_DIR, 'credentials.json');

function loadCredentials() {
  // First try credentials file
  if (fs.existsSync(CREDENTIALS_PATH)) {
    const data = readJson(CREDENTIALS_PATH);
    if (data.gemini_api_key) {
      return {apiKey: data.gemini_api_key};
    }
  }

  // Fallback to environment variable
  const envKey = process.env.GEMINI_API_KEY;
  if (envKey) {
    return {apiKey: envKey};
  }

  const err = new Error(
    `Missing Gemini API key.

Set credentials from a JSON file:
  node setup.js auth set --file /path/to/credentials.json

Or use clipboard:
  node setup.js auth paste-win --overwrite  (Windows)
  node setup.js auth paste-macos --overwrite  (macOS)

Or set directly:
  node setup.js auth set-key --key "your-api-key"

Or set GEMINI_API_KEY environment variable.`
  );
  err.code = 'MISSING_CREDENTIALS';
  throw err;
}

async function setCredentials(flags) {
  const overwrite = Boolean(flags.overwrite);

  if (fs.existsSync(CREDENTIALS_PATH) && !overwrite) {
    const err = new Error(
      `Credentials already exist at ${CREDENTIALS_PATH}. Re-run with --overwrite to replace.`
    );
    err.code = 'CREDENTIALS_ALREADY_EXIST';
    throw err;
  }

  let raw = typeof flags._raw === 'string' ? flags._raw : '';
  if (!raw) {
    const file = String(flags.file || '').trim();
    if (file) {
      raw = fs.readFileSync(path.resolve(file), 'utf8');
    } else {
      if (process.stdin.isTTY) {
        const err = new Error('No --file provided and stdin is empty.');
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
  }

  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    const err = new Error('Invalid JSON input.');
    err.code = 'INVALID_JSON';
    throw err;
  }

  // Support both { "gemini_api_key": "..." } and { "GEMINI_API_KEY": "..." }
  const apiKey = json.gemini_api_key || json.GEMINI_API_KEY || json.api_key || json.apiKey;
  if (!apiKey) {
    const err = new Error('Invalid credentials JSON. Expected { "gemini_api_key": "..." }');
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  ensureDir(INDEXER_DIR);
  writeJson(CREDENTIALS_PATH, {gemini_api_key: apiKey});
  printJson({ok: true, action: 'auth.set', path: CREDENTIALS_PATH});
}

async function setCredentialsFromClipboard(flags) {
  const overwrite = Boolean(flags.overwrite);

  if (process.platform !== 'win32' && process.platform !== 'darwin') {
    const err = new Error('Clipboard mode is only supported on Windows and macOS.');
    err.code = 'UNSUPPORTED_PLATFORM';
    throw err;
  }

  const cmd =
    process.platform === 'win32'
      ? {
          exe: 'powershell.exe',
          args: [
            '-NoProfile',
            '-Command',
            [
              "$ErrorActionPreference='Stop';",
              'try { $t = Get-Clipboard -Raw; if ($t) { $t; exit 0 } } catch {}',
              'try { $files = Get-Clipboard -Format FileDropList; if ($files -and $files.Count -gt 0) { Get-Content -Raw -LiteralPath $files[0]; exit 0 } } catch {}',
              'exit 2',
            ].join(' '),
          ],
        }
      : {exe: 'pbpaste', args: []};

  const out = childProcess.spawnSync(cmd.exe, cmd.args, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });

  if (out.error) throw out.error;
  if (out.status !== 0) {
    const err = new Error(`Failed to read clipboard via ${cmd.exe}.`);
    err.code = 'CLIPBOARD_READ_FAILED';
    throw err;
  }

  const jsonText = String(out.stdout || '').trim();
  if (!jsonText) {
    const err = new Error('Clipboard is empty or does not contain JSON text.');
    err.code = 'EMPTY_CLIPBOARD';
    throw err;
  }

  await setCredentials({overwrite, _raw: jsonText});
}

async function pasteWin(flags) {
  if (process.platform !== 'win32') {
    const err = new Error('paste-win is only supported on Windows.');
    err.code = 'UNSUPPORTED_PLATFORM';
    throw err;
  }
  return setCredentialsFromClipboard(flags);
}

async function pasteMacos(flags) {
  if (process.platform !== 'darwin') {
    const err = new Error('paste-macos is only supported on macOS.');
    err.code = 'UNSUPPORTED_PLATFORM';
    throw err;
  }
  return setCredentialsFromClipboard(flags);
}

async function setApiKeyDirect(flags) {
  const overwrite = Boolean(flags.overwrite);
  const key = String(flags.key || '').trim();

  if (!key) {
    const err = new Error('Missing --key <api-key>');
    err.code = 'MISSING_KEY';
    throw err;
  }

  if (fs.existsSync(CREDENTIALS_PATH) && !overwrite) {
    const err = new Error(
      `Credentials already exist at ${CREDENTIALS_PATH}. Re-run with --overwrite to replace.`
    );
    err.code = 'CREDENTIALS_ALREADY_EXIST';
    throw err;
  }

  ensureDir(INDEXER_DIR);
  writeJson(CREDENTIALS_PATH, {gemini_api_key: key});
  printJson({ok: true, action: 'auth.set-key', path: CREDENTIALS_PATH});
}

async function checkStatus() {
  try {
    const {apiKey} = loadCredentials();

    // Test API key by making a simple request
    const valid = await testApiKey(apiKey);

    printJson({
      ok: true,
      action: 'auth.status',
      credentialsPath: fs.existsSync(CREDENTIALS_PATH) ? CREDENTIALS_PATH : null,
      envVar: !!process.env.GEMINI_API_KEY,
      keyPrefix: apiKey.slice(0, 8) + '...',
      valid,
    });
  } catch (err) {
    if (err.code === 'MISSING_CREDENTIALS') {
      printJson({
        ok: true,
        action: 'auth.status',
        credentialsPath: null,
        envVar: false,
        valid: false,
        message: 'No credentials configured',
      });
    } else {
      throw err;
    }
  }
}

function testApiKey(apiKey) {
  return new Promise((resolve) => {
    const url = new URL('https://generativelanguage.googleapis.com/v1beta/models');
    url.searchParams.set('key', apiKey);

    const req = https.request(url, {method: 'GET'}, (res) => {
      resolve(res.statusCode === 200);
    });

    req.on('error', () => resolve(false));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

module.exports = {
  loadCredentials,
  setCredentials,
  setCredentialsFromClipboard,
  pasteWin,
  pasteMacos,
  setApiKeyDirect,
  checkStatus,
  INDEXER_DIR,
  CREDENTIALS_PATH,
};
