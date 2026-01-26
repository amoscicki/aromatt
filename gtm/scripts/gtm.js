#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const childProcess = require('child_process');
const openPkg = require('open');
const {google} = require('googleapis');

const open = typeof openPkg === 'function' ? openPkg : openPkg?.default;

// Store credentials/tokens alongside the script (plugin-local, not project-local)
const SCRIPT_DIR = __dirname;
const GTM_DIR = path.join(SCRIPT_DIR, '.gtm');
const CREDENTIALS_PATH = path.join(GTM_DIR, 'credentials.json');
const TOKEN_PATH = path.join(GTM_DIR, 'token.json');
const TEMPLATES_DIR = path.join(SCRIPT_DIR, 'templates');

const PROJECT_ROOT = process.cwd();

const SELF_PATH = process.argv[1];
const SELF_REL = path.relative(PROJECT_ROOT, SELF_PATH);
const SELF_CMD = `node ${SELF_REL && !SELF_REL.startsWith('..') ? SELF_REL : SELF_PATH}`;

const SCOPE_PRESETS = {
  readonly: ['https://www.googleapis.com/auth/tagmanager.readonly'],
  edit: ['https://www.googleapis.com/auth/tagmanager.edit.containers'],
  publish: [
    'https://www.googleapis.com/auth/tagmanager.edit.containers',
    'https://www.googleapis.com/auth/tagmanager.publish',
  ],
};

const DEFAULT_SCOPES = SCOPE_PRESETS.edit;

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

function loadTemplate(name, vars = {}) {
  const templatePath = path.join(TEMPLATES_DIR, `${name}.html`);
  let html = fs.readFileSync(templatePath, 'utf8');
  for (const [k, v] of Object.entries(vars)) {
    html = html.replaceAll(`__${k}__`, String(v));
  }
  return html;
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

function loadCredentials() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    const err = new Error(
      `Missing OAuth credentials at ${CREDENTIALS_PATH}.

Set credentials from a downloaded Google OAuth Desktop App JSON:
  ${SELF_CMD} auth credentials set --file /path/to/credentials.json

Or copy JSON to clipboard and run:
  # Windows PowerShell
  Get-Clipboard | ${SELF_CMD} auth credentials set --overwrite

  # Windows shortcut
  ${SELF_CMD} auth credentials paste-win --overwrite

  # macOS
  pbpaste | ${SELF_CMD} auth credentials set --overwrite

  # macOS shortcut
  ${SELF_CMD} auth credentials paste-macos --overwrite`
    );
    err.code = 'MISSING_CREDENTIALS';
    throw err;
  }

  const raw = readJson(CREDENTIALS_PATH);
  const block = raw.installed || raw.web;
  if (!block || !block.client_id || !block.client_secret) {
    const err = new Error(`Invalid credentials file format at ${CREDENTIALS_PATH}.`);
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  return {
    clientId: block.client_id,
    clientSecret: block.client_secret,
    redirectUris: Array.isArray(block.redirect_uris) ? block.redirect_uris : [],
  };
}

