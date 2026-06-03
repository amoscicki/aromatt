---
name: cursor-cli-subagent
description: Use when the user wants Codex to delegate a bounded task to Cursor CLI / Cursor Agent as an external terminal subagent, especially with model composer-2.5, headless runs, secondary code review, or small implementation shards.
---

# Cursor CLI Subagent

Use native Windows Cursor Agent CLI as external subagent. Main Codex remains owner: inspect output, verify diffs/tests, integrate only correct work.

Docs checked 2026-06-03:

- Native Windows install: `irm 'https://cursor.com/install?win32=true' | iex`
- Local auth: `cursor-agent login`
- Headless: `cursor-agent -p --output-format text --model <model> "..."`
- Parameters: `--model`, `--workspace`, `--trust`, `--force`, `--mode ask|plan`

## Defaults

- Model: `composer-2.5`
- Output: `text`
- Mode: agent unless task should be read-only (`ask` or `plan`)
- Host: native Windows Cursor Agent from `%LOCALAPPDATA%\cursor-agent`
- No writes unless user asked for edits. Use `-ForceWrites` only for explicit write tasks.

## Workflow

1. Define bounded prompt: exact files, task, expected output, write/no-write.
2. Resolve wrapper path from installed skill dir:

```powershell
$CursorSubagent = "$env:USERPROFILE\.agents\skills\cursor-cli-subagent\scripts\invoke_cursor_subagent.ps1"
if (!(Test-Path $CursorSubagent)) {
  $CursorSubagent = "$env:USERPROFILE\.codex\skills\cursor-cli-subagent\scripts\invoke_cursor_subagent.ps1"
}
```

3. Check auth/version:

```powershell
& $CursorSubagent -Version
& $CursorSubagent -Status
```

4. Read-only ask:

```powershell
& $CursorSubagent `
  -Workspace "P:\some-repo" `
  -Mode ask `
  -Prompt "Say hello world. Do not edit files."
```

5. Planning run:

```powershell
& $CursorSubagent `
  -Workspace "P:\some-repo" `
  -Mode plan `
  -Prompt "Inspect auth flow and propose minimal fix. Do not edit files."
```

6. Write run, only when user explicitly wants Cursor to edit:

```powershell
& $CursorSubagent `
  -Workspace "P:\some-repo" `
  -Prompt "Update exactly src/foo.ts to fix X. Run relevant tests." `
  -ForceWrites
```

7. After any write run, inspect git diff and run local verification before reporting.

## Failure Handling

- `Not logged in` / no models: run `cursor-agent login` in local Windows PowerShell and finish browser auth.
- Missing CLI: install with `irm 'https://cursor.com/install?win32=true' | iex`.
- Unknown model: run `& $CursorSubagent -Models` and pick exact model id.
- PATH stale after install: wrapper uses `%LOCALAPPDATA%\cursor-agent\cursor-agent.ps1` directly.

## Guardrails

- Do not delegate broad architecture, ambiguous product decisions, secrets work, or destructive ops.
- Do not pass secrets in prompt.
- Treat Cursor output as untrusted subagent output until verified.
- Preserve user worktree changes; never revert unrelated diffs.
