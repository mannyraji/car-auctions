import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the MCP SDK modules — these use dynamic import() in createMcpServer
const mockServerInstance = {
  connect: vi.fn().mockResolvedValue(undefined),
  tool: vi.fn().mockReturnValue(undefined),
};

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn().mockImplementation(() => mockServerInstance),
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@modelcontextprotocol/sdk/server/sse.js', () => ({
  SSEServerTransport: vi.fn().mockImplementation(() => ({})),
}));

import { createMcpServer } from '../src/mcp-helpers/index.js';

describe('createMcpServer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockServerInstance.connect.mockResolvedValue(undefined);
    mockServerInstance.tool.mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns a server instance with stdio transport', async () => {
    const server = await createMcpServer({ name: 'test', version: '0.1.0', transport: 'stdio' });
    expect(server).toBeDefined();
    expect(typeof server.connect).toBe('function');
  });

  it('defaults transport to process.env.TRANSPORT when not specified', async () => {
    vi.stubEnv('TRANSPORT', 'stdio');
    const server = await createMcpServer({ name: 'test', version: '0.1.0' });
    expect(server).toBeDefined();
  });

  it('defaults to stdio when neither transport option nor env var is set', async () => {
    // TRANSPORT env var not set → should default to stdio
    vi.stubEnv('TRANSPORT', '');
    const server = await createMcpServer({ name: 'test', version: '0.1.0' });
    expect(server).toBeDefined();
  });

  it('throws on invalid transport value', async () => {
    await expect(
      createMcpServer({ name: 'test', version: '0.1.0', transport: 'invalid' as 'stdio' })
    ).rejects.toThrow(/Invalid transport/);
  });

  it('accepts tool registration after creation', async () => {
    const server = await createMcpServer({ name: 'test', version: '0.1.0', transport: 'stdio' });
    expect(() => server.tool('my_tool', {}, async () => ({ content: [] }))).not.toThrow();
    expect(mockServerInstance.tool).toHaveBeenCalledWith('my_tool', {}, expect.any(Function));
  });
});
