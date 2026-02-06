#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Get target directory from argument (required)
const targetArg = process.argv[2];
if (!targetArg) {
  console.error('Usage: node init.js <project-root-path>');
  process.exit(1);
}
const targetDir = path.resolve(targetArg);

const SKILL_DIR = path.join(targetDir, '.claude/skills/project-knowledge-base');
const SKILL_FILE = path.join(SKILL_DIR, 'SKILL.md');
const REFS_DIR = path.join(SKILL_DIR, 'references');

const SKILL_TEMPLATE = `---
name: project-knowledge-base
description: Project-specific documentation and patterns. Check references below before coding unfamiliar patterns. To add new knowledge, invoke the docs-researcher agent.
---

# Project Knowledge Base

This skill contains researched documentation specific to this project. Entries are added by the \`docs-researcher\` agent.

## References
<!-- Entries added by docs-researcher agent -->

To add new knowledge, invoke the \`docs-researcher\` agent with: \`<technology> <topic> for <context>\`
`;

// Check if skill already exists
if (fs.existsSync(SKILL_FILE)) {
  console.log('Skill already exists: ' + SKILL_FILE);
  process.exit(0);
}

// Create directory structure
fs.mkdirSync(REFS_DIR, { recursive: true });

// Write SKILL.md
fs.writeFileSync(SKILL_FILE, SKILL_TEMPLATE);

console.log('Created: ' + SKILL_FILE);
console.log('Created: ' + REFS_DIR);
console.log('Project knowledge base initialized in: ' + targetDir);