async function authSetCredentials(flags) {
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
      raw = fs.readFileSync(path.resolve(PROJECT_ROOT, file), 'utf8');
    } else {
      if (process.stdin.isTTY) {
        const err = new Error('No --file provided and stdin is empty.');
        err.code = 'MISSING_INPUT';
        throw err;
      }
      raw = await new Promise((resolve, reject) => {
        let data = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', chunk => {
          data += chunk;
        });
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

  // Validate structure.
  const block = json.installed || json.web;
  if (!block || !block.client_id || !block.client_secret) {
    const err = new Error(
      'Invalid credentials JSON. Expected {installed:{client_id, client_secret, redirect_uris}} or {web:{...}}.'
    );
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  ensureDir(GTM_DIR);
  writeJson(CREDENTIALS_PATH, json);

  printJson({ok: true, action: 'auth.credentials.set', path: CREDENTIALS_PATH});
}

async function authSetCredentialsFromClipboard(flags) {
  const overwrite = Boolean(flags.overwrite);

  if (process.platform !== 'win32' && process.platform !== 'darwin') {
    const err = new Error(
      'Clipboard mode is only supported on Windows (PowerShell Get-Clipboard) and macOS (pbpaste).'
    );
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
              // Prefer raw text (works if user copied JSON content).
              'try { $t = Get-Clipboard -Raw; if ($t) { $t; exit 0 } } catch {}',
              // If user copied a file in Explorer, read the first file's contents.
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
    err.details = {stderr: out.stderr};
    throw err;
  }

  const jsonText = String(out.stdout || '').trim();
  if (!jsonText) {
    const err = new Error(
      `Clipboard is empty or does not contain JSON text.

Tip:
- copy the JSON file contents, or
- use: ${SELF_CMD} auth credentials set --file /path/to/credentials.json

Windows-only:
- you can also copy the JSON file in Explorer (FileDropList) and rerun this command.`
    );
    err.code = 'EMPTY_CLIPBOARD';
    throw err;
  }

  await authSetCredentials({overwrite, file: '' , _raw: jsonText});
}

async function authSetCredentialsFromPasteWin(flags) {
  if (process.platform !== 'win32') {
    const err = new Error('paste-win is only supported on Windows.');
    err.code = 'UNSUPPORTED_PLATFORM';
    throw err;
  }
  return authSetCredentialsFromClipboard(flags);
}

async function authSetCredentialsFromPasteMacos(flags) {
  if (process.platform !== 'darwin') {
    const err = new Error('paste-macos is only supported on macOS.');
    err.code = 'UNSUPPORTED_PLATFORM';
    throw err;
  }
  return authSetCredentialsFromClipboard(flags);
}

function createAuthedClientFromToken() {
  if (!fs.existsSync(TOKEN_PATH)) {
    const err = new Error(`Not authenticated. Run: ${SELF_CMD} auth login`);
    err.code = 'NOT_AUTHENTICATED';
    throw err;
  }

  const {clientId, clientSecret} = loadCredentials();
  const stored = readJson(TOKEN_PATH);
  const tokens = stored.tokens || stored;

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials(tokens);
  return oauth2Client;
}

async function authLogin(flags) {
  const scopesPreset = String(flags.preset || flags.scopesPreset || '').trim();
  const scopes = String(flags.scopes || '').trim()
    ? String(flags.scopes)
        .split(/[\s,]+/)
        .filter(Boolean)
    : SCOPE_PRESETS[scopesPreset] || DEFAULT_SCOPES;

  ensureDir(GTM_DIR);
  const {clientId, clientSecret, redirectUris} = loadCredentials();

  // Prefer the first redirect URI from the credentials file if provided.
  // For Desktop apps, this is often `http://localhost`.
  const preferredRedirect = (redirectUris[0] || 'http://localhost').trim();
  const preferredUrl = new URL(preferredRedirect);
  const callbackPath = preferredUrl.pathname && preferredUrl.pathname !== '/' ? preferredUrl.pathname : '/';

  let resolveAuth;
  let rejectAuth;
  const authPromise = new Promise((resolve, reject) => {
    resolveAuth = resolve;
    rejectAuth = reject;
  });

  let oauth2Client;
  let handled = false;
  const sockets = new Set();

  function shutdownServer() {
    for (const s of sockets) {
      try {
        s.destroy();
      } catch {
        // ignore
      }
    }
    sockets.clear();
    try {
      server.close();
    } catch {
      // ignore
    }
  }

  const server = http.createServer(async (req, res) => {
    try {
      res.setHeader('connection', 'close');

      if (handled) {
        res.statusCode = 200;
        res.setHeader('content-type', 'text/plain; charset=utf-8');
        res.end('OK');
        return;
      }

      if (!req.url) {
        res.statusCode = 400;
        res.setHeader('content-type', 'text/plain; charset=utf-8');
        res.end('Bad request');
        return;
      }

      const requestUrl = new URL(req.url, `http://${preferredUrl.hostname}`);

      const expectedPath = callbackPath;
      const pathOk =
        expectedPath === '/'
          ? requestUrl.pathname === '/' || requestUrl.pathname === ''
          : requestUrl.pathname === expectedPath;

      if (!pathOk) {
        res.statusCode = 404;
        res.setHeader('content-type', 'text/plain; charset=utf-8');
        res.end('Not found');
        return;
      }

      const code = requestUrl.searchParams.get('code');
      if (!code) {
        res.statusCode = 400;
        res.setHeader('content-type', 'text/plain; charset=utf-8');
        res.end('Missing code');
        return;
      }

      handled = true;

      res.statusCode = 200;
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(loadTemplate('oauth-success', {VERIFY_COMMAND: `${SELF_CMD} accounts list`}));

      const {tokens} = await oauth2Client.getToken(code);

      // Preserve existing refresh_token if Google doesn't return it.
      let finalTokens = tokens;
      if (!tokens.refresh_token && fs.existsSync(TOKEN_PATH)) {
        const existing = readJson(TOKEN_PATH);
        const existingTokens = existing.tokens || existing;
        if (existingTokens.refresh_token) {
          finalTokens = {...tokens, refresh_token: existingTokens.refresh_token};
        }
      }

      writeJson(TOKEN_PATH, {
        scopes,
        tokens: finalTokens,
        updatedAt: new Date().toISOString(),
      });

      shutdownServer();
      resolveAuth(true);
    } catch (e) {
      try {
        res.statusCode = 500;
        res.setHeader('content-type', 'text/plain; charset=utf-8');
        res.end('Authentication failed. Check terminal.');
      } catch {
        // ignore
      }
      shutdownServer();
      rejectAuth(e);
    }
  });

  server.on('connection', socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  const fixedPort = preferredUrl.port ? Number(preferredUrl.port) : null;
  await new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(fixedPort || 0, preferredUrl.hostname, resolve);
  });
  server.unref();

  const port = server.address().port;
  const redirectUri = `${preferredUrl.protocol}//${preferredUrl.hostname}:${port}${callbackPath === '/' ? '' : callbackPath}`;
  oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const authorizeUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes,
  });

  // Fire-and-forget: do not await, some environments can hang.
  open(authorizeUrl, {wait: false})
    .then(cp => {
      if (cp) {
        if (typeof cp.unref === 'function') cp.unref();
      }
    })
    .catch(() => {
      // Ignore browser-launch errors; user can open the URL manually.
    });

  const timeoutSecRaw = flags.timeoutSec ?? flags.timeout ?? '';
  const timeoutSec = timeoutSecRaw === '' ? 120 : Number(timeoutSecRaw);
  const deadlineMs = Number.isFinite(timeoutSec) && timeoutSec > 0 ? timeoutSec * 1000 : 120000;

  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      shutdownServer();
      const err = new Error('OAuth login timed out.');
      err.code = 'OAUTH_TIMEOUT';
      reject(err);
    }, deadlineMs);
  });

  try {
    await Promise.race([authPromise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }

  printJson({ok: true, action: 'auth.login', scopes});
}

async function accountsList() {
  const auth = createAuthedClientFromToken();
  const tagmanager = google.tagmanager({version: 'v2', auth});
  const res = await tagmanager.accounts.list({});
  printJson({ok: true, data: res.data});
}

async function containersList(flags) {
  const accountId = String(flags.accountId || '').trim();
  if (!accountId) {
    const err = new Error('Missing --accountId');
    err.code = 'MISSING_ARG';
    throw err;
  }
  const auth = createAuthedClientFromToken();
  const tagmanager = google.tagmanager({version: 'v2', auth});
  const res = await tagmanager.accounts.containers.list({
    parent: `accounts/${accountId}`,
  });
  printJson({ok: true, data: res.data});
}

async function workspacesList(flags) {
  const accountId = String(flags.accountId || '').trim();
  const containerId = String(flags.containerId || '').trim();
  if (!accountId) {
    const err = new Error('Missing --accountId');
    err.code = 'MISSING_ARG';
    throw err;
  }
  if (!containerId) {
    const err = new Error('Missing --containerId');
    err.code = 'MISSING_ARG';
    throw err;
  }
  const auth = createAuthedClientFromToken();
  const tagmanager = google.tagmanager({version: 'v2', auth});
  const res = await tagmanager.accounts.containers.workspaces.list({
    parent: `accounts/${accountId}/containers/${containerId}`,
  });
  printJson({ok: true, data: res.data});
}

async function tagsList(flags) {
  const accountId = String(flags.accountId || '').trim();
  const containerId = String(flags.containerId || '').trim();
  const workspaceId = String(flags.workspaceId || '').trim();
  if (!accountId) {
    const err = new Error('Missing --accountId');
    err.code = 'MISSING_ARG';
    throw err;
  }
  if (!containerId) {
    const err = new Error('Missing --containerId');
    err.code = 'MISSING_ARG';
    throw err;
  }
  if (!workspaceId) {
    const err = new Error('Missing --workspaceId');
    err.code = 'MISSING_ARG';
    throw err;
  }
  const auth = createAuthedClientFromToken();
  const tagmanager = google.tagmanager({version: 'v2', auth});
  const res = await tagmanager.accounts.containers.workspaces.tags.list({
    parent: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}`,
  });
  printJson({ok: true, data: res.data});
}

async function foldersList(flags) {
  const accountId = String(flags.accountId || '').trim();
  const containerId = String(flags.containerId || '').trim();
  const workspaceId = String(flags.workspaceId || '').trim();
  if (!accountId) {
    const err = new Error('Missing --accountId');
    err.code = 'MISSING_ARG';
    throw err;
  }
  if (!containerId) {
    const err = new Error('Missing --containerId');
    err.code = 'MISSING_ARG';
    throw err;
  }
  if (!workspaceId) {
    const err = new Error('Missing --workspaceId');
    err.code = 'MISSING_ARG';
    throw err;
  }
  const auth = createAuthedClientFromToken();
  const tagmanager = google.tagmanager({version: 'v2', auth});
  const res = await tagmanager.accounts.containers.workspaces.folders.list({
    parent: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}`,
  });
  printJson({ok: true, data: res.data});
}

