'use strict';

const {Pool} = require('pg');
const path = require('path');
const fs = require('fs');
const {readJson} = require('./utils');
const {INDEXER_DIR} = require('./auth');

const CONFIG_PATH = path.join(INDEXER_DIR, 'config.json');

let pool = null;

function getConfig() {
  const defaults = {
    host: 'localhost',
    port: 5433,
    database: 'codebase_index',
    user: 'indexer',
    password: 'indexer_dev',
  };

  // Try config file
  if (fs.existsSync(CONFIG_PATH)) {
    const config = readJson(CONFIG_PATH);
    return {...defaults, ...config};
  }

  // Try environment variables
  return {
    host: process.env.PGVECTOR_HOST || defaults.host,
    port: parseInt(process.env.PGVECTOR_PORT || String(defaults.port), 10),
    database: process.env.PGVECTOR_DB || defaults.database,
    user: process.env.PGVECTOR_USER || defaults.user,
    password: process.env.PGVECTOR_PASSWORD || defaults.password,
  };
}

function getPool() {
  if (!pool) {
    const config = getConfig();
    pool = new Pool(config);
  }
  return pool;
}

async function checkHealth() {
  const p = getPool();
  try {
    await p.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

async function upsertSegment(segment) {
  const p = getPool();
  const {
    projectRoot,
    filePath,
    fileName,
    content,
    startLine,
    endLine,
    symbolName,
    nodeType,
    contentHash,
    embedding,
  } = segment;

  // Format embedding as pgvector literal
  const embeddingLiteral = `[${embedding.join(',')}]`;

  const query = `
    INSERT INTO codebase_segments
      (project_root, file_path, file_name, content, start_line, end_line,
       symbol_name, node_type, content_hash, embedding, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::vector, NOW())
    ON CONFLICT (project_root, file_path, start_line, end_line)
    DO UPDATE SET
      content = EXCLUDED.content,
      file_name = EXCLUDED.file_name,
      symbol_name = EXCLUDED.symbol_name,
      node_type = EXCLUDED.node_type,
      content_hash = EXCLUDED.content_hash,
      embedding = EXCLUDED.embedding,
      updated_at = NOW()
    WHERE codebase_segments.content_hash != EXCLUDED.content_hash
    RETURNING id, (xmax = 0) as inserted
  `;

  const result = await p.query(query, [
    projectRoot,
    filePath,
    fileName,
    content,
    startLine,
    endLine,
    symbolName,
    nodeType,
    contentHash,
    embeddingLiteral,
  ]);

  return result.rows[0] || null;
}

async function searchSimilar(projectRoot, queryEmbedding, limit = 10, threshold = 0.7) {
  const p = getPool();
  const embeddingLiteral = `[${queryEmbedding.join(',')}]`;

  const query = `
    SELECT
      file_path,
      file_name,
      content,
      start_line,
      end_line,
      symbol_name,
      node_type,
      1 - (embedding <=> $2::vector) as similarity
    FROM codebase_segments
    WHERE project_root = $1
      AND 1 - (embedding <=> $2::vector) >= $3
    ORDER BY embedding <=> $2::vector
    LIMIT $4
  `;

  const result = await p.query(query, [projectRoot, embeddingLiteral, threshold, limit]);
  return result.rows;
}

async function deleteFileSegments(projectRoot, filePath) {
  const p = getPool();
  const result = await p.query(
    'DELETE FROM codebase_segments WHERE project_root = $1 AND file_path = $2',
    [projectRoot, filePath]
  );
  return result.rowCount;
}

async function deleteProjectSegments(projectRoot) {
  const p = getPool();
  const result = await p.query(
    'DELETE FROM codebase_segments WHERE project_root = $1',
    [projectRoot]
  );
  return result.rowCount;
}

async function getProjectStats(projectRoot) {
  const p = getPool();
  const result = await p.query(
    `SELECT
      COUNT(DISTINCT file_path) as file_count,
      COUNT(*) as segment_count,
      MAX(updated_at) as last_updated
    FROM codebase_segments
    WHERE project_root = $1`,
    [projectRoot]
  );
  return result.rows[0];
}

async function checkSegmentExists(projectRoot, filePath, startLine, endLine, contentHash) {
  const p = getPool();
  const result = await p.query(
    `SELECT id FROM codebase_segments
     WHERE project_root = $1 AND file_path = $2 AND start_line = $3 AND end_line = $4 AND content_hash = $5`,
    [projectRoot, filePath, startLine, endLine, contentHash]
  );
  return result.rows.length > 0;
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  getPool,
  getConfig,
  checkHealth,
  upsertSegment,
  searchSimilar,
  deleteFileSegments,
  deleteProjectSegments,
  getProjectStats,
  checkSegmentExists,
  closePool,
  CONFIG_PATH,
};
