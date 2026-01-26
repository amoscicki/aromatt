'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const childProcess = require('child_process');
const {google} = require('googleapis');
const openPkg = require('open');

const {printJson, ensureDir, readJson, writeJson} = require('./utils');

const open = typeof openPkg === 'function' ? openPkg : openPkg?.default;

function createAuthModule(config) {
  const {GAPIS_DIR, CREDENTIALS_PATH, TOKEN_PATH, TEMPLATES_DIR, SELF_CMD, PROJECT_ROOT, SCOPE_PRESETS, DEFAULT_SCOPES} = config;

  function loadTemplate(name, vars = {}) {
    const templatePath = path.join(TEMPLATES_DIR, `${name}.html`);
    let html = fs.readFileSync(templatePath, 'utf8');
    for (const [k, v] of Object.entries(vars)) {
      html = html.replaceAll(`__${k}__`, String(v));
    }
    return html;
  }

  function loadCredentials() {
    if (!fs.existsSync(CREDENTIALS_PATH)) {
      const err = new Error(
        `Missing OAuth credentials at ${CREDENTIALS_PATH}.

Set credentials from a downloaded Google OAuth Desktop App JSON:
  ${SELF_CMD} auth credentials set --file /path/to/credentials.json

Or use clipboard shortcuts:
  ${SELF_CMD} auth credentials paste-win --overwrite  (Windows)
  ${SELF_CMD} auth credentials paste-macos --overwrite  (macOS)`
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

  function createAuthedClient() {
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

    const block = json.installed || json.web;
    if (!block || !block.client_id || !block.client_secret) {
      const err = new Error('Invalid credentials JSON.');
      err.code = 'INVALID_CREDENTIALS';
      throw err;
    }

    ensureDir(GAPIS_DIR);
    writeJson(CREDENTIALS_PATH, json);
    printJson({ok: true, action: 'auth.credentials.set', path: CREDENTIALS_PATH});
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

  async function login(flags) {
    const scopesPreset = String(flags.preset || '').trim();
    const scopes = String(flags.scopes || '').trim()
      ? String(flags.scopes).split(/[\s,]+/).filter(Boolean)
      : SCOPE_PRESETS[scopesPreset] || DEFAULT_SCOPES;

    ensureDir(GAPIS_DIR);
    const {clientId, clientSecret, redirectUris} = loadCredentials();

    const preferredRedirect = (redirectUris[0] || 'http://localhost').trim();
    const preferredUrl = new URL(preferredRedirect);
    const callbackPath = preferredUrl.pathname && preferredUrl.pathname !== '/' ? preferredUrl.pathname : '/';

    let resolveAuth, rejectAuth;
    const authPromise = new Promise((resolve, reject) => {
      resolveAuth = resolve;
      rejectAuth = reject;
    });

    let oauth2Client;
    let handled = false;
    const sockets = new Set();

    function shutdownServer() {
      for (const s of sockets) {
        try { s.destroy(); } catch {}
      }
      sockets.clear();
      try { server.close(); } catch {}
    }

    const server = http.createServer(async (req, res) => {
      try {
        res.setHeader('connection', 'close');

        if (handled) {
          res.statusCode = 200;
          res.end('OK');
          return;
        }

        if (!req.url) {
          res.statusCode = 400;
          res.end('Bad request');
          return;
        }

        const requestUrl = new URL(req.url, `http://${preferredUrl.hostname}`);
        const pathOk = callbackPath === '/'
          ? requestUrl.pathname === '/' || requestUrl.pathname === ''
          : requestUrl.pathname === callbackPath;

        if (!pathOk) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }

        const code = requestUrl.searchParams.get('code');
        if (!code) {
          res.statusCode = 400;
          res.end('Missing code');
          return;
        }

        handled = true;

        res.statusCode = 200;
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end(loadTemplate('oauth-success', {
          VERIFY_COMMAND: `${SELF_CMD} accounts list`,
          SCOPES: scopes.map(s => s.replace('https://www.googleapis.com/auth/', '')).join(', ')
        }));

        const {tokens} = await oauth2Client.getToken(code);

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
        try { res.statusCode = 500; res.end('Auth failed'); } catch {}
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

    open(authorizeUrl, {wait: false})
      .then(cp => { if (cp && typeof cp.unref === 'function') cp.unref(); })
      .catch(() => {});

    const timeoutSec = flags.timeout ? Number(flags.timeout) : 120;
    const deadlineMs = timeoutSec * 1000;

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

  return {
    loadCredentials,
    createAuthedClient,
    setCredentials,
    setCredentialsFromClipboard,
    pasteWin,
    pasteMacos,
    login,
  };
}

module.exports = {createAuthModule};
