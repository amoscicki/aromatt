---
name: research-methodology
description: This skill should be used when docs-researcher agent needs guidance on "how to search documentation", "WebSearch query patterns", "filtering search results", "documentation research strategy", or "creating knowledge files". Provides systematic methodology for effective technical documentation research.
version: 0.2.0
---

# Research Methodology for Documentation

This skill provides systematic approach to researching technical documentation using WebSearch and WebFetch tools.

## Core Principles

1. **Initialize first** - Ensure project knowledge base skill exists
2. **Validate before research** - Ensure request is specific enough
3. **Check local first** - Look in `.claude/skills/project-knowledge-base/references/` before searching
4. **Official sources priority** - Start with official docs
5. **Filter aggressively** - Extract only what's relevant to context
6. **Save for reuse** - Document findings in standard format

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

Save all knowledge files to `.claude/skills/project-knowledge-base/references/` using the template in `references/document-template.md`.

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

## Progressive Disclosure

**Threshold: 500 lines**

When a reference file exceeds 500 lines, split into a tree structure:

```
references/tanstack-router.md  (>500 lines)
↓ split to
references/tanstack-router/
├── _index.md        # Overview + TOC linking to sub-files
├── route-guards.md
├── data-loading.md
└── navigation.md
```

### When to Split

- Single reference file exceeds 500 lines
- Topic has clearly distinct sub-topics
- Different aspects serve different use cases

### Split Structure

1. **_index.md**: Overview, quick reference, TOC with links
2. **Sub-files**: One file per major sub-topic
3. **Cross-references**: Link between related sub-files

### SKILL.md Update

After splitting, update SKILL.md index to reference `_index.md`:
```markdown
- [tanstack-router](references/tanstack-router/_index.md) - TanStack Router comprehensive guide
```

## Quality Checklist

Before saving knowledge document, verify:

- [ ] Project knowledge base skill initialized
- [ ] Request was properly validated
- [ ] Existing knowledge was checked first
- [ ] Official sources were consulted
- [ ] Content is specific to stated context
- [ ] Code examples are complete and tested
- [ ] Sources are cited
- [ ] File follows naming convention
- [ ] Frontmatter is complete
- [ ] SKILL.md index updated
- [ ] Progressive disclosure applied if >500 lines

## Additional Resources

### Reference Files

- **`references/query-patterns.md`** - Technology-specific search query templates
- **`references/document-template.md`** - Complete knowledge document template

### Implementation Notes

This methodology is designed for Haiku model execution. Instructions are explicit and procedural to ensure consistent results across model capabilities.
