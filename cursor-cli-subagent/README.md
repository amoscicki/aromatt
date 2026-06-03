# Cursor CLI Subagent

Skill for delegating bounded tasks to native Windows Cursor Agent CLI with `composer-2.5`.

## Install

```powershell
npx skills add P:\aromatt -g --skill cursor-cli-subagent --yes --full-depth
```

## Test

```powershell
cursor-agent -p --output-format text --model composer-2.5 --mode ask --trust --workspace "P:\cursor-cli-subagent-skill-test" "Say exactly: hello world. Do not edit files."
```
