'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Lazy-load tree-sitter to avoid startup cost when not needed
let Parser = null;
let languageCache = {};

// Language extension mappings
const LANGUAGE_MAP = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.go': 'go',
};

// Supported file extensions for indexing
const CODE_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.kt',
  '.c', '.cpp', '.h', '.hpp', '.cs',
  '.vue', '.svelte', '.astro',
  '.sql', '.graphql', '.gql',
  '.sh', '.bash', '.zsh',
  '.yaml', '.yml', '.json', '.toml',
  '.md', '.mdx', '.txt',
  '.css', '.scss', '.sass', '.less',
  '.html', '.xml',
]);

// Node types to extract per language
const EXTRACTABLE_NODES = {
  typescript: [
    'function_declaration',
    'class_declaration',
    'method_definition',
    'arrow_function',
    'interface_declaration',
    'type_alias_declaration',
    'enum_declaration',
  ],
  javascript: [
    'function_declaration',
    'class_declaration',
    'method_definition',
    'arrow_function',
  ],
  python: [
    'function_definition',
    'class_definition',
  ],
  go: [
    'function_declaration',
    'method_declaration',
    'type_declaration',
  ],
};

const MAX_CHUNK_LINES = 100;
const MIN_CHUNK_LINES = 5;
const OVERLAP_LINES = 5;

function isCodeFile(filePath) {
  return CODE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function getLanguage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return LANGUAGE_MAP[ext] || null;
}

function loadParser() {
  if (!Parser) {
    Parser = require('tree-sitter');
  }
  return Parser;
}

function loadLanguageGrammar(language) {
  if (languageCache[language]) {
    return languageCache[language];
  }

  try {
    let grammar;
    switch (language) {
      case 'typescript':
        grammar = require('tree-sitter-typescript').typescript;
        break;
      case 'javascript':
        grammar = require('tree-sitter-javascript');
        break;
      case 'python':
        grammar = require('tree-sitter-python');
        break;
      case 'go':
        grammar = require('tree-sitter-go');
        break;
      default:
        return null;
    }
    languageCache[language] = grammar;
    return grammar;
  } catch {
    return null;
  }
}

function getSymbolName(node, language) {
  // Try to extract a meaningful name from the node
  const nameNode =
    node.childForFieldName('name') ||
    node.children.find((c) => c.type === 'identifier' || c.type === 'property_identifier');

  if (nameNode) {
    return nameNode.text;
  }

  // For arrow functions, try to get the variable name
  if (node.type === 'arrow_function') {
    const parent = node.parent;
    if (parent && parent.type === 'variable_declarator') {
      const nameChild = parent.childForFieldName('name');
      if (nameChild) return nameChild.text;
    }
  }

  return null;
}

function extractSymbols(filePath, content, language) {
  const TreeSitter = loadParser();
  const grammar = loadLanguageGrammar(language);

  if (!grammar) {
    return null; // Fall back to line-based chunking
  }

  const parser = new TreeSitter();
  parser.setLanguage(grammar);

  let tree;
  try {
    tree = parser.parse(content);
  } catch {
    return null; // Parse error, fall back to line-based
  }

  const extractableTypes = new Set(EXTRACTABLE_NODES[language] || []);
  const symbols = [];
  const lines = content.split('\n');

  function walk(node, depth = 0) {
    // Only extract top-level or class-level symbols
    if (extractableTypes.has(node.type) && depth <= 2) {
      const startLine = node.startPosition.row + 1; // 1-indexed
      const endLine = node.endPosition.row + 1;
      const symbolContent = lines.slice(startLine - 1, endLine).join('\n');

      // Skip very small snippets
      if (endLine - startLine >= MIN_CHUNK_LINES || symbolContent.length >= 100) {
        symbols.push({
          filePath,
          fileName: path.basename(filePath),
          content: symbolContent,
          startLine,
          endLine,
          symbolName: getSymbolName(node, language),
          nodeType: node.type,
          contentHash: hashContent(symbolContent),
        });
      }
    }

    for (const child of node.children) {
      walk(child, depth + 1);
    }
  }

  walk(tree.rootNode);
  return symbols.length > 0 ? symbols : null;
}

function chunkFileByLines(filePath, content) {
  const lines = content.split('\n');
  const chunks = [];
  const fileName = path.basename(filePath);

  if (lines.length <= MAX_CHUNK_LINES) {
    // Small file - single chunk
    chunks.push({
      filePath,
      fileName,
      content,
      startLine: 1,
      endLine: lines.length,
      nodeType: 'file',
      symbolName: null,
      contentHash: hashContent(content),
    });
    return chunks;
  }

  // Large file - sliding window with overlap
  let startLine = 0;
  while (startLine < lines.length) {
    const endLine = Math.min(startLine + MAX_CHUNK_LINES, lines.length);
    const chunkLines = lines.slice(startLine, endLine);
    const chunkContent = chunkLines.join('\n');

    chunks.push({
      filePath,
      fileName,
      content: chunkContent,
      startLine: startLine + 1, // 1-indexed
      endLine,
      nodeType: 'block',
      symbolName: null,
      contentHash: hashContent(chunkContent),
    });

    startLine = endLine - OVERLAP_LINES;
    if (endLine === lines.length) break;
  }

  return chunks;
}

function chunkFile(filePath, content) {
  const language = getLanguage(filePath);

  if (language) {
    const symbols = extractSymbols(filePath, content, language);
    if (symbols && symbols.length > 0) {
      return symbols;
    }
  }

  // Fall back to line-based chunking
  return chunkFileByLines(filePath, content);
}

async function readAndChunkFile(absolutePath, projectRoot) {
  const relativePath = path.relative(projectRoot, absolutePath).replace(/\\/g, '/');
  const content = fs.readFileSync(absolutePath, 'utf8');

  if (!content.trim()) {
    return []; // Skip empty files
  }

  return chunkFile(relativePath, content);
}

module.exports = {
  isCodeFile,
  hashContent,
  chunkFile,
  chunkFileByLines,
  readAndChunkFile,
  getLanguage,
  CODE_EXTENSIONS,
  LANGUAGE_MAP,
};