async function templatesList(flags) {
  const accountId = String(flags.accountId || '').trim();
  const containerId = String(flags.containerId || '').trim();
  const workspaceId = String(flags.workspaceId || '').trim();
  if (!accountId) {
    const err = new Error('Missing --accountId');
    err.code = 'MISSING_ARG';
    throw err;
  }
  if (!containerId) {
    const err = new Error('Missing --containerId');
    err.code = 'MISSING_ARG';
    throw err;
  }
  if (!workspaceId) {
    const err = new Error('Missing --workspaceId');
    err.code = 'MISSING_ARG';
    throw err;
  }
  const auth = createAuthedClientFromToken();
  const tagmanager = google.tagmanager({version: 'v2', auth});
  const res = await tagmanager.accounts.containers.workspaces.templates.list({
    parent: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}`,
  });
  printJson({ok: true, data: res.data});
}

async function zonesList(flags) {
  const accountId = String(flags.accountId || '').trim();
  const containerId = String(flags.containerId || '').trim();
  const workspaceId = String(flags.workspaceId || '').trim();
  if (!accountId) {
    const err = new Error('Missing --accountId');
    err.code = 'MISSING_ARG';
    throw err;
  }
  if (!containerId) {
    const err = new Error('Missing --containerId');
    err.code = 'MISSING_ARG';
    throw err;
  }
  if (!workspaceId) {
    const err = new Error('Missing --workspaceId');
    err.code = 'MISSING_ARG';
    throw err;
  }
  const auth = createAuthedClientFromToken();
  const tagmanager = google.tagmanager({version: 'v2', auth});
  const res = await tagmanager.accounts.containers.workspaces.zones.list({
    parent: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}`,
  });
  printJson({ok: true, data: res.data});
}

