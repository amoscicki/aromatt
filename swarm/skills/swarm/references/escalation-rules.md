# Escalation Rules

This document defines when and how to escalate tasks to more capable models.

## Model Hierarchy

```
haiku (fast, cheap, simple tasks)
   ↓ on failure
opus (capable, balanced)
   ↓ on failure
opus-ultrathink (deep reasoning, complex problems)
```

## Initial Model Selection

Architect assigns models based on task characteristics:

### Haiku (default for simple tasks)

**Use when:**
- Mechanical changes (delete, rename, move)
- Boilerplate generation from template
- Simple config updates
- Single-file, obvious changes
- Copy-paste with minor modifications
- Documentation updates

**Examples:**
- "Delete file X"
- "Rename function from A to B"
- "Add import statement"
- "Update config value"
- "Create file from template"

### Opus (default for standard tasks)

**Use when:**
- Feature implementation
- Multi-file changes with logic
- Bug fixes requiring understanding
- Integration between components
- Refactoring with judgment calls
- Test writing

**Examples:**
- "Implement booking cancellation"
- "Fix race condition in auth"
- "Add validation to form"
- "Write unit tests for service"
- "Migrate to new API"

### Opus-Ultrathink (reserved for complex tasks)

**Use when:**
- Complex algorithmic problems
- Architectural decisions
- Security-sensitive code
- Performance optimization
- Tricky edge cases
- Debugging mysterious issues
- Meta-programming (code that writes code)

**Examples:**
- "Design caching strategy"
- "Optimize query performance"
- "Fix intermittent test failure"
- "Implement complex state machine"
- "Create code generator"

## Escalation Triggers

### Automatic Escalation

Orchestrator escalates when:

| Trigger | Action |
|---------|--------|
| Task fails | Retry with next model up |
| Worker reports "too complex" | Escalate immediately |
| Worker reports "uncertain" | Escalate if pattern continues |
| Audit finds same issue twice | Escalate the fixer |

### Escalation Limits

- **Max retries per task**: 1 (original + 1 escalation)
- **Max escalation**: opus-ultrathink
- **After max escalation fails**: Pause for human

```
haiku fails → retry with opus
opus fails → retry with opus-ultrathink
opus-ultrathink fails → STOP, ask human
```

## Escalation Protocol

When escalating:

1. **Log the escalation** in plan file
2. **Preserve context** from failed attempt
3. **Add failure analysis** to new task prompt
4. **Mark task** with `[^]` in plan

### Enhanced Prompt for Escalated Task

```markdown
**Task**: {original task}
**Escalated from**: {model}
**Previous attempt**:
- Error: {what went wrong}
- Attempted: {what was tried}
- Files touched: {list}

**Additional context**:
{any learnings from the failure}

**Expectation**: Handle edge cases that simpler model missed.
```

## De-escalation

Not common, but possible:

- If opus-ultrathink solves quickly → note for future similar tasks
- Pattern emerges → update Architect's model selection heuristics

## Cost Awareness

Model costs (relative):
- haiku: 1x (baseline)
- opus: ~10x
- opus-ultrathink: ~25x + thinking tokens

Optimize by:
1. **Start simple** - haiku first
2. **Escalate on failure** - don't preemptively upgrade
3. **Batch similar tasks** - same model, parallel execution
4. **Learn from escalations** - update initial assignments

## Fixer Escalation

Fixers (post-audit) follow same rules:

```
haiku fixer for auto-fixable issues
   ↓ if fix fails
opus fixer
   ↓ if still fails
Report as "needs human review"
```

Fixers should NOT escalate to opus-ultrathink - if opus can't fix it, human needs to review.

## Failure Categories

### Escalatable Failures

| Failure Type | Why Escalate |
|--------------|--------------|
| Logic error | Need deeper reasoning |
| Missing context | Need better codebase understanding |
| Complex types | Need stronger type inference |
| Edge case missed | Need thorough analysis |

### Non-Escalatable Failures

| Failure Type | Action |
|--------------|--------|
| Missing dependency | Pause, ask human to install |
| Permission error | Pause, ask human to configure |
| External API down | Pause, retry later |
| Task description unclear | Pause, ask for clarification |

## Tracking Escalations

Record in plan file:

```markdown
### Execution Log

#### {timestamp}
**Wave**: 2
**Task**: 2.3
**Action**: Escalated haiku → opus
**Reason**: Type inference failed, needed understanding of Effect patterns
**Result**: Success on retry
```

## Metrics for Improvement

Track over time:
- Escalation rate per task type
- Success rate after escalation
- Tasks that always need opus/ultrathink

Use metrics to improve Architect's initial model selection.
