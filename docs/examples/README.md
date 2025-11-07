# Examples: Practical Code Walkthroughs

Concrete, runnable examples demonstrating key patterns and workflows. These examples serve as onboarding aids and reference implementations.

---

## Purpose

This layer (10,000 ft) provides:
- **Proof points**: Working code demonstrating architecture patterns
- **Onboarding aids**: New developers can run examples to understand the stack
- **Reference implementations**: Templates for common tasks

---

## Available Examples

### Backend & Infrastructure

1. **[Azure Function Endpoint (Player Bootstrap)](./function-endpoint-player.md)**
   - HTTP trigger structure
   - Stateless handler pattern
   - Telemetry integration
   - Testing locally

2. **[Gremlin Traversal Query (Finding Exits)](./gremlin-traversal-query.md)**
   - Cosmos DB Gremlin API usage
   - Spatial navigation queries
   - Security (parameterized queries)
   - Performance optimization

3. **[Seed Script Usage](./seed-script-usage.md)**
   - Idempotent world data initialization
   - In-memory vs Cosmos DB modes
   - Custom data files
   - Exit reciprocity patterns

---

### Testing & Quality

4. **[Accessibility Test Run](./accessibility-test-run.md)**
   - Automated axe-core scans
   - WCAG 2.2 AA compliance
   - Common violations & fixes
   - CI/CD integration

---

## How to Use This Layer

### For New Developers:
1. Start with [Seed Script Usage](./seed-script-usage.md) to populate test data
2. Run [Azure Function Endpoint](./function-endpoint-player.md) to understand backend patterns
3. Study [Gremlin Traversal Query](./gremlin-traversal-query.md) for graph interactions
4. Ensure all changes pass [Accessibility Test Run](./accessibility-test-run.md)

### For Experienced Developers:
- Use examples as templates for new endpoints or queries
- Reference examples when debugging integration issues
- Update examples when patterns change (keep them evergreen)

### For Code Reviews:
- Verify new code follows patterns demonstrated in examples
- Point to relevant examples when requesting changes
- Suggest new examples if common patterns emerge

---

## Example Taxonomy

Examples are organized by:
- **Category**: Backend, Frontend, Testing, Infrastructure
- **Complexity**: Beginner, Intermediate, Advanced
- **Prerequisites**: What must be installed/configured first

| Example                        | Category     | Complexity   | Prerequisites               |
| ------------------------------ | ------------ | ------------ | --------------------------- |
| Function Endpoint (Player)     | Backend      | Beginner     | Node.js 20+, Azure Functions Core Tools |
| Gremlin Traversal Query        | Backend      | Intermediate | Cosmos DB provisioned       |
| Seed Script Usage              | Infrastructure | Beginner   | Node.js 20+                 |
| Accessibility Test Run         | Testing      | Beginner     | Frontend dependencies       |

---

## Contributing New Examples

When adding a new example:

1. **Choose a clear title**: Action-oriented (e.g., "Deploying with Bicep", "Testing NPC Behavior")
2. **Follow the template**:
   ```markdown
   # Example: [Title]
   
   ## Purpose
   [One sentence: what does this demonstrate?]
   
   ## Code Location
   [File paths to relevant source code]
   
   ## Quick Start
   [Runnable commands with expected output]
   
   ## Key Patterns
   [Highlight 2-3 important design decisions]
   
   ## Troubleshooting
   [Common errors and fixes]
   
   ## Related Examples
   [Links to complementary examples]
   
   ## Related Documentation
   [Links to architecture, modules, ADRs]
   
   _Last updated: YYYY-MM-DD_
   ```
3. **Keep it concise**: Aim for 300-500 lines total
4. **Include output**: Show expected console output or responses
5. **Link to source**: Reference actual code files (don't duplicate)
6. **Update this index**: Add entry to "Available Examples" table

---

## Quality Standards

All examples must:
- ✅ Be runnable with documented prerequisites
- ✅ Include expected output or screenshots
- ✅ Reference actual code (no stale pseudocode)
- ✅ Explain "why" not just "how"
- ✅ Link to related architecture/design docs
- ✅ Pass accessibility scans (if UI-related)

---

## Maintenance Policy

Examples require periodic review:
- **Quarterly**: Verify all commands still work
- **On breaking changes**: Update affected examples immediately
- **On pattern evolution**: Deprecate old examples, add new ones

Stale examples are worse than no examples—delete if unmaintainable.

---

## Related Documentation Layers

| Layer                  | Altitude | Document                                     |
| ---------------------- | -------- | -------------------------------------------- |
| Vision                 | 60k ft   | `../vision-and-tenets.md` (Vision section)   |
| Tenets                 | 50k ft   | `../tenets.md`                               |
| Design Modules         | 40k ft   | `../design-modules/README.md`                |
| Architecture           | 30k ft   | `../architecture/mvp-azure-architecture.md`  |
| Roadmap                | 20k ft   | `../roadmap.md`                              |
| **Examples (You Are Here)** | **10k ft** | **(This file)**                        |
| Code                   | Ground   | `../../backend/`, `../../frontend/`          |

---

## Future Examples (Planned)

- **Bicep Deployment**: Provisioning infrastructure with IaC
- **Queue-Triggered Function**: Processing world events asynchronously
- **Application Insights Query**: Writing KQL for telemetry dashboards
- **MCP Read-Only Server**: Exposing world context to AI (M3)
- **Description Layer Validation**: Testing additive prose layers (M4)
- **Dungeon Instance Creation**: Spawning episodic subgraphs (M6)

Vote for prioritization in GitHub Discussions or propose new examples via issues tagged `docs`.

---

_Last updated: 2025-11-07 (initial creation for MECE documentation hierarchy)_
