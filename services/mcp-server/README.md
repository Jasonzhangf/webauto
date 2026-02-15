# WebAuto Camoufox MCP Server

 Built-in MCP server for controlling Camoufox browser via Browser Service HTTP API (port 7704).
No browser extension required.

## Usage

### Start Unified API first
```bash
npm run service:browser:start
```

### Start Unified API (optional, for unified action router)
```bash
npm run service:browser:start
```

### Start MCP Server
```bash
npm run start:mcp:camoufox
```

### Available Tools

| Tool | Description |
|------|-------------|
| `browser_create_session` | Create a new browser session with Camoufox |
| `browser_close_session` | Close a browser session |
| `browser_navigate` | Navigate to a URL |
| `browser_click` | Click an element by selector using system mouse |
| `browser_type` | Type text into an input |
| `browser_screenshot` | Take a screenshot |
| `browser_evaluate` | Evaluate JavaScript |
| `browser_get_status` | Get session status |
| `browser_mouse_click` | Click at specific coordinates |

### Configuration

Environment variable:
- `WEBAUTO_BROWSER_URL`: Browser Service URL (default: http://127.0.0.1:7704)

### Integration with AI Clients

For Claude Desktop / Codex, add to your MCP config:
```json
{
  "mcpServers": {
    "webauto-camoufox": {
      "command": "tsx",
      "args": ["services/mcp-server/index.ts"],
      "env": {
        "WEBAUTO_BROWSER_URL": "http://127.0.0.1:7704"
      }
    }
  }
}
```
