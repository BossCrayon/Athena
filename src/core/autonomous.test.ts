import assert from 'assert';
import { EventBus } from './events.js';
import { TaskQueue } from './task-queue.js';
import { Scheduler } from './scheduler.js';
import { AutonomousRuntime } from './autonomous-runtime.js';
import { TaskEngine } from './task-engine.js';
import type { Task } from './task.js';

// Mocks
class MockEngine {
    public executedTasks: Task[] = [];
    async executeBackground(task: Task, history: any[]) {
        this.executedTasks.push(task);
        if (task.request === 'fail') {
            throw new Error('Task execution failed.');
        }
        task.status = 'completed';
        return "Done.";
    }
}

async function runTests() {
    console.log('Running Autonomous Phase G tests...');

    // 1. EventBus Test
    {
        const bus = new EventBus();
        let received = false;
        const handler = (payload: any) => { received = payload.ok; };
        bus.subscribe('test', handler);
        bus.emit('test', { ok: true });
        assert.ok(received, 'EventBus should trigger handler');
        bus.unsubscribe('test', handler);
        received = false;
        bus.emit('test', { ok: true });
        assert.ok(!received, 'EventBus should not trigger handler after unsubscribe');
    }

    // 2. TaskQueue Test
    {
        const queue = new TaskQueue();
        queue.enqueue({ id: '1', request: 'low', priority: 0 } as Task);
        queue.enqueue({ id: '2', request: 'high', priority: 1 } as Task);
        
        const first = await queue.dequeue('worker-1');
        assert.strictEqual(first?.id, '2', 'Queue should dequeue highest priority first');
        
        queue.cancel('1');
        const second = await queue.dequeue('worker-1');
        assert.strictEqual(second, null, 'Queue should ignore cancelled tasks');
    }

    // 3. Scheduler Test
    {
        const queue = new TaskQueue();
        const scheduler = new Scheduler(queue);
        
        scheduler.schedule({ id: '1', priority: 0 } as Task, { runAt: Date.now() - 1000 }); // already due
        scheduler.schedule({ id: '2', priority: 0 } as Task, { intervalMs: 50 }); 
        
        // Tick manually for testing (tick is private, but we'll cast to any)
        (scheduler as any).tick();
        
        const dueTask = await queue.dequeue('worker-1');
        assert.strictEqual(dueTask?.id, '1', 'Scheduler should enqueue due one-time task');
        
        // Wait 60ms and tick again to test interval
        await new Promise(r => setTimeout(r, 60));
        (scheduler as any).tick();
        
        const intervalTask = await queue.dequeue('worker-1');
        assert.strictEqual(intervalTask?.id, '2', 'Scheduler should enqueue due interval task');
    }

    // 4. AutonomousRuntime Test
    {
        const queue = new TaskQueue();
        const bus = new EventBus();
        const engine = new MockEngine() as unknown as TaskEngine;
        const mockContextBuilder = {
            async buildContext() { return ''; }
        };
        const mockExtractor = {
            async extractFromTask() { return []; }
        };
        const mockMemoryManager = {
            async upsertMemory() {}
        };
        const mockTaskStore = {
            async listIncomplete() { return []; },
            async upsert() {}
        };

        const runtime = new AutonomousRuntime(
            queue, 
            engine, 
            bus, 
            mockContextBuilder as any,
            mockExtractor as any,
            mockMemoryManager as any,
            mockTaskStore as any
        );

        let started = false;
        let completed = false;
        let failed = false;

        bus.subscribe('task_started', () => { started = true; });
        bus.subscribe('task_completed', () => { completed = true; });
        bus.subscribe('task_failed', () => { failed = true; });

        runtime.start(50); // fast poll
        
        queue.enqueue({ id: '1', request: 'success', priority: 0, status: 'queued', steps: [] } as any);
        
        await new Promise(r => setTimeout(r, 150));
        
        assert.ok(started, 'Runtime should emit task_started');
        assert.ok(completed, 'Runtime should emit task_completed');
        
        // Test failure recovery
        started = false;
        queue.enqueue({ id: '2', request: 'fail', priority: 0, status: 'queued', steps: [] } as any);
        
        await new Promise(r => setTimeout(r, 150));
        
        assert.ok(failed, 'Runtime should emit task_failed');
        assert.ok(runtime.getIsRunning(), 'Runtime should not crash after task failure');
        
        runtime.stop();
        assert.ok(!runtime.getIsRunning(), 'Runtime should stop gracefully');
    }

    console.log('Autonomous tests passed!');
}

runTests().catch(e => {
    console.error(e);
    process.exit(1);
});
