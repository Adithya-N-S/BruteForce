import { ToolDecorator as Tool, ControllerDecorator as Controller, z, ExecutionContext } from '@nitrostack/core';

@Controller()
export class HelloTools {
  @Tool({
    name: 'hello_bruteforce',
    description: 'A simple health-check tool that confirms the BruteForce MCP server is running',
    inputSchema: z.object({
      name: z.string().optional().describe('Optional name to greet'),
    }),
  })
  async hello(input: { name?: string }, ctx: ExecutionContext) {
    return {
      status: 'ok',
      message: `BruteForce MCP server is live. Hello, ${input.name || 'investigator'}!`,
      timestamp: new Date().toISOString(),
    };
  }
}
