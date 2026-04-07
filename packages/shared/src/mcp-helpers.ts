/**
 * @file src/mcp-helpers.ts
 * @description MCP server bootstrap helper supporting stdio, SSE, and WebSocket transports.
 *
 * Transport is selected by (in order): options.transport → TRANSPORT env var → 'stdio'
 */

import { createServer } from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import type { ServerCapabilities } from '@modelcontextprotocol/sdk/types.js';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

/**
 * Options for createMcpServer().
 */
export interface McpServerOptions {
  /** Server name reported in MCP handshake. */
  name: string;
  /** Server version reported in MCP handshake. */
  version: string;
  /** MCP server capabilities (tools, prompts, resources). */
  capabilities: ServerCapabilities;
  /** Callback to register all MCP tool handlers on the server instance. */
  registerTools: (server: Server) => void;
  /**
   * Transport override. Defaults to process.env.TRANSPORT ('stdio' | 'sse' | 'websocket').
   * Falls back to 'stdio' if env var is not set.
   */
  transport?: 'stdio' | 'sse' | 'websocket';
  /** HTTP port for SSE transport. Defaults to process.env.PORT ?? 3000. */
  port?: number;
  /** WebSocket port for websocket transport. Defaults to process.env.WS_PORT ?? 3001. */
  wsPort?: number;
}

/**
 * A minimal Transport implementation over a WebSocket connection.
 * Uses the `ws` package to handle WebSocket connections.
 */
class WsServerTransport implements Transport {
  private _wss: WebSocketServer;
  private _ws: WebSocket | null = null;
  private readonly _port: number;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(port: number) {
    this._port = port;
    this._wss = new WebSocketServer({ port: this._port });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this._wss.on('error', (err) => {
        this.onerror?.(err);
        reject(err);
      });

      this._wss.on('listening', () => {
        resolve();
      });

      this._wss.on('connection', (ws: WebSocket) => {
        this._ws = ws;

        ws.on('message', (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString()) as JSONRPCMessage;
            this.onmessage?.(message);
          } catch (err) {
            this.onerror?.(err instanceof Error ? err : new Error(String(err)));
          }
        });

        ws.on('close', () => {
          this._ws = null;
          this.onclose?.();
        });

        ws.on('error', (err: Error) => {
          this.onerror?.(err);
        });
      });
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this._ws?.close();
      this._wss.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this._ws) {
      throw new Error('No WebSocket client connected');
    }
    return new Promise((resolve, reject) => {
      this._ws!.send(JSON.stringify(message), (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

/**
 * Bootstraps an MCP server with the specified transport.
 *
 * Supports:
 * - stdio: Claude Desktop integration; listens on stdin/stdout
 * - sse: HTTP SSE transport; listens on `port` for /sse connections
 * - websocket: WebSocket transport; listens on `wsPort`
 *
 * Transport is selected by (in order): options.transport → TRANSPORT env var → 'stdio'
 *
 * @param options - Server configuration options
 * @returns Promise that resolves when the server is connected
 * @example
 * await createMcpServer({
 *   name: 'copart-scraper',
 *   version: '1.0.0',
 *   capabilities: { tools: {} },
 *   registerTools: (server) => {
 *     server.tool('copart_search', searchSchema, copartSearch);
 *   },
 * });
 */
export async function createMcpServer(options: McpServerOptions): Promise<void> {
  const server = new Server(
    { name: options.name, version: options.version },
    { capabilities: options.capabilities }
  );

  options.registerTools(server);

  const transportType =
    options.transport ?? (process.env['TRANSPORT'] as 'stdio' | 'sse' | 'websocket' | undefined) ?? 'stdio';

  if (transportType === 'stdio') {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    return;
  }

  if (transportType === 'sse') {
    const port = options.port ?? parseInt(process.env['PORT'] ?? '3000', 10);
    const httpServer = createServer();
    let sseTransport: SSEServerTransport | null = null;

    httpServer.on('request', async (req, res) => {
      if (req.method === 'GET' && req.url === '/sse') {
        sseTransport = new SSEServerTransport('/messages', res);
        await server.connect(sseTransport);
      } else if (req.method === 'POST' && req.url === '/messages' && sseTransport) {
        await sseTransport.handlePostMessage(req, res);
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(port, () => resolve());
    });
    return;
  }

  if (transportType === 'websocket') {
    const wsPort = options.wsPort ?? parseInt(process.env['WS_PORT'] ?? '3001', 10);
    const transport = new WsServerTransport(wsPort);
    await transport.start();
    await server.connect(transport);
    return;
  }

  throw new Error(
    `Unknown transport type "${String(transportType)}". Expected 'stdio', 'sse', or 'websocket'.`
  );
}
