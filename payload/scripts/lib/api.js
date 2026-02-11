'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const LEGACY_PID_FILE = path.join(__dirname, '..', '.payload-server.json');
const STATE_DIR = process.env.PAYLOAD_CMS_HOME
  ? path.resolve(process.env.PAYLOAD_CMS_HOME)
  : path.join(os.homedir(), '.payload-cms');
const PID_FILE = path.join(STATE_DIR, 'server.json');

function ensureStateDir() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

function migrateLegacyState() {
  ensureStateDir();
  if (fs.existsSync(PID_FILE) || !fs.existsSync(LEGACY_PID_FILE)) return;
  fs.copyFileSync(LEGACY_PID_FILE, PID_FILE);
}

/**
 * Read server info (pid + port) from the PID file.
 * @returns {{ pid: number, port: number }}
 */
function readServerInfo() {
  migrateLegacyState();
  if (!fs.existsSync(PID_FILE)) {
    const err = new Error(
      'Payload server is not running. Start it with: payload start'
    );
    err.code = 'SERVER_NOT_RUNNING';
    throw err;
  }
  return JSON.parse(fs.readFileSync(PID_FILE, 'utf8'));
}

/**
 * Make an HTTP request to the running Payload server.
 * @param {'GET'|'POST'} method
 * @param {string} urlPath
 * @param {object} [body]
 * @param {number} [timeout]
 * @returns {Promise<object>}
 */
function callServer(method, urlPath, body, timeout) {
  const info = readServerInfo();

  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: info.port,
      path: urlPath,
      method,
      headers: { 'Content-Type': 'application/json' },
      timeout: timeout || 30000,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Invalid JSON from server: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', (err) => {
      if (err.code === 'ECONNREFUSED') {
        // Server PID file exists but server is dead — clean up
        try { fs.unlinkSync(PID_FILE); } catch { /* ignore */ }
        reject(new Error(
          'Payload server is not responding (stale PID file cleaned). Start it with: payload start'
        ));
      } else {
        reject(err);
      }
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timed out after ${options.timeout}ms`));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * Check if the server is currently running and healthy.
 * @returns {Promise<object|null>} Health response or null if not running.
 */
async function checkHealth() {
  try {
    return await callServer('GET', '/health');
  } catch {
    return null;
  }
}

module.exports = {
  PID_FILE,
  readServerInfo,
  callServer,
  checkHealth,
};