async function environmentsList(flags) {
  const accountId = String(flags.accountId || '').trim();
  const containerId = String(flags.containerId || '').trim();
  if (!accountId) {
    const err = new Error('Missing --accountId');
    err.code = 'MISSING_ARG';
    throw err;
  }
  if (!containerId) {
    const err = new Error('Missing --containerId');
    err.code = 'MISSING_ARG';
    throw err;
  }
  const auth = createAuthedClientFromToken();
  const tagmanager = google.tagmanager({version: 'v2', auth});
  const res = await tagmanager.accounts.containers.environments.list({
    parent: `accounts/${accountId}/containers/${containerId}`,
  });
  printJson({ok: true, data: res.data});
}

async function versionsList(flags) {
  const accountId = String(flags.accountId || '').trim();
  const containerId = String(flags.containerId || '').trim();
  if (!accountId) {
    const err = new Error('Missing --accountId');
    err.code = 'MISSING_ARG';
    throw err;
  }
  if (!containerId) {
    const err = new Error('Missing --containerId');
    err.code = 'MISSING_ARG';
    throw err;
  }
  const auth = createAuthedClientFromToken();
  const tagmanager = google.tagmanager({version: 'v2', auth});
  // The Tag Manager API exposes list on version_headers, not versions.
  const res = await tagmanager.accounts.containers.version_headers.list({
    parent: `accounts/${accountId}/containers/${containerId}`,
  });
  printJson({ok: true, data: res.data});
}

