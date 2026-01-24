# docs-researcher

A Claude Code plugin that provides a documentation research agent. The agent searches official documentation, filters relevant information for the current task, and saves it to `.claude/skills/project-knowledge-base/` as a reusable project-local knowledge base skill.

## Purpose

This plugin enables Claude to build its own knowledge base for each project. Instead of repeatedly searching for the same documentation, Claude:

1. Initializes the project knowledge base skill (if not exists)
2. Checks `.claude/skills/project-knowledge-base/references/` for existing documentation
3. If not found, uses the `docs-researcher` agent to gather information
4. Saves filtered, task-relevant documentation for future sessions
5. Updates the skill index for easy discovery

## Installation

Copy the `docs-researcher` folder to your Claude Code plugins directory, or reference it in your dotfiles setup.

## How It Works

### Automatic Initialization

When `docs-researcher` runs in a new project, it automatically:

1. Creates `.claude/skills/project-knowledge-base/` structure
2. Initializes `SKILL.md` with references index
3. Creates `references/` directory for documentation
4. Optionally adds knowledge base section to project's `CLAUDE.md`
5. Migrates any existing `.claude/knowledge/` files (legacy format)

### Knowledge Base Skill

The skill created in each project provides:

```
{project}/
└── .claude/
    └── skills/
        └── project-knowledge-base/
            ├── SKILL.md           # Index with all references
            └── references/
                ├── react-hooks.md
                ├── tanstack-router/    # Tree for large topics (>500 lines)
                │   ├── _index.md
                │   └── route-guards.md
                └── ...
```

## Project Setup

To enable the knowledge-building workflow in a project, add this to your project's `CLAUDE.md`:

```markdown
## Knowledge Base

Ten projekt używa `.claude/skills/project-knowledge-base/`.
Przed kodowaniem zapoznaj się ze skillem.
```

The agent will add this section automatically if it doesn't exist.

## Components

### Agent: docs-researcher

Autonomous agent that:
- Initializes project knowledge base skill (Step 0)
- Validates research requests (technology, topic, context required)
- Checks existing references before researching
- Uses WebSearch/WebFetch for documentation
- Filters results for relevance
- Saves to standardized knowledge format
- Updates SKILL.md index
- Applies progressive disclosure for large documents (>500 lines)

**Model**: Haiku (fast, cost-effective for research tasks)

### Skill: research-methodology

Provides the agent with:
- WebSearch query patterns for different technology domains
- Source prioritization (official docs first)
- Filtering criteria
- Document template and formatting rules
- Progressive disclosure guidelines

### Script: init.js

Node.js script that creates the knowledge base skill structure:
- Creates `.claude/skills/project-knowledge-base/`
- Initializes `SKILL.md` with base template
- Creates `references/` directory

## Knowledge File Format

Files are saved as `.claude/skills/project-knowledge-base/references/{technology}-{topic}.md`:

```yaml
---
topic: "React useEffect Cleanup for Subscriptions"
technology: "react"
version: "18.x"
sources:
  - https://react.dev/reference/react/useEffect
created: 2025-01-15
context: "Memory leak in subscription component"
---
```

## Progressive Disclosure

When a reference exceeds 500 lines, it's automatically split into a tree:

```
references/tanstack-router.md  (>500 lines)
↓ split to
references/tanstack-router/
├── _index.md        # Overview + TOC
├── route-guards.md
├── data-loading.md
└── navigation.md
```

## Migration

Projects with the legacy `.claude/knowledge/` format are automatically migrated:

1. Agent detects existing `.claude/knowledge/*.md` files
2. Copies each file to `.claude/skills/project-knowledge-base/references/`
3. Adds entries to SKILL.md index
4. **Does NOT delete originals** - user verifies and removes manually

## Directory Structure

```
docs-researcher/
├── .claude-plugin/
│   └── plugin.json
├── agents/
│   └── docs-researcher.md
├── scripts/
│   └── init.js
├── skills/
│   └── research-methodology/
│       ├── SKILL.md
│       └── references/
│           ├── query-patterns.md
│           └── document-template.md
└── README.md
```

## License

MIT
