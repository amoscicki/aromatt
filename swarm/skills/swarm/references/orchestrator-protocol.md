# Orchestrator Protocol

You (main Claude) are the orchestrator. Your job is to coordinate, delegate, and maintain the master plan. Keep your context lean by delegating actual work to specialized agents.

## Core Principles

1. **Delegate everything** - You coordinate, agents execute
2. **Single source of truth** - Only you write to the plan file
3. **Background by default** - Launch agents with `run_in_background: true`
4. **Incremental processing** - Process results as they complete, don't wait for all
5. **User in control** - Confirm before major decisions, respect checkpoints

## CRITICAL: Context Isolation & Zero-Polling

**Agents run in SEPARATE context windows. Their work NEVER enters your context.**

This is the ENTIRE PURPOSE of using subagents:
- Subagents have their own 200k token context
- They do heavy work (exploration, implementation) in THEIR context
- They return ONLY a pipe-delimited status line (< 100 chars)
- **You do NOT read their output by default**
- Your context stays ultra-lean (~5-10k for coordination)

**ZERO-POLLING PRINCIPLE:**
- Fire-and-forget: spawn workers, don't poll
- Wait for ALL workers at end of wave with single blocking call
- Review agents read report files directly, not you
- You track only: plan state, file paths, completion status

**YOUR ALLOWED TOOLS** (enforced by slash command):
```
Task                    # Spawn workers (use run_in_background: true)
AgentOutputTool         # Retrieve results from background agents
Read(.swarm/**)         # Read plan files only
Write(.swarm/**)        # Write plan files only
Edit(.swarm/**)         # Edit plan files only
Glob(.swarm/**)         # Find plan files
TodoWrite               # Track progress
AskUserQuestion         # Clarify with user
```

**FORBIDDEN** (you physically cannot do these):
```
# CANNOT read source files
Read("src/...")         # ❌ Not in allowed tools
Grep("pattern")         # ❌ Not in allowed tools
Bash("tsc --noEmit")    # ❌ Not in allowed tools

# CANNOT run commands
Bash("pnpm build")      # ❌ Workers do this
Bash("pnpm test")       # ❌ Workers do this
```

**CORRECT - Orchestrator pattern with ZERO-POLLING:**
```
# Architect assesses and creates plan (in THEIR context)
Task(swarm-worker-opus, "Assess: run tsc, analyze errors, write plan to .swarm/fix-ts.md",
     run_in_background: true)
→ Returns immediately with agentId: "architect-abc123"

# Wait for architect to complete (blocking since we need the plan)
TaskOutput(task_id: "architect-abc123", block: true)
→ Returns: "plan|success|.swarm/fix-ts.md" (you ignore this output)

# You read ONLY the plan file (allowed)
Read(".swarm/fix-ts.md")

# Workers implement IN PARALLEL - FIRE AND FORGET
Task(swarm-worker-haiku, "Task 1.1: {desc}. Plan: fix-ts. Report to: .swarm/reports/fix-ts/wave-1/task-1.1.md", run_in_background: true)
→ Store agentId: "worker-1-def456"
Task(swarm-worker-opus, "Task 1.2: {desc}. Plan: fix-ts. Report to: .swarm/reports/fix-ts/wave-1/task-1.2.md", run_in_background: true)
→ Store agentId: "worker-2-ghi789"
Task(swarm-worker-opus, "Task 1.3: {desc}. Plan: fix-ts. Report to: .swarm/reports/fix-ts/wave-1/task-1.3.md", run_in_background: true)
→ Store agentId: "worker-3-jkl012"

# DO NOT POLL. Wait for ALL at end of wave (single blocking call on last agent)
TaskOutput(task_id: "worker-3-jkl012", block: true)
→ All workers done. You DON'T read their outputs.

# Update plan with file paths only (from your stored mapping)
Edit(".swarm/fix-ts.md", mark tasks completed with report paths)

# Spawn MANDATORY wave review (ultrathink reads ALL reports)
Task(swarm-reviewer-ultrathink, "Review wave 1. Reports: .swarm/reports/fix-ts/wave-1/", run_in_background: true)
```

**NEVER:**
- Poll workers with `block: false`
- Read worker output content
- Store worker summaries in your context

## Startup Flow

### 0. Plan Discovery (MANDATORY)

**Before creating any new plan**, check for existing active plans:

