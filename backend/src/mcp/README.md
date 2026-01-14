# MCP tool registrations (Azure Functions)

This folder contains the Azure Functions MCP tool registrations via `app.mcpTool(...)`.

## Source of truth

- **Registered tools**: `backend/src/mcp/**` (this folder)
- **Handler implementations**: `backend/src/handlers/mcp/**`
- **Canonical documentation**: `docs/architecture/agentic-ai-and-mcp.md` (tool catalog + boundary guidance)

## Contract guidance

- Treat **`toolName`** (e.g. `get-location-context`) as the stable client contract.
- Treat the Azure Functions registration name (e.g. `WorldContext-getLocationContext`) as an implementation detail.

## Security boundary (gateway-first)

- The **website gameplay client must not call MCP tools directly**.
- External narrators (VS Code / Teams / agent runners) must go through the platform boundary (**Entra ID / APIM**), with quotas enforced there.
- Do not introduce per-tool API keys as the primary security model.

Tracking:

- Auth boundary: GitHub issue #428
- Quotas/rate limiting: GitHub issue #429
