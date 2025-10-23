# MCP Browser Server Integration (Codex)

This repo includes a Codex-compatible MCP client configuration to use the Browser MCP server for page inspection and DOM anchor checks.

## 1) Add MCP server to Codex config

Copy `config/codex.mcp.json` into your Codex configuration (or merge the `mcpServers` block into your existing Codex JSON settings):

```json
{
  "mcpServers": {
    "browsermcp": {
      "command": "npx",
      "args": ["@browsermcp/mcp@latest"]
    }
  }
}
```

Alternatively, run directly:

```bash
npm run start:mcp:browser
```

This will launch the Browser MCP server which exposes navigation and DOM tools.

## 2) Suggested anchors to inspect

See `config/anchors/1688-anchors.json` for the full list of stage anchors (home, search results, chat target, send area). Use the Browser MCP tools to:

- open https://www.1688.com/ and assert avatar/search input (home anchor)
- open the GBK search URL and assert the search results container (search anchor)
- attach to air.1688.com chat tab, assert chat target header/selection (chat target anchor)
- assert send area: contenteditable input + a visible send button/span (send area anchor)

## 3) Example MCP tool usage (typical prompts)

- Navigate to URL and wait for `domcontentloaded`.
- Query for a selector and assert visibility.
- Iframes: select the iframe by URL substring `def_cbu_web_im_core` and query inside it.

> Exact tool names and JSON schemas depend on the Browser MCP server version. Use the MCP tool-list/introspection in Codex to discover available tools and their input schemas.

