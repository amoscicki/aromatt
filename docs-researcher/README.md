# docs-researcher

A Claude Code plugin that provides a documentation research agent. The agent searches official documentation, filters relevant information for the current task, and saves it to `.claude/knowledge/` as a reusable project-local knowledge base.

## Purpose

This plugin enables Claude to build its own knowledge base for each project. Instead of repeatedly searching for the same documentation, Claude:

1. Checks `.claude/knowledge/` for existing documentation
2. If not found, uses the `docs-researcher` agent to gather information
3. Saves filtered, task-relevant documentation for future sessions

## Installation

Copy the `docs-researcher` folder to your Claude Code plugins directory, or reference it in your dotfiles setup.

## Project Setup

To enable the knowledge-building workflow in a project, add this to your project's `CLAUDE.md`:

```markdown
## Documentation Protocol

This project uses a local knowledge base in `.claude/knowledge/`.

### Workflow

1. When encountering unfamiliar technology or needing documentation:
   - First check `.claude/knowledge/` for existing documentation
   - Use `glob .claude/knowledge/{technology}-*.md` to find relevant files

2. If documentation is not found or incomplete:
   - Use the `docs-researcher` agent to gather information
   - Provide: technology name, specific topic, and current context

3. The agent will:
   - Research official documentation and trusted sources
   - Filter only information relevant to the current task
   - Save to `.claude/knowledge/{technology}-{topic}.md`

### Knowledge Files

Files in `.claude/knowledge/` follow this format:
- YAML frontmatter with topic, technology, version, sources, date, context
- Markdown body with summary, key concepts, code examples, pitfalls

### Technologies in This Project

- {List your project's main technologies here}
- {e.g., React 18, Next.js 14, Prisma, Effect}
```

## Components

### Agent: docs-researcher

Autonomous agent that:
- Validates research requests (technology, topic, context required)
- Checks existing knowledge before researching
- Uses WebSearch/WebFetch for documentation
- Filters results for relevance
- Saves to standardized knowledge format

**Model**: Haiku (fast, cost-effective for research tasks)

### Skill: research-methodology

Provides the agent with:
- WebSearch query patterns for different technology domains
- Source prioritization (official docs first)
- Filtering criteria
- Document template and formatting rules

## Knowledge File Format

Files are saved as `.claude/knowledge/{technology}-{topic}.md`:

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

## Directory Structure

```
docs-researcher/
├── .claude-plugin/
│   └── plugin.json
├── agents/
│   └── docs-researcher.md
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
