'use strict';

const fs = require('fs');
const path = require('path');

// Default patterns always excluded
const DEFAULT_EXCLUDES = [
  'node_modules/',
  '.git/',
  'dist/',
  'build/',
  '.next/',
  '__pycache__/',
  '*.pyc',
  '.env',
  '.env.*',
  '*.log',
  '*.lock',
  'package-lock.json',
  'yarn.lock',
  'bun.lock',
  'pnpm-lock.yaml',
  '.DS_Store',
  'Thumbs.db',
  '*.min.js',
  '*.min.css',
  '*.map',
  '.swarm/',
  '.claude/',
  '.semantic-indexer/',
  'coverage/',
  '.nyc_output/',
  '.cache/',
  'vendor/',
  '.venv/',
  'venv/',
  '.idea/',
  '.vscode/',
  '*.exe',
  '*.dll',
  '*.so',
  '*.dylib',
  '*.png',
  '*.jpg',
  '*.jpeg',
  '*.gif',
  '*.ico',
  '*.svg',
  '*.woff',
  '*.woff2',
  '*.ttf',
  '*.eot',
  '*.pdf',
  '*.zip',
  '*.tar',
  '*.gz',
];

function createMatcher(patterns) {
  const compiled = patterns
    .filter((p) => p && !p.startsWith('#'))
    .map((p) => {
      const negated = p.startsWith('!');
      const pattern = negated ? p.slice(1) : p;

      // Convert gitignore pattern to regex
      let regex = pattern
        .replace(/\./g, '\\.')
        .replace(/\*\*/g, '{{GLOBSTAR}}')
        .replace(/\*/g, '[^/]*')
        .replace(/{{GLOBSTAR}}/g, '.*')
        .replace(/\?/g, '.');

      if (pattern.startsWith('/')) {
        regex = '^' + regex.slice(1);
      } else if (!regex.startsWith('.*')) {
        regex = '(^|/)' + regex;
      }

      if (pattern.endsWith('/')) {
        regex = regex.slice(0, -1) + '(/|$)';
      } else {
        regex += '(/|$)?';
      }

      return {re: new RegExp(regex), negated};
    });

  return (filePath) => {
    const normalized = filePath.replace(/\\/g, '/');
    let matched = false;

    for (const {re, negated} of compiled) {
      if (re.test(normalized)) {
        matched = !negated;
      }
    }

    return matched;
  };
}

function loadGitignore(projectRoot) {
  const gitignorePath = path.join(projectRoot, '.gitignore');

  let patterns = [...DEFAULT_EXCLUDES];

  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf8');
    patterns = patterns.concat(
      content
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'))
    );
  }

  return createMatcher(patterns);
}

module.exports = {
  loadGitignore,
  createMatcher,
  DEFAULT_EXCLUDES,
};
