# Swarm Execution Skill

This skill orchestrates parallel agent workflows for complex, multi-step tasks. It decomposes work into dependency-mapped waves and executes them with autonomous agents while maintaining quality through automated auditing.

## When to Use

Invoke this skill when:
- User runs `/swarm` command
- Task requires decomposition into multiple parallel sub-tasks
- User mentions "swarm", "parallel execution", "wave-based", or "multi-agent"
- Complex refactoring or migration with many interdependent steps

## Roles

The swarm system has five agent roles:

| Role | Purpose | When Spawned |
|------|---------|--------------|
| **Architect** | Plan generation, task decomposition, dependency mapping | Start of swarm, re-planning phases |
| **Worker** | Execute individual tasks, write reports to files | During wave execution |
| **Reviewer (ultrathink)** | MANDATORY wave review, reads ALL reports | End of EVERY wave |
| **Reviewer (opus)** | Optional task-scoped review | Complex tasks (optional) |
| **Fixer** | Auto-fix HIGH priority issues | When review returns HIGH |

## Worker Agents

Worker agents are defined in `./agents/` and run in **parallel with separate context windows**:

| Agent | Model | Purpose | Use For |
|-------|-------|---------|---------|
| `swarm-worker-haiku` | haiku | Fast, cheap tasks | Deletions, renames, config, boilerplate |
| `swarm-worker-opus` | opus | Standard tasks | Implement, integrate, fix bugs |
| `swarm-worker-ultrathink` | opus | Complex tasks | Architecture, algorithms, edge cases |

## Review Agents

| Agent | Model | Purpose | When Used |
|-------|-------|---------|-----------|
| `swarm-reviewer-ultrathink` | opus | Wave review (ALL tasks) | MANDATORY end of every wave |
| `swarm-reviewer-opus` | opus | Task review (single task) | Optional for complex tasks |

**Review Output**: `{priority}|{action}|{review-path}` where priority is HIGH/MED/LOW.

## Spawning Pattern (Fire-and-Forget)

All agents MUST be spawned with `run_in_background: true`:
```
# Workers - include report path in prompt
Task(subagent_type="swarm-worker-haiku",
     prompt="Task 1.1: ... Report: .swarm/reports/plan/wave-1/task-1.1.md",
     run_in_background=true)
→ Returns: agentId (store mapping taskId→agentId)

# DO NOT POLL - wait at end of wave only
TaskOutput(task_id=lastAgentId, block=true)
# Ignore output content - workers wrote to files
```

**ZERO-POLLING**: Orchestrator never reads worker output. Communication via files only.

## CRITICAL: Orchestrator Context Isolation

**The orchestrator (you) NEVER uses Explore or general-purpose agents for assessment.**

Why? Because agent output returns to your context, defeating the purpose. Instead:

| Need | WRONG | CORRECT |
|------|-------|---------|
| Get TypeScript errors | `Task(Explore, "run tsc")` | `Bash("npx tsc --noEmit")` |
| Read a file | `Task(Explore, "read X")` | `Read("X")` |
| Find files | `Task(Explore, "find...")` | `Glob("pattern")` |
| Search code | `Task(Explore, "grep...")` | `Grep("pattern")` |

**Workers are for IMPLEMENTATION, not exploration.** You explore directly, then spawn workers to implement in parallel.

## Orchestrator Responsibilities

The main Claude (you) acts as orchestrator:
- Delegates planning to Architect agent
- Launches Worker agents in parallel within waves
- Coordinates Auditor agents after each wave
- Manages the master plan file (sole writer)
- Handles user checkpoints and confirmations
- Decides on escalation and retries

## Reference Files

Load these based on current phase:

| Phase | Load Reference |
|-------|----------------|
| Planning | [architect-protocol.md](references/architect-protocol.md) |
| Execution | [worker-protocol.md](references/worker-protocol.md), [escalation-rules.md](references/escalation-rules.md) |
| Validation | [auditor-protocol.md](references/auditor-protocol.md) |
| All phases | [orchestrator-protocol.md](references/orchestrator-protocol.md), [plan-format.md](references/plan-format.md) |

## Quick Start

1. **Receive task** (description, file path, or "resume")
2. **Spawn Architect** (run_in_background: true) → wait with TaskOutput(block: true)
3. **Confirm with user** (checkpoints, model assignments)
4. **Execute waves** (ZERO-POLLING):
   - SPAWN all workers with report paths in prompts
   - Store taskId→agentId mapping (NOT output)
   - WAIT at end of wave only: TaskOutput(lastAgentId, block: true)
   - Ignore output content - workers wrote to files
5. **MANDATORY wave review**: spawn swarm-reviewer-ultrathink
   - Returns: `{priority}|{action}|{review-path}`
   - HIGH → spawn fixers, wait, re-review
   - MED → note in plan, continue
   - LOW → proceed
6. **Optional task review**: spawn swarm-reviewer-opus for complex tasks
7. **Checkpoint with user** at agreed points
8. **Update plan** with file paths only (not content)
9. **Repeat** until complete

## Plan File Location

Plans are stored in `.swarm/{task-slug}.md` in project root.
This file is both the plan definition AND execution state (checkboxes).

## Mode Behavior

| Mode | Behavior |
|------|----------|
| **Plan mode** | Generate plan only, no execution |
| **Auto-edit** | Execute with minimal pauses (major milestones only) |
| **Default** | Wave-by-wave checkpoints |

## Future: GitHub Actions

Design notes for CI/CD migration:
- Tasks are stateless with explicit inputs/outputs
- Plan format supports workflow generation
- Checkpoints map to approval gates
