import { Module, ConfigModule } from '@nitrostack/core';
import { HelloModule } from './modules/hello/hello.module.js';
import { InvestigationModule } from './modules/investigation/investigation.module.js';

@Module({
  name: 'bruteforce-mcp',
  description: 'BruteForce MCP server root module',
  imports: [
    ConfigModule.forRoot(),
    HelloModule,
    InvestigationModule,
  ],
})
export class AppModule {}
