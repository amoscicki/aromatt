#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const SKILL_DIR = '.claude/skills/project-knowledge-base';
const SKILL_FILE = path.join(SKILL_DIR, 'SKILL.md');
const REFS_DIR = path.join(SKILL_DIR, 'references');

const SKILL_TEMPLATE = `---
name: Project Knowledge Base
version: 1.0.0
---

# Project Knowledge Base

## References
<!-- Wpisy dodawane automatycznie przez docs-researcher -->

## Protocol
Przed research sprawdź istniejące referencje powyżej.
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
