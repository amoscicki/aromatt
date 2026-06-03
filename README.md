# aromatt

Claude Code plugins marketplace.

## Plugins

| Plugin | Description |
|--------|-------------|
| [docs-researcher](./docs-researcher) | Research technical documentation and create knowledge files |
| [cursor-cli-subagent](./cursor-cli-subagent) | Delegate bounded tasks to native Windows Cursor Agent CLI |
| [payload](./payload) | Payload CMS query/mutate CLI via persistent local server |
| [swarm](./swarm) | Multi-agent parallel task orchestration with wave-based execution |

## Installation

Add to your Claude Code settings:

```json
{
  "plugins": [
    "aromatt/cursor-cli-subagent",
    "aromatt/docs-researcher",
    "aromatt/payload",
    "aromatt/swarm"
  ]
}
```
