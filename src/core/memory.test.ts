import assert from 'assert';
import { MemoryExtractor } from './memory-extractor.js';
import { ContextBuilder } from './context-builder.js';
import { CloudMemoryManager } from './memory.js';
import type { LLMRouter } from '../llm/router.js';
import type { Task } from './task.js';
import type { MemoryRecord, MemoryContextOptions } from './memory-types.js';

class MockRouter {
    public nextResponseText = '';
    async generate() {
        return { text: this.nextResponseText, toolCalls: [] };
    }
}

class MockMemoryManager extends CloudMemoryManager {
    public memories: MemoryRecord[] = [
        { id: '1', content: 'Legacy memory without metadata', metadata: {} },
        { id: '2', content: 'Project memory', metadata: { type: 'project', project: 'BMS', importance: 'high' } },
        { id: '3', content: 'Semantic memory', metadata: { type: 'semantic', importance: 'medium' } }
    ];

    constructor() {
        super(); // Will warn about missing env vars, which is fine for tests
    }

    async searchRelevantContext(query: string, options: MemoryContextOptions = {}): Promise<MemoryRecord[]> {
        let results = [...this.memories];
        if (options.project) {
            results = results.filter(m => m.metadata.project === options.project);
        }
        if (options.types && options.types.length > 0) {
            results = results.filter(m => m.metadata.type && options.types!.includes(m.metadata.type as any));
        }
        return results.slice(0, options.maxMemories || 5);
    }
}

async function runTests() {
    console.log('Running Memory tests...');

    // 1. Context Retrieval (Project filtering & Limits)
    {
        const manager = new MockMemoryManager();
        const builder = new ContextBuilder(manager);

        const allContext = await builder.buildContext('query', { maxMemories: 10 });
        assert.ok(allContext.includes('Legacy memory without metadata'), 'Should handle legacy metadata');
        assert.ok(allContext.includes('Project memory'));

        const projContext = await builder.buildContext('query', { project: 'BMS', maxMemories: 5 });
        assert.ok(projContext.includes('Project memory'));
        assert.ok(!projContext.includes('Semantic memory'), 'Should filter by project');
    }

    // 2. Memory Extraction (Valid & Invalid)
    {
        const router = new MockRouter();
        const extractor = new MemoryExtractor(router as unknown as LLMRouter);

        const task: Task = {
            id: 't-1',
            request: 'test',
            status: 'completed',
            priority: 0,
            retryCount: 0,
            isCancelled: false,
            createdAt: 0,
            updatedAt: 0,
            steps: [{ id: 's1', toolName: 'test', arguments: {}, status: 'success' }]
        };

        // Valid JSON extraction
        router.nextResponseText = '```json\n{"memories":[{"content":"User likes testing","type":"preference","importance":"high","confidence":"high"}]}\n```';
        const memories = await extractor.extractFromTask(task);
        assert.strictEqual(memories.length, 1);
        assert.strictEqual(memories[0].content, 'User likes testing');
        assert.strictEqual(memories[0].metadata.type, 'preference');
        assert.strictEqual(memories[0].metadata.importance, 'high');
        assert.strictEqual(memories[0].metadata.source_task_id, 't-1');
        assert.strictEqual(memories[0].metadata.status, 'active');

        // Invalid extraction handling (should not crash)
        router.nextResponseText = 'I am just an LLM and I cannot do this.';
        const badMemories = await extractor.extractFromTask(task);
        assert.strictEqual(badMemories.length, 0, 'Should gracefully handle invalid LLM output');
    }

    // 3. Memory Supersession Extraction
    {
        class MultiMockRouter {
            public responses: string[] = [];
            async generate() {
                return { text: this.responses.shift() || '', toolCalls: [] };
            }
        }
        const router = new MultiMockRouter();
        const manager = new MockMemoryManager();
        const extractor = new MemoryExtractor(router as unknown as LLMRouter, manager);
        
        const task: Task = {
            id: 't-2',
            request: 'test2',
            status: 'completed',
            priority: 0,
            retryCount: 0,
            isCancelled: false,
            createdAt: 0,
            updatedAt: 0,
            steps: [{ id: 's2', toolName: 'test', arguments: {}, status: 'success' }]
        };

        // 1st response: JSON extraction
        // 2nd response: Supersession check response
        router.responses.push('```json\n{"memories":[{"content":"New memory","type":"fact"}]}\n```');
        router.responses.push('["2"]'); // supersede memory with ID "2"

        const memories = await extractor.extractFromTask(task);
        assert.strictEqual(memories.length, 1);
        assert.strictEqual(memories[0].content, 'New memory');
        assert.strictEqual(memories[0].metadata.supersedes, '2', 'Should have extracted supersedes ID');
    }

    console.log('Memory tests passed!');
}

runTests().catch(e => {
    console.error(e);
    process.exit(1);
});
