# gtm

Claude Code plugin: Google Tag Manager API v2 CLI + skill.

## One-time setup (per machine)

Install plugin dependencies in this plugin folder:

```bash
bun install
```

## Project setup (per repo)

This tool stores credentials and tokens in the current project directory:

- `.gtm/credentials.json`
- `.gtm/token.json`

Recommended `.gitignore` entries in your project:

```gitignore
/.gtm/credentials.json
/.gtm/token*.json
```

## Usage

Use the `gtm` skill (plugin) to run:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/gtm.js help
node ${CLAUDE_PLUGIN_ROOT}/scripts/gtm.js auth login
node ${CLAUDE_PLUGIN_ROOT}/scripts/gtm.js accounts list
```
