#!/usr/bin/env node
'use strict';

const path = require('path');
const {parseArgs, printJson, fail} = require('./lib/utils');
const {createAuthModule} = require('./lib/auth');
const {createGaApi} = require('./lib/ga-api');

// Config
const SCRIPT_DIR = __dirname;
const GAPIS_DIR = path.join(SCRIPT_DIR, '.gapis');
const CREDENTIALS_PATH = path.join(GAPIS_DIR, 'credentials.json');
const TOKEN_PATH = path.join(GAPIS_DIR, 'token.json');
const TEMPLATES_DIR = path.join(SCRIPT_DIR, 'templates');
const PROJECT_ROOT = process.cwd();

const SELF_PATH = process.argv[1];
const SELF_REL = path.relative(PROJECT_ROOT, SELF_PATH);
const SELF_CMD = `node ${SELF_REL && !SELF_REL.startsWith('..') ? SELF_REL : SELF_PATH}`;

const SCOPE_PRESETS = {
  readonly: [
    'https://www.googleapis.com/auth/analytics.readonly',
    'https://www.googleapis.com/auth/tagmanager.readonly',
  ],
  edit: [
    'https://www.googleapis.com/auth/analytics.edit',
    'https://www.googleapis.com/auth/tagmanager.edit.containers',
  ],
  publish: [
    'https://www.googleapis.com/auth/analytics.edit',
    'https://www.googleapis.com/auth/tagmanager.edit.containers',
    'https://www.googleapis.com/auth/tagmanager.publish',
  ],
};
const DEFAULT_SCOPES = SCOPE_PRESETS.edit;

// Initialize modules
const auth = createAuthModule({
  GAPIS_DIR, CREDENTIALS_PATH, TOKEN_PATH, TEMPLATES_DIR,
  SELF_CMD, PROJECT_ROOT, SCOPE_PRESETS, DEFAULT_SCOPES,
});

const api = createGaApi(auth.createAuthedClient);

// Command routing table
const COMMANDS = {
  // Auth
  'auth login': auth.login,
  'auth credentials set': auth.setCredentials,
  'auth credentials paste-win': auth.pasteWin,
  'auth credentials paste-macos': auth.pasteMacos,
  // Accounts
  'accounts list': api.accounts.list,
  'accounts get': api.accounts.get,
  'accounts delete': api.accounts.delete,
  'accounts patch': api.accounts.patch,
  'accounts search-change-history': api.accounts.searchChangeHistoryEvents,
  // Account Summaries
  'account-summaries list': api.accountSummaries.list,
  // Properties
  'properties list': api.properties.list,
  'properties get': api.properties.get,
  'properties create': api.properties.create,
  'properties delete': api.properties.delete,
  'properties patch': api.properties.patch,
  'properties get-data-retention': api.properties.getDataRetentionSettings,
  'properties update-data-retention': api.properties.updateDataRetentionSettings,
  // Data Streams
  'data-streams list': api.dataStreams.list,
  'data-streams get': api.dataStreams.get,
  'data-streams create': api.dataStreams.create,
  'data-streams delete': api.dataStreams.delete,
  'data-streams patch': api.dataStreams.patch,
  // Custom Dimensions
  'custom-dimensions list': api.customDimensions.list,
  'custom-dimensions get': api.customDimensions.get,
  'custom-dimensions create': api.customDimensions.create,
  'custom-dimensions patch': api.customDimensions.patch,
  'custom-dimensions archive': api.customDimensions.archive,
  // Custom Metrics
  'custom-metrics list': api.customMetrics.list,
  'custom-metrics get': api.customMetrics.get,
  'custom-metrics create': api.customMetrics.create,
  'custom-metrics patch': api.customMetrics.patch,
  'custom-metrics archive': api.customMetrics.archive,
  // Key Events
  'key-events list': api.keyEvents.list,
  'key-events get': api.keyEvents.get,
  'key-events create': api.keyEvents.create,
  'key-events delete': api.keyEvents.delete,
  'key-events patch': api.keyEvents.patch,
  // Google Ads Links
  'google-ads-links list': api.googleAdsLinks.list,
  'google-ads-links create': api.googleAdsLinks.create,
  'google-ads-links delete': api.googleAdsLinks.delete,
  'google-ads-links patch': api.googleAdsLinks.patch,
  // Firebase Links
  'firebase-links list': api.firebaseLinks.list,
  'firebase-links create': api.firebaseLinks.create,
  'firebase-links delete': api.firebaseLinks.delete,
  // Measurement Protocol Secrets
  'mp-secrets list': api.measurementProtocolSecrets.list,
  'mp-secrets get': api.measurementProtocolSecrets.get,
  'mp-secrets create': api.measurementProtocolSecrets.create,
  'mp-secrets delete': api.measurementProtocolSecrets.delete,
  'mp-secrets patch': api.measurementProtocolSecrets.patch,
};

function printHelp() {
  const usage = {};
  for (const cmd of Object.keys(COMMANDS)) {
    usage[cmd] = `${SELF_CMD} ${cmd} [flags]`;
  }
  printJson({ok: true, usage});
}

async function main() {
  const {positional, flags} = parseArgs(process.argv.slice(2));

  if (positional.length === 0 || ['help', '--help', '-h'].includes(positional[0])) {
    printHelp();
    return;
  }

  // Try 3-word, 2-word commands
  const cmd3 = positional.slice(0, 3).join(' ');
  const cmd2 = positional.slice(0, 2).join(' ');

  const handler = COMMANDS[cmd3] || COMMANDS[cmd2];

  if (handler) {
    await handler(flags);
  } else {
    const err = new Error(`Unknown command: ${positional.join(' ')}`);
    err.code = 'UNKNOWN_COMMAND';
    throw err;
  }
}

main().catch(fail);
