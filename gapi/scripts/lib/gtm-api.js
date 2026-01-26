'use strict';

const {google} = require('googleapis');
const {printJson, requireFlags, parseJsonInput} = require('./utils');

function createGtmApi(createAuthedClient) {
  function getTagManager() {
    const auth = createAuthedClient();
    return google.tagmanager({version: 'v2', auth});
  }

  // Generic CRUD factory for workspace-level resources
  function createWorkspaceResource(resourceName, resourceIdFlag) {
    const basePath = (f) => `accounts/${f.accountId}/containers/${f.containerId}/workspaces/${f.workspaceId}`;
    const itemPath = (f) => `${basePath(f)}/${resourceName}/${f[resourceIdFlag]}`;

    return {
      async list(flags) {
        requireFlags(flags, 'accountId', 'containerId', 'workspaceId');
        const tm = getTagManager();
        const res = await tm.accounts.containers.workspaces[resourceName].list({
          parent: basePath(flags),
        });
        printJson({ok: true, data: res.data});
      },

      async get(flags) {
        requireFlags(flags, 'accountId', 'containerId', 'workspaceId', resourceIdFlag);
        const tm = getTagManager();
        const res = await tm.accounts.containers.workspaces[resourceName].get({
          path: itemPath(flags),
        });
        printJson({ok: true, data: res.data});
      },

      async create(flags) {
        requireFlags(flags, 'accountId', 'containerId', 'workspaceId');
        const data = await parseJsonInput(flags);
        const tm = getTagManager();
        const res = await tm.accounts.containers.workspaces[resourceName].create({
          parent: basePath(flags),
          requestBody: data,
        });
        printJson({ok: true, data: res.data});
      },

      async update(flags) {
        requireFlags(flags, 'accountId', 'containerId', 'workspaceId', resourceIdFlag);
        const data = await parseJsonInput(flags);
        const tm = getTagManager();
        const res = await tm.accounts.containers.workspaces[resourceName].update({
          path: itemPath(flags),
          requestBody: data,
        });
        printJson({ok: true, data: res.data});
      },

      async delete(flags) {
        requireFlags(flags, 'accountId', 'containerId', 'workspaceId', resourceIdFlag);
        const tm = getTagManager();
        await tm.accounts.containers.workspaces[resourceName].delete({
          path: itemPath(flags),
        });
        printJson({ok: true, action: `${resourceName}.delete`});
      },

      async revert(flags) {
        requireFlags(flags, 'accountId', 'containerId', 'workspaceId', resourceIdFlag);
        const tm = getTagManager();
        const res = await tm.accounts.containers.workspaces[resourceName].revert({
          path: itemPath(flags),
        });
        printJson({ok: true, data: res.data});
      },
    };
  }

  // Accounts
  const accounts = {
    async list() {
      const tm = getTagManager();
      const res = await tm.accounts.list({});
      printJson({ok: true, data: res.data});
    },

    async get(flags) {
      requireFlags(flags, 'accountId');
      const tm = getTagManager();
      const res = await tm.accounts.get({path: `accounts/${flags.accountId}`});
      printJson({ok: true, data: res.data});
    },

    async update(flags) {
      requireFlags(flags, 'accountId');
      const data = await parseJsonInput(flags);
      const tm = getTagManager();
      const res = await tm.accounts.update({
        path: `accounts/${flags.accountId}`,
        requestBody: data,
      });
      printJson({ok: true, data: res.data});
    },
  };

  // Containers
  const containers = {
    async list(flags) {
      requireFlags(flags, 'accountId');
      const tm = getTagManager();
      const res = await tm.accounts.containers.list({parent: `accounts/${flags.accountId}`});
      printJson({ok: true, data: res.data});
    },

    async get(flags) {
      requireFlags(flags, 'accountId', 'containerId');
      const tm = getTagManager();
      const res = await tm.accounts.containers.get({
        path: `accounts/${flags.accountId}/containers/${flags.containerId}`,
      });
      printJson({ok: true, data: res.data});
    },

    async create(flags) {
      requireFlags(flags, 'accountId');
      const data = await parseJsonInput(flags);
      const tm = getTagManager();
      const res = await tm.accounts.containers.create({
        parent: `accounts/${flags.accountId}`,
        requestBody: data,
      });
      printJson({ok: true, data: res.data});
    },

    async update(flags) {
      requireFlags(flags, 'accountId', 'containerId');
      const data = await parseJsonInput(flags);
      const tm = getTagManager();
      const res = await tm.accounts.containers.update({
        path: `accounts/${flags.accountId}/containers/${flags.containerId}`,
        requestBody: data,
      });
      printJson({ok: true, data: res.data});
    },

    async delete(flags) {
      requireFlags(flags, 'accountId', 'containerId');
      const tm = getTagManager();
      await tm.accounts.containers.delete({
        path: `accounts/${flags.accountId}/containers/${flags.containerId}`,
      });
      printJson({ok: true, action: 'containers.delete'});
    },
  };

  // Workspaces
  const workspaces = {
    async list(flags) {
      requireFlags(flags, 'accountId', 'containerId');
      const tm = getTagManager();
      const res = await tm.accounts.containers.workspaces.list({
        parent: `accounts/${flags.accountId}/containers/${flags.containerId}`,
      });
      printJson({ok: true, data: res.data});
    },

    async get(flags) {
      requireFlags(flags, 'accountId', 'containerId', 'workspaceId');
      const tm = getTagManager();
      const res = await tm.accounts.containers.workspaces.get({
        path: `accounts/${flags.accountId}/containers/${flags.containerId}/workspaces/${flags.workspaceId}`,
      });
      printJson({ok: true, data: res.data});
    },

    async create(flags) {
      requireFlags(flags, 'accountId', 'containerId');
      const data = await parseJsonInput(flags);
      const tm = getTagManager();
      const res = await tm.accounts.containers.workspaces.create({
        parent: `accounts/${flags.accountId}/containers/${flags.containerId}`,
        requestBody: data,
      });
      printJson({ok: true, data: res.data});
    },

    async update(flags) {
      requireFlags(flags, 'accountId', 'containerId', 'workspaceId');
      const data = await parseJsonInput(flags);
      const tm = getTagManager();
      const res = await tm.accounts.containers.workspaces.update({
        path: `accounts/${flags.accountId}/containers/${flags.containerId}/workspaces/${flags.workspaceId}`,
        requestBody: data,
      });
      printJson({ok: true, data: res.data});
    },

    async delete(flags) {
      requireFlags(flags, 'accountId', 'containerId', 'workspaceId');
      const tm = getTagManager();
      await tm.accounts.containers.workspaces.delete({
        path: `accounts/${flags.accountId}/containers/${flags.containerId}/workspaces/${flags.workspaceId}`,
      });
      printJson({ok: true, action: 'workspaces.delete'});
    },

    async sync(flags) {
      requireFlags(flags, 'accountId', 'containerId', 'workspaceId');
      const tm = getTagManager();
      const res = await tm.accounts.containers.workspaces.sync({
        path: `accounts/${flags.accountId}/containers/${flags.containerId}/workspaces/${flags.workspaceId}`,
      });
      printJson({ok: true, data: res.data});
    },

    async quickPreview(flags) {
      requireFlags(flags, 'accountId', 'containerId', 'workspaceId');
      const tm = getTagManager();
      const res = await tm.accounts.containers.workspaces.quick_preview({
        path: `accounts/${flags.accountId}/containers/${flags.containerId}/workspaces/${flags.workspaceId}`,
      });
      printJson({ok: true, data: res.data});
    },

    async getStatus(flags) {
      requireFlags(flags, 'accountId', 'containerId', 'workspaceId');
      const tm = getTagManager();
      const res = await tm.accounts.containers.workspaces.getStatus({
        path: `accounts/${flags.accountId}/containers/${flags.containerId}/workspaces/${flags.workspaceId}`,
      });
      printJson({ok: true, data: res.data});
    },

    async createVersion(flags) {
      requireFlags(flags, 'accountId', 'containerId', 'workspaceId');
      const data = await parseJsonInput(flags);
      const tm = getTagManager();
      const res = await tm.accounts.containers.workspaces.create_version({
        path: `accounts/${flags.accountId}/containers/${flags.containerId}/workspaces/${flags.workspaceId}`,
        requestBody: data,
      });
      printJson({ok: true, data: res.data});
    },
  };

  // Environments
  const environments = {
    async list(flags) {
      requireFlags(flags, 'accountId', 'containerId');
      const tm = getTagManager();
      const res = await tm.accounts.containers.environments.list({
        parent: `accounts/${flags.accountId}/containers/${flags.containerId}`,
      });
      printJson({ok: true, data: res.data});
    },

    async get(flags) {
      requireFlags(flags, 'accountId', 'containerId', 'environmentId');
      const tm = getTagManager();
      const res = await tm.accounts.containers.environments.get({
        path: `accounts/${flags.accountId}/containers/${flags.containerId}/environments/${flags.environmentId}`,
      });
      printJson({ok: true, data: res.data});
    },

    async create(flags) {
      requireFlags(flags, 'accountId', 'containerId');
      const data = await parseJsonInput(flags);
      const tm = getTagManager();
      const res = await tm.accounts.containers.environments.create({
        parent: `accounts/${flags.accountId}/containers/${flags.containerId}`,
        requestBody: data,
      });
      printJson({ok: true, data: res.data});
    },

    async update(flags) {
      requireFlags(flags, 'accountId', 'containerId', 'environmentId');
      const data = await parseJsonInput(flags);
      const tm = getTagManager();
      const res = await tm.accounts.containers.environments.update({
        path: `accounts/${flags.accountId}/containers/${flags.containerId}/environments/${flags.environmentId}`,
        requestBody: data,
      });
      printJson({ok: true, data: res.data});
    },

    async delete(flags) {
      requireFlags(flags, 'accountId', 'containerId', 'environmentId');
      const tm = getTagManager();
      await tm.accounts.containers.environments.delete({
        path: `accounts/${flags.accountId}/containers/${flags.containerId}/environments/${flags.environmentId}`,
      });
      printJson({ok: true, action: 'environments.delete'});
    },

    async reauthorize(flags) {
      requireFlags(flags, 'accountId', 'containerId', 'environmentId');
      const data = await parseJsonInput(flags);
      const tm = getTagManager();
      const res = await tm.accounts.containers.environments.reauthorize({
        path: `accounts/${flags.accountId}/containers/${flags.containerId}/environments/${flags.environmentId}`,
        requestBody: data,
      });
      printJson({ok: true, data: res.data});
    },
  };

  // Versions
  const versions = {
    async list(flags) {
      requireFlags(flags, 'accountId', 'containerId');
      const tm = getTagManager();
      const res = await tm.accounts.containers.version_headers.list({
        parent: `accounts/${flags.accountId}/containers/${flags.containerId}`,
      });
      printJson({ok: true, data: res.data});
    },

    async get(flags) {
      requireFlags(flags, 'accountId', 'containerId', 'versionId');
      const tm = getTagManager();
      const res = await tm.accounts.containers.versions.get({
        path: `accounts/${flags.accountId}/containers/${flags.containerId}/versions/${flags.versionId}`,
      });
      printJson({ok: true, data: res.data});
    },

    async publish(flags) {
      requireFlags(flags, 'accountId', 'containerId', 'versionId');
      const tm = getTagManager();
      const res = await tm.accounts.containers.versions.publish({
        path: `accounts/${flags.accountId}/containers/${flags.containerId}/versions/${flags.versionId}`,
      });
      printJson({ok: true, data: res.data});
    },

    async setLatest(flags) {
      requireFlags(flags, 'accountId', 'containerId', 'versionId');
      const tm = getTagManager();
      const res = await tm.accounts.containers.versions.set_latest({
        path: `accounts/${flags.accountId}/containers/${flags.containerId}/versions/${flags.versionId}`,
      });
      printJson({ok: true, data: res.data});
    },

    async delete(flags) {
      requireFlags(flags, 'accountId', 'containerId', 'versionId');
      const tm = getTagManager();
      await tm.accounts.containers.versions.delete({
        path: `accounts/${flags.accountId}/containers/${flags.containerId}/versions/${flags.versionId}`,
      });
      printJson({ok: true, action: 'versions.delete'});
    },

    async undelete(flags) {
      requireFlags(flags, 'accountId', 'containerId', 'versionId');
      const tm = getTagManager();
      const res = await tm.accounts.containers.versions.undelete({
        path: `accounts/${flags.accountId}/containers/${flags.containerId}/versions/${flags.versionId}`,
      });
      printJson({ok: true, data: res.data});
    },

    async live(flags) {
      requireFlags(flags, 'accountId', 'containerId');
      const tm = getTagManager();
      const res = await tm.accounts.containers.versions.live({
        parent: `accounts/${flags.accountId}/containers/${flags.containerId}`,
      });
      printJson({ok: true, data: res.data});
    },

    async update(flags) {
      requireFlags(flags, 'accountId', 'containerId', 'versionId');
      const data = await parseJsonInput(flags);
      const tm = getTagManager();
      const res = await tm.accounts.containers.versions.update({
        path: `accounts/${flags.accountId}/containers/${flags.containerId}/versions/${flags.versionId}`,
        requestBody: data,
      });
      printJson({ok: true, data: res.data});
    },
  };

  // Built-in Variables
  const builtInVariables = {
    async list(flags) {
      requireFlags(flags, 'accountId', 'containerId', 'workspaceId');
      const tm = getTagManager();
      const res = await tm.accounts.containers.workspaces.built_in_variables.list({
        parent: `accounts/${flags.accountId}/containers/${flags.containerId}/workspaces/${flags.workspaceId}`,
      });
      printJson({ok: true, data: res.data});
    },

    async create(flags) {
      requireFlags(flags, 'accountId', 'containerId', 'workspaceId');
      const type = flags.type ? String(flags.type).split(',') : undefined;
      const tm = getTagManager();
      const res = await tm.accounts.containers.workspaces.built_in_variables.create({
        parent: `accounts/${flags.accountId}/containers/${flags.containerId}/workspaces/${flags.workspaceId}`,
        type,
      });
      printJson({ok: true, data: res.data});
    },

    async delete(flags) {
      requireFlags(flags, 'accountId', 'containerId', 'workspaceId');
      const type = flags.type ? String(flags.type).split(',') : undefined;
      const tm = getTagManager();
      await tm.accounts.containers.workspaces.built_in_variables.delete({
        path: `accounts/${flags.accountId}/containers/${flags.containerId}/workspaces/${flags.workspaceId}`,
        type,
      });
      printJson({ok: true, action: 'built_in_variables.delete'});
    },

    async revert(flags) {
      requireFlags(flags, 'accountId', 'containerId', 'workspaceId');
      const tm = getTagManager();
      const res = await tm.accounts.containers.workspaces.built_in_variables.revert({
        path: `accounts/${flags.accountId}/containers/${flags.containerId}/workspaces/${flags.workspaceId}`,
        type: flags.type,
      });
      printJson({ok: true, data: res.data});
    },
  };

  // User Permissions
  const userPermissions = {
    async list(flags) {
      requireFlags(flags, 'accountId');
      const tm = getTagManager();
      const res = await tm.accounts.user_permissions.list({
        parent: `accounts/${flags.accountId}`,
      });
      printJson({ok: true, data: res.data});
    },

    async get(flags) {
      requireFlags(flags, 'accountId', 'userPermissionId');
      const tm = getTagManager();
      const res = await tm.accounts.user_permissions.get({
        path: `accounts/${flags.accountId}/user_permissions/${flags.userPermissionId}`,
      });
      printJson({ok: true, data: res.data});
    },

    async create(flags) {
      requireFlags(flags, 'accountId');
      const data = await parseJsonInput(flags);
      const tm = getTagManager();
      const res = await tm.accounts.user_permissions.create({
        parent: `accounts/${flags.accountId}`,
        requestBody: data,
      });
      printJson({ok: true, data: res.data});
    },

    async update(flags) {
      requireFlags(flags, 'accountId', 'userPermissionId');
      const data = await parseJsonInput(flags);
      const tm = getTagManager();
      const res = await tm.accounts.user_permissions.update({
        path: `accounts/${flags.accountId}/user_permissions/${flags.userPermissionId}`,
        requestBody: data,
      });
      printJson({ok: true, data: res.data});
    },

    async delete(flags) {
      requireFlags(flags, 'accountId', 'userPermissionId');
      const tm = getTagManager();
      await tm.accounts.user_permissions.delete({
        path: `accounts/${flags.accountId}/user_permissions/${flags.userPermissionId}`,
      });
      printJson({ok: true, action: 'user_permissions.delete'});
    },
  };

  // Workspace-level resources using the factory
  const tags = createWorkspaceResource('tags', 'tagId');
  const triggers = createWorkspaceResource('triggers', 'triggerId');
  const variables = createWorkspaceResource('variables', 'variableId');
  const folders = createWorkspaceResource('folders', 'folderId');
  const clients = createWorkspaceResource('clients', 'clientId');
  const templates = createWorkspaceResource('templates', 'templateId');
  const zones = createWorkspaceResource('zones', 'zoneId');
  const transformations = createWorkspaceResource('transformations', 'transformationId');

  // Add move_entities to folders
  folders.moveEntities = async function(flags) {
    requireFlags(flags, 'accountId', 'containerId', 'workspaceId', 'folderId');
    const data = await parseJsonInput(flags);
    const tm = getTagManager();
    await tm.accounts.containers.workspaces.folders.move_entities_to_folder({
      path: `accounts/${flags.accountId}/containers/${flags.containerId}/workspaces/${flags.workspaceId}/folders/${flags.folderId}`,
      requestBody: data,
    });
    printJson({ok: true, action: 'folders.move_entities'});
  };

  return {
    accounts,
    containers,
    workspaces,
    environments,
    versions,
    builtInVariables,
    userPermissions,
    tags,
    triggers,
    variables,
    folders,
    clients,
    templates,
    zones,
    transformations,
  };
}

module.exports = {createGtmApi};
