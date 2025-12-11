# Orchestrator Protocol

You (main Claude) are the orchestrator. Your job is to coordinate, delegate, and maintain the master plan. Keep your context lean by delegating actual work to specialized agents.

## Core Principles

1. **Delegate everything** - You coordinate, agents execute
2. **Single source of truth** - Only you write to the plan file
3. **Background by default** - Launch agents with `run_in_background: true`
4. **Incremental processing** - Process results as they complete, don't wait for all
5. **User in control** - Confirm before major decisions, respect checkpoints

## CRITICAL: Context Isolation

**Agents run in SEPARATE context windows. Their work NEVER enters your context.**

This is the ENTIRE PURPOSE of using subagents:
- Subagents have their own 200k token context
- They do heavy work (exploration, implementation) in THEIR context
- They return ONLY a brief summary to you
- Your context stays lean (~10-20k) for coordination

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

**CORRECT - Orchestrator pattern with background agents:**
```
# Architect assesses and creates plan (in THEIR context)
Task(swarm-worker-opus, "Assess: run tsc, analyze errors, write plan to .swarm/fix-ts.md",
     run_in_background: true)
→ Returns immediately with agentId: "architect-abc123"

# Wait for architect to complete (blocking since we need the plan)
AgentOutputTool(agentId: "architect-abc123", block: true)
→ Returns: "Found 47 errors in 16 files. Plan written to .swarm/fix-ts.md"

# You read the plan file (allowed)
Read(".swarm/fix-ts.md")

# Workers implement IN PARALLEL, NON-BLOCKING (in THEIR contexts)
Task(swarm-worker-haiku, "Implement task 1.1 per .swarm/fix-ts.md", run_in_background: true)
→ Returns: agentId: "worker-1-def456"
Task(swarm-worker-opus, "Implement task 1.2 per .swarm/fix-ts.md", run_in_background: true)
→ Returns: agentId: "worker-2-ghi789"
Task(swarm-worker-opus, "Implement task 1.3 per .swarm/fix-ts.md", run_in_background: true)
→ Returns: agentId: "worker-3-jkl012"

# Process results incrementally as they complete
AgentOutputTool(agentId: "worker-1-def456", block: false)
→ "running" → check another worker or update plan
→ "completed" → process result, update plan, check next

# When you need all workers done (before next wave), use block: true
AgentOutputTool(agentId: "worker-3-jkl012", block: true)
→ Waits until worker-3 completes
```

**If an agent returns a detailed report INTO your context, you used it wrong.**

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

## Execution Loop

```
For each wave:
  1. Update plan: wave status → in_progress
  2. Identify parallel tasks (no inter-wave deps)
  3. SPAWN all workers with run_in_background: true (get agentIds)
  4. POLL/WAIT loop for results:
     a. AgentOutputTool(agentId, block: false) for each active worker
     b. If "completed" → process result, update plan, mark task done
     c. If "running" → continue polling others
     d. If all workers done OR critical failure → exit loop
  5. Handle failures (see Escalation) - can escalate while others still running
  6. SPAWN auditor agents with run_in_background: true
  7. POLL/WAIT for audit results (same pattern as step 4)
  8. SPAWN Fixer agents for trivial issues (background)
  9. POLL/WAIT for fixer results
  10. Update plan: audit results
  11. Check if checkpoint → pause for user
  12. Update plan: wave status → completed
  13. Proceed to next wave
```