```
1. Glob(".swarm/*-inprogress.md") + Glob(".swarm/*-paused.md")
2. Review filenames - do any describe a similar task?
3. If match found → AskUserQuestion: "Found existing plan: {filename}. Resume or create new?"
4. Only proceed to create new plan if:
   - No active plans exist, OR
   - No filename matches the task, OR
   - User explicitly confirms "create new"
```

**Why this matters**: Prevents duplicate plans for same task (like `header-fixes.md` vs `header-check.md`).

### 1. Parse Input

When `/swarm` is invoked, determine the input type:

| Input | Action |
|-------|--------|
| Description text | Run Plan Discovery first, then spawn Architect if needed |
| File path (`.swarm/*.md`) | Load existing plan, check state |
| "resume" (with optional context) | Load plan, find incomplete work |
| Empty | Ask user or infer from conversation |

### 2. Mode Detection

Check current mode and adjust behavior:

```
Plan mode → Generate plan only, no execution
Auto-edit → Execute with minimal pauses
Default → Wave-by-wave with full checkpoints
```

### 3. Initialize or Resume

**New swarm:**
1. **Run Plan Discovery** (see section 0 above)
2. If existing plan found and user wants to resume → go to "Resume swarm"
3. Spawn Architect agent with task description
4. Architect creates plan with descriptive filename: `.swarm/{10-20-word-summary}-inprogress.md`
5. Present to user: summary, waves, suggested checkpoints
6. Ask user to confirm/adjust checkpoints
7. Begin execution (if not in plan mode)

**Resume swarm:**
1. Read plan file
2. Parse state: find incomplete tasks/waves
3. If user specified starting point, honor it
4. Otherwise, resume from first incomplete item
5. Optionally: spawn quick Auditor to validate completed work
6. Continue execution

## Execution Loop (Zero-Polling)

```
For each wave:
  1. Update plan: wave status → in_progress
  2. Identify parallel tasks (no inter-wave deps)
  3. SPAWN all workers with run_in_background: true
     - Store agentId → taskId mapping (do NOT store output)
     - Include report path in prompt: ".swarm/reports/{plan}/wave-{N}/task-{ID}.md"
  4. WAIT for ALL workers (single blocking call on last agentId)
     - TaskOutput(last_agentId, block: true)
     - Do NOT read the output content
  5. Update plan: mark all tasks completed with report paths
  6. SPAWN MANDATORY wave review (swarm-reviewer-ultrathink)
     - Reads all reports in ".swarm/reports/{plan}/wave-{N}/"
     - Returns: review priority (LOW/MED/HIGH) + fixes needed
  7. WAIT for review
  8. Process review result:
     - HIGH: spawn fixers immediately, wait, re-review
     - MED: note in plan, continue (fix at end of swarm or next wave)
     - LOW: proceed to next wave
  9. Optional: spawn task-specific review (swarm-reviewer-opus) for complex tasks
  10. Check if checkpoint → pause for user
  11. Update plan: wave status → completed
  12. Proceed to next wave
```

### Background Agent Lifecycle (Fire-and-Forget)

```
┌─────────────────────────────────────────────────────────────────┐
│ SPAWN PHASE (instant, non-blocking)                             │
│                                                                 │
│   Task(worker-1, "...report to .swarm/reports/plan/wave-1/task-1.1.md", run_in_background: true) → agentId-1
│   Task(worker-2, "...report to .swarm/reports/plan/wave-1/task-1.2.md", run_in_background: true) → agentId-2
│   Task(worker-3, "...report to .swarm/reports/plan/wave-1/task-1.3.md", run_in_background: true) → agentId-3
│                                                                 │
│   Store ONLY mapping: {task-1.1: agentId-1, ...}                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ WAIT PHASE (end of wave only, NO POLLING)                       │
│                                                                 │
│   # Block on last agent (all others complete before it)         │
│   TaskOutput(agentId-3, block: true)                            │
│   # Ignore output content - workers wrote to files              │
│                                                                 │
│   # Update plan with file paths (not content!)                  │
│   Edit(".swarm/plan.md", mark tasks done with report paths)     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ MANDATORY REVIEW PHASE (ultrathink reads files)                 │
│                                                                 │
│   Task(swarm-reviewer-ultrathink,                               │
│        "Review wave 1. Reports: .swarm/reports/plan/wave-1/",   │
│        run_in_background: true) → reviewId                      │
│   TaskOutput(reviewId, block: true)                             │
│   # Review returns: priority|action|summary-path                │
│   # HIGH → fix now, MED → defer, LOW → proceed                  │
└─────────────────────────────────────────────────────────────────┘
```