async function triggersList(flags) {
  const accountId = String(flags.accountId || '').trim();
  const containerId = String(flags.containerId || '').trim();
  const workspaceId = String(flags.workspaceId || '').trim();
  if (!accountId) {
    const err = new Error('Missing --accountId');
    err.code = 'MISSING_ARG';
    throw err;
  }
  if (!containerId) {
    const err = new Error('Missing --containerId');
    err.code = 'MISSING_ARG';
    throw err;
  }
  if (!workspaceId) {
    const err = new Error('Missing --workspaceId');
    err.code = 'MISSING_ARG';
    throw err;
  }
  const auth = createAuthedClientFromToken();
  const tagmanager = google.tagmanager({version: 'v2', auth});
  const res = await tagmanager.accounts.containers.workspaces.triggers.list({
    parent: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}`,
  });
  printJson({ok: true, data: res.data});
}

async function variablesList(flags) {
  const accountId = String(flags.accountId || '').trim();
  const containerId = String(flags.containerId || '').trim();
  const workspaceId = String(flags.workspaceId || '').trim();
  if (!accountId) {
    const err = new Error('Missing --accountId');
    err.code = 'MISSING_ARG';
    throw err;
  }
  if (!containerId) {
    const err = new Error('Missing --containerId');
    err.code = 'MISSING_ARG';
    throw err;
  }
  if (!workspaceId) {
    const err = new Error('Missing --workspaceId');
    err.code = 'MISSING_ARG';
    throw err;
  }
  const auth = createAuthedClientFromToken();
  const tagmanager = google.tagmanager({version: 'v2', auth});
  const res = await tagmanager.accounts.containers.workspaces.variables.list({
    parent: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}`,
  });
  printJson({ok: true, data: res.data});
}

async function clientsList(flags) {
  const accountId = String(flags.accountId || '').trim();
  const containerId = String(flags.containerId || '').trim();
  const workspaceId = String(flags.workspaceId || '').trim();
  if (!accountId) {
    const err = new Error('Missing --accountId');
    err.code = 'MISSING_ARG';
    throw err;
  }
  if (!containerId) {
    const err = new Error('Missing --containerId');
    err.code = 'MISSING_ARG';
    throw err;
  }
  if (!workspaceId) {
    const err = new Error('Missing --workspaceId');
    err.code = 'MISSING_ARG';
    throw err;
  }
  const auth = createAuthedClientFromToken();
  const tagmanager = google.tagmanager({version: 'v2', auth});
  const res = await tagmanager.accounts.containers.workspaces.clients.list({
    parent: `accounts/${accountId}/containers/${containerId}/workspaces/${workspaceId}`,
  });
  printJson({ok: true, data: res.data});
}

