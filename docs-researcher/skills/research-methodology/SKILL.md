---
name: Research Methodology
description: This skill should be used when docs-researcher agent needs guidance on "how to search documentation", "WebSearch query patterns", "filtering search results", "documentation research strategy", or "creating knowledge files". Provides systematic methodology for effective technical documentation research.
version: 0.1.0
---

# Research Methodology for Documentation

This skill provides systematic approach to researching technical documentation using WebSearch and WebFetch tools.

## Core Principles

1. **Validate before research** - Ensure request is specific enough
2. **Check local first** - Look in `.claude/knowledge/` before searching
3. **Official sources priority** - Start with official docs
4. **Filter aggressively** - Extract only what's relevant to context
5. **Save for reuse** - Document findings in standard format

## Request Validation

A valid research request must contain three elements:

| Element | Example | Invalid |
|---------|---------|---------|
| Technology | "React", "Effect", "Prisma" | "JavaScript library" |
| Topic | "useEffect cleanup", "pipe operator" | "how it works" |
| Context | "fixing memory leak in subscription" | "learning" |

If any element is missing, return validation error and request clarification.

## Search Strategy

### Query Formulation

Build queries progressively:

```
Level 1 (Official): {technology} official documentation {topic}
Level 2 (Tutorial): {technology} {topic} tutorial example
Level 3 (Problem): {technology} {topic} {error-message} solution
```

### Source Hierarchy

Prioritize sources in this order:

1. **Official documentation** (always check first)
   - react.dev, docs.python.org, effect.website
   - GitHub official repos and examples

2. **Trusted secondary sources**
   - MDN Web Docs (web technologies)
   - DigitalOcean Community tutorials
   - Dev.to (high-quality articles only)
   - Stack Overflow (accepted answers)

3. **Avoid**
   - SEO-optimized content farms
   - Outdated tutorials (check dates)
   - AI-generated summaries
   - Forums without accepted solutions

### WebSearch Patterns

Reference `references/query-patterns.md` for specific query templates per technology domain.

## Filtering Results

### Relevance Criteria

Include information that:
- Directly addresses the stated context
- Provides actionable code examples
- Explains common pitfalls for the use case
- Is current (matches stated version or latest)

Exclude information that:
- Is tangentially related
- Covers advanced edge cases not needed
- Is deprecated or version-mismatched
- Duplicates what's already found

### Extraction Process

1. Scan search results for relevance
2. Open 2-3 most promising sources
3. Extract specific sections, not entire pages
4. Verify code examples are complete
5. Note version compatibility

## Document Format

Save all knowledge files to `.claude/knowledge/` using the template in `references/document-template.md`.

### File Naming

Format: `{technology}-{topic}.md`

Examples:
- `react-useeffect-cleanup.md`
- `effect-pipe-operator.md`
- `prisma-relations.md`
- `nextauth-jwt-session.md`

Rules:
- All lowercase
- Hyphens between words
- Technology first, then topic
- No version numbers in filename

### Frontmatter Structure

Required fields in YAML frontmatter:
- `topic`: Descriptive title
- `technology`: Library/framework name
- `version`: Version researched (or "latest")
- `sources`: List of URLs used
- `created`: Date in YYYY-MM-DD format
- `context`: Original problem that triggered research

## Quality Checklist

Before saving knowledge document, verify:

- [ ] Request was properly validated
- [ ] Existing knowledge was checked first
- [ ] Official sources were consulted
- [ ] Content is specific to stated context
- [ ] Code examples are complete and tested
- [ ] Sources are cited
- [ ] File follows naming convention
- [ ] Frontmatter is complete

## Additional Resources

### Reference Files

- **`references/query-patterns.md`** - Technology-specific search query templates
- **`references/document-template.md`** - Complete knowledge document template

### Implementation Notes

This methodology is designed for Haiku model execution. Instructions are explicit and procedural to ensure consistent results across model capabilities.