### Background Agent Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│ SPAWN PHASE (instant, non-blocking)                             │
│                                                                 │
│   Task(worker-1, run_in_background: true) → agentId-1           │
│   Task(worker-2, run_in_background: true) → agentId-2           │
│   Task(worker-3, run_in_background: true) → agentId-3           │
│                                                                 │
│   Store agentIds: {task-1.1: agentId-1, task-1.2: agentId-2...} │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ POLL PHASE (incremental processing)                             │
│                                                                 │
│   pendingAgents = [agentId-1, agentId-2, agentId-3]            │
│   while pendingAgents.length > 0:                               │
│     for agentId in pendingAgents:                               │
│       result = AgentOutputTool(agentId, block: false)           │
│       if result.status == "completed":                          │
│         processResult(result)                                   │
│         updatePlan(taskId, "completed")                         │
│         pendingAgents.remove(agentId)                           │
│       elif result.status == "failed":                           │
│         handleFailure(agentId, result)                          │
│         pendingAgents.remove(agentId)                           │
│       # "running" → keep in pending, check next                 │
│                                                                 │
│   # Or use block: true on last agent when you need ALL done:    │
│   AgentOutputTool(lastAgentId, block: true)                     │
└─────────────────────────────────────────────────────────────────┘
```

### When to use block: true vs block: false

| Situation | Use |
|-----------|-----|
| Checking if any worker is done | `block: false` |
| Updating plan while workers run | `block: false` |
| Need result before next step | `block: true` |
| All workers must finish before wave ends | `block: true` on last pending |
| Architect must finish before workers start | `block: true` |

## Delegation Patterns

### Spawning Architect (Background)

```typescript
// ALWAYS use run_in_background: true for architects
Task({
  subagent_type: "swarm-worker-opus",
  run_in_background: true,  // ← MANDATORY
  prompt: `
    **Role**: Swarm Architect
    **Task**: Create execution plan for: {task description}

    **Requirements**:
    - Decompose into waves (parallel where possible)
    - Map dependencies between tasks
    - Assign models (haiku/opus/opus-ultrathink)
    - Suggest checkpoints for user review
    - Use plan format from references/plan-format.md

    **Context**:
    {relevant codebase context}

    **Output**: Complete plan in markdown format
  `
})
// Returns: agentId immediately

// Then wait for architect to complete:
AgentOutputTool({ agentId: architectAgentId, block: true })
```

### Spawning Workers (Background, Parallel)

Launch ALL independent tasks with `run_in_background: true` in a single message:

```typescript
// CORRECT - single message, multiple background Task calls
// All spawn instantly, run in parallel, return agentIds

Task({
  subagent_type: "swarm-worker-haiku",
  run_in_background: true,
  prompt: "Task 1.1: {description}"
})  // → Returns: {agentId: "worker-1-abc"}

Task({
  subagent_type: "swarm-worker-haiku",
  run_in_background: true,
  prompt: "Task 1.2: {description}"
})  // → Returns: {agentId: "worker-2-def"}

Task({
  subagent_type: "swarm-worker-opus",
  run_in_background: true,
  prompt: "Task 1.3: {description}"
})  // → Returns: {agentId: "worker-3-ghi"}

// Store agentIds mapped to task IDs for later retrieval:
// agentMap = {"1.1": "worker-1-abc", "1.2": "worker-2-def", "1.3": "worker-3-ghi"}
```

### Collecting Worker Results (Incremental)

```typescript
// Poll for results while workers run:
for (const [taskId, agentId] of Object.entries(agentMap)) {
  const result = AgentOutputTool({ agentId, block: false });

  if (result.status === "completed") {
    updatePlan(taskId, "completed", result.output);
    delete agentMap[taskId];
  }
  // "running" → leave in map, check next iteration
}

// When only one worker remains and you need to wait:
const lastAgentId = Object.values(agentMap)[0];
const finalResult = AgentOutputTool({ agentId: lastAgentId, block: true });
```

### Spawning Auditors (Background, Parallel)

After wave completion, launch auditors IN BACKGROUND:

```typescript
// AI auditors in parallel (background)
Task({
  subagent_type: "swarm-worker-haiku",
  run_in_background: true,
  prompt: "Audit: Check code style and conventions for files: {list}"
})  // → Returns: {agentId: "auditor-1-xyz"}

Task({
  subagent_type: "swarm-worker-haiku",
  run_in_background: true,
  prompt: "Audit: Check for type safety issues (any, unknown, casts)"
})  // → Returns: {agentId: "auditor-2-uvw"}

