/**
 * MCP server bootstrap helper
 *
 * Creates and connects an MCP server with stdio, SSE, or WebSocket transport.
 */
import { createRequire } from 'module';
import http from 'http';
import type { McpServerOptions } from '../types/index.js';

const require = createRequire(import.meta.url);

// Minimal transport interface — no index signature to keep types simple
interface TransportInstance {
  close?(): Promise<void>;
  start?(): Promise<void>;
  send?(message: unknown): Promise<void>;
}

// Minimal McpServer interface (enough for connect + tool registration)
interface McpServerInstance {
  connect(transport: TransportInstance): Promise<void>;
  tool(name: string, ...args: unknown[]): void;
}

/** Resolve the WebSocketServer constructor from the `ws` module, handling both CJS export shapes. */
function getWebSocketServerConstructor(ws: typeof import('ws')): typeof import('ws').WebSocketServer {
  const wsModule = ws as unknown as Record<string, unknown>;
  return (wsModule['WebSocketServer'] ?? wsModule['Server']) as typeof import('ws').WebSocketServer;
}

/**
 * Create and connect an MCP server with the specified transport.
 *
 * @example
 * const server = await createMcpServer({ name: 'copart-mcp', version: '0.1.0' });
 * server.tool('search', { q: z.string() }, async ({ q }) => ({ content: [...] }));
 */
export async function createMcpServer(options: McpServerOptions): Promise<McpServerInstance> {
  const transportMode =
    options.transport ?? (process.env['TRANSPORT'] || 'stdio');

  // Use dynamic import so Vitest can mock these modules in tests
  const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js') as unknown as {
    McpServer: new (info: { name: string; version: string }) => McpServerInstance;
  };

  const server = new McpServer({ name: options.name, version: options.version });

  switch (transportMode) {
    case 'stdio': {
      const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js') as unknown as {
        StdioServerTransport: new () => TransportInstance;
      };
      const transport = new StdioServerTransport();
      await server.connect(transport);
      return server;
    }

    case 'sse': {
      const port = options.port ?? parseInt(process.env['PORT'] ?? '3000', 10);
      const { SSEServerTransport } = await import('@modelcontextprotocol/sdk/server/sse.js') as unknown as {
        SSEServerTransport: new (path: string, res: http.ServerResponse) => TransportInstance;
      };
      await new Promise<void>((resolve, reject) => {
        const httpServer = http.createServer((req, res) => {
          if (req.url === '/sse' && req.method === 'GET') {
            const transport = new SSEServerTransport('/sse', res);
            server.connect(transport).catch(reject);
          } else {
            res.writeHead(404).end();
          }
        });
        httpServer.once('error', reject);
        httpServer.listen(port, () => resolve());
      });
      return server;
    }

    case 'websocket': {
      const wsPort = options.wsPort ?? parseInt(process.env['WS_PORT'] ?? '3001', 10);
      const ws = require('ws') as typeof import('ws');

      const WsServer = getWebSocketServerConstructor(ws);

      await new Promise<void>((resolve, reject) => {
        const wss = new WsServer({ port: wsPort });
        wss.once('error', reject);
        wss.once('listening', () => resolve());

        wss.on('connection', (socket: import('ws').WebSocket) => {
          const transport = new WebSocketTransportAdapter(socket);
          server.connect(transport).catch(() => {});
        });
      });
      return server;
    }

    default:
      throw new Error(
        `Invalid transport "${transportMode}". Must be one of: stdio, sse, websocket`,
      );
  }
}

/** Minimal WebSocket→MCP transport adapter */
class WebSocketTransportAdapter implements TransportInstance {
  private readonly socket: import('ws').WebSocket;
  onmessage?: (message: { jsonrpc: string }) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;

  constructor(socket: import('ws').WebSocket) {
    this.socket = socket;
    socket.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as { jsonrpc: string };
        this.onmessage?.(msg);
      } catch {
        // ignore parse errors
      }
    });
    socket.on('close', () => this.onclose?.());
    socket.on('error', (err) => this.onerror?.(err));
  }

  async send(message: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.send(JSON.stringify(message), (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async close(): Promise<void> {
    this.socket.close();
  }

  async start(): Promise<void> {
    // WebSocket already connected
  }
}
