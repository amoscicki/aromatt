#!/usr/bin/env node
'use strict';

/**
 * Project management - add/remove/list/reindex/clear
 */

const fs = require('fs');
const path = require('path');
const {parseArgs, printJson, fail, ensureDir, readJson, writeJson} = require('./lib/utils');
const {INDEXER_DIR} = require('./lib/auth');
const {deleteProjectSegments, getProjectStats} = require('./lib/db');

const PROJECTS_PATH = path.join(INDEXER_DIR, 'projects.json');
const PID_PATH = path.join(INDEXER_DIR, 'daemon.pid');

function loadProjects() {
  if (!fs.existsSync(PROJECTS_PATH)) {
    return [];
  }
  const data = readJson(PROJECTS_PATH);
  return data.projects || [];
}

function saveProjects(projects) {
  ensureDir(INDEXER_DIR);
  writeJson(PROJECTS_PATH, {projects});
}

function getDaemonPid() {
  if (!fs.existsSync(PID_PATH)) {
    return null;
  }
  const pid = parseInt(fs.readFileSync(PID_PATH, 'utf8').trim(), 10);
  if (isNaN(pid)) {
    return null;
  }
  try {
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
}

function notifyDaemon() {
  const pid = getDaemonPid();
  if (pid) {
    try {
      process.kill(pid, 'SIGHUP');
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

const COMMANDS = {
  add: async (flags, projectPath) => {
    if (!projectPath) {
      const err = new Error('Missing project path. Usage: node projects.js add <path>');
      err.code = 'MISSING_PATH';
      throw err;
    }

    const absolutePath = path.resolve(projectPath);

    if (!fs.existsSync(absolutePath)) {
      const err = new Error(`Directory does not exist: ${absolutePath}`);
      err.code = 'DIR_NOT_FOUND';
      throw err;
    }

    if (!fs.statSync(absolutePath).isDirectory()) {
      const err = new Error(`Not a directory: ${absolutePath}`);
      err.code = 'NOT_A_DIR';
      throw err;
    }

    const projects = loadProjects();

    // Check if already exists
    const existing = projects.find((p) => p.path === absolutePath);
    if (existing) {
      printJson({
        ok: true,
        action: 'projects.add',
        message: 'Project already in watch list',
        project: existing,
      });
      return;
    }

    // Add new project
    const newProject = {
      path: absolutePath,
      addedAt: new Date().toISOString(),
      lastIndexed: null,
      fileCount: 0,
    };

    projects.push(newProject);
    saveProjects(projects);

    // Notify daemon to reload
    const notified = notifyDaemon();

    printJson({
      ok: true,
      action: 'projects.add',
      project: newProject,
      daemonNotified: notified,
    });
  },

  remove: async (flags, projectPath) => {
    if (!projectPath) {
      const err = new Error('Missing project path. Usage: node projects.js remove <path>');
      err.code = 'MISSING_PATH';
      throw err;
    }

    const absolutePath = path.resolve(projectPath);
    const projects = loadProjects();

    const index = projects.findIndex((p) => p.path === absolutePath);
    if (index === -1) {
      printJson({
        ok: true,
        action: 'projects.remove',
        message: 'Project not in watch list',
        path: absolutePath,
      });
      return;
    }

    const removed = projects.splice(index, 1)[0];
    saveProjects(projects);

    // Notify daemon to reload
    const notified = notifyDaemon();

    printJson({
      ok: true,
      action: 'projects.remove',
      project: removed,
      daemonNotified: notified,
      note: 'Use "projects.js clear <path>" to remove indexed data from database',
    });
  },

  list: async () => {
    const projects = loadProjects();
    const daemonRunning = !!getDaemonPid();

    // Get stats for each project
    const projectsWithStats = [];
    for (const project of projects) {
      try {
        const stats = await getProjectStats(project.path);
        projectsWithStats.push({
          ...project,
          stats: {
            fileCount: parseInt(stats.file_count, 10),
            segmentCount: parseInt(stats.segment_count, 10),
            lastUpdated: stats.last_updated,
          },
        });
      } catch {
        projectsWithStats.push({
          ...project,
          stats: null,
        });
      }
    }

    printJson({
      ok: true,
      action: 'projects.list',
      daemonRunning,
      projectCount: projects.length,
      projects: projectsWithStats,
    });
  },

  reindex: async (flags, projectPath) => {
    if (!projectPath) {
      const err = new Error('Missing project path. Usage: node projects.js reindex <path>');
      err.code = 'MISSING_PATH';
      throw err;
    }

    const absolutePath = path.resolve(projectPath);
    const projects = loadProjects();

    const project = projects.find((p) => p.path === absolutePath);
    if (!project) {
      const err = new Error(`Project not in watch list: ${absolutePath}`);
      err.code = 'PROJECT_NOT_FOUND';
      throw err;
    }

    // Clear existing data
    const deletedCount = await deleteProjectSegments(absolutePath);

    // Reset project stats
    project.lastIndexed = null;
    project.fileCount = 0;
    saveProjects(projects);

    // Notify daemon to reindex
    const notified = notifyDaemon();

    printJson({
      ok: true,
      action: 'projects.reindex',
      path: absolutePath,
      segmentsDeleted: deletedCount,
      daemonNotified: notified,
      message: notified
        ? 'Daemon will reindex automatically'
        : 'Start daemon with "daemon.js start" to reindex',
    });
  },

  clear: async (flags, projectPath) => {
    if (!projectPath) {
      const err = new Error('Missing project path. Usage: node projects.js clear <path>');
      err.code = 'MISSING_PATH';
      throw err;
    }

    const absolutePath = path.resolve(projectPath);

    // Clear data from database
    const deletedCount = await deleteProjectSegments(absolutePath);

    // Also remove from projects list if present
    const projects = loadProjects();
    const index = projects.findIndex((p) => p.path === absolutePath);
    let removedFromList = false;
    if (index !== -1) {
      projects.splice(index, 1);
      saveProjects(projects);
      removedFromList = true;
      notifyDaemon();
    }

    printJson({
      ok: true,
      action: 'projects.clear',
      path: absolutePath,
      segmentsDeleted: deletedCount,
      removedFromWatchList: removedFromList,
    });
  },

  stats: async (flags, projectPath) => {
    if (!projectPath) {
      const err = new Error('Missing project path. Usage: node projects.js stats <path>');
      err.code = 'MISSING_PATH';
      throw err;
    }

    const absolutePath = path.resolve(projectPath);
    const stats = await getProjectStats(absolutePath);

    printJson({
      ok: true,
      action: 'projects.stats',
      path: absolutePath,
      stats: {
        fileCount: parseInt(stats.file_count, 10),
        segmentCount: parseInt(stats.segment_count, 10),
        lastUpdated: stats.last_updated,
      },
    });
  },

  help: async () => {
    printJson({
      ok: true,
      commands: {
        'add <path>': 'Add a project to the watch list',
        'remove <path>': 'Remove a project from the watch list (keeps data)',
        'list': 'List all watched projects with stats',
        'reindex <path>': 'Clear and reindex a project',
        'clear <path>': 'Remove project data from database and watch list',
        'stats <path>': 'Show indexing statistics for a project',
      },
    });
  },
};

async function main() {
  const {positional, flags} = parseArgs(process.argv.slice(2));
  const command = positional[0];
  const projectPath = positional[1];

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

  await handler(flags, projectPath);
}

main().catch(fail);
