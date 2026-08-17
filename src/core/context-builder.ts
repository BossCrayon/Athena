import type { CloudMemoryManager } from './memory.js';
import type { MemoryContextOptions } from './memory-types.js';

export class ContextBuilder {
    constructor(private readonly memoryManager: CloudMemoryManager) {}

    async buildContext(query: string, options: MemoryContextOptions = {}): Promise<string> {
        const memories = await this.memoryManager.searchRelevantContext(query, options);
        
        if (!memories || memories.length === 0) {
            return '';
        }

        // We can sort them by importance or similarity. 
        // match_memories already sorts by similarity. We boost slightly by importance here.
        const importanceWeight = { high: 0.2, medium: 0.1, low: 0 };
        
        memories.sort((a, b) => {
            const simA = (a.similarity || 0) + (importanceWeight[a.metadata.importance as keyof typeof importanceWeight] || 0);
            const simB = (b.similarity || 0) + (importanceWeight[b.metadata.importance as keyof typeof importanceWeight] || 0);
            return simB - simA; // descending
        });

        const formatted = memories.map(m => {
            let meta = `[Type: ${m.metadata.type || 'unknown'}]`;
            if (m.metadata.project) meta += ` [Project: ${m.metadata.project}]`;
            return `- ${meta} ${m.content}`;
        }).join('\n');

        return `\n\n--- RELEVANT MEMORY CONTEXT ---\n${formatted}\n-------------------------------\n`;
    }
}
