---
name: docs-researcher
description: Initialize project knowledge base or research documentation. Use "init" to setup, or provide a research topic.
argument-hint: "init | <technology> <topic> for <context>"
allowed-tools: Bash, Task
---

# Documentation Researcher Skill

## Mode 1: Initialize (`init`)

When argument is `init`, run the initialization script:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/init.js .
```

This creates:
- `.claude/skills/project-knowledge-base/SKILL.md`
- `.claude/skills/project-knowledge-base/references/` directory

**Example:**
```
User: /docs-researcher init
Action: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/init.js .)
Response: Report what was created
```

## Mode 2: Research

When argument contains a research request (not "init"), invoke the `docs-researcher` agent.

```
Task(
  subagent_type: "docs-researcher", 
  description: "Research documentation",
  prompt: "{user's research request}"
)
```

**Example:**
```
User: /docs-researcher TanStack Router beforeLoad for authentication guards
Action: Task(subagent_type: "docs-researcher", prompt: "TanStack Router beforeLoad for authentication guards")
Response: Agent's research results
```
