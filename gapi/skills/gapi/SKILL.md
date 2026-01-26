---
name: gapi
description: Run local Node CLIs for Google Tag Manager and Google Analytics Admin APIs (OAuth2). Use for GTM containers/tags/triggers or GA properties/data-streams.
allowed-tools: Bash(node:*)
argument-hint: "gtm accounts list | ga properties list --accountId <id>"
---

Two CLIs for Google APIs, sharing the same OAuth credentials.

## Commands

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/gtm.js $ARGUMENTS   # Google Tag Manager API v2
node ${CLAUDE_PLUGIN_ROOT}/scripts/ga.js $ARGUMENTS    # Google Analytics Admin API v1
```

Run with `help` for full command list.

## Setup

### Credentials

Store OAuth client credentials in `scripts/.gapis/credentials.json`:

```bash
# From file
node ${CLAUDE_PLUGIN_ROOT}/scripts/gtm.js auth credentials set --file /path/to/credentials.json

# From clipboard
node ${CLAUDE_PLUGIN_ROOT}/scripts/gtm.js auth credentials paste-win --overwrite   # Windows
node ${CLAUDE_PLUGIN_ROOT}/scripts/gtm.js auth credentials paste-macos --overwrite # macOS
```

### Login

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/gtm.js auth login                 # edit scope (default)
node ${CLAUDE_PLUGIN_ROOT}/scripts/gtm.js auth login --preset readonly
node ${CLAUDE_PLUGIN_ROOT}/scripts/gtm.js auth login --preset publish
```

Scopes are combined for both APIs:
- `readonly`: tagmanager.readonly + analytics.readonly
- `edit`: tagmanager.edit.containers + analytics.edit
- `publish`: above + tagmanager.publish

---

## GTM Reference (93 commands)

### Hierarchy
```
accounts > containers > workspaces > tags/triggers/variables/...
                      > environments
                      > versions
```

### Commands

| Resource | Actions |
|----------|---------|
| accounts | list, get, update |
| containers | list, get, create, update, delete |
| workspaces | list, get, create, update, delete, sync, quick-preview, get-status, create-version |
| tags | list, get, create, update, delete, revert |
| triggers | list, get, create, update, delete, revert |
| variables | list, get, create, update, delete, revert |
| folders | list, get, create, update, delete, revert, move-entities |
| clients | list, get, create, update, delete, revert *(server containers)* |
| templates | list, get, create, update, delete, revert |
| zones | list, get, create, update, delete, revert |
| transformations | list, get, create, update, delete, revert *(server containers)* |
| built-in-variables | list, create, delete, revert |
| environments | list, get, create, update, delete, reauthorize |
| versions | list, get, publish, set-latest, delete, undelete, live, update |
| user-permissions | list, get, create, update, delete |

### Required Flags

| Resource | Flags |
|----------|-------|
| accounts | *(none for list)* |
| containers | `--accountId` |
| workspaces | `--accountId --containerId` |
| tags/triggers/variables/etc | `--accountId --containerId --workspaceId` |
| environments | `--accountId --containerId` |
| versions | `--accountId --containerId` |

### Examples

```bash
# List accounts
node ${CLAUDE_PLUGIN_ROOT}/scripts/gtm.js accounts list

# List containers
node ${CLAUDE_PLUGIN_ROOT}/scripts/gtm.js containers list --accountId 6310095540

# List tags in workspace
node ${CLAUDE_PLUGIN_ROOT}/scripts/gtm.js tags list --accountId 6310095540 --containerId 228346062 --workspaceId 20

# Get specific tag
node ${CLAUDE_PLUGIN_ROOT}/scripts/gtm.js tags get --accountId 6310095540 --containerId 228346062 --workspaceId 20 --tagId 21

# Get live version
node ${CLAUDE_PLUGIN_ROOT}/scripts/gtm.js versions live --accountId 6310095540 --containerId 228346062

# Create tag (JSON via stdin)
echo '{"name":"My Tag","type":"html"}' | node ${CLAUDE_PLUGIN_ROOT}/scripts/gtm.js tags create --accountId <id> --containerId <id> --workspaceId <id>
```

---

## GA Reference (49 commands)

### Hierarchy
```
accounts > properties > data-streams > mp-secrets
                      > custom-dimensions
                      > custom-metrics
                      > key-events
                      > google-ads-links
                      > firebase-links
```

### Commands

| Resource | Actions |
|----------|---------|
| accounts | list, get, delete, patch, search-change-history |
| account-summaries | list |
| properties | list, get, create, delete, patch, get-data-retention, update-data-retention |
| data-streams | list, get, create, delete, patch |
| custom-dimensions | list, get, create, patch, archive |
| custom-metrics | list, get, create, patch, archive |
| key-events | list, get, create, delete, patch |
| google-ads-links | list, create, delete, patch |
| firebase-links | list, create, delete |
| mp-secrets | list, get, create, delete, patch |

### Required Flags

| Resource | Flags |
|----------|-------|
| accounts | *(none for list)* |
| account-summaries | *(none)* |
| properties | `--accountId` (for list) or `--propertyId` (for get/patch) |
| data-streams | `--propertyId` |
| custom-dimensions/metrics | `--propertyId` |
| key-events | `--propertyId` |
| google-ads-links | `--propertyId` |
| firebase-links | `--propertyId` |
| mp-secrets | `--propertyId --dataStreamId` |

### Examples

```bash
# List accounts
node ${CLAUDE_PLUGIN_ROOT}/scripts/ga.js accounts list

# List account summaries (includes properties)
node ${CLAUDE_PLUGIN_ROOT}/scripts/ga.js account-summaries list

# List properties
node ${CLAUDE_PLUGIN_ROOT}/scripts/ga.js properties list --accountId 40457743

# Get property
node ${CLAUDE_PLUGIN_ROOT}/scripts/ga.js properties get --propertyId 452774256

# List data streams
node ${CLAUDE_PLUGIN_ROOT}/scripts/ga.js data-streams list --propertyId 452774256

# List key events (conversions)
node ${CLAUDE_PLUGIN_ROOT}/scripts/ga.js key-events list --propertyId 452774256

# Create key event (JSON via stdin)
echo '{"eventName":"sign_up","countingMethod":"ONCE_PER_EVENT"}' | node ${CLAUDE_PLUGIN_ROOT}/scripts/ga.js key-events create --propertyId <id>
```
