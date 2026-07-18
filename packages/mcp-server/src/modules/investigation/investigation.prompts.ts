import { PromptDecorator as Prompt, ControllerDecorator as Controller, ExecutionContext } from '@nitrostack/core';
import { GraphService } from '../../services/graph.service.js';

@Controller()
export class InvestigationPrompts {
  constructor(private readonly graphService: GraphService) {
    this.getInvestigationPlaybook = this.getInvestigationPlaybook.bind(this);
    this.getExplanationPlaybook = this.getExplanationPlaybook.bind(this);
    this.getSarSummaryTemplate = this.getSarSummaryTemplate.bind(this);
  }
  @Prompt({
    name: 'investigation_playbook',
    description: 'System prompt for the AI Planner that drives investigation. Enforces the deterministic wall: the AI plans and chooses tools, but never asserts facts about ownership or entities.',
    arguments: [
      {
        name: 'target_company',
        description: 'The name or ID of the company to investigate',
        required: true,
      },
    ],
  })
  async getInvestigationPlaybook(
    args: { target_company: string },
    ctx: ExecutionContext
  ) {
    const graph = this.graphService.getGraph();
    const stats = graph.toEvidenceGraph();

    return [
      {
        role: 'user' as const,
        content: `You are an investigation Planner. Your job is to uncover the Ultimate Beneficial Owner (UBO) of "${args.target_company}" by calling deterministic tools.

CRITICAL RULES (THE DETERMINISTIC WALL):
- You NEVER assert facts about ownership, entities, or percentages.
- You ONLY call tools. Every fact comes from a tool result.
- The ONLY source of ownership percentages is the compute_control tool.
- You NEVER produce numbers yourself.
- When explaining your reasoning, describe your INTENT ("I will check shared directors"), never state facts ("Company X owns 40% of Company Y").

AVAILABLE TOOLS:
1. resolve_entity - Find entities by name/jurisdiction/identifiers
2. all_control_paths - Trace ownership chains between two entities
3. compute_control - Calculate effective ownership percentage
4. find_shared_attributes - Find entities sharing directors, addresses, or agents
5. co_consignee_links - Find trade co-consignee relationships
6. score_evidence - Score evidence edges for confidence
7. match_sanctions - Match an entity against sanctions lists
8. assemble_dossier - Build final investigation report

INVESTIGATION STRATEGY:
1. Start by resolving the target company name to an entity ID
2. Explore direct ownership paths (owns_pct edges)
3. If direct paths are thin, pivot to alternative modalities:
   - Shared directors (director_of edges)
   - Shared registered addresses (registered_at edges)
   - Trade co-consignees (consignee_on / shipper_on edges)
4. When you find a potential UBO, compute control percentage
5. Check if control >= 25% threshold
6. Match against sanctions lists
7. Stop when you have identified a sanctioned UBO with >= 25% control, OR when you have exhausted all investigative avenues

GRAPH STATS: ${stats.nodes.length} entities, ${stats.edges.length} edges loaded.

Begin the investigation of "${args.target_company}" now.`,
      },
    ];
  }

  @Prompt({
    name: 'explanation_playbook',
    description: 'System prompt for the AI Explainer that narrates investigation results. May only cite sourced edges and tool outputs. Never asserts facts not returned by tools.',
    arguments: [
      {
        name: 'target_company',
        description: 'The investigated company name',
        required: true,
      },
    ],
  })
  async getExplanationPlaybook(
    args: { target_company: string },
    ctx: ExecutionContext
  ) {
    return [
      {
        role: 'user' as const,
        content: `You are an investigation Explainer. Your job is to narrate the findings of a UBO investigation for "${args.target_company}" based ONLY on sourced tool outputs.

CRITICAL RULES:
- You may ONLY reference facts that were returned by deterministic tools.
- You may NOT invent any numbers, percentages, entity names, or relationships.
- Cite record IDs when describing evidence (e.g., "Registry filing #REC-001 shows...").
- The ONLY source of ownership percentages is compute_control.
- The ONLY source of confidence scores is score_evidence.
- If a fact is not backed by a tool result, do not include it.

Your narrative should cover:
1. How the target entity was identified (resolve_entity result)
2. The ownership chains discovered (all_control_paths result)
3. The effective control percentage (compute_control result)
4. Any sanctions matches found (match_sanctions result)
5. The evidence confidence assessment (score_evidence result)
6. The final veil-pierced verdict

Structure your output as a clear, professional investigation summary with sourced claims only.`,
      },
    ];
  }

  @Prompt({
    name: 'sar_summary_template',
    description: 'Template for generating a Suspicious Activity Report (SAR) summary from investigation findings. Used to structure the final narrative for compliance submission.',
    arguments: [
      {
        name: 'target_company',
        description: 'The investigated company name',
        required: true,
      },
      {
        name: 'ubo_name',
        description: 'The identified UBO name',
        required: true,
      },
    ],
  })
  async getSarSummaryTemplate(
    args: { target_company: string; ubo_name: string },
    ctx: ExecutionContext
  ) {
    return [
      {
        role: 'user' as const,
        content: `SUSPICIOUS ACTIVITY REPORT — SUMMARY TEMPLATE

SUBJECT: ${args.target_company}
UBO: ${args.ubo_name}

---

1. SUBJECT DETAILS
   - Entity Name: [from resolve_entity]
   - Jurisdiction: [from resolve_entity]
   - Entity ID: [from resolve_entity]
   - Subject Type: [company / trust / foundation]

2. UBO IDENTIFICATION
   - UBO Name: ${args.ubo_name}
   - Relationship: [beneficial owner / director / shareholder]
   - Ownership Structure Description: [brief description based on all_control_paths]

3. CONTROL STRUCTURE
   - Effective Ownership Percentage: [from compute_control — sole source of percentages]
   - Control Threshold Met (≥25%): [Yes / No]
   - Path Count: [number of contributing ownership paths]
   - Weakest Link Confidence: [from score_evidence]

4. SANCTIONS CHECK
   - Sanctions List Matches: [from match_sanctions — list each match with score]
   - Highest Match Score: [score]

5. EVIDENCE ASSESSMENT
   - Total Evidence Edges: [count]
   - Overall Confidence: [from score_evidence / adjudicator]
   - Weakest Evidence Edge: [edge ID with lowest confidence]

6. NARRATIVE SUMMARY
   - Investigation Summary: [generate concise narrative from sourced tool outputs only]
   - Key Findings: [bullet list of critical findings]

7. FILING RECOMMENDATION
   - Veil Pierced: [Yes / No]
   - Recommended Action: [Enhanced Due Diligence / File SAR / No Further Action / Escalate]
   - Confidence Level: [High / Medium / Low]`,
      },
      {
        role: 'user' as const,
        content: 'Fill in each section with sourced tool outputs only. Never include unsourced assertions. All percentages must come from compute_control, all confidence scores from score_evidence.',
      },
    ];
  }
}
