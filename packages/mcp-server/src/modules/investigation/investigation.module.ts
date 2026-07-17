import { Module } from '@nitrostack/core';
import { GraphService } from '../../services/graph.service.js';
import { InvestigationTools } from './investigation.tools.js';
import { InvestigationResources } from './investigation.resources.js';
import { InvestigationPrompts } from './investigation.prompts.js';

@Module({
  name: 'investigation',
  description: 'Core investigation tools, resources, and prompts for entity resolution and control analysis',
  providers: [GraphService],
  controllers: [InvestigationTools, InvestigationResources, InvestigationPrompts],
})
export class InvestigationModule {}
