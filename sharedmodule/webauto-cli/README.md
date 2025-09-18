# WebAuto CLI with MCP Support

An automated web processing program with MCP (Model Context Protocol) architecture.

## Installation

```bash
npm install -g webauto-cli
```

## Usage

### Running as MCP Server

To run WebAuto as an MCP server:

```bash
npx -y webauto-cli@0.0.1
```

Or directly:

```bash
npx -y webauto-cli@0.0.1 mcp
```

The server will start and listen for MCP messages over stdio.

### MCP Configuration for iFlow

The MCP server can be configured for iFlow using the `iflow-mcp-config.json` file:

```json
{
  "mcpServers": {
    "webauto-cli": {
      "command": "npx",
      "args": ["-y", "webauto-cli@0.0.1"]
    }
  }
}
```

### Supported MCP Methods

1. **initialize** - Initialize the server
2. **tools/list** - List available tools
3. **tools/call** - Call a specific tool
4. **resources/list** - List available resources
5. **resources/read** - Read a specific resource
6. **prompts/list** - List available prompts
7. **prompts/get** - Get a specific prompt

### Available Tools

1. **executePipeline** - Execute a web automation pipeline
2. **applyRules** - Apply rules to a webpage
3. **extractTargets** - Extract target elements from a webpage

## Development

### Building

```bash
npm run build
```

### Testing

```bash
npm test
```

## License

ISC