// Wait for all auditors:
AgentOutputTool({ agentId: "auditor-1-xyz", block: true })
AgentOutputTool({ agentId: "auditor-2-uvw", block: true })
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

## Context Management

**Your context budget: ~20k tokens for coordination. Agents get 200k each for work.**

### What Goes WHERE

| Task Type | Who Does It | Why |
|-----------|-------------|-----|
| Run `tsc --noEmit` | **Worker agent** | You cannot run Bash |
| Read source files | **Worker agent** | You can only read `.swarm/**` |
| Explore codebase | **Worker agent** | Heavy search, their context |
| Implement a feature | **Worker agent** | Heavy work, their context |
| Read/write plan files | **Orchestrator** | `.swarm/**` only |
| Track agent IDs | **Orchestrator** | Map task IDs ↔ agent IDs |
| Retrieve agent results | **Orchestrator** | Via AgentOutputTool |

### DO (Orchestrator)
- Spawn workers with `run_in_background: true`
- Track agentIds mapped to task IDs
- Use `AgentOutputTool(block: false)` for polling
- Use `AgentOutputTool(block: true)` when you must wait
- Read/write/edit `.swarm/**` plan files only
- Use `Glob(".swarm/**")` to find plan files
- Read `.swarm/reports/task-{ID}.md` for task details

### DON'T (Orchestrator)
- Read source files (you physically cannot - not in allowed-tools)
- Run Bash commands (you physically cannot)
- Expect detailed reports from agents (they return brief summaries)
- Store worker outputs in your context
- Use `block: true` prematurely (wastes time waiting)

### On-Demand Detail Retrieval

Workers write detailed reports to structured paths. You receive only summaries.

**Report paths follow this structure**:
```
.swarm/reports/{plan-slug}/wave-{N}/task-{ID}.md
```

Where `{plan-slug}` is the plan filename without status suffix.

**Example**: For plan `fix-auth-service-tokens-inprogress.md`, task 2.3:
```
Read(".swarm/reports/fix-auth-service-tokens/wave-2/task-2.3.md")
```

**Finding all reports for a swarm**:
```
Glob(".swarm/reports/fix-auth-service-tokens/**/*.md")
```

This keeps your context lean while preserving full detail when needed.

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

## AgentOutputTool Reference

The key tool for managing background agents.

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `agentId` | string | required | The agent ID returned from Task with `run_in_background: true` |
| `block` | boolean | true | If true, waits for agent to complete. If false, returns immediately with status |
| `wait_up_to` | number | 150 | Max seconds to wait when blocking (max 300) |

### Return Values

When `block: false` (immediate check):
```typescript
{
  status: "running" | "completed" | "failed",
  output?: string  // Only if completed
}
```

When `block: true` (wait until done):
```typescript
{
  status: "completed" | "failed" | "timeout",
  output?: string  // Agent's final message
}
```

### Usage Patterns

**Pattern 1: Fire-and-forget spawn, then poll**
```typescript
// Spawn all workers
const agents = tasks.map(task =>
  Task({ subagent_type: "swarm-worker-opus", prompt: task, run_in_background: true })
);

// Poll until all done
while (agents.some(a => a.status === "running")) {
  for (const agent of agents.filter(a => a.status === "running")) {
    const result = AgentOutputTool({ agentId: agent.id, block: false });
    if (result.status !== "running") {
      agent.status = result.status;
      agent.output = result.output;
    }
  }
}
```

**Pattern 2: Wait for specific agent**
```typescript
// When you MUST have result before continuing:
const result = AgentOutputTool({ agentId: "critical-agent-id", block: true });
```

**Pattern 3: Timeout handling**
```typescript
const result = AgentOutputTool({
  agentId: "slow-agent",
  block: true,
  wait_up_to: 300  // Max 5 minutes
});
if (result.status === "timeout") {
  // Agent still running, decide: wait more or escalate
}
```
