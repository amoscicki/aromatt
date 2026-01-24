# Knowledge Document Template

Complete template for `.claude/skills/project-knowledge-base/references/` files.

## File Structure

```markdown
---
topic: "{Descriptive Title of the Topic}"
technology: "{technology-name}"
version: "{X.Y.Z or 'latest'}"
sources:
  - https://official-docs.example.com/page
  - https://secondary-source.example.com/article
created: YYYY-MM-DD
context: "{Original problem or task that triggered this research}"
---

# {Topic Title}

## Summary

{2-3 sentences providing quick overview of key findings.
Should answer: What is this? Why does it matter for our context?}

## Key Concepts

{Core concepts needed to understand and use this feature/pattern.
Keep focused on the stated context - not encyclopedic coverage.}

### {Concept 1}

{Explanation with emphasis on practical application}

### {Concept 2}

{Explanation with emphasis on practical application}

## Code Examples

{Relevant, complete code snippets. Each example should be:
- Self-contained (can be copied and used)
- Commented where non-obvious
- Matched to stated context}

### Basic Usage

```{language}
// Example code here
```

### {Context-Specific Pattern}

```{language}
// Example addressing the specific use case
```

## Common Pitfalls

{Mistakes to avoid, based on the context. Include:
- What goes wrong
- Why it happens
- How to fix/avoid}

### {Pitfall 1}

**Problem**: {Description}
**Solution**: {How to avoid or fix}

## Related

{Optional: Links to related topics if user might need to explore further}

- [{Related Topic 1}]({url}) - {why relevant}
- [{Related Topic 2}]({url}) - {why relevant}
```

## Frontmatter Fields

### topic (required)
Human-readable title describing the content.

**Good**: "React useEffect Cleanup for Subscriptions"
**Bad**: "useEffect" (too vague)

### technology (required)
Lowercase name of the library/framework.

**Good**: "react", "effect", "prisma"
**Bad**: "React.js", "Effect-TS" (not normalized)

### version (required)
Semantic version or "latest" if version-agnostic.

**Good**: "18.2.0", "3.x", "latest"
**Bad**: "new", "current" (ambiguous)

### sources (required)
List of URLs used to create this document.

**Good**: Full URLs to specific pages
**Bad**: Domain names only, or missing sources

### created (required)
ISO date when document was created.

**Format**: YYYY-MM-DD
**Example**: 2025-01-15

### context (required)
The original problem or task that triggered this research.

**Good**: "Memory leak in subscription component using useEffect"
**Bad**: "Learning React" (too vague to filter relevance)

## Section Guidelines

### Summary
- Maximum 3 sentences
- Answer "what" and "why it matters"
- Skip if document is very short

### Key Concepts
- Only concepts needed for the stated context
- Use subheadings for distinct concepts
- Practical focus, not theoretical

### Code Examples
- Must be complete and runnable
- Include imports if non-obvious
- Comment complex parts
- At least one example matching exact context

### Common Pitfalls
- Only pitfalls relevant to stated context
- Include problem, cause, and solution
- Skip if none found during research

### Related
- Optional section
- Only include if genuinely helpful for next steps
- Maximum 3-4 links

## Length Guidelines

| Context Type | Target Length |
|--------------|---------------|
| Specific error | 200-400 words |
| Feature usage | 400-800 words |
| Pattern/concept | 600-1200 words |
| New technology intro | 800-1500 words |

Err on the side of concise. This is a reference, not a tutorial.

## Example: Completed Document

```markdown
---
topic: "React useEffect Cleanup for Subscriptions"
technology: "react"
version: "18.x"
sources:
  - https://react.dev/reference/react/useEffect#connecting-to-an-external-system
  - https://react.dev/learn/synchronizing-with-effects#how-to-handle-the-effect-firing-twice-in-development
created: 2025-01-15
context: "Memory leak in subscription component - WebSocket not closing on unmount"
---

# React useEffect Cleanup for Subscriptions

## Summary

useEffect cleanup functions run before the component unmounts and before every re-run of the effect. For subscriptions like WebSockets, the cleanup must close the connection to prevent memory leaks.

## Key Concepts

### Cleanup Function

Return a function from useEffect to clean up:

- Runs on unmount
- Runs before effect re-executes (if deps change)
- Must mirror the setup (if you subscribe, unsubscribe)

### Strict Mode Double-Invoke

React 18 Strict Mode runs effects twice in development to catch missing cleanups. If you see double connections, that's expected - fix by adding proper cleanup.

## Code Examples

### WebSocket Subscription

```tsx
useEffect(() => {
  const ws = new WebSocket('wss://api.example.com');

  ws.onmessage = (event) => {
    setData(JSON.parse(event.data));
  };

  // Cleanup: close connection on unmount
  return () => {
    ws.close();
  };
}, []); // Empty deps = connect once
```

### Event Listener Pattern

```tsx
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  window.addEventListener('keydown', handler);

  return () => {
    window.removeEventListener('keydown', handler);
  };
}, [onClose]);
```

## Common Pitfalls

### Missing Cleanup

**Problem**: WebSocket stays open after component unmounts
**Solution**: Always return cleanup function that closes/unsubscribes

### Stale Closure in Cleanup

**Problem**: Cleanup references old state/props
**Solution**: Include dependencies in deps array, or use refs for mutable values

## Related

- [Synchronizing with Effects](https://react.dev/learn/synchronizing-with-effects) - full effects guide
- [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) - when to avoid effects
```
