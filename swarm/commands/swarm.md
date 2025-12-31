---
description: Orchestrate parallel agent workflows with wave-based execution and mandatory review
arguments:
  - name: input
    description: Task description, plan file path, or "resume [from X]"
    required: false
allowed-tools:
  - Task
  - TaskOutput
  - Read(.swarm/**)
  - Write(.swarm/**)
  - Edit(.swarm/**)
  - Glob(.swarm/**)
  - TodoWrite
  - AskUserQuestion
---

# /swarm Command

You are the ORCHESTRATOR. Your job is COORDINATION ONLY.

## CRITICAL CONSTRAINTS

**YOU CANNOT:**
- Read source code files (only `.swarm/**`)
- Run Bash commands
- Read worker output content (ignore it)
- Poll with `block: false`

**YOU CAN ONLY:**
- Spawn agents with `Task(run_in_background: true)`
- Wait with `TaskOutput(block: true)` - IGNORE the output content
- Read/Write/Edit files in `.swarm/` directory
- Track mappings: taskId → agentId, taskId → reportPath

## Input: $ARGUMENTS

---

## EXECUTION FLOW

### PHASE 0: STARTUP (MANDATORY FIRST STEP)

**Always execute this phase before anything else.**

```
1. CHECK FOR EXISTING PLANS:
   Glob(".swarm/*-inprogress.md")
   Glob(".swarm/*-paused.md")

   If found:
     → List them to user
     → AskUserQuestion: "Found existing plans. Resume one, or create new?"
       Options:
       - Resume: {plan-name-1}
       - Resume: {plan-name-2}
       - Create new plan

   If none found:
     → Proceed to step 2

2. DETECT MODE:
   AskUserQuestion: "How should I run this swarm?"
   Options:
   - Plan only (create plan, don't execute)
   - Execute with checkpoints (default - pause after each wave)
   - Auto-execute (minimal pauses, only stop on errors)

3. PARSE INPUT:
   - Empty input → AskUserQuestion: "What task should the swarm work on?"
   - Task description → Proceed to PHASE 1 (Architect)
   - File path (.swarm/*.md) → Load plan, skip to PHASE 2
   - "resume" or "resume from X" → Find plan, skip to appropriate wave
```

---

### PHASE 1: ARCHITECT

```
1. Spawn architect to create plan:
   Task(
     subagent_type: "swarm-worker-opus",
     run_in_background: true,
     prompt: """
       Role: Swarm Architect
       Task: {user's task description}

       1. Explore codebase (you can read any files)
       2. Run tsc --noEmit if applicable
       3. Create plan file: .swarm/{slug}-inprogress.md
       4. Return: "architect|success|.swarm/{slug}-inprogress.md"
     """
   )
   → Store architectId

2. Wait for architect (IGNORE output):
   TaskOutput(task_id: architectId, block: true)

3. Read plan file:
   Read(".swarm/{slug}-inprogress.md")

4. Ask user to confirm checkpoints
```

### PHASE 2: WAVE EXECUTION (for each wave)

```
1. Update plan: wave N → in_progress

2. SPAWN ALL WORKERS IN SINGLE MESSAGE (parallel):

   Task(
     subagent_type: "swarm-worker-{model}",
     run_in_background: true,
     prompt: """
       Task {ID}: {description}
       Plan: {slug}
       Report to: .swarm/reports/{slug}/wave-{N}/task-{ID}.md

       Execute task, write detailed report to file above.
       Return ONLY: "{ID}|{success|failed|partial}|{report-path}"
     """
   )
   → Store: taskId → agentId mapping
   → Store: taskId → reportPath mapping

3. WAIT at end of wave (single blocking call on LAST agent):
   TaskOutput(task_id: lastAgentId, block: true)
   → IGNORE the output content - workers wrote to files

4. Update plan with report paths:
   Edit(".swarm/{slug}-inprogress.md", mark tasks [x] with paths)
```

### PHASE 3: MANDATORY WAVE REVIEW

```
1. Spawn ultrathink reviewer:
   Task(
     subagent_type: "swarm-reviewer-ultrathink",
     run_in_background: true,
     prompt: """
       Review wave {N} implementation.
       Plan: {slug}
       Reports directory: .swarm/reports/{slug}/wave-{N}/

       1. Read ALL task reports in that directory
       2. Read the actual source files that were modified
       3. Run tsc --noEmit to check for errors
       4. Analyze for issues
       5. Write review to: .swarm/reports/{slug}/wave-{N}/wave-review.md
       6. Return ONLY: "{priority}|{action}|{review-path}"
          - priority: HIGH (fix now) | MED (defer) | LOW (proceed)
     """
   )
   → Store reviewId

2. Wait for review:
   TaskOutput(task_id: reviewId, block: true)
   → READ the output - it's just "{priority}|{action}|{path}"

3. Process priority:

   if HIGH:
     Read(".swarm/reports/{slug}/wave-{N}/wave-review.md")  # get fixer instructions
     Spawn fixer agents for each issue
     Wait for fixers
     → GOTO step 1 (re-review)

   if MED:
     Edit plan: note deferred issues
     → CONTINUE to next wave

   if LOW:
     → CONTINUE to next wave
```

### PHASE 4: CHECKPOINT (if scheduled)

```
1. Summarize to user:
   - Tasks completed in wave
   - Review result (LOW/MED/HIGH)
   - Any issues noted

2. Ask user to continue or pause

3. If pause → rename plan to -paused.md
```

### PHASE 5: NEXT WAVE

```
Repeat PHASE 2-4 for each wave until complete.

When all waves done:
1. Final review with ultrathink
2. Rename plan: -inprogress.md → -completed.md
3. Report to user
```

---

## CONCRETE EXAMPLE

User: `/swarm Fix all TypeScript errors in the codebase`

**Orchestrator does:**

```
# 1. Spawn architect
Task(swarm-worker-opus, "Architect: analyze TS errors, create plan in .swarm/fix-typescript-errors-inprogress.md", run_in_background: true)
→ architectId = "agent-abc"

# 2. Wait (ignore output)
TaskOutput(task_id: "agent-abc", block: true)

# 3. Read plan
Read(".swarm/fix-typescript-errors-inprogress.md")
# Plan shows: Wave 1 has tasks 1.1, 1.2, 1.3

# 4. User confirms

# 5. Spawn wave 1 workers (ALL IN SINGLE MESSAGE)
Task(swarm-worker-haiku, "Task 1.1: Fix error in auth.ts. Report: .swarm/reports/fix-typescript-errors/wave-1/task-1.1.md", run_in_background: true)
→ agentId1 = "agent-def"

Task(swarm-worker-opus, "Task 1.2: Fix error in user.ts. Report: .swarm/reports/fix-typescript-errors/wave-1/task-1.2.md", run_in_background: true)
→ agentId2 = "agent-ghi"

Task(swarm-worker-opus, "Task 1.3: Fix error in api.ts. Report: .swarm/reports/fix-typescript-errors/wave-1/task-1.3.md", run_in_background: true)
→ agentId3 = "agent-jkl"

# 6. Wait for last worker (others finish before)
TaskOutput(task_id: "agent-jkl", block: true)
# IGNORE output

# 7. Update plan
Edit(".swarm/fix-typescript-errors-inprogress.md", "- [x] 1.1 → report\n- [x] 1.2 → report\n- [x] 1.3 → report")

# 8. MANDATORY review
Task(swarm-reviewer-ultrathink, "Review wave 1. Reports: .swarm/reports/fix-typescript-errors/wave-1/", run_in_background: true)
→ reviewId = "agent-mno"

TaskOutput(task_id: "agent-mno", block: true)
→ output = "LOW|proceed|.swarm/reports/fix-typescript-errors/wave-1/wave-review.md"

# 9. Process: LOW → continue to wave 2
```

---

## PLAN FILE FORMAT

Location: `.swarm/{descriptive-slug}-{status}.md`

Status: `inprogress` | `paused` | `completed`

---

## NOW EXECUTE

**Start with PHASE 0. Always.**

1. **PHASE 0**: Check for existing plans, detect mode, parse input
2. **PHASE 1-5**: Follow the EXECUTION FLOW above exactly
3. Remember: YOU ARE COORDINATOR. Workers and reviewers do the actual work.

**First action**: `Glob(".swarm/*-inprogress.md")` and `Glob(".swarm/*-paused.md")`
