import assert from 'assert';
import { TaskEngine } from './task-engine.js';
import type { LLMRouter } from '../llm/router.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { ToolOrchestrator } from '../tools/orchestrator.js';
import type { ToolContext } from '../tools/types.js';
import type { ToolResponse } from '../tools/response.js';
import type { ToolSchema } from '../tools/schema.js';
import type { Message, GenerationOptions } from '../llm/types.js';
import type { Planner } from './planner.js';

class MockRouter {
    public generateResponses: any[] = [];
    public continueResponses: any[] = [];
    
    async generate(messages: Message[], options?: GenerationOptions, tools?: ToolSchema[]) {
        return this.generateResponses.shift() || { text: 'fallback generate' };
    }
    
    async continueWithToolResults(continuationId: string, results: any[], messages: Message[], options?: GenerationOptions, tools?: ToolSchema[]) {
        const next = this.continueResponses.shift();
        if (typeof next === 'function') {
            return next(results, messages);
        }
        return next || { text: 'fallback continue' };
    }
}

class MockRegistry {
    getSchemas() { return []; }
    get(name: string): any { return undefined; }
}

class MockOrchestrator {
    public handlers: Record<string, Function> = {};
    
    async handle(request: any, context: any): Promise<ToolResponse> {
        if (this.handlers[request.toolName]) {
            return this.handlers[request.toolName](request.arguments);
        }
        return { toolName: request.toolName, success: true, output: 'default success' };
    }
}

