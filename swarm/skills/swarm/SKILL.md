# Swarm Execution Skill

This skill orchestrates parallel agent workflows for complex, multi-step tasks. It decomposes work into dependency-mapped waves and executes them with autonomous agents while maintaining quality through automated auditing.

## When to Use

Invoke this skill when:
- User runs `/swarm` command
- Task requires decomposition into multiple parallel sub-tasks
- User mentions "swarm", "parallel execution", "wave-based", or "multi-agent"
- Complex refactoring or migration with many interdependent steps

## Roles

The swarm system has four agent roles:

| Role | Purpose | When Spawned |
|------|---------|--------------|
| **Architect** | Plan generation, task decomposition, dependency mapping | Start of swarm, re-planning phases |
| **Worker** | Execute individual tasks | During wave execution |
| **Auditor** | Validate outputs (tools + AI) | After each wave completes |
| **Fixer** | Auto-fix simple issues found by auditors | When auditors find trivial issues |

## Worker Agents

Worker agents are defined in `.claude/agents/` and run in **parallel with separate context windows**:

| Agent | Model | Purpose | Use For |
|-------|-------|---------|---------|
| `swarm-worker-haiku` | haiku | Fast, cheap tasks | Deletions, renames, config, boilerplate |
| `swarm-worker-opus` | opus | Standard tasks | Implement, integrate, fix bugs |
| `swarm-worker-ultrathink` | opus | Complex tasks | Architecture, algorithms, edge cases |

**Spawning Pattern (BACKGROUND - MANDATORY)**:

All agents MUST be spawned with `run_in_background: true`:
```
Task(subagent_type="swarm-worker-haiku", prompt="Task 1.1: ...", run_in_background=true)
→ Returns: agentId "worker-1-abc"

Task(subagent_type="swarm-worker-opus", prompt="Task 1.2: ...", run_in_background=true)
→ Returns: agentId "worker-2-def"

Task(subagent_type="swarm-worker-opus", prompt="Task 1.3: ...", run_in_background=true)
→ Returns: agentId "worker-3-ghi"
```

**Collecting Results (incremental)**:
```
# Poll for completed workers
AgentOutputTool(agentId="worker-1-abc", block=false)
→ "running" or "completed" with output

# Wait when needed
AgentOutputTool(agentId="worker-3-ghi", block=true)
→ Blocks until worker completes
```

Each agent runs in its own context window (up to 10 parallel), returns results via AgentOutputTool.

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
2. **Spawn Architect** (run_in_background: true) → wait with AgentOutputTool(block: true)
3. **Confirm with user** (checkpoints, model assignments)
4. **Execute waves**:
   - SPAWN all workers (run_in_background: true, get agentIds)
   - POLL with AgentOutputTool(block: false) for results
   - Process completed tasks incrementally
   - Use AgentOutputTool(block: true) for last pending agent
5. **Audit after each wave** (spawn auditors in background)
6. **Checkpoint with user** at agreed points
7. **Update plan file** incrementally as agents complete
8. **Repeat** until complete

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
