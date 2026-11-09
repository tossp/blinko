import { describe, expect, it, mock } from 'bun:test';
import { RequestContext } from '@mastra/core/request-context';

let forwarded: unknown;
mock.module('../McpClientManager', () => ({
  mcpClientManager: {
    getAllEnabledTools: async () => [{
      serverId: 5, serverName: 'local', name: 'lookup', description: 'Local lookup',
      inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    }],
    callTool: async (serverId: number, name: string, args: unknown) => {
      forwarded = { serverId, name, args };
      return { content: [{ type: 'text', text: 'local result' }] };
    },
  },
}));
const { getMcpMastraTools } = await import('../McpToolBridge');

describe('MCP tool bridge on Mastra 1', () => {
  it('uses the enabled-tool list and forwards new execute input, not execution context', async () => {
    const tools = await getMcpMastraTools();
    expect(Object.keys(tools)).toEqual(['mcp_local_lookup']);
    const result = await tools.mcp_local_lookup.execute!({ query: 'hello' }, { requestContext: new RequestContext() });
    expect(forwarded).toEqual({ serverId: 5, name: 'lookup', args: { query: 'hello' } });
    expect(result).toMatchObject({ success: true, result: 'local result' });
  });
});
