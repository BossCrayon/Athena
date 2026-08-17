import { TaskQueue } from '../src/core/task-queue.js';
import { EventBus } from '../src/core/events.js';
import { Scheduler } from '../src/core/scheduler.js';
import { AutonomousRuntime } from '../src/core/autonomous-runtime.js';
import { ContextBuilder } from '../src/core/context-builder.js';
import { MemoryExtractor } from '../src/core/memory-extractor.js';
import { CloudMemoryManager } from '../src/core/memory.js';
import { LLMRouter } from '../src/llm/router.js';
import { GeminiProvider } from '../src/llm/providers/gemini.js';
import { TaskEngine } from '../src/core/task-engine.js';
import { ToolRegistry } from '../src/tools/registry.js';
import { ToolExecutor } from '../src/tools/executor.js';
import { ToolOrchestrator } from '../src/tools/orchestrator.js';
import { PermissionManager } from '../src/tools/permission.js';

import * as dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import type { Task } from '../src/core/task.js';

dotenv.config();

async function runTest() {
    console.log('--- Initializing Autonomous Runtime for Test ---');
    
    const router = new LLMRouter();
    if (process.env.GEMINI_API_KEY) {
        router.registerProvider('gemini-3.6-flash', new GeminiProvider('gemini-3.6-flash'));
        router.setDefaultProvider('gemini-3.6-flash');
    }

    const registry = new ToolRegistry();
    // Register just a few tools for the test, or leave it blank to force generic reasoning
    const orchestrator = new ToolOrchestrator(registry, new ToolExecutor(registry, new PermissionManager()));
    
    const memoryManager = new CloudMemoryManager();
    const contextBuilder = new ContextBuilder(memoryManager);
    const memoryExtractor = new MemoryExtractor(router);
    const taskEngine = new TaskEngine(router, registry, orchestrator, { cwd: process.cwd() }, memoryManager, contextBuilder);
    
    const queue = new TaskQueue();
    const eventBus = new EventBus();
    const scheduler = new Scheduler(queue);
    
    const runtime = new AutonomousRuntime(queue, taskEngine, eventBus, contextBuilder, memoryExtractor, memoryManager);

    // Listen to events
    eventBus.subscribe('task_started', (t: Task) => console.log(`\n[EventBus] Task Started: ${t.request}`));
    eventBus.subscribe('task_completed', (t: Task) => console.log(`\n[EventBus] Task Completed! Check Supabase if it extracted a memory.`));
    eventBus.subscribe('task_failed', (t: Task) => console.log(`\n[EventBus] Task Failed:`, t.metadata?.error));

    runtime.start(1000); // Poll every 1 second

    console.log('\n--- Enqueuing a test task ---');
    console.log('We will tell ATHENA a fact in a background task, and see if she extracts it into memory.\n');

    queue.enqueue({
        id: randomUUID(),
        request: "Hi! Just wanted to let you know for future reference that my favorite color is crimson red. Please don't forget it.",
        priority: 1,
        status: 'queued',
        retryCount: 0,
        isCancelled: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        steps: []
    });

    // Let it run for 15 seconds to allow LLM extraction, then exit
    setTimeout(() => {
        console.log('\n--- Shutting down test ---');
        runtime.stop();
        process.exit(0);
    }, 15000);
}

runTest();
