import { Module } from '@nitrostack/core';
import { HelloTools } from './hello.tools.js';

@Module({
  name: 'hello',
  description: 'Health-check and diagnostic tools',
  controllers: [HelloTools],
})
export class HelloModule {}
