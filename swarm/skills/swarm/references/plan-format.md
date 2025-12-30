# Swarm Plan Format

This document defines the structure for swarm execution plans stored in `.swarm/{task-slug}.md`.

## File Structure

```markdown
# Swarm: {Task Name}

## Status
- **State**: planning | executing | paused | completed | failed
- **Current Wave**: {N} of {total}
- **Started**: {ISO date}
- **Last Updated**: {ISO date}

## Goal
{Brief description of what this swarm accomplishes}

## Checkpoints
User-confirmed pause points:
- [ ] After Wave {N}: {reason}
- [x] After Wave {M}: {completed}

---

## Wave 1: {Wave Name}
**Status**: pending | in_progress | completed | failed
**Depends on**: - (none for first wave)

| ID | Task | Model | Status | Deps | Description |
|----|------|-------|--------|------|-------------|
| 1.1 | {name} | haiku | [ ] | - | {what to do} |
| 1.2 | {name} | opus | [ ] | 1.1 | {what to do} |

### Wave 1 Review (MANDATORY)
- [ ] AI Review: swarm-reviewer-ultrathink
- [ ] Priority: pending | LOW | MED | HIGH
- [ ] Report: `.swarm/reports/{slug}/wave-1/wave-review.md`
- [ ] Issues: {count} HIGH, {count} MED, {count} LOW

---

## Wave 2: {Wave Name}
**Status**: pending
**Depends on**: Wave 1

| ID | Task | Model | Status | Deps | Description |
|----|------|-------|--------|------|-------------|
| 2.1 | {name} | haiku | [ ] | 1.2 | {what to do} |

### Wave 2 Review (MANDATORY)
- [ ] AI Review: swarm-reviewer-ultrathink
- [ ] Priority: pending | LOW | MED | HIGH
- [ ] Report: `.swarm/reports/{slug}/wave-2/wave-review.md`
- [ ] Issues: {count} HIGH, {count} MED, {count} LOW

...

---

## Execution Log

### {ISO timestamp}
**Wave**: 1
**Action**: Started task 1.1
**Agent**: worker-haiku
**Result**: success | failed | escalated

### {ISO timestamp}
**Wave**: 1
**Action**: Audit completed
**Issues**: 3 style, 1 type error
**Auto-fixed**: 3, **Needs review**: 1

---

## Files Modified
- `path/to/file.ts` - Wave 1, Task 1.1
- `path/to/other.ts` - Wave 1, Task 1.2

## Notes
{Any relevant context, decisions, or issues for future reference}
```

## Field Definitions

### Status Values

| Field | Values | Meaning |
|-------|--------|---------|
| **State** | `planning` | Architect is generating/refining plan |
| | `executing` | Workers are running tasks |
| | `paused` | Waiting for user at checkpoint |
| | `completed` | All waves done successfully |
| | `failed` | Unrecoverable error, needs intervention |
| **Wave Status** | `pending` | Not started |
| | `in_progress` | Workers executing |
| | `completed` | All tasks done + audit passed |
| | `failed` | Task failed after escalation |
| **Task Status** | `[ ]` | Pending |
| | `[~]` | In progress |
| | `[x]` | Completed |
| | `[!]` | Failed |
| | `[^]` | Escalated to higher model |

### Model Values

| Model | Use For |
|-------|---------|
| `haiku` | Simple, mechanical tasks (deletions, renames, config changes) |
| `opus` | Standard implementation, integration, moderate complexity |
| `opus-ultrathink` | Complex reasoning, architecture decisions, tricky bugs |

### Dependencies

- `-` = no dependencies
- `1.1` = depends on task 1.1
- `1.1, 1.2` = depends on multiple tasks
- `Wave 1` = depends on entire wave (for wave-level deps)

## Minimal Template

For simple swarms, use this minimal format:

```markdown
# Swarm: {Task Name}

## Status
- **State**: planning

## Goal
{Description}

---

## Wave 1: {Name}

| ID | Task | Model | Status | Description |
|----|------|-------|--------|-------------|
| 1.1 | {name} | haiku | [ ] | {what} |

### Wave 1 Review (MANDATORY)
- [ ] AI Review: swarm-reviewer-ultrathink
- [ ] Priority: pending
- [ ] Report: `.swarm/reports/{slug}/wave-1/wave-review.md`

---

## Execution Log
(auto-populated during execution)
```

## CRITICAL: Architect Instructions

**EVERY wave MUST include a Review section.** This is NON-NEGOTIABLE.

When creating a plan, the Architect MUST:

1. **Add Review section to EVERY wave** - no exceptions
2. **Use exact format**:
   ```markdown
   ### Wave {N} Review (MANDATORY)
   - [ ] AI Review: swarm-reviewer-ultrathink
   - [ ] Priority: pending
   - [ ] Report: `.swarm/reports/{slug}/wave-{N}/wave-review.md`
   ```
3. **Never skip reviews** - even for single-task waves
4. **Plan assumes review** - task estimates don't include review time

