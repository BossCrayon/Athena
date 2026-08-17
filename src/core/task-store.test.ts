import assert from 'assert';
import { TaskStore } from './task-store.js';
import type { Task } from './task.js';

// We mock Supabase Client inside TaskStore by mocking its instance methods
class MockTaskStore extends TaskStore {
    public mockDb: Map<string, any> = new Map();

    constructor() {
        super();
        (this as any).supabase = {
            from: (table: string) => ({
                upsert: async (row: any) => {
                    this.mockDb.set(row.id, { ...row });
                    return { error: null };
                },
                select: () => {
                    let results = Array.from(this.mockDb.values());
                    return {
                        eq: (field: string, value: any) => {
                            results = results.filter(r => r[field] === value);
                            return {
                                single: async () => ({ data: results[0], error: null })
                            };
                        },
                        in: (field: string, values: any[]) => {
                            results = results.filter(r => values.includes(r[field]));
                            const orderObj = {
                                order: () => orderObj,
                                limit: async (limit: number) => ({ data: results.slice(0, limit), error: null }),
                                then: (resolve: any) => resolve({ data: results, error: null })
                            };
                            return orderObj;
                        }
                    };
                }
            })
        };
    }
}

async function runTests() {
    console.log('Running TaskStore tests...');

    const store = new MockTaskStore();

    const task: Task = {
        id: 'task-123',
        request: 'hello',
        status: 'queued',
        priority: 1,
        createdAt: 1000,
        updatedAt: 1000,
        retryCount: 0,
        isCancelled: false,
        steps: [
            { id: 's1', toolName: 'test_tool', arguments: {}, status: 'pending' }
        ],
        metadata: { info: 'test' }
    };

    // 1. Create task
    await store.create(task);
    assert.strictEqual(store.mockDb.size, 1);
    
    // 2. Get task
    const retrieved = await store.get('task-123');
    assert.ok(retrieved);
    assert.strictEqual(retrieved!.id, 'task-123');
    assert.strictEqual(retrieved!.status, 'queued');
    assert.strictEqual(retrieved!.steps.length, 1);
    assert.strictEqual(retrieved!.metadata!.info, 'test');

    // 3. Update task
    task.status = 'executing';
    await store.update(task);
    const updated = await store.get('task-123');
    assert.strictEqual(updated!.status, 'executing');

    // 4. List incomplete
    const incomplete = await store.listIncomplete();
    assert.strictEqual(incomplete.length, 1);

    // 5. Complete and list completed
    task.status = 'completed';
    await store.update(task);
    const incompleteNow = await store.listIncomplete();
    assert.strictEqual(incompleteNow.length, 0);

    const completed = await store.listCompleted();
    assert.strictEqual(completed.length, 1);

    console.log('TaskStore tests passed!');
}

runTests().catch(e => {
    console.error(e);
    process.exit(1);
});
