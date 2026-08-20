import type { LLMRouter } from '../llm/router.js';
import type { Task } from './task.js';
import type { MemoryRecord, MemoryMetadata } from './memory-types.js';

import type { CloudMemoryManager } from './memory.js';

export class MemoryExtractor {
    constructor(
        private readonly router: LLMRouter,
        private readonly memoryManager?: CloudMemoryManager
    ) {}

    async extractFromTask(task: Task): Promise<MemoryRecord[]> {
        if (!task.steps || task.steps.length === 0) {
            return []; // no action took place
        }

        const taskContext = `
Task Request: ${task.request}
Status: ${task.status}
Steps Taken:
${task.steps.map(s => `- Tool: ${s.toolName}\n  Args: ${JSON.stringify(s.arguments)}\n  Result: ${s.status === 'success' ? 'Success' : 'Failed'}`).join('\n')}
`;

        const prompt = `You are ATHENA's Memory Extractor.
Evaluate the completed task and determine if there is any long-term semantic, episodic, preference, fact, decision, or project memory that should be saved.
Do not extract trivial temporary task states. Only extract facts, user preferences, or major episodic events that would be useful later.

CRITICAL DIRECTIVE: DO NOT extract ephemeral or real-time state data as facts. 
Examples of things you MUST NOT extract:
- Current weather (e.g. "The weather in Bacolod is 32C")
- Current time or dates
- Current system status (battery levels, active processes, RAM usage)
- Stock prices or news headlines
These are temporary states, not long-term memories.

Respond ONLY with a valid JSON object matching this schema:
{
  "memories": [
    {
      "content": "A clear, standalone statement of the memory.",
      "type": "semantic" | "episodic" | "project" | "preference" | "fact" | "decision",
      "importance": "low" | "medium" | "high",
      "confidence": "low" | "medium" | "high",
      "project": "Optional project name if applicable"
    }
  ]
}

If nothing is worth saving, return {"memories": []}.

Task Information:
${taskContext}
`;

        try {
            const response = await this.router.generate([
                { role: 'user', content: prompt }
            ], {
                temperature: 0.1,
                routing: { intent: { reasoning: true }, priority: 'cost' }
            }, []);

            if (!response.text) return [];

            const jsonMatch = response.text.match(/```(?:json)?\n([\s\S]*?)\n```/);
            const jsonText = jsonMatch ? jsonMatch[1] : response.text;
            
            const parsed = JSON.parse(jsonText);
            
            if (!parsed.memories || !Array.isArray(parsed.memories)) {
                return [];
            }

            const records: MemoryRecord[] = [];

            for (const m of parsed.memories) {
                const metadata: MemoryMetadata = {
                    type: m.type,
                    importance: m.importance || 'low',
                    confidence: m.confidence || 'high',
                    source_task_id: task.id,
                    source: 'autonomous_extraction',
                    status: 'active'
                };
                if (m.project) metadata.project = m.project;

                let supersedesIds: string[] = [];
                
                // Supersession check
                if (this.memoryManager) {
                    const existing = await this.memoryManager.searchRelevantContext(m.content, { maxMemories: 5, minimumRelevance: 0.75 });
                    if (existing.length > 0) {
                        const checkPrompt = `New Memory Candidate:\n"${m.content}"\n\nExisting Memories:\n${existing.map(e => `[ID: ${e.id}] ${e.content}`).join('\n')}\n\nDoes the new memory logically supersede (replace, correct, or update) any of these existing memories? Return ONLY a JSON array of the IDs it supersedes. If none, return []. Example: ["id-1", "id-2"]`;
                        
                        try {
                            const checkResp = await this.router.generate([{ role: 'user', content: checkPrompt }], { temperature: 0.1, routing: { intent: { reasoning: true } } });
                            const match = checkResp.text.match(/\[.*\]/s);
                            if (match) {
                                const ids = JSON.parse(match[0]);
                                if (Array.isArray(ids)) {
                                    // Validate the IDs actually exist in our search results
                                    const validIds = ids.filter(id => existing.some(e => e.id === id));
                                    supersedesIds = validIds;
                                }
                            }
                        } catch (e) {
                            console.error('[MemoryExtractor] Supersession check failed:', e);
                        }
                    }
                }

                if (supersedesIds.length > 0) {
                    metadata.supersedes = supersedesIds.join(',');
                }

                records.push({
                    content: m.content,
                    metadata
                });
            }

            return records;
        } catch (error) {
            console.error('[MemoryExtractor] Failed to extract memory:', error);
            return [];
        }
    }
}