**Why this matters**:
- Orchestrator spawns `swarm-reviewer-ultrathink` after EVERY wave
- Review catches cross-cutting issues before they propagate
- HIGH priority issues get fixed immediately, not at end of swarm
- MED/LOW issues are noted but don't block progress

## Adaptive Extensions

The plan format is adaptive. Add sections as needed:

- **Architecture Diagram**: ASCII art for complex systems
- **Decision Log**: Record of choices made during planning
- **Risk Register**: Known risks and mitigations
- **Rollback Plan**: How to undo if things go wrong
- **External Dependencies**: APIs, services, credentials needed

## Plan File Naming

```
.swarm/{descriptive-task-summary}-{status}.md
```

**Format**:
- `{descriptive-task-summary}` = 10-20 words in kebab-case describing what the plan does
- `{status}` = `inprogress` | `paused` | `completed`

**Examples**:
```
.swarm/check-and-fix-jsdoc-headers-on-all-staged-unstaged-typescript-files-inprogress.md
.swarm/refactor-auth-service-to-use-new-token-validation-pattern-paused.md
.swarm/add-recharts-analytics-dashboard-to-admin-panel-with-weekly-stats-completed.md
.swarm/fix-typescript-strict-mode-errors-in-domain-services-layer-inprogress.md
```

**Naming rules**:
- Lowercase kebab-case
- 10-20 words that clearly describe the task scope
- Status suffix always present
- No dates in filename (use metadata inside file)

**Why this format**:
- **Descriptive names** → know what plan does without opening file
- **Status suffix** → `Glob("*-inprogress.md")` instantly filters active plans
- **Completed plans** → easily ignored when searching for duplicates
- **No dates** → task description is more useful than timestamp

**Status transitions**:
```
{name}-inprogress.md  →  {name}-paused.md      (user interrupts)
{name}-inprogress.md  →  {name}-completed.md   (all waves done)
{name}-paused.md      →  {name}-inprogress.md  (user resumes)
```

## Orchestrator Rules

1. **Only orchestrator writes to plan file** - workers report back, orchestrator updates
2. **Update after each significant event** - task completion, audit results, failures
3. **Execution log is append-only** - never delete entries, only add
4. **Keep Files Modified section current** - for quick impact assessment

## Report Directory Structure

Reports are organized hierarchically per swarm plan and wave:

```
.swarm/
├── {plan-slug}-{status}.md              # Plan file
├── reports/
│   ├── {plan-slug}/                     # Folder per swarm (matches plan name)
│   │   ├── architect.md                 # Architect's planning report
│   │   ├── wave-0/                      # Wave 0 (if exists)
│   │   │   ├── task-0.1.md              # Task reports
│   │   │   └── wave-review.md           # Wave review (MANDATORY)
│   │   ├── wave-1/
│   │   │   ├── task-1.1.md
│   │   │   ├── task-1.2.md
│   │   │   ├── task-1.3.md
│   │   │   └── wave-review.md
│   │   ├── wave-2/
│   │   │   └── ...
│   │   └── summary.md                   # Final swarm summary
│   └── (legacy files - not migrated)
├── refs/
│   ├── {plan-slug}/                     # Reference docs per swarm
│   │   ├── architecture.md              # Architecture decisions
│   │   ├── research.md                  # Research findings
│   │   └── {topic}/                     # Subdirectory for complex topics
│   │       ├── overview.md
│   │       └── details.md
│   └── (legacy files - not migrated)
└── ...
```

### Path Patterns

| Content Type | Path Pattern |
|--------------|--------------|
| **Reports** | |
| Architect | `.swarm/reports/{plan-slug}/architect.md` |
| Task | `.swarm/reports/{plan-slug}/wave-{N}/task-{ID}.md` |
| Wave Review | `.swarm/reports/{plan-slug}/wave-{N}/wave-review.md` |
| Final Summary | `.swarm/reports/{plan-slug}/summary.md` |
| **Reference Docs** | |
| Architecture | `.swarm/refs/{plan-slug}/architecture.md` |
| Research | `.swarm/refs/{plan-slug}/research.md` |
| Topic subfolder | `.swarm/refs/{plan-slug}/{topic}/*.md` |

### Naming Conventions

- `{plan-slug}` = same as plan filename without status suffix
  - Plan: `fix-auth-service-tokens-inprogress.md`
  - Reports folder: `reports/fix-auth-service-tokens/`
- Task IDs match plan: task `2.3` → `wave-2/task-2.3.md`
- All lowercase kebab-case

### Worker Report Instructions

Workers MUST write reports to the correct path:

```markdown
Write(".swarm/reports/{plan-slug}/wave-{N}/task-{ID}.md", """
# Task {ID} Report

## Status: success | failed | partial

## Changes Made
- file1.ts: description
- file2.ts: description

## Technical Notes
{implementation details}
""")
```

### Benefits

- **Discoverability**: `Glob("reports/{plan-slug}/**")` finds all reports for a swarm
- **Context**: Reports grouped by wave show execution progression
- **Cleanup**: Delete entire `reports/{plan-slug}/` folder when archiving
- **Audit trail**: Wave-level audit reports adjacent to task reports
