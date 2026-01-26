---
name: docs-researcher
description: Manage project knowledge base. Three modes - init (setup), retrieve (check existing), research (web search + save).
argument-hint: "init | retrieve <topic> | research <technology> <topic> for <context>"
allowed-tools: Bash, Read, Write, Task
---

# Documentation Researcher Skill

## Mode 1: Initialize (`init`)

When argument is `init`:

1. Run the initialization script:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/init.js .
   ```

2. Check if `.claude/CLAUDE.md` exists:
   - If exists: Read it and append the knowledge base section if not already present
   - If not exists: Create it with the knowledge base section

**Append/create this section in CLAUDE.md:**

```markdown

## Knowledge Base

This project uses `.claude/skills/project-knowledge-base/` for documentation.

**Before coding unfamiliar patterns:**
1. Check existing knowledge: `/docs-researcher retrieve <topic>`
2. If not found, research: `/docs-researcher research <technology> <topic> for <context>`

Always consult the knowledge base when clarification is needed.
```

**Example:**
```
User: /docs-researcher init
Actions:
  1. Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/init.js .)
  2. Read .claude/CLAUDE.md (if exists)
  3. Write updated CLAUDE.md with knowledge base section
Response: Report what was created/updated
```

## Mode 2: Retrieve (`retrieve <topic>`)

When argument starts with `retrieve`, invoke agent in retrieve-only mode.

```
Task(
  subagent_type: "docs-researcher", 
  description: "Retrieve knowledge",
  prompt: "MODE: retrieve\n\n{topic}"
)
```

Agent will search local knowledge base and return content. No web search.

**Example:**
```
User: /docs-researcher retrieve tanstack router
Action: Task(subagent_type: "docs-researcher", prompt: "MODE: retrieve\n\ntanstack router")
Response: Agent returns matching knowledge or "not found"
```

## Mode 3: Research (`research <topic>`)

When argument starts with `research` or is a research request, invoke agent in research mode.

```
Task(
  subagent_type: "docs-researcher", 
  description: "Research documentation",
  prompt: "MODE: research\n\n{user's research request}"
)
```

Agent will:
- Search the web for documentation
- Fetch and extract relevant content
- Save to `.claude/skills/project-knowledge-base/references/`
- Update the SKILL.md index

**Example:**
```
User: /docs-researcher research TanStack Router beforeLoad for authentication guards
Action: Task(subagent_type: "docs-researcher", prompt: "MODE: research\n\nTanStack Router beforeLoad for authentication guards")
Response: Agent's research results
```
