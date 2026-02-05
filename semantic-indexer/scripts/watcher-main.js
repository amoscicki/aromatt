#!/usr/bin/env node
'use strict';

/**
 * Internal watcher process - spawned by daemon.js
 * Watches all projects in projects.json and indexes files using Tree-sitter
 */

const fs = require('fs');
const path = require('path');
const {loadGitignore} = require('./lib/gitignore');
const {isCodeFile, readAndChunkFile} = require('./lib/chunker');
const {generateEmbedding} = require('./lib/embeddings');
const {upsertSegment, deleteFileSegments, checkHealth, closePool, checkSegmentExists} = require('./lib/db');
const {readJson, writeJson, ensureDir} = require('./lib/utils');
const {INDEXER_DIR} = require('./lib/auth');

const PROJECTS_PATH = path.join(INDEXER_DIR, 'projects.json');
const LOG_PATH = path.join(INDEXER_DIR, 'daemon.log');

let watchers = new Map(); // projectRoot -> watcher
let gitignoreMatchers = new Map(); // projectRoot -> matcher
let debounceTimers = new Map(); // filePath -> timer
let processing = new Set(); // files currently being processed

const DEBOUNCE_MS = 500;
const RATE_LIMIT_MS = 100;

function log(level, message, data = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...data,
  };
  const line = JSON.stringify(entry);
  // Only use console - daemon redirects stdout/stderr to log file
  if (level === 'error') {
    console.error(line);
  } else {
    console.log(line);
  }
}

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

async function processFile(projectRoot, absolutePath, eventType) {
  const relativePath = path.relative(projectRoot, absolutePath).replace(/\\/g, '/');

  // Prevent concurrent processing of same file
  if (processing.has(absolutePath)) return;
  processing.add(absolutePath);

  try {
    if (!fs.existsSync(absolutePath)) {
      // File deleted
      const count = await deleteFileSegments(projectRoot, relativePath);
      log('info', 'File deleted', {project: projectRoot, file: relativePath, segmentsRemoved: count});
      return;
    }

    // Read and chunk
    const chunks = await readAndChunkFile(absolutePath, projectRoot);

    if (chunks.length === 0) {
      await deleteFileSegments(projectRoot, relativePath);
      return;
    }

    let indexed = 0;
    let skipped = 0;

    // Generate embeddings and upsert
    for (const chunk of chunks) {
      // Check if segment already exists with same hash (deduplication)
      const exists = await checkSegmentExists(
        projectRoot,
        chunk.filePath,
        chunk.startLine,
        chunk.endLine,
        chunk.contentHash
      );

      if (exists) {
        skipped++;
        continue;
      }

      const embedding = await generateEmbedding(chunk.content);

      await upsertSegment({
        projectRoot,
        filePath: chunk.filePath,
        fileName: chunk.fileName,
        content: chunk.content,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        symbolName: chunk.symbolName,
        nodeType: chunk.nodeType,
        contentHash: chunk.contentHash,
        embedding,
      });

      indexed++;

      // Rate limiting
      await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
    }

    if (indexed > 0 || skipped > 0) {
      log('info', 'File indexed', {
        project: projectRoot,
        file: relativePath,
        chunks: chunks.length,
        indexed,
        skipped,
      });
    }
  } catch (err) {
    log('error', 'Error processing file', {
      project: projectRoot,
      file: relativePath,
      error: err.message,
    });
  } finally {
    processing.delete(absolutePath);
  }
}

function handleFileChange(projectRoot, absolutePath, eventType) {
  const relativePath = path.relative(projectRoot, absolutePath).replace(/\\/g, '/');
  const matcher = gitignoreMatchers.get(projectRoot);

  // Check gitignore
  if (matcher && matcher(relativePath)) return;

  // Check if code file
  if (!isCodeFile(relativePath)) return;

  // Debounce rapid changes
  if (debounceTimers.has(absolutePath)) {
    clearTimeout(debounceTimers.get(absolutePath));
  }

  debounceTimers.set(
    absolutePath,
    setTimeout(async () => {
      debounceTimers.delete(absolutePath);
      await processFile(projectRoot, absolutePath, eventType);
    }, DEBOUNCE_MS)
  );
}

