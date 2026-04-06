/**
 * @file mcp-helpers.ts
 * @description MCP server bootstrap helper for all car-auctions packages.
 *
 * Supports three transports:
 *  - `stdio`     — StdioServerTransport (SDK-native)
 *  - `sse`       — SSEServerTransport with Express (SDK-native)
 *  - `websocket` — Custom WebSocketServerTransport (ws-based)
 *
 * Transport selection priority:
 *  1. `options.transport` parameter
 *  2. `TRANSPORT` environment variable
 *  3. Fallback: `'stdio'`
 *
 * @since 001-shared-utilities-lib
 */

import type { McpServerOptions } from './types/index.js';

// ─── Re-export the type from this module ─────────────────────────────────────

export type { McpServerOptions };

// ─── createMcpServer ─────────────────────────────────────────────────────────

/**
 * Bootstraps an MCP server with the specified transport.
 *
 * Environment variables:
 *  - `TRANSPORT`  — `'stdio'` | `'sse'` | `'websocket'`
 *  - `PORT`       — HTTP port for SSE transport (default: 3000)
 *  - `WS_PORT`    — WebSocket port (default: 3001)
 *
 * @example
 * // Start with stdio transport (default)
 * await createMcpServer({ name: 'copart-mcp', version: '1.0.0' });
 *
 * @example
 * // Start with WebSocket transport on port 8080
 * await createMcpServer({
 *   name: 'copart-mcp',
 *   version: '1.0.0',
 *   transport: 'websocket',
 *   wsPort: 8080,
 * });
 */
export async function createMcpServer(options: McpServerOptions): Promise<void> {
  const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');

  const server = new McpServer({
    name: options.name,
    version: options.version,
  });

  const transport = resolveTransport(options);

  switch (transport) {
    case 'stdio':
      await startStdio(server);
      break;
    case 'sse':
      await startSse(server, options.port);
      break;
    case 'websocket':
      await startWebSocket(server, options.wsPort);
      break;
    default:
      throw new Error(`Unknown transport: "${transport}"`);
  }
}

// ─── Transport resolution ─────────────────────────────────────────────────────

function resolveTransport(options: McpServerOptions): 'stdio' | 'sse' | 'websocket' {
  if (options.transport) return options.transport;
  const env = process.env['TRANSPORT'];
  if (env === 'sse' || env === 'websocket' || env === 'stdio') return env;
  return 'stdio';
}

// ─── Stdio transport ──────────────────────────────────────────────────────────

async function startStdio(server: import('@modelcontextprotocol/sdk/server/mcp.js').McpServer): Promise<void> {
  const { StdioServerTransport } = await import(
    '@modelcontextprotocol/sdk/server/stdio.js'
  );
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// ─── SSE transport ────────────────────────────────────────────────────────────

async function startSse(
  server: import('@modelcontextprotocol/sdk/server/mcp.js').McpServer,
  port?: number,
): Promise<void> {
  const express = (await import('express')).default;
  const { SSEServerTransport } = await import(
    '@modelcontextprotocol/sdk/server/sse.js'
  );

  const app = express();
  const resolvedPort = port ?? parseInt(process.env['PORT'] ?? '3000', 10);

  // Map from session ID to transport instance
  const transports = new Map<string, InstanceType<typeof SSEServerTransport>>();

  app.get('/sse', (_req, res) => {
    const transport = new SSEServerTransport('/messages', res);
    transports.set(transport.sessionId, transport);
    void server.connect(transport);
  });

  app.post('/messages', express.json(), (req, res) => {
    const sessionId = req.query['sessionId'] as string;
    const transport = transports.get(sessionId);
    if (!transport) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    void transport.handlePostMessage(req, res);
  });

  await new Promise<void>((resolve) => {
    app.listen(resolvedPort, () => {
      console.log(`[mcp-helpers] SSE transport listening on port ${resolvedPort}`);
      resolve();
    });
  });
}

// ─── WebSocket transport ──────────────────────────────────────────────────────

async function startWebSocket(
  server: import('@modelcontextprotocol/sdk/server/mcp.js').McpServer,
  wsPort?: number,
): Promise<void> {
  const { WebSocketServer } = await import('ws');
  const resolvedPort = wsPort ?? parseInt(process.env['WS_PORT'] ?? '3001', 10);

  const wss = new WebSocketServer({ port: resolvedPort });

  wss.on('connection', (ws) => {
    const transport = new WebSocketServerTransport(ws);
    void server.connect(transport);
  });

  await new Promise<void>((resolve) => {
    wss.once('listening', () => {
      console.log(`[mcp-helpers] WebSocket transport listening on port ${resolvedPort}`);
      resolve();
    });
  });
}

// ─── WebSocketServerTransport ─────────────────────────────────────────────────

import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { WebSocket } from 'ws';

/**
 * Custom MCP Transport implementation backed by a `ws` WebSocket connection.
 *
 * Implements the MCP SDK `Transport` interface:
 *  - `onmessage`  — called when a JSONRPC message arrives
 *  - `onerror`    — called on transport-level errors
 *  - `onclose`    — called when the connection closes
 *  - `send(msg)`  — serialises and sends a JSONRPC message
 *  - `close()`    — terminates the WebSocket connection
 */
class WebSocketServerTransport implements Transport {
  onmessage?: (message: JSONRPCMessage) => void;
  onerror?: (error: Error) => void;
  onclose?: () => void;

  constructor(private readonly ws: WebSocket) {
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as JSONRPCMessage;
        this.onmessage?.(msg);
      } catch (err) {
        this.onerror?.(err instanceof Error ? err : new Error(String(err)));
      }
    });

    ws.on('error', (err) => {
      this.onerror?.(err);
    });

    ws.on('close', () => {
      this.onclose?.();
    });
  }

  async send(message: JSONRPCMessage): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws.send(JSON.stringify(message), (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async close(): Promise<void> {
    this.ws.close();
  }

  /** Required by the MCP SDK Transport interface */
  async start(): Promise<void> {
    // WebSocket is already established at construction time; no action needed.
  }
}
