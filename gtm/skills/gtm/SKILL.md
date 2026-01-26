---
name: gtm
description: Run a local Node CLI for Google Tag Manager API v2 (OAuth2) using repo-local tokens in .gtm/.
allowed-tools: Bash(node:*)
argument-hint: "auth credentials set --file <path> | auth credentials paste-win --overwrite | auth login --preset edit | accounts list | containers list --accountId <id> | workspaces list --accountId <id> --containerId <id> | tags list --accountId <id> --containerId <id> --workspaceId <id>"
---

Run the GTM CLI and return ONLY the JSON printed to stdout.

Command:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/gtm.js $ARGUMENTS
```

Notes:
- Credentials/tokens are stored plugin-local (in the gtm plugin's `scripts/.gtm/` directory).
- Once authenticated, works from any project.
- If credentials are missing, use `auth credentials set --file ...` or clipboard paste.
- Default login scope is edit (`tagmanager.edit.containers`).