### TaskOutput Usage (Zero-Polling)

**ALWAYS use `block: true`** - no polling allowed:

| Situation | Action |
|-----------|--------|
| End of wave | `TaskOutput(last_agentId, block: true)` |
| Architect must finish | `TaskOutput(architect_id, block: true)` |
| Review must finish | `TaskOutput(review_id, block: true)` |

**NEVER use `block: false`** - it wastes context on partial status checks.

## Delegation Patterns (File-Based Communication)

### Spawning Architect

```typescript
Task({
  subagent_type: "swarm-worker-opus",
  run_in_background: true,
  prompt: `
    **Role**: Swarm Architect
    **Task**: Create execution plan for: {task description}
    **Output**: Write plan to .swarm/{plan-slug}-inprogress.md
  `
})
// Returns: agentId immediately

// Wait for architect, ignore output content
TaskOutput({ task_id: architectAgentId, block: true })
// Read plan file (the only thing you care about)
Read(".swarm/{plan-slug}-inprogress.md")
```

### Spawning Workers (Fire-and-Forget)

Launch ALL workers in single message. Include report path in prompt:

```typescript
// SINGLE MESSAGE - all workers spawn in parallel
Task({
  subagent_type: "swarm-worker-haiku",
  run_in_background: true,
  prompt: "Task 1.1: {desc}. Plan: {slug}. Report: .swarm/reports/{slug}/wave-1/task-1.1.md"
})  // Store: {"1.1": agentId}

Task({
  subagent_type: "swarm-worker-opus",
  run_in_background: true,
  prompt: "Task 1.2: {desc}. Plan: {slug}. Report: .swarm/reports/{slug}/wave-1/task-1.2.md"
})  // Store: {"1.2": agentId}

// DO NOT POLL. Workers write to files. You track file paths.
```

### End of Wave (Single Blocking Call)

```typescript
// Wait for last worker only (others are done by then)
TaskOutput({ task_id: lastAgentId, block: true })
// Ignore output - all details are in report files

// Update plan with file paths (NOT content)
Edit(".swarm/plan.md", `
- [x] 1.1 → .swarm/reports/{slug}/wave-1/task-1.1.md
- [x] 1.2 → .swarm/reports/{slug}/wave-1/task-1.2.md
`)
```

### MANDATORY Wave Review (Ultrathink)

```typescript
// After EVERY wave - ultrathink reviews ALL task reports
Task({
  subagent_type: "swarm-reviewer-ultrathink",
  run_in_background: true,
  prompt: `
    Review wave 1 implementation.
    Reports: .swarm/reports/{slug}/wave-1/
    Return: {priority}|{action}|{review-path}
    Priority: HIGH (fix now) | MED (defer) | LOW (proceed)
  `
})

TaskOutput({ task_id: reviewId, block: true })
// Process priority: HIGH→fix, MED→note, LOW→continue
```

### Optional Task Review (Opus)

For complex individual tasks, spawn scoped review:

```typescript
Task({
  subagent_type: "swarm-reviewer-opus",
  run_in_background: true,
  prompt: `
    Review task 2.3 implementation.
    Report: .swarm/reports/{slug}/wave-2/task-2.3.md
    Scope: ONLY this task's code changes
    Return: {priority}|{action}|{review-path}
  `
})
```

## Checkpoint Handling

At user-confirmed checkpoints:

1. **Summarize wave results**:
   - Tasks completed
   - Files modified
   - Issues found/fixed
   - Any concerns

2. **Present to user**:
   ```
   Wave {N} complete.
   - {X} tasks completed
   - {Y} files modified
   - {Z} issues auto-fixed

   Ready to proceed to Wave {N+1}?
   Or would you like to review specific changes?
   ```

3. **Wait for user response** - do not proceed autonomously

4. **Update plan** with checkpoint completion

## Failure Handling

When a worker fails:

1. **Record in plan** - mark task `[!]`, log error
2. **Check escalation rules** - can we retry with higher model?
3. **If escalatable**: spawn new worker with upgraded model, mark task `[^]`
4. **If not escalatable**: pause, present to user
5. **Never block other tasks** - continue with independent work