async function runTests() {
    console.log('Running TaskEngine tests...');
    const registry = new MockRegistry() as unknown as ToolRegistry;
    const context = {} as ToolContext;
    
    class MockPlanner {
        async createPlan(task: any) {
            return {
                goal: 'Test',
                complexity: 'simple',
                subgoals: [
                    { id: 'sg1', description: 'Step 1', dependencies: [], status: 'pending' }
                ]
            };
        }
        async replan(task: any, failedSg: any, obs: string) {
            return {
                goal: 'Test',
                complexity: 'simple',
                subgoals: [
                    { id: 'sg2', description: 'Alternative step', dependencies: [], status: 'pending' }
                ]
            };
        }
    }
    const mockPlanner = new MockPlanner() as unknown as Planner;

    // Test 1: Normal conversation
    {
        const router = new MockRouter();
        router.generateResponses.push({ text: 'Hello sir.' });
        const engine = new TaskEngine(router as unknown as LLMRouter, registry, {} as ToolOrchestrator, context, mockPlanner);
        const res = await engine.executeInteractive('Hello', []);
        assert.strictEqual(res, 'Hello sir.');
    }

    // Test 2: Single-step execution
    {
        const router = new MockRouter();
        router.generateResponses.push({ 
            text: '', 
            continuationId: 'c1',
            toolCalls: [{ id: 't1', name: 'sys_info', arguments: {} }] 
        });
        router.continueResponses.push({ text: 'System is nominal.' });

        const orchestrator = new MockOrchestrator();
        orchestrator.handlers['sys_info'] = () => ({ toolName: 'sys_info', success: true, output: '100% CPU' });

        const engine = new TaskEngine(router as unknown as LLMRouter, registry, orchestrator as unknown as ToolOrchestrator, context, mockPlanner);
        const res = await engine.executeInteractive('Status?', []);
        assert.strictEqual(res, 'System is nominal.');
    }

    // Test 3: Failure handling and adaptation
    {
        const router = new MockRouter();
        router.generateResponses.push({ 
            text: '', 
            continuationId: 'c1',
            toolCalls: [{ id: 't1', name: 'run_command', arguments: { cmd: 'fail' } }] 
        });
        
        // Return an observation explicitly
        router.continueResponses.push((results: any[]) => {
            assert.strictEqual(results[0].success, false);
            assert.ok(results[0].output.includes('Execution Failed'));
            return { text: 'I see it failed. Let me fix it.' };
        });

        const orchestrator = new MockOrchestrator();
        orchestrator.handlers['run_command'] = () => { throw new Error('Command not found'); };

        const engine = new TaskEngine(router as unknown as LLMRouter, registry, orchestrator as unknown as ToolOrchestrator, context, mockPlanner);
        const res = await engine.executeInteractive('Run fail', []);
        assert.strictEqual(res, 'I see it failed. Let me fix it.');
    }

    // Test 4: Verification Loop (multiple iterations)
    {
        const router = new MockRouter();
        router.generateResponses.push({ 
            continuationId: 'c1',
            toolCalls: [{ id: 't1', name: 'step1', arguments: {} }] 
        });
        router.continueResponses.push((results: any[]) => {
            // First step finished, now verify with step 2
            return {
                continuationId: 'c2',
                toolCalls: [{ id: 't2', name: 'verify', arguments: {} }]
            };
        });
        router.continueResponses.push((results: any[]) => {
            // Verification finished
            return { text: 'Everything verified and complete.' };
        });

        const orchestrator = new MockOrchestrator();
        
        const engine = new TaskEngine(router as unknown as LLMRouter, registry, orchestrator as unknown as ToolOrchestrator, context, mockPlanner);
        const res = await engine.executeInteractive('Do complex task', []);
        assert.strictEqual(res, 'Everything verified and complete.');
    }

    // Test 5: Loop Limits (Infinite loop prevention)
    {
        const router = new MockRouter();
        router.generateResponses.push({ continuationId: 'c', toolCalls: [{ id: '1', name: 'loop', arguments: {} }] });
        // Make it return tool calls infinitely
        for (let i = 0; i < 15; i++) {
            router.continueResponses.push({ continuationId: 'c', toolCalls: [{ id: `${i}`, name: 'loop', arguments: {} }] });
        }
        
        const orchestrator = new MockOrchestrator();
        const engine = new TaskEngine(router as unknown as LLMRouter, registry, orchestrator as unknown as ToolOrchestrator, context, mockPlanner);
        const res = await engine.executeInteractive('Start loop', []);
        
        assert.ok(res.includes('Maximum task iterations exceeded'));
    }

    // Test 6: Parallel Execution
    {
        const router = new MockRouter();
        router.generateResponses.push({
            continuationId: 'c1',
            toolCalls: [
                { id: 't1', name: 'parallel_tool', arguments: { num: 1 } },
                { id: 't2', name: 'parallel_tool', arguments: { num: 2 } },
                { id: 't3', name: 'seq_tool', arguments: { num: 3 } }
            ]
        });
        router.continueResponses.push((results: any[]) => {
            return { text: `Done ${results.length}` };
        });

        const reg = new MockRegistry() as unknown as ToolRegistry;
        reg.get = (name: string) => {
            if (name === 'parallel_tool') return { definition: { isParallelizable: true } } as any;
            return { definition: { isParallelizable: false } } as any;
        };

        const orchestrator = new MockOrchestrator();
        let runningCount = 0;
        let maxRunningCount = 0;
        
        orchestrator.handlers['parallel_tool'] = async () => {
            runningCount++;
            if (runningCount > maxRunningCount) maxRunningCount = runningCount;
            await new Promise(r => setTimeout(r, 50));
            runningCount--;
            return { toolName: 'parallel_tool', success: true, output: 'ok' };
        };
        
        orchestrator.handlers['seq_tool'] = async () => {
            assert.strictEqual(runningCount, 0, 'Sequential tool should not overlap with parallel tools');
            return { toolName: 'seq_tool', success: true, output: 'ok' };
        };

        const engine = new TaskEngine(router as unknown as LLMRouter, reg, orchestrator as unknown as ToolOrchestrator, context, mockPlanner);
        const res = await engine.executeInteractive('Run parallel', []);
        
        assert.strictEqual(res, 'Done 3');
        assert.strictEqual(maxRunningCount, 2, 'Two parallel tools should have run concurrently');
    }

    // Test 7: Task Cancellation
    {
        const router = new MockRouter();
        router.generateResponses.push({
            continuationId: 'c1',
            toolCalls: [
                { id: 't1', name: 'slow_tool', arguments: {} },
                { id: 't2', name: 'slow_tool', arguments: {} }
            ]
        });

        const reg = new MockRegistry() as unknown as ToolRegistry;
        reg.get = (name: string) => {
            return { definition: { isParallelizable: false } } as any;
        };

        const orchestrator = new MockOrchestrator();
        
        const engine = new TaskEngine(router as unknown as LLMRouter, reg, orchestrator as unknown as ToolOrchestrator, context, mockPlanner);
        
        const taskObj = {
            id: 'cancel_task',
            request: 'do slow stuff',
            status: 'queued',
            priority: 0,
            retryCount: 0,
            isCancelled: false,
            steps: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
        } as any;

        let executionStarted = false;
        orchestrator.handlers['slow_tool'] = async () => {
            executionStarted = true;
            taskObj.isCancelled = true; // Cancel during the first tool execution!
            await new Promise(r => setTimeout(r, 50));
            return { toolName: 'slow_tool', success: true, output: 'ok' };
        };

        // Note: We're calling executeBackground here to pass the task object directly
        let res;
        try {
            res = await engine.executeBackground(taskObj, []);
        } catch (e: any) {
            res = e.message;
        }
        
        assert.strictEqual(res, 'AbortError');
        assert.strictEqual(taskObj.status, 'cancelled');
        assert.strictEqual(taskObj.steps.length, 1, 'Only first tool should be processed because cancellation kicks in');
    }

    // Test 8: Task Telemetry
    {
        const router = new MockRouter();
        router.generateResponses.push({
            continuationId: 'c1',
            toolCalls: [{ id: 't1', name: 'fast_tool', arguments: {} }]
        });
        router.continueResponses.push((results: any[]) => {
            return { text: `Done` };
        });

        const reg = new MockRegistry() as unknown as ToolRegistry;
        reg.get = (name: string) => {
            return { definition: { isParallelizable: false } } as any;
        };

        const orchestrator = new MockOrchestrator();
        orchestrator.handlers['fast_tool'] = async () => {
            await new Promise(r => setTimeout(r, 10));
            return { toolName: 'fast_tool', success: true, output: 'ok' };
        };

        const engine = new TaskEngine(router as unknown as LLMRouter, reg, orchestrator as unknown as ToolOrchestrator, context, mockPlanner);
        
        const taskObj = {
            id: 'telemetry_task',
            request: 'test telemetry',
            status: 'queued',
            priority: 0,
            retryCount: 0,
            isCancelled: false,
            steps: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
        } as any;

        await engine.executeBackground(taskObj, []);
        
        assert.ok(taskObj.telemetry, 'Telemetry object should be populated');
        assert.ok(taskObj.telemetry.durationMs > 0, 'Should have positive duration');
        assert.ok(taskObj.telemetry.toolExecutionMs >= 10, 'Should track tool execution time');
        assert.strictEqual(taskObj.telemetry.loopIterations, 1, 'Should track 1 loop iteration');
        assert.ok(taskObj.steps[0].telemetry.durationMs >= 10, 'Should track step execution time');
    }

    console.log('TaskEngine tests passed!');
}

runTests().catch(e => {
    console.error(e);
    process.exit(1);
});