function printHelp() {
  printJson({
    ok: true,
    usage: {
      login:
        `${SELF_CMD} auth login [--preset readonly|edit|publish] [--scopes <space-or-comma-list>] [--timeoutSec 120]`,
      setCredentials:
        `${SELF_CMD} auth credentials set --file <path> [--overwrite]  (or pipe JSON to stdin)`,
      setCredentialsClipboard:
        `${SELF_CMD} auth credentials set-clipboard [--overwrite]  (Windows/macOS)`,
      pasteWin:
        `${SELF_CMD} auth credentials paste-win [--overwrite]  (Windows)`,
      pasteMacos:
        `${SELF_CMD} auth credentials paste-macos [--overwrite]  (macOS)`,
      accounts: 'node tools/gtm.js accounts list',
      containers: 'node tools/gtm.js containers list --accountId <id>',
      workspaces:
        'node tools/gtm.js workspaces list --accountId <id> --containerId <id>',
      tags:
        'node tools/gtm.js tags list --accountId <id> --containerId <id> --workspaceId <id>',
      triggers:
        'node tools/gtm.js triggers list --accountId <id> --containerId <id> --workspaceId <id>',
      variables:
        'node tools/gtm.js variables list --accountId <id> --containerId <id> --workspaceId <id>',
      clients:
        'node tools/gtm.js clients list --accountId <id> --containerId <id> --workspaceId <id>',
      folders:
        'node tools/gtm.js folders list --accountId <id> --containerId <id> --workspaceId <id>',
      templates:
        'node tools/gtm.js templates list --accountId <id> --containerId <id> --workspaceId <id>',
      zones:
        'node tools/gtm.js zones list --accountId <id> --containerId <id> --workspaceId <id>',
      environments:
        'node tools/gtm.js environments list --accountId <id> --containerId <id>',
      versions:
        'node tools/gtm.js versions list --accountId <id> --containerId <id>',
    },
  });
}

async function main() {
  const {positional, flags} = parseArgs(process.argv.slice(2));
  const cmd1 = positional[0] || 'help';
  const cmd2 = positional[1] || '';
  const cmd3 = positional[2] || '';

  if (cmd1 === 'help' || cmd1 === '--help' || cmd1 === '-h') {
    printHelp();
    return;
  }

  if (cmd1 === 'auth' && cmd2 === 'login') {
    await authLogin(flags);
    return;
  }

  if (cmd1 === 'auth' && cmd2 === 'credentials' && cmd3 === 'set') {
    await authSetCredentials(flags);
    return;
  }

  if (cmd1 === 'auth' && cmd2 === 'credentials' && cmd3 === 'set-clipboard') {
    await authSetCredentialsFromClipboard(flags);
    return;
  }

  if (cmd1 === 'auth' && cmd2 === 'credentials' && cmd3 === 'paste-win') {
    await authSetCredentialsFromPasteWin(flags);
    return;
  }

  if (cmd1 === 'auth' && cmd2 === 'credentials' && cmd3 === 'paste-macos') {
    await authSetCredentialsFromPasteMacos(flags);
    return;
  }

  if (cmd1 === 'accounts' && cmd2 === 'list') {
    await accountsList();
    return;
  }

  if (cmd1 === 'containers' && cmd2 === 'list') {
    await containersList(flags);
    return;
  }

  if (cmd1 === 'workspaces' && cmd2 === 'list') {
    await workspacesList(flags);
    return;
  }

  if (cmd1 === 'tags' && cmd2 === 'list') {
    await tagsList(flags);
    return;
  }

  if (cmd1 === 'triggers' && cmd2 === 'list') {
    await triggersList(flags);
    return;
  }

  if (cmd1 === 'variables' && cmd2 === 'list') {
    await variablesList(flags);
    return;
  }

  if (cmd1 === 'clients' && cmd2 === 'list') {
    await clientsList(flags);
    return;
  }

  if (cmd1 === 'folders' && cmd2 === 'list') {
    await foldersList(flags);
    return;
  }

  if (cmd1 === 'templates' && cmd2 === 'list') {
    await templatesList(flags);
    return;
  }

  if (cmd1 === 'zones' && cmd2 === 'list') {
    await zonesList(flags);
    return;
  }

  if (cmd1 === 'environments' && cmd2 === 'list') {
    await environmentsList(flags);
    return;
  }

  if (cmd1 === 'versions' && cmd2 === 'list') {
    await versionsList(flags);
    return;
  }

  const err = new Error(`Unknown command: ${positional.join(' ') || '(empty)'}`);
  err.code = 'UNKNOWN_COMMAND';
  throw err;
}

main().catch(fail);