## Resume Protocol

When resuming:

1. **Parse user intent**:
   - "resume" → find first incomplete
   - "resume from wave 3" → start at wave 3
   - "resume from task 2.3" → start at specific task
   - "resume, skip failed tasks" → continue past failures

2. **Validate completed work** (optional but recommended):
   - Quick audit of files modified by completed tasks
   - Check for drift (manual changes since last run)

3. **Re-read dependencies**:
   - Ensure prerequisites for resume point are met
   - If not, warn user

4. **Continue execution loop**

## Context Management (Ultra-Lean)

**Your context budget: ~5-10k tokens for coordination. Agents get 200k each for work.**

### Communication Flow

```
Workers → Write reports to files → Review agents read files → Return priority to you
         (you never read)                                    (minimal output)
```

### What Goes WHERE

| Task Type | Who Does It | Why |
|-----------|-------------|-----|
| Run `tsc --noEmit` | **Worker agent** | You cannot run Bash |
| Read source files | **Worker agent** | You can only read `.swarm/**` |
| Read task reports | **Review agents** | Not you - zero context waste |
| Implement a feature | **Worker agent** | Heavy work, their context |
| Read/write plan files | **Orchestrator** | `.swarm/**` only |
| Track agent IDs → paths | **Orchestrator** | Map task IDs ↔ report paths |

### DO (Orchestrator)
- Spawn workers with `run_in_background: true`
- Include report path in every worker prompt
- Store mapping: taskId → reportPath (NOT output content)
- Use `TaskOutput(block: true)` at end of wave only
- Ignore TaskOutput content - files have details
- Spawn review agents to read reports

### DON'T (Orchestrator)
- Read source files (not in allowed-tools)
- Read worker output content (waste of context)
- Poll with `block: false` (wastes context)
- Store any worker details in your context
- Read report files yourself (reviewers do this)

### Report Structure (For Review Agents)

Workers write detailed reports to structured paths. **You never read these - review agents do.**

**Report paths**:
```
.swarm/reports/{plan-slug}/wave-{N}/task-{ID}.md
.swarm/reports/{plan-slug}/wave-{N}/wave-review.md  (ultrathink review)
```

**Review agent reads reports, you read ONLY the review summary**:
```
# Review agent output (what you receive):
HIGH|fix-imports|.swarm/reports/{slug}/wave-1/wave-review.md

# You DON'T read the review file - just act on priority
if HIGH → spawn fixers
if MED → note in plan, continue
if LOW → continue
```

## Error Recovery

| Situation | Action |
|-----------|--------|
| Worker timeout | Log, mark failed, escalate |
| Worker crash | Log, mark failed, escalate |
| Audit finds issues | Spawn fixers for trivial, pause for complex |
| All retries exhausted | Pause, present to user |
| User wants to abort | Update plan state to `paused`, summarize progress |
| Dependency failure | Skip dependent tasks, continue others, notify user |

## Plan File Updates

Update the plan file at these moments:

1. After spawning Architect (state: planning)
2. Before starting each wave (wave status: in_progress)
3. After each task completes (task checkbox)
4. After audit completes (audit section)
5. At checkpoints (checkpoint checkbox)
6. On any failure (execution log)
7. After wave completes (wave status: completed)
8. At swarm completion (state: completed)

Always use atomic writes - read, modify, write complete file.

## TaskOutput Reference (Zero-Polling)

The ONLY tool for agent completion - use `block: true` exclusively.

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `task_id` | string | required | The agent ID from Task with `run_in_background: true` |
| `block` | boolean | true | ALWAYS use true - no polling |
| `timeout` | number | 30000 | Max ms to wait (up to 600000) |

### Return Values

```typescript
{
  status: "completed" | "failed" | "timeout",
  output?: string  // IGNORE THIS - all details in files
}
```

### Usage (ONLY Pattern)

```typescript
// End of wave - wait for all workers
TaskOutput({ task_id: lastAgentId, block: true })
// IGNORE output content - workers wrote to report files

// Review completion
TaskOutput({ task_id: reviewId, block: true })
// Read ONLY the priority from output: "HIGH|action|path"
```

**NEVER use `block: false` - it wastes context on partial checks.**
