#!/usr/bin/env node
'use strict';

const path = require('path');
const {parseArgs, printJson, fail} = require('./lib/utils');
const {createAuthModule} = require('./lib/auth');
const {createGtmApi} = require('./lib/gtm-api');

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
    'https://www.googleapis.com/auth/tagmanager.readonly',
    'https://www.googleapis.com/auth/analytics.readonly',
  ],
  edit: [
    'https://www.googleapis.com/auth/tagmanager.edit.containers',
    'https://www.googleapis.com/auth/analytics.edit',
  ],
  publish: [
    'https://www.googleapis.com/auth/tagmanager.edit.containers',
    'https://www.googleapis.com/auth/tagmanager.publish',
    'https://www.googleapis.com/auth/analytics.edit',
  ],
};
const DEFAULT_SCOPES = SCOPE_PRESETS.edit;

// Initialize modules
const auth = createAuthModule({
  GAPIS_DIR, CREDENTIALS_PATH, TOKEN_PATH, TEMPLATES_DIR,
  SELF_CMD, PROJECT_ROOT, SCOPE_PRESETS, DEFAULT_SCOPES,
});

const api = createGtmApi(auth.createAuthedClient);

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
  'accounts update': api.accounts.update,
  // Containers
  'containers list': api.containers.list,
  'containers get': api.containers.get,
  'containers create': api.containers.create,
  'containers update': api.containers.update,
  'containers delete': api.containers.delete,
  // Workspaces
  'workspaces list': api.workspaces.list,
  'workspaces get': api.workspaces.get,
  'workspaces create': api.workspaces.create,
  'workspaces update': api.workspaces.update,
  'workspaces delete': api.workspaces.delete,
  'workspaces sync': api.workspaces.sync,
  'workspaces quick-preview': api.workspaces.quickPreview,
  'workspaces get-status': api.workspaces.getStatus,
  'workspaces create-version': api.workspaces.createVersion,
  // Tags
  'tags list': api.tags.list,
  'tags get': api.tags.get,
  'tags create': api.tags.create,
  'tags update': api.tags.update,
  'tags delete': api.tags.delete,
  'tags revert': api.tags.revert,
  // Triggers
  'triggers list': api.triggers.list,
  'triggers get': api.triggers.get,
  'triggers create': api.triggers.create,
  'triggers update': api.triggers.update,
  'triggers delete': api.triggers.delete,
  'triggers revert': api.triggers.revert,
  // Variables
  'variables list': api.variables.list,
  'variables get': api.variables.get,
  'variables create': api.variables.create,
  'variables update': api.variables.update,
  'variables delete': api.variables.delete,
  'variables revert': api.variables.revert,
  // Folders
  'folders list': api.folders.list,
  'folders get': api.folders.get,
  'folders create': api.folders.create,
  'folders update': api.folders.update,
  'folders delete': api.folders.delete,
  'folders revert': api.folders.revert,
  'folders move-entities': api.folders.moveEntities,
  // Clients
  'clients list': api.clients.list,
  'clients get': api.clients.get,
  'clients create': api.clients.create,
  'clients update': api.clients.update,
  'clients delete': api.clients.delete,
  'clients revert': api.clients.revert,
  // Templates
  'templates list': api.templates.list,
  'templates get': api.templates.get,
  'templates create': api.templates.create,
  'templates update': api.templates.update,
  'templates delete': api.templates.delete,
  'templates revert': api.templates.revert,
  // Zones
  'zones list': api.zones.list,
  'zones get': api.zones.get,
  'zones create': api.zones.create,
  'zones update': api.zones.update,
  'zones delete': api.zones.delete,
  'zones revert': api.zones.revert,
  // Environments
  'environments list': api.environments.list,
  'environments get': api.environments.get,
  'environments create': api.environments.create,
  'environments update': api.environments.update,
  'environments delete': api.environments.delete,
  'environments reauthorize': api.environments.reauthorize,
  // Versions
  'versions list': api.versions.list,
  'versions get': api.versions.get,
  'versions publish': api.versions.publish,
  'versions set-latest': api.versions.setLatest,
  'versions delete': api.versions.delete,
  'versions undelete': api.versions.undelete,
  'versions live': api.versions.live,
  'versions update': api.versions.update,
  // Built-in Variables
  'built-in-variables list': api.builtInVariables.list,
  'built-in-variables create': api.builtInVariables.create,
  'built-in-variables delete': api.builtInVariables.delete,
  'built-in-variables revert': api.builtInVariables.revert,
  // Transformations
  'transformations list': api.transformations.list,
  'transformations get': api.transformations.get,
  'transformations create': api.transformations.create,
  'transformations update': api.transformations.update,
  'transformations delete': api.transformations.delete,
  'transformations revert': api.transformations.revert,
  // User Permissions
  'user-permissions list': api.userPermissions.list,
  'user-permissions get': api.userPermissions.get,
  'user-permissions create': api.userPermissions.create,
  'user-permissions update': api.userPermissions.update,
  'user-permissions delete': api.userPermissions.delete,
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