async function scanDirectory(projectRoot, dir) {
  const matcher = gitignoreMatchers.get(projectRoot);
  let fileCount = 0;

  const entries = fs.readdirSync(dir, {withFileTypes: true});

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(projectRoot, fullPath).replace(/\\/g, '/');

    if (matcher && matcher(relativePath)) continue;

    if (entry.isDirectory()) {
      fileCount += await scanDirectory(projectRoot, fullPath);
    } else if (entry.isFile() && isCodeFile(entry.name)) {
      await processFile(projectRoot, fullPath, 'initial');
      fileCount++;
    }
  }

  return fileCount;
}

function watchProject(projectRoot) {
  if (watchers.has(projectRoot)) return;

  if (!fs.existsSync(projectRoot)) {
    log('warn', 'Project directory does not exist', {project: projectRoot});
    return;
  }

  // Load gitignore
  gitignoreMatchers.set(projectRoot, loadGitignore(projectRoot));

  // Watch for changes
  const watcher = fs.watch(projectRoot, {recursive: true}, (eventType, filename) => {
    if (!filename) return;
    const fullPath = path.join(projectRoot, filename);
    handleFileChange(projectRoot, fullPath, eventType);
  });

  watchers.set(projectRoot, watcher);
  log('info', 'Started watching project', {project: projectRoot});
}

function unwatchProject(projectRoot) {
  const watcher = watchers.get(projectRoot);
  if (watcher) {
    watcher.close();
    watchers.delete(projectRoot);
    gitignoreMatchers.delete(projectRoot);
    log('info', 'Stopped watching project', {project: projectRoot});
  }
}

async function reloadProjects() {
  const projects = loadProjects();
  const currentRoots = new Set(watchers.keys());
  const newRoots = new Set(projects.map((p) => p.path));

  // Stop watching removed projects
  for (const root of currentRoots) {
    if (!newRoots.has(root)) {
      unwatchProject(root);
    }
  }

  // Start watching new projects
  for (const project of projects) {
    if (!currentRoots.has(project.path)) {
      watchProject(project.path);
    }
  }
}

async function initialScan() {
  const projects = loadProjects();

  for (const project of projects) {
    if (!fs.existsSync(project.path)) {
      log('warn', 'Skipping non-existent project', {project: project.path});
      continue;
    }

    // Load gitignore BEFORE scanning
    gitignoreMatchers.set(project.path, loadGitignore(project.path));

    log('info', 'Starting initial scan', {project: project.path});
    const fileCount = await scanDirectory(project.path, project.path);

    // Update project stats
    project.lastIndexed = new Date().toISOString();
    project.fileCount = fileCount;

    log('info', 'Initial scan complete', {project: project.path, fileCount});
  }

  saveProjects(projects);
}

async function main() {
  ensureDir(INDEXER_DIR);

  log('info', 'Watcher starting (Node.js + Tree-sitter)');

  // Check DB connection
  if (!(await checkHealth())) {
    log('error', 'Database not available. Run: node setup.js docker-up');
    process.exit(1);
  }

  log('info', 'Database connected');

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    log('info', 'Received SIGTERM, shutting down');
    for (const root of watchers.keys()) {
      unwatchProject(root);
    }
    await closePool();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    log('info', 'Received SIGINT, shutting down');
    for (const root of watchers.keys()) {
      unwatchProject(root);
    }
    await closePool();
    process.exit(0);
  });

  // Initial scan
  await initialScan();

  // Start watching all projects
  const projects = loadProjects();
  for (const project of projects) {
    watchProject(project.path);
  }

  log('info', 'Watcher ready', {projectCount: projects.length});

  // Keep process alive
  setInterval(() => {}, 60000);
}

main().catch((err) => {
  log('error', 'Watcher crashed', {error: err.message, stack: err.stack});
  process.exit(1);
});
