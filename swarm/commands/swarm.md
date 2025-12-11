---
description: Orchestrate parallel agent workflows for complex multi-step tasks with wave-based execution, automatic auditing, and model escalation
arguments:
  - name: input
    description: Task description, plan file path, or "resume [from X]"
    required: false
allowed-tools:
  - Task
  - AgentOutputTool
  - Read(.swarm/**)
  - Write(.swarm/**)
  - Edit(.swarm/**)
  - Glob(.swarm/**)
  - TodoWrite
  - AskUserQuestion
---

# /swarm Command

Execute a swarm workflow - parallel agents working through a dependency-mapped plan.

## Input: $ARGUMENTS

## Modes

### Standard Mode (default)
Full workflow: Plan Discovery → Architect → Plan → User Checkpoints → Workers → Audits

### Ad-hoc Mode (skip plan)
Quick subagentic tasks without formal planning. Use when:
- Task is small and well-defined
- No dependencies between subtasks
- User wants fast turnaround

**Trigger**: Input contains `--adhoc` flag OR user explicitly asks to skip planning

**Ad-hoc Flow**:
1. Parse task description
2. Discuss with user - clarify scope, break into 1-3 subtasks
3. Present proposed agents: "I'll spawn {N} agents for: {task1}, {task2}..."
4. **WAIT for explicit user confirmation** before spawning ANY agents
5. Only after user says "go/yes/proceed" → spawn workers (background)
6. Poll and report results
7. No plan file created, no audits (unless requested)

**CRITICAL**: In ad-hoc mode, NEVER spawn agents without user's explicit "yes/go/proceed" confirmation.

## Protocol

**MANDATORY FIRST STEP**: You MUST read the orchestrator protocol before doing ANYTHING:
```
Read(".claude/skills/swarm/references/orchestrator-protocol.md")
```

**CRITICAL**: Orchestrator does COORDINATION ONLY. You cannot read source files or run commands.
- Spawn Architect agent with task description - Architect explores in their context
- Spawn Worker agents for implementation - Workers read/edit files in their context
- You only manage `.swarm/` plan files and spawn agents
- Your allowed tools are: Task, Read/Write/Edit(.swarm/**), Glob(.swarm/**), TodoWrite, AskUserQuestion

### Quick Reference

1. **Plan Discovery (MANDATORY before creating new plan)**:
   - `Glob(".swarm/*-inprogress.md")` + `Glob(".swarm/*-paused.md")`
   - Review filenames - do any match the new task?
   - If match found → ask user: resume existing or create new?
   - Only create new plan if no matches or user confirms

2. **Parse input**:
   - If description provided → run Plan Discovery first, then spawn Architect if needed
   - If file path (`.swarm/*.md`) → load existing plan
   - If "resume" → find and continue from incomplete work
   - If empty → ask user or infer from context

2. **Respect current mode**:
   - Plan mode → generate plan only, no execution
   - Auto-edit → execute with minimal pauses
   - Default → wave-by-wave checkpoints

3. **Execution flow (with background agents)**:
   ```
   Architect creates plan (run_in_background: true)
        ↓ AgentOutputTool(block: true) to wait for plan
   User confirms checkpoints
        ↓
   For each wave:
     → SPAWN Workers (run_in_background: true, get agentIds)
     → POLL with AgentOutputTool(block: false) for results
     → Process completed tasks incrementally
     → SPAWN Auditors (background)
     → POLL for audit results
     → Fix trivial issues
     → Checkpoint if scheduled
        ↓
   Complete
   ```

4. **Key rules**:
   - **ALL agents spawn with run_in_background: true**
   - Use `AgentOutputTool(block: false)` for polling
   - Use `AgentOutputTool(block: true)` when you must wait
   - Process results incrementally (don't wait for all)
   - Track agentIds mapped to task IDs
   - Only orchestrator writes to plan file
   - Model escalation: haiku → opus → opus-ultrathink

## Examples

```bash
# New swarm from description (standard mode)
/swarm Refactor auth to use new token service

# New swarm from existing plan
/swarm .swarm/auth-refactor.md

# Resume interrupted swarm
/swarm resume

# Resume from specific point
/swarm resume from wave 3

# Resume from specific task
/swarm resume from task 2.3

# Ad-hoc mode - quick tasks, no plan file
/swarm --adhoc Fix typos in 3 config files
/swarm --adhoc Update imports in services folder
/swarm --adhoc Add missing JSDoc headers to new files
```

### Ad-hoc Example Flow:

```
User: /swarm --adhoc rename Button to PrimaryButton in portal components
Orchestrator: "I'll search portal components and spawn agents for each file with Button.
              Proposed: 3 agents for portal/button.tsx, portal/card.tsx, portal/form.tsx
              Proceed? (yes/no)"
User: yes
Orchestrator: [spawns 3 haiku workers in background, polls, reports results]
```

## Plan Location & Naming

Plans are stored in `.swarm/{descriptive-task-summary}-{status}.md`

**Naming convention**:
- `{descriptive-task-summary}` = 10-20 words in kebab-case describing the task
- `{status}` = `inprogress` | `paused` | `completed`

**Examples**:
```
.swarm/check-and-fix-jsdoc-headers-on-staged-unstaged-typescript-files-inprogress.md
.swarm/refactor-auth-service-to-use-new-token-validation-pattern-paused.md
.swarm/add-recharts-dashboard-to-admin-panel-with-weekly-statistics-completed.md
```

**Why this format**:
- Descriptive names → know what plan does without opening
- Status suffix → `Glob("*-inprogress.md")` filters active plans instantly
- Completed plans ignored when searching for duplicates

## Skill Reference

For detailed protocols, see skill: `swarm`
- [orchestrator-protocol.md](../.claude/skills/swarm/references/orchestrator-protocol.md)
- [architect-protocol.md](../.claude/skills/swarm/references/architect-protocol.md)
- [worker-protocol.md](../.claude/skills/swarm/references/worker-protocol.md)
- [auditor-protocol.md](../.claude/skills/swarm/references/auditor-protocol.md)
- [plan-format.md](../.claude/skills/swarm/references/plan-format.md)
- [escalation-rules.md](../.claude/skills/swarm/references/escalation-rules.md)

## Now Execute

**Step 0 (MANDATORY)**: Read the orchestrator protocol FIRST:
```
Read(".claude/skills/swarm/references/orchestrator-protocol.md")
```

Then proceed:

1. If input is empty, ask: "What task would you like to swarm? Or provide a path to an existing plan file."

2. **If input contains `--adhoc` flag (AD-HOC MODE)**:
   a. Skip plan discovery entirely
   b. Parse task description (remove `--adhoc` flag)
   c. Discuss with user: clarify scope, identify subtasks (1-3 typically)
   d. Present proposal: "I'll spawn {N} agents for: {subtask1}, {subtask2}..."
   e. **MANDATORY**: Use AskUserQuestion to get explicit confirmation
   f. **ONLY after user confirms** → spawn workers with `run_in_background: true`
   g. Poll with AgentOutputTool, report results
   h. No plan file, no audits (unless user requests)

3. **If input is a description (STANDARD MODE - PLAN DISCOVERY FIRST)**:
   a. Run `Glob(".swarm/*-inprogress.md")` and `Glob(".swarm/*-paused.md")`
   b. Review filenames - does any match the task description?
   c. If potential match found → AskUserQuestion: "Found existing plan: {filename}. Resume it or create new?"
   d. If user says resume → load that plan
   e. If no match OR user says create new → spawn **Architect agent** (swarm-worker-opus) to:
      - Assess current state (run tsc, read files, etc.) in THEIR context
      - Create the plan with descriptive filename: `.swarm/{10-20-word-summary}-inprogress.md`
      - Return brief summary to you

4. If input starts with "resume", use `Glob(".swarm/*-inprogress.md")` + `Glob(".swarm/*-paused.md")` to find active plans, then load and check state.

5. If input is a file path, load that plan with `Read(".swarm/...")` and check its state.

6. **When plan completes**: Rename file from `-inprogress.md` to `-completed.md`

**REMEMBER**: You can ONLY read `.swarm/` files. All source file access happens in worker contexts.

After loading/creating the plan, follow the orchestrator protocol.
