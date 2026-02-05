#!/usr/bin/env node
'use strict';

/**
 * Semantic search CLI
 */

const path = require('path');
const {parseArgs, printJson, fail, requireFlags} = require('./lib/utils');
const {generateQueryEmbedding} = require('./lib/embeddings');
const {searchSimilar, checkHealth} = require('./lib/db');

async function search(flags) {
  const projectPath = flags.project || flags.p || process.cwd();
  const projectRoot = path.resolve(projectPath);
  const query = flags.query || flags.q;
  const limit = parseInt(flags.limit || flags.l || '10', 10);
  const threshold = parseFloat(flags.threshold || flags.t || '0.7');

  if (!query) {
    const err = new Error('Missing --query or -q');
    err.code = 'MISSING_QUERY';
    throw err;
  }

  // Check DB
  if (!(await checkHealth())) {
    const err = new Error('Database not available. Ensure Docker is running: node setup.js docker-up');
    err.code = 'DB_UNAVAILABLE';
    throw err;
  }

  // Generate query embedding
  const queryEmbedding = await generateQueryEmbedding(query);

  // Search
  const results = await searchSimilar(projectRoot, queryEmbedding, limit, threshold);

  // Format output for Claude Code consumption
  const formatted = results.map((r) => ({
    file_path: r.file_path,
    file_name: r.file_name,
    start_line: r.start_line,
    end_line: r.end_line,
    similarity: Math.round(r.similarity * 100) / 100,
    symbol_name: r.symbol_name,
    node_type: r.node_type,
    preview: r.content.slice(0, 200) + (r.content.length > 200 ? '...' : ''),
  }));

  printJson({
    ok: true,
    query,
    project_root: projectRoot,
    result_count: formatted.length,
    results: formatted,
  });
}

async function main() {
  const {positional, flags} = parseArgs(process.argv.slice(2));

  if (positional[0] === 'help' || flags.help) {
    printJson({
      ok: true,
      usage: {
        search: 'node search.js --query "find user authentication" [--project <path>] [--limit 10] [--threshold 0.7]',
      },
      flags: {
        '--query, -q': 'Search query (required)',
        '--project, -p': 'Project path (default: current directory)',
        '--limit, -l': 'Maximum results (default: 10)',
        '--threshold, -t': 'Minimum similarity score 0-1 (default: 0.7)',
      },
    });
    return;
  }

  await search(flags);
}

main().catch(fail);
