# Copilot Agents

This directory contains specialized Copilot agents for The Shifting Atlas project, using the standard agent file format for VS Code GitHub Copilot extensions.

## Agent File Format

All agent files use:

-   **File extension**: `.agent.md` or `.agents.md` (both supported as of v1.106)
-   **Code fence**: ` ```chatagent `
-   **Frontmatter**: YAML with required `name` and `description`, plus optional properties:
    -   `target`: `vscode` (local chat) or `github-copilot` (cloud/CLI agents)
    -   `tools`: Available tools for the agent
    -   `model`: Preferred language model
    -   `argument-hint`: Guidance shown in chat input
    -   `handoffs`: Enable agent-to-agent workflows
    -   `mcp-servers`: MCP server integrations (for `github-copilot` target)

## Available Agents

| Agent                                    | File                                             | Purpose                                                                                                                                   |
| ---------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Atlas Documentation Agent**            | `documentation.agent.md`                         | Maintains concise, accurate documentation; resolves conflicts; enforces MECE hierarchy (see `.github/copilot-instructions.md` Section 18) |
| **Atlas Game Logic Agent**               | `gamelogic.agent.md`                             | Expert in game mechanics, narrative design, D&D systems, faction/economy design, business logic                                           |
| **Azure Static Web App**                 | `Azure_Static_Web_App.agent.md`                  | Specialized in SWA development, deployment, configuration, and troubleshooting                                                            |
| **Azure Functions Codegen & Deployment** | `Azure_function_codegen_and_deployment.agent.md` | Enterprise-grade Azure Functions workflow with planning, code generation, testing, and IaC deployment                                     |

## Usage

### In VS Code Chat

1. Use the agent picker (@ symbol) to select a specialized agent
2. Or mention by name: `@documentation`, `@gamelogic`, etc.
3. Agents have access to repository context and specialized knowledge

### When to Use Each Agent

**Documentation Agent** (`@documentation`):

-   Fixing broken links or documentation conflicts
-   Reconciling design docs with ADRs
-   Maintaining MECE documentation hierarchy
-   Removing duplication between docs and code

**Game Logic Agent** (`@gamelogic`):

-   Designing new game mechanics (D&D-inspired systems)
-   Quest, dialogue, or narrative design
-   Economy, faction, or governance systems
-   Player progression and engagement loops
-   **Does NOT handle**: Infrastructure, frontend, backend implementation

**Azure Static Web App** (`@Azure_Static_Web_App`):

-   SWA project initialization and configuration
-   API integration with Azure Functions
-   Authentication and authorization setup
-   Deployment and troubleshooting

**Azure Functions Codegen** (`@Azure_function_codegen_and_deployment`):

-   Planning and generating Azure Functions
-   Best practices for code generation and deployment
-   Infrastructure as Code (Bicep/AVM)
-   Enterprise compliance and security

## Migration Notes

### Agent File Format Evolution (v1.106 - October 2025)

VS Code v1.106 renamed "chat modes" to "custom agents" and enhanced the agent file format:

**Legacy format (deprecated but still works)**:

-   Files in `.github/chatmodes/`
-   `.chatmode.md` file extension
-   Limited frontmatter properties

**Current format** (`.github/agents/`):

-   `.agent.md` or `.agents.md` file extension
-   ` ```chatagent ` code fence with enhanced YAML frontmatter
-   New properties: `target`, `argument-hint`, `handoffs`, `mcp-servers`
-   Can be used as GitHub Copilot Cloud Agents and CLI Agents

**Migration completed**: All agents migrated to current format on November 13, 2025.

### v1.106 New Features

-   **`target` property**: Specify `vscode` (local) or `github-copilot` (cloud/CLI)
-   **`argument-hint`**: Provide in-chat guidance for teammates
-   **`handoffs`**: Enable guided agent-to-agent workflow transitions
-   **Editor support**: Validation, completions, hovers, and code actions for agent files

## Development Guidelines

### Creating a New Agent

1. Create a new file in `.github/agents/` with `.agent.md` or `.agents.md` extension
2. Use this template (v1.106 format):

````markdown
```chatagent
---
name: Agent Display Name
description: Brief description of agent's purpose and expertise
target: vscode  # or 'github-copilot' for cloud/CLI agents
argument-hint: 'Example: @agent <task> [options]'  # Optional: shows guidance in chat
tools: ['edit', 'search', 'terminal']  # Optional
model: Claude Sonnet 4  # Optional
handoffs:  # Optional: enable agent-to-agent workflows
  - to: documentation
    description: For documentation-related tasks
---

# Agent Title

## Purpose and Scope

[Agent's role and expertise areas]

## When to Use

[Specific scenarios where this agent is most helpful]

## Out of Scope

[What this agent should defer or refuse]
```
````

```

3. Document the agent in:
   - This README
   - `docs/developer-workflow/using-copilot.md`

**Note**: The agent file editor in VS Code provides validation, completions, and hovers to help you configure properties correctly.

### Updating Existing Agents

When modifying agent instructions:
1. Test prompts to verify behavior
2. Keep descriptions concise (≤120 chars for table display)
3. Reference relevant project documentation (ADRs, design modules)
4. Update this README if purpose/scope changes

## References

- [VS Code Copilot Agents Documentation](https://code.visualstudio.com/docs/copilot/copilot-agents)
- [Using Copilot in This Repository](../../docs/developer-workflow/using-copilot.md)
- [Copilot Instructions](./../copilot-instructions.md)

---

_Last updated: 2025-11-13 (validated against VS Code v1.106 - October 2025 release)_
```
