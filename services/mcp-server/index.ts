// services/mcp-server/index.ts
// MCP Server for Camoufox browser control (built-in, no extension needed)
// Directly calls existing browser-service HTTP API

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Browser Service HTTP client (port 7704)
const BROWSER_SERVICE_BASE = process.env.WEBAUTO_BROWSER_URL || "http://127.0.0.1:7704";

async function browserApiCall(action: string, args: Record<string, any>) {
  const res = await fetch(`${BROWSER_SERVICE_BASE}/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, args }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Browser service error: ${res.status} ${JSON.stringify(body)}`);
  return body;
}

const server = new Server(
  { name: "webauto-camoufox-mcp", version: "0.1.0" },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "browser_create_session",
        description: "Create a new browser session with Camoufox",
        inputSchema: {
          type: "object",
          properties: {
            profileId: { type: "string", description: "Profile ID" },
            headless: { type: "boolean", description: "Run in headless mode (default false)" },
            url: { type: "string", description: "Initial URL to navigate to" },
          },
          required: ["profileId"],
        },
      },
      {
        name: "browser_close_session",
        description: "Close a browser session",
        inputSchema: {
          type: "object",
          properties: {
            profileId: { type: "string", description: "Profile ID" },
          },
          required: ["profileId"],
        },
      },
      {
        name: "browser_navigate",
        description: "Navigate to a URL in the browser",
        inputSchema: {
          type: "object",
          properties: {
            profileId: { type: "string", description: "Profile ID" },
            url: { type: "string", description: "Target URL" },
            waitUntil: { type: "string", description: "Navigation wait condition (domcontentloaded/networkidle)" },
          },
          required: ["profileId", "url"],
        },
      },
      {
        name: "browser_click",
        description: "Click an element by selector using system mouse",
        inputSchema: {
          type: "object",
          properties: {
            profileId: { type: "string", description: "Profile ID" },
            selector: { type: "string", description: "CSS selector" },
          },
          required: ["profileId", "selector"],
        },
      },
      {
        name: "browser_type",
        description: "Type text into an input element",
        inputSchema: {
          type: "object",
          properties: {
            profileId: { type: "string", description: "Profile ID" },
            selector: { type: "string", description: "CSS selector" },
            text: { type: "string", description: "Text to type" },
            delay: { type: "number", description: "Keystroke delay in ms (default 50)" },
          },
          required: ["profileId", "selector", "text"],
        },
      },
      {
        name: "browser_screenshot",
        description: "Take a screenshot of the current page",
        inputSchema: {
          type: "object",
          properties: {
            profileId: { type: "string", description: "Profile ID" },
            fullPage: { type: "boolean", description: "Capture full page (default true)" },
          },
          required: ["profileId"],
        },
      },
      {
        name: "browser_evaluate",
        description: "Evaluate JavaScript in the page context",
        inputSchema: {
          type: "object",
          properties: {
            profileId: { type: "string", description: "Profile ID" },
            script: { type: "string", description: "JavaScript code to evaluate" },
          },
          required: ["profileId", "script"],
        },
      },
      {
        name: "browser_get_status",
        description: "Get browser session status",
        inputSchema: {
          type: "object",
          properties: {
            profileId: { type: "string", description: "Profile ID" },
          },
          required: ["profileId"],
        },
      },
      {
        name: "browser_mouse_click",
        description: "Click at specific coordinates using system mouse",
        inputSchema: {
          type: "object",
          properties: {
            profileId: { type: "string", description: "Profile ID" },
            x: { type: "number", description: "X coordinate" },
            y: { type: "number", description: "Y coordinate" },
          },
          required: ["profileId", "x", "y"],
        },
      },
    ],
  };
});

// Tool execution handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "browser_create_session": {
        const { profileId, headless = false, url } = args as { profileId: string; headless?: boolean; url?: string };
        const result = await browserApiCall("start", { profileId, headless, url });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "browser_close_session": {
        const { profileId } = args as { profileId: string };
        const result = await browserApiCall("close", { profileId });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "browser_navigate": {
        const { profileId, url, waitUntil = "domcontentloaded" } = args as { profileId: string; url: string; waitUntil?: string };
        const result = await browserApiCall("navigate", { profileId, url, waitUntil });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "browser_click": {
        const { profileId, selector } = args as { profileId: string; selector: string };
        const result = await browserApiCall("click", { profileId, selector });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "browser_type": {
        const { profileId, selector, text, delay = 50 } = args as { profileId: string; selector: string; text: string; delay?: number };
        const result = await browserApiCall("type", { profileId, selector, text, delay });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "browser_screenshot": {
        const { profileId, fullPage = true } = args as { profileId: string; fullPage?: boolean };
        const result = await browserApiCall("screenshot", { profileId, fullPage });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "browser_evaluate": {
        const { profileId, script } = args as { profileId: string; script: string };
        const result = await browserApiCall("evaluate", { profileId, script });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "browser_get_status": {
        const { profileId } = args as { profileId: string };
        const result = await browserApiCall("status", { profileId });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "browser_mouse_click": {
        const { profileId, x, y } = args as { profileId: string; x: number; y: number };
        const result = await browserApiCall("mouseClick", { profileId, x, y });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

// Resources - list active sessions
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "browser://sessions",
        name: "Active Browser Sessions",
        mimeType: "application/json",
      },
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  if (uri === "browser://sessions") {
    try {
      const result = await browserApiCall("list", {});
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (e: any) {
      return {
        contents: [{ uri, mimeType: "text/plain", text: `Error: ${e.message}` }],
      };
    }
  }
  throw new Error(`Unknown resource: ${uri}`);
});

// Start server
const transport = new StdioServerTransport();
server.connect(transport).then(() => {
  console.error("WebAuto Camoufox MCP Server running on stdio");
  console.error(`Connected to Browser Service at ${BROWSER_SERVICE_BASE}`);
});
