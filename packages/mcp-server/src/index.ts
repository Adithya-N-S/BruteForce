import 'dotenv/config';
import { McpApplicationFactory, McpApp } from '@nitrostack/core';
import { AppModule } from './app.module.js';

// Apply @McpApp after class definition to avoid TDZ
McpApp({
  module: AppModule,
  server: { name: 'bruteforce-mcp', version: '0.1.0' },
})(AppModule);

async function bootstrap() {
  const server = await McpApplicationFactory.create(AppModule);
  await server.start();
}

bootstrap();
