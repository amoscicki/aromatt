---
name: docs-researcher
description: Manage project knowledge base. Use "init" to setup, or provide a topic to research.
argument-hint: "init | <technology> <topic> for <context>"
allowed-tools: Bash, Read, Write, Task
---

# Documentation Researcher Skill

## Mode 1: Initialize (`init`)

When argument is `init`:

1. Run the initialization script:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/init.js .
   ```

2. Check if `CLAUDE.md` exists (at project root):
   - If exists: Read it and append the knowledge base section if not already present
   - If not exists: Create it with the knowledge base section

**Append/create this section in CLAUDE.md:**

```markdown

## Knowledge Base

This project uses `.claude/skills/project-knowledge-base/` for documentation.

**Before coding unfamiliar patterns:**
1. Load the `project-knowledge-base` skill to see available references
2. If topic not covered, use `/docs-researcher <technology> <topic> for <context>`

Always consult the knowledge base when clarification is needed.
```

**Example:**
```
User: /docs-researcher init
Actions:
  1. Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/init.js .)
  2. Read CLAUDE.md (if exists, at project root)
  3. Write updated CLAUDE.md with knowledge base section
Response: Report what was created/updated
```

## Mode 2: Research

When argument is a research request (not "init"), invoke the `docs-researcher` agent.

```
Task(
  subagent_type: "docs-researcher", 
  description: "Research documentation",
  prompt: "{user's research request}"
)
```

Agent will:
- Search the web for documentation
- Fetch and extract relevant content
- Save to `.claude/skills/project-knowledge-base/references/`
- Update the SKILL.md index

**Example:**
```
User: /docs-researcher TanStack Router beforeLoad for authentication guards
Action: Task(subagent_type: "docs-researcher", prompt: "TanStack Router beforeLoad for authentication guards")
Response: Agent's research results
```
